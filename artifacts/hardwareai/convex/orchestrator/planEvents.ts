import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { PlanEventKind, PlanEventPayload } from "../plugins/types";

interface BuildArgs {
  projectId: Id<"projects">;
  kind: PlanEventKind;
  payload: PlanEventPayload;
}

/** Pure builder — used by the mutation below and exercised by unit tests. */
export function buildPlanEvent(args: BuildArgs) {
  return {
    projectId: args.projectId,
    at: Date.now(),
    kind: args.kind,
    payload: args.payload,
  };
}

export const append = internalMutation({
  args: {
    projectId: v.id("projects"),
    kind: v.union(
      v.literal("phase-changed"),
      v.literal("noop-logged"),
      v.literal("specialist-scheduled"),
      v.literal("specialist-completed"),
      v.literal("auto-repaired"),
      v.literal("violation-opened"),
      v.literal("violation-resolved"),
      v.literal("escalation-opened"),
      v.literal("escalation-answered"),
    ),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const ev = buildPlanEvent({
      projectId: args.projectId,
      kind: args.kind as PlanEventKind,
      payload: args.payload as PlanEventPayload,
    });
    await ctx.db.insert("planEvents", ev);
  },
});
