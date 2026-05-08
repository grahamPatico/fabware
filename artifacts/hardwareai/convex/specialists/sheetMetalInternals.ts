import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { PartKind } from "../plugins/types";

// ─── Internal helpers (separate file because actions can't define queries/mutations
//     in the same "use node" file — Convex requires them in a non-node module) ───

export const _loadPartAndProject = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return null;
    const project = await ctx.db.get(part.projectId);
    const peerRows = await ctx.db
      .query("parts")
      .withIndex("by_project", (q) => q.eq("projectId", part.projectId))
      .collect();
    const peerParts = peerRows
      .filter((p) => p._id !== partId)
      .map((p) => ({
        partId: String(p._id),
        label: p.label,
        kind: (p.kind ?? "sheet_metal") as PartKind,
      }));
    return {
      ...part,
      scope: project?.scope ?? null,
      peerParts,
    };
  },
});

export const _setPartStatus = internalMutation({
  args: {
    partId: v.id("parts"),
    status: v.union(
      v.literal("pending"), v.literal("designing"),
      v.literal("ok"), v.literal("escalated"), v.literal("failed"),
    ),
  },
  handler: async (ctx, { partId, status }) => {
    await ctx.db.patch(partId, { status, lastValidationAt: Date.now(), updatedAt: Date.now() });
  },
});

export const _setPartDsl = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    await ctx.db.patch(partId, { dslJson, updatedAt: Date.now() });
  },
});
