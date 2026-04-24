import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { buildFeatureGraph } from "./lib/featureGraph";
import { generateSvgPreview } from "./lib/dxfGenerator";
import type { Doc, Id } from "./_generated/dataModel";

function safeJsonParse<T = unknown>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function renderRevisionSpec(revision: Doc<"partRevisions">) {
  const snapshot = safeJsonParse<Record<string, unknown>>(revision.specSnapshot, {});
  const dslRaw = safeJsonParse<unknown>(revision.dslJson, null);
  const dslParse = dslRaw ? PartDslSchema.safeParse(dslRaw) : null;
  const dsl = dslParse?.success ? dslParse.data : null;
  const graph = dsl ? buildFeatureGraph(dsl) : null;
  const svg = dsl
    ? generateSvgPreview({ ...snapshot, dsl, featureGraph: graph })
    : (snapshot as { svgPreview?: string }).svgPreview ?? null;
  return { snapshot, dsl, graph, svg };
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("partRevisions")
      .withIndex("by_project_revision", (q) => q.eq("projectId", projectId))
      .collect();
    return rows
      .sort((a, b) => a.revisionNumber - b.revisionNumber)
      .map((r) => ({
        id: r._id,
        projectId: r.projectId,
        revisionNumber: r.revisionNumber,
        dslJson: r.dslJson,
        rationale: r.rationale,
        createdAt: r.createdAt,
      }));
  },
});

export const get = query({
  args: {
    projectId: v.id("projects"),
    revisionId: v.id("partRevisions"),
  },
  handler: async (ctx, { projectId, revisionId }) => {
    const revision = await ctx.db.get(revisionId);
    if (!revision || revision.projectId !== projectId) return null;
    const activeSpec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    const { snapshot, svg } = renderRevisionSpec(revision);
    const previewSpec = {
      ...(activeSpec ?? {}),
      ...snapshot,
      svgPreview: svg,
      dslJson: revision.dslJson,
      currentRevisionId: activeSpec?.currentRevisionId ?? null,
      totalRevisions: activeSpec?.totalRevisions ?? 0,
      updatedAt: revision.createdAt,
      projectId,
    };
    return {
      revision: {
        id: revision._id,
        projectId: revision.projectId,
        revisionNumber: revision.revisionNumber,
        dslJson: revision.dslJson,
        rationale: revision.rationale,
        createdAt: revision.createdAt,
      },
      partSpec: previewSpec,
      isCurrent: activeSpec?.currentRevisionId === revision._id,
    };
  },
});

async function activateRevision(
  ctx: { db: any },
  projectId: Id<"projects">,
  targetIdx: number,
) {
  const spec = await ctx.db
    .query("partSpecs")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .unique();
  if (!spec) return null;

  const revisions = (
    await ctx.db
      .query("partRevisions")
      .withIndex("by_project_revision", (q: any) => q.eq("projectId", projectId))
      .collect()
  ).sort((a: Doc<"partRevisions">, b: Doc<"partRevisions">) => a.revisionNumber - b.revisionNumber);

  if (revisions.length === 0) {
    return { spec, currentRevisionId: null, canUndo: false, canRedo: false };
  }

  const clampedIdx = Math.max(0, Math.min(targetIdx, revisions.length - 1));
  const target = revisions[clampedIdx];
  const { snapshot, graph, svg } = renderRevisionSpec(target);

  await ctx.db.patch(spec._id, {
    ...snapshot,
    dslJson: target.dslJson,
    featureGraphJson: graph ? JSON.stringify(graph) : undefined,
    svgPreview: svg ?? undefined,
    currentRevisionId: target._id,
    updatedAt: Date.now(),
  });

  const updated = await ctx.db.get(spec._id);
  return {
    spec: updated,
    currentRevisionId: target._id,
    canUndo: clampedIdx > 0,
    canRedo: clampedIdx < revisions.length - 1,
  };
}

async function moveRevision(
  ctx: { db: any },
  projectId: Id<"projects">,
  direction: "undo" | "redo",
) {
  const spec = await ctx.db
    .query("partSpecs")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .unique();
  if (!spec) return null;

  const revisions = (
    await ctx.db
      .query("partRevisions")
      .withIndex("by_project_revision", (q: any) => q.eq("projectId", projectId))
      .collect()
  ).sort((a: Doc<"partRevisions">, b: Doc<"partRevisions">) => a.revisionNumber - b.revisionNumber);

  if (revisions.length === 0) {
    return { spec, currentRevisionId: null, canUndo: false, canRedo: false };
  }

  const currentIdx = spec.currentRevisionId
    ? revisions.findIndex((r: Doc<"partRevisions">) => r._id === spec.currentRevisionId)
    : revisions.length - 1;
  let targetIdx = currentIdx;
  if (direction === "undo" && currentIdx > 0) targetIdx = currentIdx - 1;
  else if (direction === "redo" && currentIdx < revisions.length - 1) targetIdx = currentIdx + 1;

  if (targetIdx === currentIdx) {
    return {
      spec,
      currentRevisionId: spec.currentRevisionId ?? revisions[currentIdx]?._id ?? null,
      canUndo: currentIdx > 0,
      canRedo: currentIdx < revisions.length - 1,
    };
  }

  return activateRevision(ctx, projectId, targetIdx);
}

export const undo = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const r = await moveRevision(ctx, projectId, "undo");
    if (!r) throw new Error("No part to revert");
    return { partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo };
  },
});

export const redo = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const r = await moveRevision(ctx, projectId, "redo");
    if (!r) throw new Error("No part to redo");
    return { partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo };
  },
});

export const restore = mutation({
  args: {
    projectId: v.id("projects"),
    revisionId: v.id("partRevisions"),
  },
  handler: async (ctx, { projectId, revisionId }) => {
    const revisions = (
      await ctx.db
        .query("partRevisions")
        .withIndex("by_project_revision", (q) => q.eq("projectId", projectId))
        .collect()
    ).sort((a, b) => a.revisionNumber - b.revisionNumber);
    const idx = revisions.findIndex((r) => r._id === revisionId);
    if (idx < 0) throw new Error("Revision not found");
    const r = await activateRevision(ctx, projectId, idx);
    if (!r) throw new Error("No part to restore");
    return { partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo };
  },
});
