import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("threads").withIndex("by_created").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("threads", {
      title: args.title,
      model: args.model,
      effort: args.effort,
      createdAt: Date.now(),
    });
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    return await ctx.db.get(threadId);
  },
});

export const updateSettings = mutation({
  args: {
    threadId: v.id("threads"),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (ctx, { threadId, model, effort }) => {
    await ctx.db.patch(threadId, { model, effort });
  },
});

export const remove = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(threadId);
  },
});
