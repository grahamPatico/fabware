import "../plugins";  // side-effect: registers all plugins
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { computeNextAction } from "./phaseMachine";
import { registeredKinds, getPlugin } from "../plugins/registry";
import type { Id } from "../_generated/dataModel";

/**
 * Orchestrator heartbeat. Call after any state change that might advance the plan
 * (specialist completion, user answer to an escalation, scope submitted, etc.).
 *
 * In Step 0 this is mostly a no-op: with no plugins registered, every "designPart"
 * action becomes a logged "noop" planEvent. Plan 2 wires sheet-metal so designPart
 * dispatches the specialist.
 */
export const tick = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ctxData = await ctx.runQuery(internal.orchestrator.queries._internalTickContext, {
      projectId: args.projectId,
    });
    if (!ctxData) return { kind: "wait", reason: "project not found" } as const;
    const { project, parts, openEscalations } = ctxData;

    if (project.useNewHarness !== true) {
      return { kind: "wait", reason: "useNewHarness not enabled" } as const;
    }

    const action = computeNextAction({
      project,
      parts,
      openEscalations,
      registeredKinds: registeredKinds(),
    });

    if (action.kind === "wait") {
      return action;
    }

    if (action.kind === "noop") {
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "noop-logged",
        payload: { message: action.reason },
      });
      return action;
    }

    if (action.kind === "transitionPhase") {
      await ctx.runMutation(internal.orchestrator.projectMutations._setPhase, {
        projectId: args.projectId,
        phase: action.toPhase,
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "phase-changed",
        payload: { fromPhase: action.fromPhase, toPhase: action.toPhase },
      });
      // Re-tick so the next phase gets a chance to advance.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return action;
    }

    if (action.kind === "designPart") {
      // Look up the plugin for the part's kind. computeNextAction already
      // verified registeredKinds.includes(part.kind), so this is defensive.
      const partRecord = parts.find((p: { _id: string }) => p._id === action.partId);
      const partKind = (partRecord as { kind?: string } | undefined)?.kind ?? "sheet_metal";

      // Mark the part 'designing' so a re-entrant tick doesn't re-dispatch it.
      await ctx.runMutation(internal.specialists.sheetMetalInternals._setPartStatus, {
        partId: action.partId as Id<"parts">,
        status: "designing",
      });

      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "specialist-scheduled",
        payload: { partId: action.partId, details: { kind: partKind } },
      });

      // Dispatch the right specialist for this kind. Plugin lookup runs through
      // the registry — useCadIr=true on a sheet-metal part resolves to the
      // dedicated `cad_ir` plugin (Phase 19 gap-closure), legacy parts still
      // resolve to `sheet_metal`. Specialist references are still hardcoded
      // per plugin kind because Convex action refs cannot live on plugin
      // objects (they're built at codegen time).
      const useCadIr = (partRecord as { useCadIr?: boolean } | undefined)?.useCadIr === true;
      const dispatchKind = partKind === "sheet_metal" && useCadIr ? "cad_ir" : partKind;
      const dispatchPlugin = getPlugin(dispatchKind as Parameters<typeof getPlugin>[0]);

      if (dispatchPlugin?.kind === "cad_ir") {
        // CAD IR pipeline — specialist only needs the partId; projectId is
        // recovered from the part record inside the action.
        await ctx.scheduler.runAfter(0, internal.specialists.cadIr.run, {
          partId: action.partId as Id<"parts">,
        });
      } else if (dispatchPlugin?.kind === "sheet_metal") {
        await ctx.scheduler.runAfter(0, internal.specialists.sheetMetal.run, {
          projectId: args.projectId,
          partId: action.partId as Id<"parts">,
        });
      } else {
        // No plugin's specialist registered yet — log and leave the part as 'designing';
        // the next tick will not re-dispatch (status guard) until a future plan ships
        // its specialist. This branch is unreachable in Plan 2 because computeNextAction
        // gates designPart on registeredKinds, which only contains 'sheet_metal'.
        await ctx.runMutation(internal.orchestrator.planEvents.append, {
          projectId: args.projectId,
          kind: "noop-logged",
          payload: { partId: action.partId, message: `specialist for kind="${partKind}" not yet wired` },
        });
      }
      return action;
    }

    return action;
  },
});
