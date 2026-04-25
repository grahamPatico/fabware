import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema, legacyToDsl } from "./lib/dsl";
import { buildFeatureGraph } from "./lib/featureGraph";
import { generateDxf, type FlatPreviewSpec } from "./lib/dxfGenerator";


function withGraph(spec: FlatPreviewSpec & { dslJson?: string | null }): FlatPreviewSpec {
  if (spec.dsl && spec.featureGraph) return spec;
  if (spec.dslJson) {
    try {
      const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
      if (parsed.success) return { ...spec, dsl: parsed.data, featureGraph: buildFeatureGraph(parsed.data) };
    } catch {
      // fall
    }
  }
  const dsl = legacyToDsl(spec);
  return { ...spec, dsl, featureGraph: buildFeatureGraph(dsl) };
}

export const run = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    const spec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!spec) throw new Error("No part spec to export");

    const enriched = withGraph(spec);
    const dxfContent = generateDxf(enriched, {
      projectName: project.name,
      revisionNumber: spec.totalRevisions ?? undefined,
    });
    const filename = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${spec.partType}.dxf`;

    const now = Date.now();
    await ctx.db.patch(spec._id, { sendCutSendUrl: "https://sendcutsend.com/upload", updatedAt: now });
    await ctx.db.patch(projectId, { status: "ready_to_order", updatedAt: now });

    return {
      projectId,
      filename,
      dxfContent,
      sendCutSendUploadUrl: "https://sendcutsend.com/upload",
      instructions: [
        `Download your DXF file: ${filename}`,
        "Go to https://sendcutsend.com/upload to start your order",
        "Click 'Upload File' and select your DXF",
        `Select material: ${spec.material ?? "Mild Steel"} — ${spec.thickness ? `${spec.thickness}" thick` : "verify thickness"}`,
        spec.powderCoat
          ? `Add Powder Coat finishing: ${spec.powderCoatColor ?? "Black"}`
          : "Add any finishing options (optional)",
        "Review the part preview in the Send Cut Send editor",
        "Set quantity and place order — typical lead time is 3-5 business days",
      ],
      estimatedParts: 1,
    };
  },
});

export const runForPart = mutation({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, { projectId, partId }) => {
    const project = await ctx.db.get(projectId);
    const part = await ctx.db.get(partId);
    if (!project) throw new Error("Project not found");
    if (!part || part.projectId !== projectId) throw new Error("Part not found in this project");

    // Build a FlatPreviewSpec from the part's DSL (preferred) or fall back to legacy fields.
    let dsl;
    if (part.dslJson) {
      const parsed = PartDslSchema.safeParse(JSON.parse(part.dslJson));
      if (!parsed.success) throw new Error("Part DSL is invalid: " + parsed.error.message.slice(0, 200));
      dsl = parsed.data;
    } else {
      dsl = legacyToDsl({
        partType: part.partType,
        material: part.material ?? null,
        thickness: part.thickness ?? null,
        width: part.width ?? null,
        height: part.height ?? null,
        depth: part.depth ?? null,
        bendAngles: part.bendAngles ?? null,
        bendRadius: part.bendRadius ?? null,
        holePattern: part.holePattern ?? null,
        powderCoat: part.powderCoat ?? null,
        powderCoatColor: part.powderCoatColor ?? null,
      });
    }

    const featureGraph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType,
      material: dsl.material,
      thickness: dsl.thickness,
      width: dsl.width,
      height: dsl.height,
      depth: dsl.depth ?? null,
      bendAngles: null,
      bendRadius: null,
      holePattern: null,
      powderCoat: !!dsl.finish,
      powderCoatColor: dsl.finish?.color ?? null,
      dsl,
      featureGraph,
    };

    const dxfContent = generateDxf(preview, {
      projectName: project.name,
      revisionNumber: 1,
    });
    const filename = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${part.role}.dxf`;

    // Mark the project as touched (but don't change status — export is per-part now).
    await ctx.db.patch(projectId, { updatedAt: Date.now() });

    return {
      projectId,
      partId,
      filename,
      dxfContent,
      sendCutSendUploadUrl: "https://sendcutsend.com/upload",
      instructions: [
        `Download DXF: ${filename}`,
        `Material: ${dsl.material} — ${dsl.thickness}" thick`,
        dsl.finish ? `Finish: Powder coat ${dsl.finish.color}` : "Finish: none",
        "Go to https://sendcutsend.com/upload and upload this DXF",
      ],
      estimatedParts: 1,
    };
  },
});
