import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

type Pricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const PRICING: Record<string, Pricing> = {
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const DEFAULT_PRICING: Pricing = PRICING["claude-sonnet-4-6"];

export function computeCostUsd(
  model: string,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  const perMTok = (n: number, rate: number) => (n / 1_000_000) * rate;
  return (
    perMTok(tokens.inputTokens, p.input) +
    perMTok(tokens.outputTokens, p.output) +
    perMTok(tokens.cacheReadTokens, p.cacheRead) +
    perMTok(tokens.cacheCreationTokens, p.cacheWrite)
  );
}

export const record = internalMutation({
  args: {
    feature: v.string(),
    model: v.string(),
    effort: v.optional(v.string()),
    threadId: v.optional(v.id("threads")),
    projectId: v.optional(v.id("projects")),
    messageId: v.optional(v.id("messages")),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheCreationTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cacheReadTokens = args.cacheReadTokens ?? 0;
    const cacheCreationTokens = args.cacheCreationTokens ?? 0;
    const costUsd = computeCostUsd(args.model, {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    });
    return await ctx.db.insert("tokenUsage", {
      feature: args.feature,
      model: args.model,
      effort: args.effort,
      threadId: args.threadId,
      projectId: args.projectId,
      messageId: args.messageId,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
      createdAt: Date.now(),
    });
  },
});

export const summary = query({
  args: {
    sinceMs: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, { sinceMs, projectId }) => {
    const cutoff = sinceMs ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = projectId
      ? await ctx.db
          .query("tokenUsage")
          .withIndex("by_project_time", (q) =>
            q.eq("projectId", projectId).gte("createdAt", cutoff),
          )
          .collect()
      : await ctx.db
          .query("tokenUsage")
          .withIndex("by_time", (q) => q.gte("createdAt", cutoff))
          .collect();

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;
    let totalCostUsd = 0;
    const byModel: Record<string, { calls: number; costUsd: number; inputTokens: number; outputTokens: number }> = {};
    const byFeature: Record<string, { calls: number; costUsd: number }> = {};

    for (const r of rows) {
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCacheRead += r.cacheReadTokens;
      totalCacheCreation += r.cacheCreationTokens;
      totalCostUsd += r.costUsd;

      const m = (byModel[r.model] ??= { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 });
      m.calls += 1;
      m.costUsd += r.costUsd;
      m.inputTokens += r.inputTokens;
      m.outputTokens += r.outputTokens;

      const f = (byFeature[r.feature] ??= { calls: 0, costUsd: 0 });
      f.calls += 1;
      f.costUsd += r.costUsd;
    }

    return {
      sinceMs: cutoff,
      calls: rows.length,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheReadTokens: totalCacheRead,
      totalCacheCreationTokens: totalCacheCreation,
      totalCostUsd,
      byModel,
      byFeature,
    };
  },
});
