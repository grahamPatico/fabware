import { query } from "./_generated/server";
import { v } from "convex/values";
import { generateAssemblyObj } from "./lib/obj";

/**
 * OBJ export of the full assembly. Each part is an OBJ group with a 6-face
 * box mesh in world coordinates. Customer-facing 3D preview format —
 * universally viewable, shows the assembly envelope. Real STEP AP203 is a
 * follow-up backlog item.
 */
export const projectObj = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{ filename: string; obj: string }> => {
    const project = await ctx.db.get(projectId);
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const obj = generateAssemblyObj(parts, project?.name ?? "Untitled");
    const safe = (project?.name ?? "project").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    return { filename: `${safe || "project"}.obj`, obj };
  },
});
