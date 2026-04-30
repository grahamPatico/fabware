// convex/specialists/cadIrInternals.ts
//
// Internal Convex queries and mutations for the CAD IR specialist.
// Must NOT have "use node" — Convex requires queries/mutations to run in the
// standard runtime. The "use node" specialist action (cadIr.ts) calls these
// via ctx.runQuery / ctx.runMutation.

import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { PartKind } from "../plugins/types";

// ─── _loadPartAndProject ────────────────────────────────────────────────────

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

// ─── _getHeadRevision ───────────────────────────────────────────────────────

export const _getHeadRevision = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part?.headRevisionHash) return null;
    // Find the revision record whose hash matches the part's head pointer.
    const rows = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", (q) =>
        q.eq("partId", partId).eq("hash", part.headRevisionHash!)
      )
      .first();
    return rows ?? null;
  },
});

// ─── _writeRevision ─────────────────────────────────────────────────────────

export const _writeRevision = internalMutation({
  args: {
    partId: v.id("parts"),
    hash: v.string(),
    parent: v.union(v.string(), v.null()),
    ir: v.any(),
    patch: v.optional(v.any()),
    author: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    agentTurn: v.optional(v.object({
      sessionId: v.string(),
      turn: v.number(),
      toolName: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Upsert: if a revision with this hash already exists, return it (idempotent).
    const existing = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", (q) =>
        q.eq("partId", args.partId).eq("hash", args.hash)
      )
      .first();
    if (existing) return existing._id;

    const id = await ctx.db.insert("cad_revisions", {
      partId: args.partId,
      hash: args.hash,
      parent: args.parent,
      ir: args.ir,
      patch: args.patch,
      author: args.author,
      agentTurn: args.agentTurn,
      createdAt: Date.now(),
      executionStatus: "pending",
      violations: [],
    });

    // Advance the part's head pointer.
    await ctx.db.patch(args.partId, {
      headRevisionHash: args.hash,
      updatedAt: Date.now(),
    });

    return id;
  },
});

// ─── _updateRevisionAfterExecution ─────────────────────────────────────────

export const _updateRevisionAfterExecution = internalMutation({
  args: {
    partId: v.id("parts"),
    hash: v.string(),
    executionStatus: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cached"),
    ),
    violations: v.array(v.any()),
    artifactsRefId: v.optional(v.id("cad_revision_artifacts")),
  },
  handler: async (ctx, args) => {
    const rev = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", (q) =>
        q.eq("partId", args.partId).eq("hash", args.hash)
      )
      .first();
    if (!rev) return;

    await ctx.db.patch(rev._id, {
      executionStatus: args.executionStatus,
      violations: args.violations,
      ...(args.artifactsRefId ? { artifactsRefId: args.artifactsRefId } : {}),
    });
  },
});

// ─── _setPartStatus ─────────────────────────────────────────────────────────

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
