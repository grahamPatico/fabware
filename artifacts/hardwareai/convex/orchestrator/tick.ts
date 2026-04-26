import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { computeNextAction } from "./phaseMachine";
import { registeredKinds } from "../plugins/registry";

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
        kind: "specialist-scheduled",      // benign reuse — Plan 2 splits this out
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
      // Plan 2 wires the actual specialist dispatch here.
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "specialist-scheduled",
        payload: { partId: action.partId, message: "specialist not yet wired (Plan 2)" },
      });
      return action;
    }

    return action;
  },
});
