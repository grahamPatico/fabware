import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

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
