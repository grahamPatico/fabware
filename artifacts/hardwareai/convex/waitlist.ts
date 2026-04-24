import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const join = mutation({
  args: {
    email: v.string(),
    source: v.optional(v.string()),
    note: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("waitlist", {
      email: args.email,
      source: args.source ?? "landing",
      note: args.note,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
    return { persisted: true, id };
  },
});
