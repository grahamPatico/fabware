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
