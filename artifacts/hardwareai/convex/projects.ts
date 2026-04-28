import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").withIndex("by_updated").order("desc").collect();
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_updated")
      .order("desc")
      .take(12);
    const result: Array<{
      id: string;
      name: string;
      status: string;
      updatedAt: number;
      partType: string | null;
      material: string | null;
    }> = [];
    for (const p of projects) {
      const spec = await ctx.db
        .query("partSpecs")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .unique();
      result.push({
        id: p._id,
        name: p.name,
        status: p.status,
        updatedAt: p.updatedAt,
        partType: spec?.partType ?? null,
        material: spec?.material ?? null,
      });
    }
    return result;
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db.get(projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name,
      description,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("partSpecs", {
      projectId,
      partType: "bracket",
      totalRevisions: 0,
      updatedAt: now,
    });
    return await ctx.db.get(projectId);
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, ...patch }) => {
    const existing = await ctx.db.get(projectId);
    if (!existing) throw new Error("Project not found");
    const next = { ...patch, updatedAt: Date.now() };
    await ctx.db.patch(projectId, next);
    return await ctx.db.get(projectId);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    // Cascade delete
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);

    const specs = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const s of specs) await ctx.db.delete(s._id);

    const revisions = await ctx.db
      .query("partRevisions")
      .withIndex("by_project_revision", (q) => q.eq("projectId", projectId))
      .collect();
    for (const r of revisions) await ctx.db.delete(r._id);

    const assemblyParts = await ctx.db
      .query("assemblyParts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const a of assemblyParts) await ctx.db.delete(a._id);

    const partsToDelete = await ctx.db.query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const p of partsToDelete) await ctx.db.delete(p._id);

    const ifacesToDelete = await ctx.db.query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const i of ifacesToDelete) await ctx.db.delete(i._id);

    const snapshotsToDelete = await ctx.db.query("assemblySnapshots")
      .withIndex("by_project_seq", q => q.eq("projectId", projectId)).collect();
    for (const s of snapshotsToDelete) await ctx.db.delete(s._id);

    await ctx.db.delete(projectId);
  },
});

export const updateScope = mutation({
  args: {
    projectId: v.id("projects"),
    scope: v.object({
      tier: v.union(v.literal("jerry-rigged"), v.literal("mvp"), v.literal("commercial")),
      environment: v.object({
        location: v.union(v.literal("indoor"), v.literal("outdoor")),
        waterproof: v.optional(v.boolean()),
        uv: v.optional(v.boolean()),
        freeze: v.optional(v.boolean()),
      }),
      useCase: v.string(),
      userInteraction: v.optional(v.string()),
      referenceScale: v.optional(v.object({
        kind: v.string(),
        dimensions: v.optional(v.object({ w: v.number(), d: v.number(), h: v.number() })),
        quantity: v.optional(v.number()),
      })),
      budgetCeiling: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { projectId, scope }) => {
    await ctx.db.patch(projectId, { scope, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});

export const setArchetype = mutation({
  args: {
    projectId: v.id("projects"),
    archetypeId: v.union(
      v.literal("hinged_enclosure"), v.literal("sliding_enclosure"),
      v.literal("bracket_plus_panel"), v.literal("divided_tray"),
      v.literal("shelf_with_brackets"), v.literal("box_with_lid"),
      v.null(),
    ),
    archetypeParams: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, archetypeId, archetypeParams }) => {
    await ctx.db.patch(projectId, { archetypeId, archetypeParams, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});

export const setArchetypeInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    archetypeId: v.any(),
    archetypeParams: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, archetypeId, archetypeParams }) => {
    await ctx.db.patch(projectId, { archetypeId, archetypeParams, updatedAt: Date.now() });
  },
});

export const breakOut = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await ctx.db.patch(projectId, { archetypeId: null, archetypeParams: null, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});
