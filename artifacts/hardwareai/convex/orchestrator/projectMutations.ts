import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const _setPhase = internalMutation({
  args: {
    projectId: v.id("projects"),
    phase: v.union(
      v.literal("scoping"),
      v.literal("decomposing"),
      v.literal("designing"),
      v.literal("validating"),
      v.literal("exporting"),
      v.literal("done"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { phase: args.phase, updatedAt: Date.now() });
  },
});
