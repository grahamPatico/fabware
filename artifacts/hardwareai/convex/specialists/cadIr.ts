"use node";

// convex/specialists/cadIr.ts
//
// CAD IR specialist action. Implements the patch+execute repair loop:
//   1. Load part + head revision IR (or build an empty IR if none exists).
//   2. Validate tier-1 (schema) + tier-4 (manufacturing).
//   3. If clean, run sandbox geometry execution + tier-3 (geometry) validation.
//   4. If any violations remain, call the Anthropic agent (via runAgentTurn) for
//      up to TURN_BUDGET turns. Each turn's tool calls are converted to typed
//      Patch objects and applied via applyPatch.
//   5. Write the final revision and part status; re-tick the orchestrator.

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

import { cadIrPlugin, withCadIrSandbox } from "../cad/plugin";
import { applyPatch } from "../cad/patch/apply";
import { toolCallToPatch } from "../cad/patch/toolCallToPatch";
import type { CadIr } from "../cad/ir/types";
import { emptyIr } from "../cad/ir/empty";
import { compileToBuild123d } from "../cad/codegen/compileToBuild123d";
import { compileAssembly } from "../cad/codegen/compileAssembly";
import { compileToUrdf } from "../cad/codegen/compileToUrdf";
import { compileToMjcf } from "../cad/codegen/compileToMjcf";
import { compileBom } from "../cad/compile/bom";
import { compileCost, BUILTIN_PRICING } from "../cad/compile/cost";
// ME-01: \`compileCost\` invokes the fabrication+machine cost compilers
// internally and surfaces their results on the CostResult envelope, so the
// specialist no longer imports them directly.
import { resolveIr } from "../cad/resolve/resolveIr";
import { runSandbox } from "../cad/executor/runSandbox";
import { parseEntities } from "../cad/executor/entitiesParser";
import { hashIr } from "../cad/revisions/hash";
import { runAgentTurn } from "../lib/anthropicClient";
import type { Violation } from "../plugins/types";

const TURN_BUDGET = 3;

/**
 * Extract all face tags referenced by HoleFeature entries in a CadIr.
 * The geometry-tier validator uses these to check that the sandbox produced
 * the expected face entities.
 */
function extractRequestedFaceTags(ir: CadIr): string[] {
  const tags: string[] = [];
  for (const f of ir.features) {
    if (f.kind === "hole") {
      tags.push(`${f.face.feature}.${f.face.tag}`);
    }
  }
  return tags;
}

export const run = internalAction({
  args: { partId: v.id("parts") },
  handler: async (ctx, args) => {
    // ── 1. Load part + project ──────────────────────────────────────────────
    const part = await ctx.runQuery(
      internal.specialists.cadIrInternals._loadPartAndProject,
      { partId: args.partId },
    );

    if (!part) {
      // Part deleted between scheduling and dispatch; re-tick to unblock.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, {
        projectId: args.partId as unknown as Id<"projects">,
      });
      return { status: "skipped", reason: "part not found" } as const;
    }

    const projectId = part.projectId as Id<"projects">;
    const partCtx = { scope: part.scope ?? null, peerParts: part.peerParts };

    // ── 2. Build / recover the working IR ──────────────────────────────────
    // If the part already has a head revision, use it. Otherwise start empty.
    let ir: CadIr;

    const headRev = await ctx.runQuery(
      internal.specialists.cadIrInternals._getHeadRevision,
      { partId: args.partId },
    );

    if (headRev?.ir) {
      const parsed = cadIrPlugin.dslSchema.safeParse(headRev.ir);
      ir = parsed.success ? parsed.data : emptyIr();
    } else if (part.dslJson) {
      // Fallback: a part may have a legacy dslJson field populated before
      // the CAD IR pipeline existed.
      const parsed = cadIrPlugin.dslSchema.safeParse(JSON.parse(part.dslJson));
      ir = parsed.success ? parsed.data : emptyIr();
    } else {
      ir = emptyIr();
    }

    // ── 3. Repair loop ─────────────────────────────────────────────────────
    // Each iteration:
    //   a. Tier-1 + tier-4 validate
    //   b. If clean → run sandbox + tier-3 validate
    //   c. If any violations → ask agent → apply patches → repeat

    let currentIr = ir;
    let finalViolations: Violation[] = [];
    let sandboxLog = "";
    // Capture the most recent successful sandbox result so we can persist
    // its glb + run the downstream compile targets once the loop converges.
    // HI-01: track the IR hash that produced the GLB so we can detect a
    // stale-preview scenario where the loop exits with a more recent IR
    // (e.g. agent fixed geometry but later schema-tier validation failed)
    // and refuse to persist the GLB if it does not match the final IR.
    let lastSandboxGlb: string | null = null;
    let lastSandboxGlbForHash: string | null = null;

    for (let turn = 0; turn <= TURN_BUDGET; turn += 1) {
      // a. Tiers 1, 2, 4, 5 (plugin.validate without sandbox context)
      const pluginViolations = cadIrPlugin.validate(currentIr, partCtx);

      if (pluginViolations.length === 0) {
        // b. Run sandbox, then re-run plugin.validate with sandbox context
        //    so Tier 3 (geometry) fires inside the plugin contract.
        let scriptPython: string;
        try {
          const resolved = resolveIr(currentIr);
          scriptPython = compileToBuild123d(resolved);
        } catch (err) {
          finalViolations = [
            {
              ruleId: "schema.resolution-error",
              severity: "error",
              message: "Failed to resolve or compile IR",
              agentMessage: `Could not compile IR to Python: ${err instanceof Error ? err.message : String(err)}`,
            },
          ];
          break;
        }

        // HI-02: \`runSandbox\` can throw on Vercel Sandbox provisioning
        // failure, network errors, pip-install boot failures, or any
        // unexpected runtime error. Without this catch, the throw propagates
        // out of the action handler before \`_writeRevision\` runs and before
        // \`_setPartStatus\` updates the part — leaving the part stuck at
        // \`status: "designing"\`, which the orchestrator's status guard
        // (tick.ts:71-75) treats as in-progress and refuses to re-dispatch.
        // The part would be permanently stranded.
        let sandboxResult: Awaited<ReturnType<typeof runSandbox>>;
        try {
          sandboxResult = await runSandbox(scriptPython);
        } catch (err) {
          finalViolations = [
            {
              ruleId: "infra.sandbox-error",
              severity: "error",
              message: "Sandbox execution failed",
              agentMessage: `The geometry sandbox could not run: ${err instanceof Error ? err.message : String(err)}`,
            },
          ];
          break;
        }
        sandboxLog = sandboxResult.log;
        lastSandboxGlb = sandboxResult.glb;
        // Record which IR hash this GLB was generated from so the persist
        // step (4a/4b) can verify it still matches the final IR.
        lastSandboxGlbForHash = hashIr(currentIr);

        // ME-03: \`runSandbox.ok\` is \`exitCode === 0\`. When the build123d
        // script crashes (exit code != 0), entities is \`[]\` and \`log\`
        // contains the Python traceback. Running Tier 3 against empty
        // entities would spuriously raise "missing face tags" violations —
        // the agent would be asked to repair geometry that never compiled
        // and wouldn't know what to do. Synthesize a build-failed violation
        // with the log tail; the agent gets a concrete error to react to,
        // and Tier 3 is skipped (since entities are empty by definition).
        if (!sandboxResult.ok) {
          finalViolations = [
            {
              ruleId: "geom.build-failed",
              severity: "error",
              message: "Geometry sandbox build failed",
              agentMessage: `Build123d execution failed (exit != 0):\n${sandboxResult.log.slice(-800)}`,
            },
          ];
          if (turn === TURN_BUDGET) break;
          // Fall through into the agent-repair branch below by jumping
          // past the success-path validation block.
        } else {
        const entities = parseEntities(sandboxResult.entities);
        const requestedFaceTags = extractRequestedFaceTags(currentIr);
        // HI-04: thread the sandbox payload through PartContext.pluginContext
        // via the canonical helper rather than casting to a plugin-specific
        // subtype. Plugin's \`validate\` reads the payload via the same key.
        const sandboxCtx = withCadIrSandbox(partCtx, {
          log: sandboxResult.log,
          entities,
          requestedFaceTags,
        });
        const geomViolations = cadIrPlugin.validate(currentIr, sandboxCtx);

        if (geomViolations.length === 0) {
          finalViolations = [];
          break;
        }

        // Geometry violations — fall through to agent repair if budget remains.
        finalViolations = geomViolations;
        if (turn === TURN_BUDGET) break;
        } // end of else (sandboxResult.ok) — ME-03
      } else {
        finalViolations = pluginViolations;
        if (turn === TURN_BUDGET) break;
      }

      // c. Agent repair turn
      const violationLines = finalViolations
        .map((v, i) => `${i + 1}. [${v.ruleId}] ${v.agentMessage}`)
        .join("\n");

      const userMessage =
        `Current CAD IR:\n\`\`\`json\n${JSON.stringify(currentIr, null, 2)}\n\`\`\`\n\n` +
        `Violations to fix (turn ${turn + 1}/${TURN_BUDGET}):\n${violationLines}\n\n` +
        "Respond with tool calls that minimally repair the violations.";

      const agentResult = await runAgentTurn({
        model: cadIrPlugin.defaultModel?.model ?? "claude-sonnet-4-6",
        effort: cadIrPlugin.defaultModel?.effort ?? "med",
        system: cadIrPlugin.systemPromptFragment,
        tools: cadIrPlugin.tools,
        messages: [{ role: "user", content: userMessage }],
      });

      let anyApplied = false;
      for (const toolCall of agentResult.toolCalls) {
        const patch = toolCallToPatch(toolCall);
        if (!patch) continue;

        const result = applyPatch(currentIr, patch);
        if (result.schemaViolations.length === 0) {
          currentIr = result.ir;
          anyApplied = true;
        }
      }

      // If the agent made no progress, stop trying.
      if (!anyApplied) break;
    }

    // ── 4. Persist final state ──────────────────────────────────────────────
    const irHash = hashIr(currentIr);

    // Always write the revision — succeeded or failed — so the head pointer
    // advances and the agent's progress is durable.
    await ctx.runMutation(
      internal.specialists.cadIrInternals._writeRevision,
      {
        partId: args.partId,
        hash: irHash,
        parent: headRev?.hash ?? null,
        ir: currentIr,
        author: "agent",
      },
    );

    if (finalViolations.length === 0) {
      // ── 4a. Compile all targets and persist artifacts (Phase 19 gap-closure) ──
      //
      // Wire the live runtime to invoke the four compile targets that were
      // previously test-only: compileAssembly, compileToUrdf, compileToMjcf,
      // compileBom, compileCost (+ fabrication & machine cost). Each runs
      // best-effort: a compile failure is logged but does not fail the
      // revision (build123d is the primary artifact and already succeeded
      // via the sandbox).
      let glbStorageId: Id<"_storage"> | undefined;
      let urdfText: string | undefined;
      let mjcfText: string | undefined;
      let bomJson: unknown | undefined;
      let costJson: unknown | undefined;
      let fabricationCostJson: unknown | undefined;
      let machineCostJson: unknown | undefined;
      let assemblyScriptsJson: Record<string, string> | undefined;

      // (i) Persist GLB if the sandbox produced one — but only when the
      // captured GLB still matches the final IR (HI-01). On the success path
      // this is normally true (we exit the loop the same turn the sandbox
      // ran clean), but we gate defensively in case future loop edits
      // reorder turns.
      if (lastSandboxGlb && lastSandboxGlbForHash === irHash) {
        try {
          glbStorageId = await ctx.runAction(
            internal.specialists.cadIrInternals._storeGlbBlob,
            { base64: lastSandboxGlb },
          );
        } catch (err) {
          // Storage error — log via planEvents but don't fail the revision.
          // (sandbox already proved the build is valid.)
          // eslint-disable-next-line no-console
          console.warn("[cadIr] failed to persist GLB:", err);
        }
      }

      // (ii) Multi-part compile targets. URDF/MJCF/assembly are only meaningful
      // when the IR has parts/joints. BOM and cost run whenever parts are
      // present.
      const hasAssembly = currentIr.parts && Object.keys(currentIr.parts).length > 0;

      if (hasAssembly) {
        try {
          assemblyScriptsJson = compileAssembly(currentIr);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileAssembly failed:", err);
        }

        const hasJoints = currentIr.joints && Object.keys(currentIr.joints).length > 0;
        if (hasJoints) {
          try {
            urdfText = compileToUrdf(currentIr, "assembly");
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[cadIr] compileToUrdf failed:", err);
          }
          try {
            mjcfText = compileToMjcf(currentIr, "assembly");
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[cadIr] compileToMjcf failed:", err);
          }
        }

        try {
          bomJson = compileBom(currentIr);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileBom failed:", err);
        }

        // ME-01: \`compileCost\` already invokes \`compileFabricationCost\` and
        // \`compileMachineCost\` internally and returns their results on the
        // \`CostResult\` envelope (\`fabricationTotalUsd\` and \`machine\`). Reuse
        // them from \`costResult\` rather than recomputing — both compilers
        // are pure, but doubling the work doubles latency for parts with
        // non-trivial fabrication graphs, and re-invoking risks the persisted
        // JSON drifting from \`costJson\` if the two call sites ever pass
        // different config.
        try {
          const costResult = compileCost(currentIr, BUILTIN_PRICING);
          costJson = costResult;
          fabricationCostJson = { totalUsd: costResult.fabricationTotalUsd };
          machineCostJson = { perPart: costResult.machine };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileCost failed:", err);
        }
      }

      await ctx.runMutation(
        internal.specialists.cadIrInternals._updateRevisionAfterExecution,
        {
          partId: args.partId,
          hash: irHash,
          executionStatus: "succeeded",
          violations: [],
          glbStorageId,
          urdfText,
          mjcfText,
          bomJson,
          costJson,
          fabricationCostJson,
          machineCostJson,
          assemblyScriptsJson,
        },
      );
    } else {
      // ── 4b. Failed revision — record violations + sandbox glb (best-effort). ──
      // HI-01: only persist the GLB when it was generated from the same IR
      // that's about to be persisted. On the failed path the loop frequently
      // ran the sandbox earlier on a different IR (e.g. agent fixed geometry
      // but later schema/manufacturing repair failed); persisting that
      // earlier GLB would silently render geometry that doesn't match the
      // final IR snapshot, with no UI signal.
      let glbStorageId: Id<"_storage"> | undefined;
      if (lastSandboxGlb && lastSandboxGlbForHash === irHash) {
        try {
          glbStorageId = await ctx.runAction(
            internal.specialists.cadIrInternals._storeGlbBlob,
            { base64: lastSandboxGlb },
          );
        } catch {
          // ignore — failed revision; preview is opportunistic.
        }
      }

      await ctx.runMutation(
        internal.specialists.cadIrInternals._updateRevisionAfterExecution,
        {
          partId: args.partId,
          hash: irHash,
          executionStatus: "failed",
          violations: finalViolations,
          glbStorageId,
        },
      );

      // Surface violations through the harness.
      await ctx.runMutation(internal.orchestrator.violations.processViolations, {
        projectId,
        partId: args.partId,
        entries: finalViolations.map((v) => ({
          violation: v,
          tier: "requires-judgment" as const,
          escalate: true,
        })),
      });
    }

    const finalStatus = finalViolations.length === 0 ? "ok" : "escalated";

    await ctx.runMutation(
      internal.specialists.cadIrInternals._setPartStatus,
      { partId: args.partId, status: finalStatus },
    );

    await ctx.runMutation(internal.orchestrator.planEvents.append, {
      projectId,
      kind: "specialist-completed",
      payload: {
        partId: String(args.partId),
        details: {
          pipeline: "cad-ir",
          status: finalStatus,
          violations: finalViolations.length,
          sandboxLog: sandboxLog.slice(0, 500), // truncate for storage
        },
      },
    });

    // Re-tick so the phase machine re-evaluates.
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId });

    return {
      status: finalStatus,
      violations: finalViolations.length,
    } as const;
  },
});
