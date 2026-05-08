import { query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { generatePartPdf } from "./lib/pdf";

/**
 * Returns the shop-drawing PDF for a single sheet-metal part as a base64
 * string. Frontend decodes to a Blob and triggers a download.
 */
export const partPdf = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }): Promise<{ filename: string; base64: string } | null> => {
    const part = await ctx.db.get(partId);
    if (!part || (part.kind ?? "sheet_metal") !== "sheet_metal" || !part.dslJson) return null;
    const parsed = PartDslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) return null;
    const bytes = generatePartPdf(parsed.data, part.label, part.role);
    // Encode bytes -> base64 (Convex queries can return strings, not raw bytes).
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    const safeRole = part.role.replace(/[^a-zA-Z0-9_-]/g, "_");
    return { filename: `${safeRole || "part"}.pdf`, base64 };
  },
});
