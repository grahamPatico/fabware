import { query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { simulatePart, type SimStep } from "./lib/bendSim";

export const simulatePartById = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }): Promise<{ steps: SimStep[]; partRole: string; partLabel: string } | null> => {
    const part = await ctx.db.get(partId);
    if (!part || (part.kind ?? "sheet_metal") !== "sheet_metal" || !part.dslJson) return null;
    const parsed = PartDslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) return null;
    return { steps: simulatePart(parsed.data), partRole: part.role, partLabel: part.label };
  },
});
