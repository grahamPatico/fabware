import { query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { validateFdm, DEFAULT_FDM_PROFILE } from "./lib/fdmRules";

export const profile = query({
  args: {},
  handler: async () => DEFAULT_FDM_PROFILE,
});

export const getValidation = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const spec = await ctx.db
      .query("partSpecs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!spec || !spec.dslJson) {
      return { rules: [], hasFailures: false, profile: DEFAULT_FDM_PROFILE };
    }
    try {
      const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
      if (!parsed.success) {
        return { rules: [], hasFailures: false, profile: DEFAULT_FDM_PROFILE };
      }
      return validateFdm(parsed.data, DEFAULT_FDM_PROFILE);
    } catch {
      return { rules: [], hasFailures: false, profile: DEFAULT_FDM_PROFILE };
    }
  },
});
