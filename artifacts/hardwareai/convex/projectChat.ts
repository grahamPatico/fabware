"use node";

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { getArchetype } from "./archetypes";
import { summarizeStepPartForAgent } from "./lib/stepParts";
import { TOOLS, buildInstructions, buildProjectContext } from "./assemblyDesigner";
import { getModel, resolveEffort } from "./lib/models";
import {
  describeToolCall, formatValidatorNote, isFailureResult, priorTurns, type Violation,
} from "./lib/agentLoop";

type ContentParam = Anthropic.Beta.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.BetaMessageParam;
type TextBlock = Anthropic.Beta.BetaTextBlock;
type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

// One user message may take this many model round-trips. A new design usually
// needs 3–6 (research → scope → build → fix validator findings → summary).
export const MAX_ITERATIONS = 14;
// Convex kills an action at 10 minutes. Past the soft deadline the model is
// told to wrap up; a call still streaming at the hard limit is aborted so the
// run can close out cleanly instead of being killed mid-write.
const RUN_DEADLINE_MS = 6.5 * 60 * 1000;
const RUN_HARD_LIMIT_MS = 9 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 32_000;
// Spend guard for a public, unauthenticated studio: once the day's model
// spend across all projects passes this, new turns are refused until 00:00 UTC.
const DEFAULT_DAILY_USD_CAP = 25;

const STATE_CHANGING_TOOLS = new Set([
  "select_archetype", "update_archetype_params",
  "add_sheet_metal_part", "add_printed_part", "add_purchased_part",
  "add_freeform_2d_part", "add_pipe",
  "add_interface", "remove_part",
  "refine_part", "add_feature_to_part", "break_out", "capture_scope",
]);

/** An error whose message is written for the person using the studio. */
export class UserFacingError extends Error {}

/**
 * Legacy entry point, kept so browser tabs still running the previous bundle
 * keep working across a deploy. New clients call `agentRuns.start` directly.
 */
export const send = action({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    focusedRole: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ runId: string }> => {
    return await ctx.runMutation(api.agentRuns.start, a);
  },
});

/**
 * One agent turn: call Claude, apply the tools it asks for, feed the results
 * (plus fresh validator findings) back, and repeat until it stops calling
 * tools. Progress is written to the project and message tables as it happens,
 * so the workspace follows along reactively.
 */
export const runTurn = internalAction({
  args: {
    projectId: v.id("projects"),
    runId: v.string(),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    focusedRole: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<void> => {
    try {
      const outcome = await runAgentLoop(ctx, a);
      await ctx.runMutation(internal.agentRuns.finish, {
        projectId: a.projectId, runId: a.runId, status: outcome,
      });
    } catch (err) {
      const message = describeFailure(err);
      console.error(`[runTurn ${a.runId}]`, err);
      await ctx.runMutation(internal.messages.insertProjectMessage, {
        projectId: a.projectId, role: "assistant", content: message,
        model: a.model, effort: a.effort, kind: "error", isError: true, runId: a.runId,
      });
      await ctx.runMutation(internal.agentRuns.finish, {
        projectId: a.projectId, runId: a.runId, status: "error", error: message,
      });
    }
  },
});

export type TurnArgs = {
  projectId: Id<"projects">;
  runId: string;
  content: string;
  imageData?: string;
  imageMediaType?: string;
  model: string;
  effort: string;
  focusedRole?: string;
};

type ModelRequest = Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "messages">;

/**
 * One model call. `abortAfterMs` bounds the whole streamed response so the
 * surrounding action always gets to finish its bookkeeping.
 */
export type CallModel = (
  request: ModelRequest,
  messages: MessageParam[],
  abortAfterMs: number,
) => Promise<Anthropic.Beta.BetaMessage>;

function anthropicCaller(): CallModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new UserFacingError("The design agent isn't configured on this deployment (no API key).");
  const client = new Anthropic({ apiKey });
  return async (request, messages, abortAfterMs) => {
    // Streamed so a long response can't hit an HTTP timeout.
    const stream = client.beta.messages.stream({ ...request, messages });
    const timer = setTimeout(() => stream.abort(), abortAfterMs);
    try {
      return await stream.finalMessage();
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Exported for tests, which pass a scripted `callModel`. */
export async function runAgentLoop(
  ctx: ActionCtx,
  a: TurnArgs,
  callModel: CallModel = anthropicCaller(),
): Promise<"done" | "cancelled"> {
  const startedAt = Date.now();
  const spec = getModel(a.model);
  if (!spec) throw new UserFacingError(`Unsupported model: ${a.model}`);

  const cap = Number(process.env.FABWARE_DAILY_USD_CAP ?? DEFAULT_DAILY_USD_CAP);
  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  const spentToday: number = await ctx.runQuery(internal.tokenUsage.spendSince, { sinceMs: dayStart });
  if (Number.isFinite(cap) && spentToday >= cap) {
    throw new UserFacingError("Fabware has reached its AI budget for today. It resets at midnight UTC.");
  }

  const project = await ctx.runQuery(api.projects.get, { projectId: a.projectId });
  if (!project) throw new UserFacingError("This project no longer exists.");

  // Snapshot the pre-turn state so the user can undo back to it even on the
  // first turn. Only captures when no snapshot exists yet.
  if (!project.currentSnapshotId) {
    await ctx.runMutation(internal.assemblySnapshots.captureInternal, {
      projectId: a.projectId, label: "Initial state",
    });
  }
  let parts: Doc<"parts">[] = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
  const interfaces: Doc<"interfaces">[] = await ctx.runQuery(api.interfaces.listForProject, { projectId: a.projectId });
  const history: Doc<"messages">[] = await ctx.runQuery(internal.messages.listForProjectInternal, { projectId: a.projectId });

  const violations = parts.length > 0 ? await currentViolations(ctx, a.projectId) : [];
  const projectState = {
    scope: project.scope ?? null,
    archetypeId: project.archetypeId ?? null,
    archetypeParams: project.archetypeParams ?? null,
    parts: parts.map((p) => ({ role: p.role, label: p.label, position: p.position, dslJson: p.dslJson ?? undefined })),
    interfaces: interfaces.map((i) => ({
      kind: i.kind, partA: i.partA, partB: i.partB,
      featureRefs: i.featureRefs, hardwareRefs: i.hardwareRefs ?? [],
    })),
    violations,
  };

  const userContent: ContentParam[] = [];
  if (a.imageData && a.imageMediaType) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: a.imageMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: a.imageData,
      },
    });
  }
  userContent.push({ type: "text", text: a.content || "Use this reference image to design the part." });

  const messages: MessageParam[] = [
    ...priorTurns(history),
    { role: "user", content: userContent },
  ];

  const effort = resolveEffort(a.model, a.effort);
  const request: ModelRequest = {
    model: a.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // The instructions are identical on every turn of every project, so they
    // sit behind their own cache breakpoint; the top-level cache_control then
    // caches the growing transcript between iterations of this turn.
    system: [
      { type: "text" as const, text: buildInstructions(), cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: buildProjectContext(projectState, a.focusedRole) },
    ],
    cache_control: { type: "ephemeral" as const },
    tools: TOOLS as unknown as Anthropic.Beta.BetaTool[],
    ...(spec.thinking === "adaptive" ? { thinking: { type: "adaptive" as const } } : {}),
    ...(effort ? { output_config: { effort } } : {}),
    // If a safety classifier declines a request, let the API retry it on a
    // fallback model inside the same call instead of failing the turn.
    ...(spec.fallbacks
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  };

  let stateChanged = false;
  let toolCallCount = 0;
  let wroteText = false;
  let outcome: "done" | "cancelled" = "done";

  const isCancelled = async (): Promise<"superseded" | "cancelled" | null> => {
    const run = await ctx.runQuery(internal.agentRuns.getRun, { projectId: a.projectId });
    if (!run || run.runId !== a.runId) return "superseded";
    return run.cancelRequested ? "cancelled" : null;
  };
  const say = async (content: string) => {
    wroteText = true;
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId: a.projectId, role: "assistant", content,
      model: a.model, effort: a.effort, kind: "text", runId: a.runId,
    });
  };

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const cancelled = await isCancelled();
      if (cancelled === "superseded") return "cancelled"; // a newer run owns the project
      if (cancelled) { outcome = "cancelled"; break; }

      await ctx.runMutation(internal.agentRuns.setProgress, {
        projectId: a.projectId, runId: a.runId,
        step: iteration === 0 ? "Thinking through the design" : "Reviewing results",
        iteration, toolCalls: toolCallCount,
      });

      const remainingMs = RUN_HARD_LIMIT_MS - (Date.now() - startedAt);
      if (remainingMs < 15_000) {
        await say("I ran out of time on this turn. What's done so far is kept. Send \"continue\" and I'll pick up from here.");
        break;
      }
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await callModel(request, messages, remainingMs - 10_000);
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) {
          throw new UserFacingError(
            "That took longer than one turn allows. What's done so far is kept. Send \"continue\" to pick up from here.",
          );
        }
        throw err;
      }

      await ctx.runMutation(internal.tokenUsage.record, {
        feature: "assembly_designer",
        // A refusal fallback may have served this; cost it at that model's
        // rates when we know them.
        model: getModel(response.model) ? response.model : a.model,
        effort: a.effort,
        projectId: a.projectId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
      });

      if (response.stop_reason === "refusal") {
        throw new UserFacingError(
          "The model declined this request. Try rephrasing it, or describe the part in more concrete terms.",
        );
      }

      const text = response.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (text) await say(text);

      const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) break;
      if (response.stop_reason === "max_tokens") {
        // A tool call cut off mid-input would run on a truncated design.
        throw new UserFacingError(
          "That step was too large to finish in one go. Try asking for the design in smaller pieces.",
        );
      }
      if (iteration === MAX_ITERATIONS - 1) {
        // Already told to wrap up and still asking for tools: stop here rather
        // than apply changes the model will never see the result of.
        await say("I've used all the steps for this turn. Send \"continue\" and I'll keep going.");
        break;
      }
      // The model call can take a while; honour a Stop pressed during it
      // before changing anything.
      const cancelledMidCall = await isCancelled();
      if (cancelledMidCall === "superseded") return "cancelled";
      if (cancelledMidCall) { outcome = "cancelled"; break; }

      // Echo the full content back, thinking blocks included, so the model
      // keeps its reasoning across iterations.
      messages.push({ role: "assistant", content: response.content as ContentParam[] });

      const results: ContentParam[] = [];
      let changedThisIteration = false;
      for (const call of toolUses) {
        await ctx.runMutation(internal.agentRuns.setProgress, {
          projectId: a.projectId, runId: a.runId,
          step: describeToolCall(call.name, call.input), toolCalls: toolCallCount,
        });
        let result: string;
        try {
          result = await applyToolCall(ctx, a.projectId, parts, interfaces, { name: call.name, input: call.input });
        } catch (err: any) {
          result = `Couldn't run ${call.name}: ${String(err?.message ?? err).slice(0, 300)}`;
        }
        const failed = isFailureResult(result);
        toolCallCount++;
        await ctx.runMutation(internal.messages.insertProjectMessage, {
          projectId: a.projectId, role: "assistant", content: result,
          model: a.model, effort: a.effort,
          kind: "tool", toolName: call.name, isError: failed, runId: a.runId,
        });
        results.push({ type: "tool_result", tool_use_id: call.id, content: result, is_error: failed });
        if (STATE_CHANGING_TOOLS.has(call.name) && !failed) {
          changedThisIteration = true;
          stateChanged = true;
          parts = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
        }
      }

      const notes: string[] = [];
      if (changedThisIteration) {
        notes.push(formatValidatorNote(parts.length > 0 ? await currentViolations(ctx, a.projectId) : []));
      }
      const outOfTime = Date.now() - startedAt > RUN_DEADLINE_MS;
      if (outOfTime || iteration === MAX_ITERATIONS - 2) {
        notes.push(
          "You are out of steps for this turn. Do not call any more tools. Reply now with a short summary of " +
          "what is done and what is still open, so the user can ask you to continue.",
        );
      }
      // All tool results go back in one user message; notes follow them.
      messages.push({ role: "user", content: [...results, ...notes.map((t) => ({ type: "text" as const, text: t }))] });
    }
  } finally {
    // One undo step per turn that changed the assembly — also when the turn
    // failed part-way, so undo/redo never skips over applied changes.
    if (stateChanged) {
      const label = a.content.length > 60 ? a.content.slice(0, 57) + "…" : a.content || "Reference image";
      await ctx.runMutation(internal.assemblySnapshots.captureInternal, { projectId: a.projectId, label });
    }
  }

  if (outcome === "cancelled") {
    await say(stateChanged ? "Stopped. The changes made so far are kept. Use undo to roll them back." : "Stopped.");
  } else if (!wroteText) {
    // The model ended without a closing note; don't leave the chat silent.
    await say(toolCallCount > 0
      ? "Done. The assembly is updated."
      : "I didn't find anything to change for that. Try describing what you want in a bit more detail.");
  }
  return outcome;
}

async function currentViolations(ctx: ActionCtx, projectId: Id<"projects">): Promise<Violation[]> {
  const validation: { rules: any[] } = await ctx.runQuery(api.validation.getAssemblyValidation, { projectId });
  return validation.rules
    .filter((r) => r.status === "fail" || r.status === "warn")
    .map((r) => ({ id: r.id, label: r.label, status: r.status, message: r.message, suggestion: r.suggestion }));
}

function describeFailure(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI service is rate-limiting requests right now. Give it a minute and send your message again.";
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The design agent's API credentials were rejected. This needs fixing on the deployment.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `The AI service rejected the request: ${err.message.slice(0, 200)}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Check back in a moment and send your message again.";
  }
  if (err instanceof Anthropic.APIError) {
    return "The AI service had a problem handling that request. Send your message again to retry.";
  }
  return "Something went wrong while working on that. Send your message again to retry.";
}

async function applyToolCall(
  ctx: ActionCtx,
  projectId: Id<"projects">,
  partsSnapshot: any[],
  _interfacesSnapshot: any[],
  call: { name: string; input: any },
): Promise<string> {
  switch (call.name) {
    case "capture_scope":
      await ctx.runMutation(api.projects.updateScope, { projectId, scope: coerceScope(call.input.scope) });
      return "Scope updated.";

    case "select_archetype": {
      const arch = getArchetype(call.input.archetypeId);
      if (!arch) return `Unknown archetype: ${call.input.archetypeId}`;
      const project = await ctx.runQuery(api.projects.get, { projectId });
      const scope = project?.scope;
      if (!scope) return "Cannot generate archetype without scope. Ask for use case/tier/environment first.";
      // Merge agent-supplied params over the archetype's defaults so the
      // agent can omit fields it doesn't care about. paramSchema.parse
      // validates the merged shape — fails informatively if invalid.
      const merged = { ...arch.paramDefaults(scope), ...(call.input.params ?? {}) };
      let params;
      try {
        params = arch.paramSchema.parse(merged);
      } catch (err: any) {
        return `Couldn't generate ${arch.label}: ${err.message?.slice(0, 200) ?? "param validation failed"}`;
      }
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, scope);

      await ctx.runMutation(internal.parts.replaceAll, {
        projectId,
        parts: genParts.map((gp: any) => ({ role: gp.role, label: gp.label, position: gp.position, dslJson: JSON.stringify(gp.dsl) })),
      });
      await ctx.runMutation(internal.interfaces.replaceAll, {
        projectId,
        interfaces: genInterfaces,
      });
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId,
        archetypeId: call.input.archetypeId,
        archetypeParams: params,
      });
      return `Generated ${genParts.length} parts and ${genInterfaces.length} interfaces from ${arch.label}.`;
    }

    case "refine_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      // Validate the patched DSL matches the part's kind
      const kind = target.kind ?? "sheet_metal";
      const dslJson = JSON.stringify(call.input.dsl);
      try {
        if (kind === "printed") {
          const { PrintedDslSchema } = await import("./lib/printedDsl");
          PrintedDslSchema.parse(JSON.parse(dslJson));
        } else if (kind === "purchased") {
          const { PurchasedDslSchema } = await import("./lib/purchasedDsl");
          PurchasedDslSchema.parse(JSON.parse(dslJson));
        }
        // sheet_metal: existing validator runs inside updatePartDslByKindInternal
        await ctx.runMutation(internal.parts.updatePartDslByKindInternal, {
          partId: target._id, dslJson,
        });
      } catch (err: any) {
        return `Couldn't refine ${target.role}: ${err?.message?.slice(0, 200) ?? "validation error"}`;
      }
      return `Refined ${target.role}.`;
    }

    case "add_feature_to_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target || !target.dslJson) return `No part with role ${call.input.role}.`;
      const dsl = JSON.parse(target.dslJson);
      dsl.features = [...(dsl.features ?? []), call.input.feature];
      await ctx.runMutation(internal.parts.updatePartDslInternal, {
        partId: target._id, dslJson: JSON.stringify(dsl),
      });
      return `Added feature to ${target.role}.`;
    }

    case "update_archetype_params": {
      const project = await ctx.runQuery(api.projects.get, { projectId });
      if (!project?.archetypeId) return "Project has no archetype — can't update params.";
      if (!project.scope) return "Cannot resize the archetype without scope. Call capture_scope first.";
      const arch = getArchetype(project.archetypeId);
      if (!arch) return `Unknown archetype: ${project.archetypeId}`;
      const baseDefaults = arch.paramDefaults(project.scope);
      const merged = { ...baseDefaults, ...(project.archetypeParams ?? {}), ...(call.input.paramPatch ?? {}) };
      let params;
      try {
        params = arch.paramSchema.parse(merged);
      } catch (err: any) {
        return `Couldn't update ${arch.label} params: ${err.message?.slice(0, 200) ?? "validation failed"}`;
      }
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, project.scope);

      await ctx.runMutation(internal.parts.replaceAll, {
        projectId,
        parts: genParts.map((gp: any) => ({ role: gp.role, label: gp.label, position: gp.position, dslJson: JSON.stringify(gp.dsl) })),
      });
      await ctx.runMutation(internal.interfaces.replaceAll, {
        projectId,
        interfaces: genInterfaces,
      });
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId, archetypeId: project.archetypeId, archetypeParams: params,
      });
      return "Archetype params updated.";
    }

    case "break_out":
      await ctx.runMutation(api.projects.breakOut, { projectId });
      return "Broke out of archetype — project is now fully custom.";

    case "decompose_freeform":
      return "Free-form design isn't supported yet in v1. Pick the closest archetype instead (hinged_enclosure, box_with_lid, bracket_plus_panel, divided_tray, shelf_with_brackets, sliding_enclosure).";

    case "add_printed_part": {
      // Tolerant defaults: agent often omits version/kind/layerHeight/infill,
      // and sometimes feature.name. Fill them in before validation.
      // Also coerce rotations: if any |rot| > 2π, assume agent gave degrees.
      const TWO_PI = 2 * Math.PI;
      const pos = call.input.position;
      const looksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(pos?.[k] ?? 0) > TWO_PI);
      if (looksDegrees) {
        pos.rotX = (pos.rotX ?? 0) * (Math.PI / 180);
        pos.rotY = (pos.rotY ?? 0) * (Math.PI / 180);
        pos.rotZ = (pos.rotZ ?? 0) * (Math.PI / 180);
      }
      const rawDsl = (call.input.dsl ?? {}) as Record<string, unknown>;
      const rawFeatures = Array.isArray(rawDsl.features) ? rawDsl.features : [];
      const features = rawFeatures.map((f: any, i: number) => {
        const filled: any = {
          name: typeof f?.name === "string" && f.name.length > 0 ? f.name : `${f?.kind ?? "feature"}_${i}`,
          ...f,
        };
        // Pocket: agent often gives `depth` (Y dim) but forgets `depthZ` (cut depth).
        if (filled.kind === "pocket" && typeof filled.depthZ !== "number") {
          filled.depthZ = 3;
        }
        return filled;
      });
      const filledDsl = {
        version: 1,
        kind: "printed",
        material: rawDsl.material ?? "PLA",
        layerHeight: typeof rawDsl.layerHeight === "number" ? rawDsl.layerHeight : 0.2,
        infill: typeof rawDsl.infill === "number" ? rawDsl.infill : 0.2,
        primitive: rawDsl.primitive,
        features,
      };
      const dsl = JSON.stringify(filledDsl);
      try {
        await ctx.runMutation(internal.parts.addPrintedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: call.input.position,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add printed part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      return `Added 3D-printed part: ${call.input.label}.`;
    }

    case "check_manufacturing": {
      const summary: any = await ctx.runQuery(api.manufacturing.summarizeForProject, { projectId });
      const totals = summary?.totals ?? { sheetMetalParts: 0, failures: 0, warnings: 0 };
      const lines: string[] = [];
      lines.push(
        `🛠 Manufacturability check (${summary?.perPart?.length ?? 0} sheet-metal parts): ` +
        `${totals.failures} fail · ${totals.warnings} warn.`,
      );
      const failedParts = (summary?.perPart ?? []).filter((p: any) => p.failures > 0 || p.warnings > 0).slice(0, 6);
      for (const p of failedParts) {
        const stepBits = (p.steps ?? []).filter((s: any) => s.failures > 0 || s.warnings > 0)
          .map((s: any) => `${s.label} (${s.failures}F/${s.warnings}W)`)
          .join(", ");
        lines.push(`  • ${p.label} (${p.role}): ${p.failures}F / ${p.warnings}W` + (stepBits ? ` — ${stepBits}` : ""));
        // Failures first, then warnings: the agent can only act on findings it
        // is shown, and a bare "4 warn" count gives it nothing to fix.
        const flagged = (p.rules ?? []).filter((r: any) => r.status === "fail" || r.status === "warn");
        const top = [
          ...flagged.filter((r: any) => r.status === "fail"),
          ...flagged.filter((r: any) => r.status === "warn"),
        ].slice(0, 5);
        for (const r of top) {
          const suggestion = r.suggestion ? ` → ${r.suggestion}` : "";
          lines.push(`    - [${String(r.status).toUpperCase()}] ${r.label}: ${r.message}${suggestion}`);
        }
      }
      if (failedParts.length === 0) {
        lines.push("  All parts pass current manufacturability checks. (Intent: " + (call.input.intent ?? "n/a") + ")");
      }
      return lines.join("\n");
    }

    case "gather_inspiration": {
      const refs = Array.isArray(call.input.references) ? call.input.references : [];
      const recs = Array.isArray(call.input.recommendations) ? call.input.recommendations : [];
      const lines = [
        `🔍 Researched **${call.input.topic ?? "design"}** — ${refs.length} reference${refs.length === 1 ? "" : "s"}, ${recs.length} recommendation${recs.length === 1 ? "" : "s"}.`,
        ...refs.slice(0, 5).map((r: any) => `  • ${r.name} (${r.source}): ${r.features}${r.dimensions ? ` · ${r.dimensions}` : ""}`),
        ...(recs.length > 0 ? ["Will apply:", ...recs.slice(0, 5).map((r: string) => `  → ${r}`)] : []),
      ];
      return lines.join("\n");
    }

    case "add_sheet_metal_part": {
      const TWO_PI = 2 * Math.PI;
      const pos = call.input.position;
      const looksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(pos?.[k] ?? 0) > TWO_PI);
      if (looksDegrees) {
        pos.rotX = (pos.rotX ?? 0) * (Math.PI / 180);
        pos.rotY = (pos.rotY ?? 0) * (Math.PI / 180);
        pos.rotZ = (pos.rotZ ?? 0) * (Math.PI / 180);
      }
      // Coerce common feature-field synonyms to canonical enum values so the
      // agent doesn't trip the Zod validator on near-misses.
      const features = (Array.isArray(call.input.features) ? call.input.features : []).map((f: any) => {
        const out = { ...f };
        if (out.kind === "bend") {
          if (typeof out.axis === "string") {
            const a = out.axis.toLowerCase();
            if (a === "x" || a === "horiz" || a === "h" || a.startsWith("horiz")) out.axis = "horizontal";
            else if (a === "y" || a === "vert" || a === "v" || a.startsWith("vert")) out.axis = "vertical";
          }
        }
        if ((out.kind === "hole" || out.kind === "slot" || out.kind === "tab") && typeof out.pattern === "string") {
          const p = out.pattern.toLowerCase().replace(/-/g, "_");
          if (p === "corners") out.pattern = "corner";
          if (p === "centre") out.pattern = "center";
          if (p === "top") out.pattern = "top_row";
          if (p === "bottom") out.pattern = "bottom_row";
        }
        if (out.kind === "tab" && typeof out.edge === "string") {
          const e = out.edge.toLowerCase();
          if (["top", "bottom", "left", "right"].includes(e)) out.edge = e;
        }
        return out;
      });
      const dsl = {
        version: 1,
        partType: "plate" as const,
        material: call.input.material,
        thickness: call.input.thickness,
        width: call.input.width,
        height: call.input.height,
        depth: null,
        outline: call.input.outline ?? { kind: "rectangle" },
        features,
        finish: call.input.powderCoat
          ? { type: "powder_coat", color: call.input.powderCoatColor ?? "Black" }
          : null,
        assemblyRefs: [],
      };
      try {
        await ctx.runMutation(internal.parts.addPartInternal, {
          projectId, role: call.input.role, label: call.input.label, position: pos,
          dslJson: JSON.stringify(dsl),
        });
      } catch (err: any) {
        return `Couldn't add ${call.input.role}: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      return `🟦 Added sheet-metal part ${call.input.role} (${call.input.label}) — ${dsl.material} ${dsl.thickness}", ${dsl.width}" × ${dsl.height}".`;
    }

    case "add_interface": {
      const all = await ctx.runQuery(api.parts.listForProject, { projectId });
      const partA = all.find((p: Doc<"parts">) => p.role === call.input.roleA);
      const partB = all.find((p: Doc<"parts">) => p.role === call.input.roleB);
      if (!partA || !partB) {
        return `Couldn't add interface: role not found (${!partA ? call.input.roleA : call.input.roleB}).`;
      }
      try {
        await ctx.runMutation(internal.interfaces.addInterfaceInternal, {
          projectId,
          kind: call.input.kind,
          partA: partA._id,
          partB: partB._id,
          featureRefs: [
            { partId: partA._id, featureName: call.input.featureA },
            { partId: partB._id, featureName: call.input.featureB },
          ],
          hardwareRefs: Array.isArray(call.input.hardwareRefs) ? call.input.hardwareRefs : [],
          accessSide: call.input.accessSide,
        });
      } catch (err: any) {
        return `Couldn't add interface: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      const hwTotal = (call.input.hardwareRefs ?? []).reduce((acc: number, h: any) => acc + (h.quantity ?? 0), 0);
      return `🔗 ${call.input.kind} interface: ${call.input.roleA} ↔ ${call.input.roleB}${hwTotal > 0 ? ` (${hwTotal}× hardware)` : ""}.`;
    }

    case "remove_part": {
      const all = await ctx.runQuery(api.parts.listForProject, { projectId });
      const target = all.find((p: Doc<"parts">) => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      await ctx.runMutation(api.parts.removePart, { partId: target._id });
      return `🗑 Removed ${call.input.role}.`;
    }

    case "add_freeform_2d_part": {
      const TWO_PI = 2 * Math.PI;
      const fpos = call.input.position;
      const fLooksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(fpos?.[k] ?? 0) > TWO_PI);
      if (fLooksDegrees) {
        fpos.rotX = (fpos.rotX ?? 0) * (Math.PI / 180);
        fpos.rotY = (fpos.rotY ?? 0) * (Math.PI / 180);
        fpos.rotZ = (fpos.rotZ ?? 0) * (Math.PI / 180);
      }
      const outline = call.input.outline;
      const { outlineAabb: aabb } = await import("./lib/dsl");
      const { width: aabbW, height: aabbH } = aabb(outline, 1, 1);
      const dsl = {
        version: 1,
        partType: "plate" as const,
        material: call.input.material ?? "Mild Steel (CRS)",
        thickness: call.input.thickness ?? 0.075,
        width: aabbW,
        height: aabbH,
        depth: null,
        outline,
        features: Array.isArray(call.input.features) ? call.input.features : [],
        finish: null,
        assemblyRefs: [],
      };
      try {
        await ctx.runMutation(internal.parts.addPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: fpos,
          dslJson: JSON.stringify(dsl),
        });
      } catch (err: any) {
        return `Couldn't add freeform part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      const shapeDesc =
        outline?.kind === "star" ? `${outline.numPoints}-point star, OR ${outline.outerRadius}", IR ${outline.innerRadius}"` :
        outline?.kind === "circle" ? `Ø${outline.radius * 2}" disk` :
        outline?.kind === "regular_polygon" ? `${outline.sides}-sided polygon, R ${outline.radius}"` :
        outline?.kind === "polygon" ? `${outline.points?.length}-point polygon` :
        "rectangle";
      return `🟦 Added laser-cut: ${call.input.label} (${shapeDesc}) in ${dsl.material} ${dsl.thickness}".`;
    }

    case "add_purchased_part": {
      // Coerce degree-rotations same as add_printed_part.
      const TWO_PI2 = 2 * Math.PI;
      const ppos = call.input.position;
      const ppLooksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(ppos?.[k] ?? 0) > TWO_PI2);
      if (ppLooksDegrees) {
        ppos.rotX = (ppos.rotX ?? 0) * (Math.PI / 180);
        ppos.rotY = (ppos.rotY ?? 0) * (Math.PI / 180);
        ppos.rotZ = (ppos.rotZ ?? 0) * (Math.PI / 180);
      }
      // When the model picked a step.parts id, resolve it to real STEP/GLB
      // URLs. A failed lookup is not fatal — the part still lands, just with
      // the generic proxy geometry, and the note tells the user why.
      const stepPartId = typeof call.input.stepPartId === "string" ? call.input.stepPartId.trim() : "";
      let stepFields: Record<string, string | undefined> = {};
      let resolvedId: string | null = null;
      let stepNote = "";
      if (stepPartId) {
        const resolved: any = await ctx.runAction(internal.stepPartsCatalog.resolveInternal, { id: stepPartId });
        if (resolved?.ok) {
          resolvedId = resolved.part.id;
          stepFields = {
            stepPartId: resolved.part.id,
            stepGlbUrl: resolved.part.glbUrl || undefined,
            stepStepUrl: resolved.part.stepUrl || undefined,
            stepPageUrl: resolved.part.pageUrl || undefined,
            stepPngUrl: resolved.part.pngUrl || undefined,
            stepAttributesJson: JSON.stringify(resolved.part.attributes),
          };
        } else {
          stepNote = ` ⚠ ${resolved?.error ?? "step.parts lookup failed"} — added without 3D geometry.`;
        }
      }
      // purchasedPartNumber stays populated for every downstream reader (BOM,
      // assembly panel, export page) even when the model gave only a catalog id.
      const purchasedNumber = String(call.input.mcmasterPartNumber ?? "").trim()
        || (stepPartId ? `step.parts:${stepPartId}` : "");
      if (!purchasedNumber) {
        return `Couldn't add purchased part ${call.input.role}: needs mcmasterPartNumber or stepPartId.`;
      }
      const dsl = JSON.stringify({
        version: 1,
        kind: "purchased",
        mcmasterPartNumber: purchasedNumber,
        quantity: call.input.quantity,
        label: call.input.label,
        ...(resolvedId ? { stepPartId: resolvedId } : {}),
      });
      try {
        await ctx.runMutation(internal.parts.addPurchasedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: ppos,
          dslJson: dsl,
          ...stepFields,
        });
      } catch (err: any) {
        return `Couldn't add purchased part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      const geometryNote = resolvedId ? " — real STEP geometry attached." : "";
      return `Added purchased: ${call.input.quantity} × ${call.input.label} (${purchasedNumber})${geometryNote}${stepNote}`;
    }

    case "search_step_parts": {
      const res: any = await ctx.runAction(internal.stepPartsCatalog.searchInternal, {
        query: call.input.query,
        category: call.input.category,
        family: call.input.family,
        limit: 8,
      });
      if (!res?.ok) return `🔎 step.parts search failed: ${res?.error ?? "unknown error"}`;
      const hits = (res.results ?? []).slice(0, 8);
      if (hits.length === 0) {
        return `🔎 step.parts: no match for "${call.input.query}". Use a curated McMaster number instead.`;
      }
      return [
        `🔎 step.parts — ${hits.length} match${hits.length === 1 ? "" : "es"} for "${call.input.query}" ` +
        `(pass an id to add_purchased_part as stepPartId):`,
        ...hits.map((r: any) => `  • ${summarizeStepPartForAgent(r)}`),
      ].join("\n");
    }

    case "add_pipe": {
      const TWO_PI3 = 2 * Math.PI;
      const ppos = call.input.position;
      const ppLooksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(ppos?.[k] ?? 0) > TWO_PI3);
      if (ppLooksDegrees) {
        ppos.rotX = (ppos.rotX ?? 0) * (Math.PI / 180);
        ppos.rotY = (ppos.rotY ?? 0) * (Math.PI / 180);
        ppos.rotZ = (ppos.rotZ ?? 0) * (Math.PI / 180);
      }
      const dsl = JSON.stringify({
        version: 1,
        kind: "pipe",
        material: call.input.material,
        outerDiameter: call.input.outerDiameter,
        wallThickness: call.input.wallThickness,
        length: call.input.length,
        endA: call.input.endA ?? "open",
        endB: call.input.endB ?? "open",
      });
      try {
        await ctx.runMutation(internal.parts.addPipePartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: ppos,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add pipe ${call.input.role}: ${err?.message?.slice(0, 200) ?? "validation error"}`;
      }
      return `🟢 Added pipe ${call.input.role}: ${call.input.label} — Ø${call.input.outerDiameter}"×${call.input.length}" ${call.input.material}.`;
    }

    case "decide_make_or_buy": {
      const decisionLabel: Record<string, string> = {
        make_sheet_metal: "🔧 Make it (sheet metal)",
        make_printed: "🟪 Make it (3D print)",
        buy: "🛒 Buy it",
      };
      const label = decisionLabel[call.input.decision] ?? call.input.decision;
      return `${label} — ${call.input.item}\n${call.input.reasoning}`;
    }

    default:
      return `Unknown tool: ${call.name}`;
  }
}

function coerceScope(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  const out: any = { ...raw };

  const env = out.environment;
  if (typeof env === "string") {
    out.environment = { location: env === "outdoor" ? "outdoor" : "indoor" };
  } else if (env && typeof env === "object" && typeof env.location !== "string") {
    out.environment = { ...env, location: "indoor" };
  }

  const rs = out.referenceScale;
  if (typeof rs === "string") {
    const m = rs.match(/(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
    out.referenceScale = m
      ? { kind: rs, dimensions: { w: parseFloat(m[1]), d: parseFloat(m[2]), h: parseFloat(m[3]) } }
      : { kind: rs };
  } else if (rs && typeof rs === "object" && typeof rs.kind !== "string") {
    out.referenceScale = { ...rs, kind: "object" };
  }

  if (typeof out.budgetCeiling === "string") {
    const n = parseFloat(out.budgetCeiling.replace(/[^0-9.]/g, ""));
    out.budgetCeiling = isNaN(n) ? undefined : n;
  }

  return out;
}
