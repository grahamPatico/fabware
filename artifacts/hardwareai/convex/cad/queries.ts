// convex/cad/queries.ts
//
// Public queries for CAD IR revision artifacts. Phase 19 gap-closure: the
// frontend (CadPreview, BOM/cost panels) needs URL access to persisted
// build outputs, and the live specialist now writes them on every
// successful revision.

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Fetch the persisted compile-target artifacts for the head revision of a
 * part. Returns null if the part has no head revision yet, or if the
 * revision has no artifacts row (e.g. the legacy code path before Phase
 * 19 gap-closure persisted any compile output).
 *
 * `glbUrl` is resolved via ctx.storage.getUrl when a glbStorageId is
 * present — frontend consumers can hand it directly to <CadPreview>.
 */
export const headRevisionArtifacts = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part?.headRevisionHash) return null;

    const rev = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", (q) =>
        q.eq("partId", partId).eq("hash", part.headRevisionHash!),
      )
      .first();
    if (!rev?.artifactsRefId) return null;

    const artifacts = await ctx.db.get(rev.artifactsRefId);
    if (!artifacts) return null;

    const glbUrl = artifacts.glbStorageId
      ? await ctx.storage.getUrl(artifacts.glbStorageId)
      : null;

    return {
      revisionHash: artifacts.revisionHash,
      glbUrl,
      urdfText: artifacts.urdfText ?? null,
      mjcfText: artifacts.mjcfText ?? null,
      bomJson: artifacts.bomJson ?? null,
      costJson: artifacts.costJson ?? null,
      fabricationCostJson: artifacts.fabricationCostJson ?? null,
      machineCostJson: artifacts.machineCostJson ?? null,
      assemblyScriptsJson: artifacts.assemblyScriptsJson ?? null,
    };
  },
});

/**
 * Fetch the persisted GLB URL for a specific revision (by hash). Used by
 * history/preview UIs that need to scrub older revisions.
 */
export const revisionGlbUrl = query({
  args: { partId: v.id("parts"), revisionHash: v.string() },
  handler: async (ctx, { partId, revisionHash }) => {
    const rev = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", (q) =>
        q.eq("partId", partId).eq("hash", revisionHash),
      )
      .first();
    if (!rev?.artifactsRefId) return null;
    const artifacts = await ctx.db.get(rev.artifactsRefId);
    if (!artifacts?.glbStorageId) return null;
    return await ctx.storage.getUrl(artifacts.glbStorageId);
  },
});
