import { query } from "./_generated/server";
import { v } from "convex/values";
import { validateAssembly, type AssemblyInput } from "./lib/assemblyRules";
import { PartDslSchema } from "./lib/dsl";

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

    const input: AssemblyInput = {
      parts: parts.map(p => ({
        id: p._id as unknown as string,
        role: p.role,
        pose: p.position,
        dsl: p.dslJson ? PartDslSchema.parse(JSON.parse(p.dslJson)) : {
          version: 1, partType: p.partType as any, material: p.material ?? "Mild Steel (CRS)",
          thickness: p.thickness ?? 0.075, width: p.width ?? 1, height: p.height ?? 1,
          depth: p.depth ?? null, features: [], finish: null, assemblyRefs: [],
        },
      })),
      interfaces: ifaces.map(i => ({
        kind: i.kind,
        partA: i.partA as unknown as string,
        partB: i.partB as unknown as string,
        featureRefs: i.featureRefs.map(r => ({ partId: r.partId as unknown as string, featureName: r.featureName })),
        hardwareRefs: i.hardwareRefs,
        accessSide: i.accessSide,
      })),
      scope: project?.scope ?? null,
    };
    return validateAssembly(input);
  },
});
