import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  PartDslSchema,
  legacyToDsl,
  type PartDsl,
} from "./lib/dsl";
import { buildFeatureGraph } from "./lib/featureGraph";
import {
  generateSvgPreview,
  type FlatPreviewSpec,
} from "./lib/dxfGenerator";
import { validateSpec, applySnap } from "./lib/scsRules";

const partSpecPatchArgs = v.object({
  partType: v.optional(v.string()),
  material: v.optional(v.string()),
  thickness: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  depth: v.optional(v.number()),
  bendRadius: v.optional(v.number()),
  bendAngles: v.optional(v.string()),
  holePattern: v.optional(v.string()),
  powderCoat: v.optional(v.boolean()),
  powderCoatColor: v.optional(v.string()),
  notes: v.optional(v.string()),
});

function withGraph(spec: FlatPreviewSpec & { dslJson?: string | null }): FlatPreviewSpec {
  if (spec.dsl && spec.featureGraph) return spec;
  if (spec.dslJson) {
    try {
      const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
      if (parsed.success) {
        return { ...spec, dsl: parsed.data, featureGraph: buildFeatureGraph(parsed.data) };
      }
    } catch {
      // fall through
    }
  }
  const dsl = legacyToDsl(spec);
  return { ...spec, dsl, featureGraph: buildFeatureGraph(dsl) };
}

export const getForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
  },
});

export const getForProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
  },
});

export const updateManual = mutation({
  args: {
    projectId: v.id("projects"),
    patch: partSpecPatchArgs,
  },
  handler: async (ctx, { projectId, patch }) => {
    const existing = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    const base = existing ? { ...existing, ...patch } : { ...patch, partType: patch.partType ?? "bracket" };
    const merged = withGraph({ ...(base as FlatPreviewSpec), dsl: null, featureGraph: null });
    const svgPreview = generateSvgPreview(merged);
    const dslJson = merged.dsl ? JSON.stringify(merged.dsl) : undefined;
    const featureGraphJson = merged.featureGraph ? JSON.stringify(merged.featureGraph) : undefined;
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        svgPreview,
        dslJson,
        featureGraphJson,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("partSpecs", {
      projectId,
      partType: patch.partType ?? "bracket",
      material: patch.material,
      thickness: patch.thickness,
      width: patch.width,
      height: patch.height,
      depth: patch.depth,
      bendRadius: patch.bendRadius,
      bendAngles: patch.bendAngles,
      holePattern: patch.holePattern,
      powderCoat: patch.powderCoat,
      powderCoatColor: patch.powderCoatColor,
      notes: patch.notes,
      svgPreview,
      dslJson,
      featureGraphJson,
      totalRevisions: 0,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const getValidation = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const spec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!spec) return { rules: [], hasFailures: false, snappedSpec: {} };
    let assemblyRefs: PartDsl["assemblyRefs"] = [];
    if (spec.dslJson) {
      try {
        const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
        if (parsed.success) assemblyRefs = parsed.data.assemblyRefs ?? [];
      } catch {
        // ignore
      }
    }
    return validateSpec({ ...spec, assemblyRefs: assemblyRefs ?? [] });
  },
});

export const applySuggestion = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const spec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!spec) throw new Error("No part spec to fix");
    const validation = validateSpec(spec);
    const snapped = applySnap(spec, validation.snappedSpec);
    const enriched = withGraph({ ...spec, ...snapped, dsl: null, featureGraph: null });
    const svgPreview = generateSvgPreview(enriched);
    await ctx.db.patch(spec._id, {
      ...snapped,
      svgPreview,
      dslJson: enriched.dsl ? JSON.stringify(enriched.dsl) : undefined,
      featureGraphJson: enriched.featureGraph ? JSON.stringify(enriched.featureGraph) : undefined,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(spec._id);
    return { partSpec: updated, validation: validateSpec(updated!) };
  },
});

export const applyDesignResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    patch: v.object({
      partType: v.optional(v.string()),
      material: v.optional(v.string()),
      thickness: v.optional(v.number()),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      depth: v.optional(v.number()),
      bendRadius: v.optional(v.number()),
      bendAngles: v.optional(v.string()),
      holePattern: v.optional(v.string()),
      powderCoat: v.optional(v.boolean()),
      powderCoatColor: v.optional(v.string()),
      notes: v.optional(v.string()),
      svgPreview: v.optional(v.string()),
      sendCutSendUrl: v.optional(v.string()),
      dslJson: v.optional(v.string()),
      featureGraphJson: v.optional(v.string()),
    }),
    rationale: v.string(),
  },
  handler: async (ctx, { projectId, patch, rationale }) => {
    const spec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!spec) throw new Error("Part spec missing for project");

    const nextRevisionNumber = (spec.totalRevisions ?? 0) + 1;
    const specSnapshot = {
      partType: patch.partType ?? spec.partType,
      material: patch.material ?? spec.material,
      thickness: patch.thickness ?? spec.thickness,
      width: patch.width ?? spec.width,
      height: patch.height ?? spec.height,
      depth: patch.depth ?? spec.depth,
      bendRadius: patch.bendRadius ?? spec.bendRadius,
      bendAngles: patch.bendAngles ?? spec.bendAngles,
      holePattern: patch.holePattern ?? spec.holePattern,
      powderCoat: patch.powderCoat ?? spec.powderCoat,
      powderCoatColor: patch.powderCoatColor ?? spec.powderCoatColor,
      notes: patch.notes ?? spec.notes,
      svgPreview: patch.svgPreview ?? spec.svgPreview,
      sendCutSendUrl: patch.sendCutSendUrl ?? spec.sendCutSendUrl,
    };

    const revisionId = await ctx.db.insert("partRevisions", {
      projectId,
      revisionNumber: nextRevisionNumber,
      dslJson: patch.dslJson ?? spec.dslJson ?? "{}",
      specSnapshot: JSON.stringify(specSnapshot),
      rationale,
      createdAt: Date.now(),
    });

    await ctx.db.patch(spec._id, {
      ...patch,
      currentRevisionId: revisionId,
      totalRevisions: nextRevisionNumber,
      updatedAt: Date.now(),
    });
  },
});
