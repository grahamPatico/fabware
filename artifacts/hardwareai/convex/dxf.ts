import { query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { generatePartDxf } from "./lib/dxf";

/**
 * Returns the SCS-uploadable DXF text for a single sheet-metal part.
 * Caller can offer it as a download via Blob URL on the frontend.
 */
export const partDxf = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }): Promise<{ filename: string; dxf: string } | null> => {
    const part = await ctx.db.get(partId);
    if (!part || (part.kind ?? "sheet_metal") !== "sheet_metal" || !part.dslJson) return null;
    const parsed = PartDslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) return null;
    const dxf = generatePartDxf(parsed.data);
    const safeRole = part.role.replace(/[^a-zA-Z0-9_-]/g, "_");
    return { filename: `${safeRole || "part"}.dxf`, dxf };
  },
});
