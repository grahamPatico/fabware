import { query } from "./_generated/server";
import { v } from "convex/values";
import { validateAssembly, type AssemblyInput } from "./lib/assemblyRules";
import { PartDslSchema } from "./lib/dsl";
import { validatePartByKind } from "./lib/partValidator";
import { computeIntersectionRules } from "./lib/intersectRules";

export const getAssemblyValidation = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const ifaces = await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();

    // Filter to sheet-metal parts only; assembly rules apply only to sheet-metal.
    // Other-kind parts (printed, purchased) have their own per-kind rules via getPartValidation.
    const sheetMetalParts = parts.filter(p => (p.kind ?? "sheet_metal") === "sheet_metal");

    // Filter interfaces to those referencing only sheet-metal parts.
    const sheetMetalIds = new Set(sheetMetalParts.map(p => p._id));
    const sheetMetalInterfaces = ifaces.filter(i => sheetMetalIds.has(i.partA) && sheetMetalIds.has(i.partB));

    const input: AssemblyInput = {
      parts: sheetMetalParts.map(p => ({
        id: p._id as unknown as string,
        role: p.role,
        pose: p.position,
        dsl: p.dslJson ? PartDslSchema.parse(JSON.parse(p.dslJson)) : {
          version: 1, partType: p.partType as any, material: p.material ?? "Mild Steel (CRS)",
          thickness: p.thickness ?? 0.075, width: p.width ?? 1, height: p.height ?? 1,
          depth: p.depth ?? null, features: [], finish: null, assemblyRefs: [],
        },
      })),
      interfaces: sheetMetalInterfaces.map(i => ({
        kind: i.kind,
        partA: i.partA as unknown as string,
        partB: i.partB as unknown as string,
        featureRefs: i.featureRefs.map(r => ({ partId: r.partId as unknown as string, featureName: r.featureName })),
        hardwareRefs: i.hardwareRefs,
        accessSide: i.accessSide,
      })),
      scope: project?.scope ?? null,
    };
    const result = validateAssembly(input);

    // Geometric intersection check spans ALL kinds (sheet_metal + printed +
    // purchased). A printed knob clipping into a sheet-metal wall is just as
    // bad as two walls overlapping.
    const intersectionRules = computeIntersectionRules(parts);
    return {
      rules: [...result.rules, ...intersectionRules],
      hasFailures: result.hasFailures || intersectionRules.some(r => r.status === "fail"),
    };
  },
});

export const getPartValidation = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return null;
    return validatePartByKind(part);
  },
});
