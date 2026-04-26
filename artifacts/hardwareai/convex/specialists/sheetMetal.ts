"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { sheetMetalPlugin } from "../plugins/sheet_metal";
import { runSpecialistOnce, type SpecialistResult, buildRepairPrompt, applyToolCallToDsl } from "./_helpers";
import { runAgentTurn } from "../lib/anthropicClient";
import type { PartKind } from "../plugins/types";
import type { Doc } from "../_generated/dataModel";

const REPAIR_TURN_BUDGET = 3;

/**
 * Sheet-metal specialist. Validates a part's stored DSL, attempts auto-repair,
 * writes any remaining violations + escalations, sets the part's status, logs
 * a specialist-completed plan event, and re-ticks the orchestrator.
 *
 * Plan 3 will add an Anthropic agent loop on top of this so the specialist can
 * also DESIGN parts from intent (not just validate existing ones).
 */
export const run = internalAction({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, args) => {
    // 1. Load the part + project.
    // Type annotation required to break TypeScript circularity (same-file ctx.runQuery call).
    type LoadedPart = (Doc<"parts"> & { scope: unknown; peerParts: Array<{ partId: string; label: string; kind: PartKind }> }) | null;
    const part = await ctx.runQuery(internal.specialists.sheetMetalInternals._loadPartAndProject, {
      partId: args.partId,
    }) as LoadedPart;
    if (!part) {
      // Part deleted between scheduling and dispatch. Re-tick so the phase machine
      // re-evaluates without it.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "skipped", reason: "part not found" } as const;
    }

    // 2. Parse DSL. Bail to 'failed' if the part has no DSL (Plan 3 will design from scratch).
    if (!part.dslJson) {
      await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: "no DSL — Plan 3 will design from intent" },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "no DSL" } as const;
    }
    const parsed = sheetMetalPlugin.dslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) {
      await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: `DSL parse failed: ${parsed.error.message}` },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "DSL parse error" } as const;
    }

    // 3. Run the pure specialist loop.
    const result: SpecialistResult<typeof parsed.data> = runSpecialistOnce(sheetMetalPlugin, parsed.data, {
      scope: part.scope ?? null,
      peerParts: part.peerParts,
    });

    // 4. If the auto-repair loop changed the DSL, persist the new dslJson.
    if (result.autoRepairedCount > 0) {
      await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartDsl, {
        partId: args.partId, dslJson: JSON.stringify(result.repairedDsl),
      });
    }

    // 3.5: Agent repair loop. If pure-function validation produced violations whose
    // autoRepair was null (always in Plans 2 & 3), give the Anthropic agent up to
    // REPAIR_TURN_BUDGET turns to apply mechanical fixes via plugin tools.
    let currentDsl = result.repairedDsl;
    let currentViolations = result.violations;
    let agentApplyCount = 0;

    if (currentViolations.length > 0) {
      for (let turn = 0; turn < REPAIR_TURN_BUDGET; turn += 1) {
        const prompt = buildRepairPrompt({
          scope: part.scope,
          partLabel: part.label,
          partDsl: currentDsl,
          violations: currentViolations,
          pluginSystemPromptFragment: sheetMetalPlugin.systemPromptFragment,
          pluginTools: sheetMetalPlugin.tools,
        });

        const turnResult = await runAgentTurn({
          model: "claude-sonnet-4-6",
          effort: "low",
          system: prompt.system,
          tools: prompt.tools,
          messages: [{ role: "user", content: prompt.userMessage }],
        });

        let anyApplied = false;
        for (const toolCall of turnResult.toolCalls) {
          const applied = applyToolCallToDsl(currentDsl, toolCall, sheetMetalPlugin.dslSchema);
          if (applied.applied) {
            currentDsl = applied.dsl;
            anyApplied = true;
            agentApplyCount += 1;
          }
        }

        if (!anyApplied) break;  // agent gave up — nothing further to try

        // Re-validate after applying tool calls.
        currentViolations = sheetMetalPlugin.validate(currentDsl, {
          scope: part.scope ?? null,
          peerParts: part.peerParts,
        });
        if (currentViolations.length === 0) break;
      }

      // If the loop changed the DSL (any agent-apply succeeded), persist it.
      if (agentApplyCount > 0) {
        await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartDsl, {
          partId: args.partId,
          dslJson: JSON.stringify(currentDsl),
        });
      }
    }

    // 5. Write whatever violations survived the repair loop.
    if (currentViolations.length > 0) {
      await ctx.runMutation(internal.orchestrator.violations.processViolations, {
        projectId: args.projectId,
        partId: args.partId,
        entries: currentViolations.map((v) => ({
          violation: v,
          tier: "requires-judgment" as const,
          escalate: true,
        })),
      });
    }

    // 6. Set part status + log completion.
    await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartStatus, {
      partId: args.partId,
      status: currentViolations.length === 0 ? "ok" : "escalated",
    });
    await ctx.runMutation(internal.orchestrator.planEvents.append, {
      projectId: args.projectId, kind: "specialist-completed",
      payload: {
        partId: String(args.partId),
        details: {
          status: currentViolations.length === 0 ? "ok" : "escalated",
          violations: currentViolations.length,
          autoRepaired: result.autoRepairedCount,
          agentApplied: agentApplyCount,
        },
      },
    });

    // 7. Re-tick so the phase machine re-evaluates with the part's new status.
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
    return { status: currentViolations.length === 0 ? "ok" as const : "escalated" as const, violations: currentViolations.length };
  },
});

// Internal helpers (queries/mutations) are in sheetMetalInternals.ts because
// Convex requires queries/mutations to NOT be in "use node" files.
// The action references them via internal.specialists.sheetMetalInternals.*
