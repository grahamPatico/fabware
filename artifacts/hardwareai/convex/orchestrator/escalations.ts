import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

interface BuildArgs {
  projectId: Id<"projects">;
  sourceViolationId: Id<"violations"> | undefined;
  question: string;
  suggestedAnswer?: string;
  choices?: string[];
}

export function buildEscalationDoc(args: BuildArgs) {
  return {
    projectId: args.projectId,
    sourceViolationId: args.sourceViolationId,
    question: args.question,
    suggestedAnswer: args.suggestedAnswer,
    choices: args.choices,
    status: "open" as const,
    answer: undefined as string | undefined,
    createdAt: Date.now(),
    answeredAt: undefined as number | undefined,
  };
}

export const open = internalMutation({
  args: {
    projectId: v.id("projects"),
    sourceViolationId: v.optional(v.id("violations")),
    question: v.string(),
    suggestedAnswer: v.optional(v.string()),
    choices: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = buildEscalationDoc({
      projectId: args.projectId,
      sourceViolationId: args.sourceViolationId,
      question: args.question,
      suggestedAnswer: args.suggestedAnswer,
      choices: args.choices,
    });
    return await ctx.db.insert("escalations", doc);
  },
});

export const answer = internalMutation({
  args: { escalationId: v.id("escalations"), answer: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.escalationId, {
      status: "answered",
      answer: args.answer,
      answeredAt: Date.now(),
    });
  },
});

export const listOpenForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
  },
});

/**
 * Public — called by the UI when a user answers an escalation. Patches the
 * escalation row and re-ticks the orchestrator so the phase machine can advance
 * (the escalation that was blocking the wait state is now resolved).
 *
 * Plan 4+ may add an authorization check; for Step-0/1 this is open-by-id like
 * setUseNewHarness and updateScope.
 */
export const answerEscalation = mutation({
  args: { escalationId: v.id("escalations"), answer: v.string() },
  handler: async (ctx, args) => {
    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) throw new Error("escalation not found");
    await ctx.db.patch(args.escalationId, {
      status: "answered",
      answer: args.answer,
      answeredAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, {
      projectId: escalation.projectId,
    });
  },
});
