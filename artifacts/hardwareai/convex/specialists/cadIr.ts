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

import { cadIrPlugin, type CadIrPartContext } from "../cad/plugin";
import { applyPatch } from "../cad/patch/apply";
import type { Patch } from "../cad/patch/types";
import type { CadIr, Feature, SketchDef, SketchEntity, PartRef, Joint, Connection, SketchConstraint, ExternalPartRef } from "../cad/ir/types";
import type { ParameterDef } from "../cad/ir/types";
import { emptyIr } from "../cad/ir/empty";
import { compileToBuild123d } from "../cad/codegen/compileToBuild123d";
import { compileAssembly } from "../cad/codegen/compileAssembly";
import { compileToUrdf } from "../cad/codegen/compileToUrdf";
import { compileToMjcf } from "../cad/codegen/compileToMjcf";
import { compileBom } from "../cad/compile/bom";
import { compileCost, BUILTIN_PRICING } from "../cad/compile/cost";
import { compileFabricationCost } from "../cad/compile/fabricationCost";
import { compileMachineCost } from "../cad/compile/machineCost";
import { resolveIr } from "../cad/resolve/resolveIr";
import { runSandbox } from "../cad/executor/runSandbox";
import { parseEntities } from "../cad/executor/entitiesParser";
import { hashIr } from "../cad/revisions/hash";
import { runAgentTurn } from "../lib/anthropicClient";
import type { Violation } from "../plugins/types";

const TURN_BUDGET = 3;

/**
 * Convert an agent tool call (name + input) to a typed Patch, or null if
 * the tool name is not recognized or the input shape is invalid.
 */
function toolCallToPatch(tool: { name: string; input: unknown }): Patch | null {
  const inp = tool.input as Record<string, unknown>;

  if (tool.name === "set_parameter") {
    // The tool input matches the ParameterDef shape.
    if (
      typeof inp?.id !== "string" ||
      (typeof inp?.value !== "number" && typeof inp?.value !== "string")
    ) {
      return null;
    }
    const param: ParameterDef = {
      id: inp.id as string,
      value: inp.value as number | string,
      unit: inp.unit as ParameterDef["unit"],
      description: typeof inp.description === "string" ? inp.description : undefined,
      bounds: inp.bounds as ParameterDef["bounds"],
    };
    return { kind: "set_parameter", param };
  }

  if (tool.name === "add_feature") {
    if (!inp?.feature || typeof inp.feature !== "object") return null;
    // Trust the agent — applyPatch will schema-validate the result.
    return { kind: "add_feature", feature: inp.feature as Feature };
  }

  if (tool.name === "modify_feature") {
    if (typeof inp?.featureId !== "string" || !inp?.changes || typeof inp.changes !== "object") return null;
    return { kind: "modify_feature", featureId: inp.featureId, changes: inp.changes as Partial<Feature> };
  }

  if (tool.name === "suppress") {
    if (typeof inp?.featureId !== "string") return null;
    return { kind: "suppress", featureId: inp.featureId };
  }

  if (tool.name === "unsuppress") {
    if (typeof inp?.featureId !== "string") return null;
    return { kind: "unsuppress", featureId: inp.featureId };
  }

  if (tool.name === "reorder_feature") {
    if (typeof inp?.featureId !== "string") return null;
    return {
      kind: "reorder_feature",
      featureId: inp.featureId,
      beforeFeatureId: typeof inp.beforeFeatureId === "string" ? inp.beforeFeatureId : undefined,
      afterFeatureId: typeof inp.afterFeatureId === "string" ? inp.afterFeatureId : undefined,
    };
  }

  if (tool.name === "remove") {
    if (
      typeof inp?.entityType !== "string" ||
      !["parameter", "sketch", "feature"].includes(inp.entityType) ||
      typeof inp?.id !== "string"
    ) {
      return null;
    }
    return {
      kind: "remove",
      entityType: inp.entityType as "parameter" | "sketch" | "feature",
      id: inp.id,
    };
  }

  if (tool.name === "add_sketch") {
    if (!inp?.sketch || typeof inp.sketch !== "object") return null;
    return { kind: "add_sketch", sketch: inp.sketch as SketchDef };
  }

  if (tool.name === "modify_sketch") {
    if (typeof inp?.sketchId !== "string" || !inp?.op || typeof inp.op !== "object") return null;
    const op = inp.op as Record<string, unknown>;
    if (typeof op.kind !== "string") return null;

    switch (op.kind) {
      case "set_plane":
        if (!op.plane) return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "set_plane", plane: op.plane as import("../cad/ir/types").PlaneRef } };
      case "add_entity":
        if (!op.entity || typeof op.entity !== "object") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "add_entity", entity: op.entity as SketchEntity } };
      case "remove_entity":
        if (typeof op.entityId !== "string") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "remove_entity", entityId: op.entityId } };
      case "modify_entity":
        if (typeof op.entityId !== "string" || !op.changes) return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "modify_entity", entityId: op.entityId, changes: op.changes as Partial<SketchEntity> } };
      case "add_constraint":
        if (!op.constraint || typeof op.constraint !== "object") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "add_constraint", constraint: op.constraint as SketchConstraint } };
      case "remove_constraint":
        if (typeof op.constraintId !== "string") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "remove_constraint", constraintId: op.constraintId } };
      default:
        return null;
    }
  }

  // ── Phase 4: Assembly tool dispatchers ──────────────────────────────────────

  if (tool.name === "add_part") {
    if (typeof inp?.id !== "string") return null;
    // Phase 9: support both inline (ir field) and external (vendor+partNumber) variants.
    const isExternal = inp?.kind === "external";
    if (isExternal) {
      if (typeof inp?.vendor !== "string" || typeof inp?.partNumber !== "string") return null;
      const part: PartRef = {
        id: inp.id,
        kind: "external",
        vendor: inp.vendor,
        partNumber: inp.partNumber,
        description: typeof inp.description === "string" ? inp.description : undefined,
        origin: inp.origin as PartRef["origin"],
        rotation: inp.rotation as PartRef["rotation"],
        boundingBox: inp.boundingBox as ExternalPartRef["boundingBox"],
      };
      return { kind: "add_part", part };
    }
    // Inline variant (default)
    if (!inp?.ir || typeof inp.ir !== "object") return null;
    const part: PartRef = {
      id: inp.id,
      kind: inp.kind === "inline" ? "inline" : undefined,
      ir: inp.ir as CadIr,
      origin: inp.origin as PartRef["origin"],
      rotation: inp.rotation as PartRef["rotation"],
    };
    return { kind: "add_part", part };
  }

  if (tool.name === "add_joint") {
    if (
      typeof inp?.id !== "string" ||
      typeof inp?.parent !== "string" ||
      typeof inp?.child !== "string" ||
      typeof inp?.type !== "string"
    ) return null;
    const joint: Joint = {
      id: inp.id,
      parent: inp.parent,
      child: inp.child,
      type: inp.type as Joint["type"],
      axis: inp.axis as Joint["axis"],
      limits: inp.limits as Joint["limits"],
      origin: inp.origin as Joint["origin"],
    };
    return { kind: "add_joint", joint };
  }

  if (tool.name === "add_connection") {
    if (
      typeof inp?.partA !== "string" ||
      typeof inp?.featureA !== "string" ||
      typeof inp?.partB !== "string" ||
      typeof inp?.featureB !== "string" ||
      typeof inp?.type !== "string"
    ) return null;
    const connection: Connection = {
      partA: inp.partA,
      featureA: inp.featureA,
      partB: inp.partB,
      featureB: inp.featureB,
      type: inp.type as Connection["type"],
    };
    return { kind: "add_connection", connection };
  }

  return null;
}

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
    let lastSandboxGlb: string | null = null;

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

        const sandboxResult = await runSandbox(scriptPython);
        sandboxLog = sandboxResult.log;
        lastSandboxGlb = sandboxResult.glb;

        const entities = parseEntities(sandboxResult.entities);
        const requestedFaceTags = extractRequestedFaceTags(currentIr);
        const sandboxCtx: CadIrPartContext = {
          ...partCtx,
          sandbox: { log: sandboxResult.log, entities, requestedFaceTags },
        };
        const geomViolations = cadIrPlugin.validate(currentIr, sandboxCtx);

        if (geomViolations.length === 0) {
          finalViolations = [];
          break;
        }

        // Geometry violations — fall through to agent repair if budget remains.
        finalViolations = geomViolations;
        if (turn === TURN_BUDGET) break;
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

      // (i) Persist GLB if the sandbox produced one.
      if (lastSandboxGlb) {
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

        try {
          costJson = compileCost(currentIr, BUILTIN_PRICING);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileCost failed:", err);
        }

        try {
          fabricationCostJson = compileFabricationCost(currentIr);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileFabricationCost failed:", err);
        }

        try {
          machineCostJson = compileMachineCost(currentIr);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[cadIr] compileMachineCost failed:", err);
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
      let glbStorageId: Id<"_storage"> | undefined;
      if (lastSandboxGlb) {
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
