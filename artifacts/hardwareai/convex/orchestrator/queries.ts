import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

interface AssembleInput {
  project: Doc<"projects">;
  parts: Doc<"parts">[];
  interfaces: Doc<"interfaces">[];
  openViolations: Doc<"violations">[];
  openEscalations: Doc<"escalations">[];
}

export interface DesignPlan {
  project: Doc<"projects">;
  phase: NonNullable<Doc<"projects">["phase"]> | "scoping";
  parts: Doc<"parts">[];
  interfaces: Doc<"interfaces">[];
  openViolations: Doc<"violations">[];
  openEscalations: Doc<"escalations">[];
}

export function assembleDesignPlan(input: AssembleInput): DesignPlan {
  return {
    project: input.project,
    phase: input.project.phase ?? "scoping",
    parts: input.parts,
    interfaces: input.interfaces,
    openViolations: input.openViolations,
    openEscalations: input.openEscalations,
  };
}

export const getDesignPlan = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const parts = await ctx.db.query("parts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const interfaces = await ctx.db.query("interfaces").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const openViolations = await ctx.db
      .query("violations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    const openEscalations = await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    return assembleDesignPlan({ project, parts, interfaces, openViolations, openEscalations });
  },
});

export const _internalTickContext = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const parts = await ctx.db.query("parts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const openEscalations = await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    return { project, parts, openEscalations };
  },
});
