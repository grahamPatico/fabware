import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { generateSvgPreview, type FlatPreviewSpec } from "./lib/dxfGenerator";
import { buildFeatureGraph } from "./lib/featureGraph";
import { PartDslSchema } from "./lib/dsl";
import { PrintedDslSchema } from "./lib/printedDsl";
import { PurchasedDslSchema } from "./lib/purchasedDsl";
import { PipeDslSchema } from "./lib/pipeDsl";

const poseArgs = v.object({
  x: v.number(), y: v.number(), z: v.number(),
  rotX: v.number(), rotY: v.number(), rotZ: v.number(),
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const listForProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const get = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => await ctx.db.get(partId),
});

const partInsertArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),
};

async function insertPartFromArgs(ctx: any, a: any) {
  const dsl = PartDslSchema.parse(JSON.parse(a.dslJson));
  const graph = buildFeatureGraph(dsl);
  const preview: FlatPreviewSpec = {
    partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
    width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
    bendAngles: null, bendRadius: null, holePattern: null,
    powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
    dsl, featureGraph: graph,
  };
  const svg = generateSvgPreview(preview);
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    partType: dsl.partType,
    material: dsl.material,
    thickness: dsl.thickness,
    width: dsl.width,
    height: dsl.height,
    depth: dsl.depth ?? undefined,
    powderCoat: !!dsl.finish,
    powderCoatColor: dsl.finish?.color ?? undefined,
    dslJson: a.dslJson,
    featureGraphJson: JSON.stringify(graph),
    svgPreview: svg,
    createdAt: now,
    updatedAt: now,
  });
}

async function patchPartDsl(ctx: any, partId: any, dslJson: string) {
  const existing = await ctx.db.get(partId);
  if (!existing) throw new Error("Part not found");
  const dsl = PartDslSchema.parse(JSON.parse(dslJson));
  const graph = buildFeatureGraph(dsl);
  const preview: FlatPreviewSpec = {
    partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
    width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
    bendAngles: null, bendRadius: null, holePattern: null,
    powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
    dsl, featureGraph: graph,
  };
  const svg = generateSvgPreview(preview);
  await ctx.db.patch(partId, {
    partType: dsl.partType,
    material: dsl.material,
    thickness: dsl.thickness,
    width: dsl.width,
    height: dsl.height,
    depth: dsl.depth ?? undefined,
    powderCoat: !!dsl.finish,
    powderCoatColor: dsl.finish?.color ?? undefined,
    dslJson,
    featureGraphJson: JSON.stringify(graph),
    svgPreview: svg,
    updatedAt: Date.now(),
  });
  return await ctx.db.get(partId);
}

export const addPart = mutation({ args: partInsertArgs, handler: insertPartFromArgs });
export const addPartInternal = internalMutation({ args: partInsertArgs, handler: insertPartFromArgs });

export const updatePartDsl = mutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => patchPartDsl(ctx, partId, dslJson),
});

export const updatePartDslInternal = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => { await patchPartDsl(ctx, partId, dslJson); },
});

export const removePart = mutation({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return;
    const ifaces = await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", part.projectId))
      .collect();
    for (const iface of ifaces) {
      if (iface.partA === partId || iface.partB === partId) await ctx.db.delete(iface._id);
    }
    await ctx.db.delete(partId);
  },
});

const printedPartArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),    // PrintedDsl JSON
};

async function insertPrintedPart(ctx: any, a: any) {
  const dsl = PrintedDslSchema.parse(JSON.parse(a.dslJson));
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    kind: "printed",
    partType: "printed",  // legacy field; keep populated for backwards compat
    dslJson: a.dslJson,
    printedMaterial: dsl.material,
    printedInfill: dsl.infill,
    printedLayerHeight: dsl.layerHeight,
    createdAt: now,
    updatedAt: now,
  });
}

export const addPrintedPart = mutation({ args: printedPartArgs, handler: insertPrintedPart });
export const addPrintedPartInternal = internalMutation({ args: printedPartArgs, handler: insertPrintedPart });

const purchasedPartArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),    // PurchasedDsl JSON
};

async function insertPurchasedPart(ctx: any, a: any) {
  const dsl = PurchasedDslSchema.parse(JSON.parse(a.dslJson));
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    kind: "purchased",
    partType: "purchased",
    dslJson: a.dslJson,
    purchasedPartNumber: dsl.mcmasterPartNumber,
    purchasedQuantity: dsl.quantity,
    unitCostUsd: dsl.unitCostUsd,
    createdAt: now,
    updatedAt: now,
  });
}

export const addPurchasedPart = mutation({ args: purchasedPartArgs, handler: insertPurchasedPart });
export const addPurchasedPartInternal = internalMutation({ args: purchasedPartArgs, handler: insertPurchasedPart });

const pipePartArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),    // PipeDsl JSON
};

async function insertPipePart(ctx: any, a: any) {
  const dsl = PipeDslSchema.parse(JSON.parse(a.dslJson));
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    kind: "pipe",
    partType: "pipe",
    material: dsl.material,
    dslJson: a.dslJson,
    pipeOuterDiameter: dsl.outerDiameter,
    pipeWallThickness: dsl.wallThickness,
    pipeLength: dsl.length,
    pipeEndA: dsl.endA,
    pipeEndB: dsl.endB,
    createdAt: now,
    updatedAt: now,
  });
}

export const addPipePart = mutation({ args: pipePartArgs, handler: insertPipePart });
export const addPipePartInternal = internalMutation({ args: pipePartArgs, handler: insertPipePart });

export const updatePartDslByKindInternal = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    const existing = await ctx.db.get(partId);
    if (!existing) throw new Error("Part not found");
    const kind = existing.kind ?? "sheet_metal";
    const now = Date.now();
    if (kind === "printed") {
      const dsl = PrintedDslSchema.parse(JSON.parse(dslJson));
      await ctx.db.patch(partId, {
        dslJson,
        printedMaterial: dsl.material,
        printedInfill: dsl.infill,
        printedLayerHeight: dsl.layerHeight,
        updatedAt: now,
      });
      return;
    }
    if (kind === "purchased") {
      const dsl = PurchasedDslSchema.parse(JSON.parse(dslJson));
      await ctx.db.patch(partId, {
        dslJson,
        purchasedPartNumber: dsl.mcmasterPartNumber,
        purchasedQuantity: dsl.quantity,
        unitCostUsd: dsl.unitCostUsd,
        updatedAt: now,
      });
      return;
    }
    // sheet_metal
    const dsl = PartDslSchema.parse(JSON.parse(dslJson));
    const graph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
      bendAngles: null, bendRadius: null, holePattern: null,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
      dsl, featureGraph: graph,
    };
    const svg = generateSvgPreview(preview);
    await ctx.db.patch(partId, {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson, featureGraphJson: JSON.stringify(graph), svgPreview: svg, updatedAt: now,
    });
  },
});

export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    parts: v.array(v.object({
      role: v.string(), label: v.string(), position: poseArgs, dslJson: v.string(),
    })),
  },
  handler: async (ctx, { projectId, parts }) => {
    const existing = await ctx.db
      .query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const p of existing) await ctx.db.delete(p._id);
    const now = Date.now();
    for (const p of parts) {
      const dsl = PartDslSchema.parse(JSON.parse(p.dslJson));
      const graph = buildFeatureGraph(dsl);
      const preview: FlatPreviewSpec = {
        partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
        width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
        bendAngles: null, bendRadius: null, holePattern: null,
        powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
        dsl, featureGraph: graph,
      };
      const svg = generateSvgPreview(preview);
      await ctx.db.insert("parts", {
        projectId, role: p.role, label: p.label, position: p.position,
        partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
        width: dsl.width, height: dsl.height, depth: dsl.depth ?? undefined,
        powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? undefined,
        dslJson: p.dslJson, featureGraphJson: JSON.stringify(graph),
        svgPreview: svg, createdAt: now, updatedAt: now,
      });
    }
  },
});
