import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { Tier, Violation } from "../plugins/types";

interface BuildArgs {
  projectId: Id<"projects">;
  partId: Id<"parts"> | undefined;
  violation: Violation;
  tier: Tier;
}

export interface BatchEntry {
  violation: Violation;
  tier: Tier;
  /** If true, also create an escalation linked to this violation and resolve as 'escalated'. */
  escalate: boolean;
  /** Optional override for the escalation question (defaults to violation.message). */
  escalationQuestion?: string;
}

/** Pure builder — used by the open mutation and exercised by unit tests. */
export function buildViolationDoc(args: BuildArgs) {
  const now = Date.now();
  return {
    projectId: args.projectId,
    partId: args.partId,
    ruleId: args.violation.ruleId,
    severity: args.violation.severity,
    tier: args.tier,
    message: args.violation.message,
    agentMessage: args.violation.agentMessage,
    suggestedFix: args.violation.suggestedFix,
    location: args.violation.location,
    status: "open" as const,
    resolution: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export const open = internalMutation({
  args: {
    projectId: v.id("projects"),
    partId: v.optional(v.id("parts")),
    ruleId: v.string(),
    severity: v.union(v.literal("error"), v.literal("warn")),
    tier: v.union(v.literal("auto-fixable"), v.literal("requires-judgment")),
    message: v.string(),
    agentMessage: v.string(),
    suggestedFix: v.optional(v.any()),
    location: v.optional(v.object({
      kind: v.union(
        v.literal("hole"), v.literal("slot"), v.literal("edge"),
        v.literal("bend"), v.literal("face"), v.literal("feature"),
        v.literal("interface"), v.literal("part"),
      ),
      id: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const doc = buildViolationDoc({
      projectId: args.projectId,
      partId: args.partId,
      violation: {
        ruleId: args.ruleId,
        severity: args.severity,
        message: args.message,
        agentMessage: args.agentMessage,
        suggestedFix: args.suggestedFix,
        location: args.location,
      },
      tier: args.tier,
    });
    return await ctx.db.insert("violations", doc);
  },
});

export const resolve = internalMutation({
  args: {
    violationId: v.id("violations"),
    status: v.union(
      v.literal("auto-repaired"),
      v.literal("escalated"),
      v.literal("dismissed"),
      v.literal("resolved"),
    ),
    by: v.union(v.literal("agent"), v.literal("user")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.violationId, {
      status: args.status,
      updatedAt: now,
      resolution: { kind: args.status, by: args.by, at: now, note: args.note },
    });
  },
});

export const listOpenForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("violations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
  },
});

export const processViolations = internalMutation({
  args: {
    projectId: v.id("projects"),
    partId: v.optional(v.id("parts")),
    entries: v.array(v.object({
      violation: v.object({
        ruleId: v.string(),
        severity: v.union(v.literal("error"), v.literal("warn")),
        message: v.string(),
        agentMessage: v.string(),
        suggestedFix: v.optional(v.any()),
        location: v.optional(v.object({
          kind: v.union(
            v.literal("hole"), v.literal("slot"), v.literal("edge"),
            v.literal("bend"), v.literal("face"), v.literal("feature"),
            v.literal("interface"), v.literal("part"),
          ),
          id: v.string(),
        })),
      }),
      tier: v.union(v.literal("auto-fixable"), v.literal("requires-judgment")),
      escalate: v.boolean(),
      escalationQuestion: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      const violationDoc = buildViolationDoc({
        projectId: args.projectId,
        partId: args.partId,
        violation: entry.violation,
        tier: entry.tier,
      });
      const violationId = await ctx.db.insert("violations", violationDoc);

      if (entry.escalate) {
        await ctx.db.insert("escalations", {
          projectId: args.projectId,
          sourceViolationId: violationId,
          question: entry.escalationQuestion ?? entry.violation.message,
          suggestedAnswer: undefined,
          choices: undefined,
          status: "open" as const,
          answer: undefined as string | undefined,
          createdAt: Date.now(),
          answeredAt: undefined as number | undefined,
        });
        const now = Date.now();
        await ctx.db.patch(violationId, {
          status: "escalated" as const,
          updatedAt: now,
          resolution: { kind: "escalated", by: "agent" as const, at: now, note: undefined },
        });
      }
    }
  },
});
