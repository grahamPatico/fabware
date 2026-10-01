import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_MODEL, getModel, type ModelSpec } from "./lib/models";

type Pricing = ModelSpec["pricing"];

// Unknown model ids (e.g. the new-harness specialists' defaults) are costed at
// the default model's rates so spend is never under-reported as zero.
const DEFAULT_PRICING: Pricing = getModel(DEFAULT_MODEL)!.pricing;

export function computeCostUsd(
  model: string,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  },
): number {
  const p = getModel(model)?.pricing ?? DEFAULT_PRICING;
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

/** Total USD spent across every feature since `sinceMs` — feeds the daily cap. */
export const spendSince = internalQuery({
  args: { sinceMs: v.number() },
  handler: async (ctx, { sinceMs }) => {
    const rows = await ctx.db
      .query("tokenUsage")
      .withIndex("by_time", (q) => q.gte("createdAt", sinceMs))
      .collect();
    return rows.reduce((sum, r) => sum + r.costUsd, 0);
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
