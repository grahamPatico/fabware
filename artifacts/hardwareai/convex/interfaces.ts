import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const listForProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

const interfaceInsertArgs = {
  projectId: v.id("projects"),
  kind: v.union(
    v.literal("bolted"), v.literal("pem_inserted"),
    v.literal("riveted"), v.literal("hinged"),
    v.literal("weld_seam"), v.literal("weld_joint"),
  ),
  partA: v.id("parts"),
  partB: v.id("parts"),
  featureRefs: v.array(v.object({ partId: v.id("parts"), featureName: v.string() })),
  hardwareRefs: v.array(v.object({
    mcmasterPartNumber: v.string(),
    quantity: v.number(),
    role: v.optional(v.string()),
  })),
  accessSide: v.optional(v.union(
    v.literal("A-to-B"), v.literal("B-to-A"), v.literal("either"),
  )),
};

export const addInterface = mutation({
  args: interfaceInsertArgs,
  handler: async (ctx, a) => await ctx.db.insert("interfaces", { ...a, createdAt: Date.now() }),
});

export const addInterfaceInternal = internalMutation({
  args: interfaceInsertArgs,
  handler: async (ctx, a) => await ctx.db.insert("interfaces", { ...a, createdAt: Date.now() }),
});

export const removeInterface = mutation({
  args: { interfaceId: v.id("interfaces") },
  handler: async (ctx, { interfaceId }) => { await ctx.db.delete(interfaceId); },
});

export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    interfaces: v.array(v.object({
      kind: v.union(v.literal("bolted"), v.literal("pem_inserted"), v.literal("riveted"), v.literal("hinged"), v.literal("weld_seam"), v.literal("weld_joint")),
      roleA: v.string(), roleB: v.string(),
      featureA: v.string(), featureB: v.string(),
      hardwareRefs: v.array(v.object({
        mcmasterPartNumber: v.string(), quantity: v.number(), role: v.optional(v.string()),
      })),
      accessSide: v.optional(v.union(v.literal("A-to-B"), v.literal("B-to-A"), v.literal("either"))),
    })),
  },
  handler: async (ctx, { projectId, interfaces }) => {
    const existing = await ctx.db
      .query("interfaces").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const i of existing) await ctx.db.delete(i._id);
    const parts = await ctx.db
      .query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    const roleToId = new Map(parts.map(p => [p.role, p._id]));
    const now = Date.now();
    for (const i of interfaces) {
      const a = roleToId.get(i.roleA);
      const b = roleToId.get(i.roleB);
      if (!a || !b) continue;
      await ctx.db.insert("interfaces", {
        projectId, kind: i.kind, partA: a, partB: b,
        featureRefs: [
          { partId: a, featureName: i.featureA },
          { partId: b, featureName: i.featureB },
        ],
        hardwareRefs: i.hardwareRefs,
        accessSide: i.accessSide,
        createdAt: now,
      });
    }
  },
});
