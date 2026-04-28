import { query } from "./_generated/server";
import { v } from "convex/values";
import { generateBom } from "./lib/bom";

export const projectCsv = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{ filename: string; csv: string }> => {
    const project = await ctx.db.get(projectId);
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const interfaces = await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const assemblyParts = await ctx.db
      .query("assemblyParts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();

    const csv = generateBom({
      projectName: project?.name ?? "Untitled",
      parts, interfaces, assemblyParts,
    });
    const safe = (project?.name ?? "project").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    return { filename: `${safe || "project"}-bom.csv`, csv };
  },
});
