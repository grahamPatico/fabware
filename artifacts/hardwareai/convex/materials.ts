import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SCS_MATERIALS } from "./lib/scsRules";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("materials").withIndex("by_name").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listThicknesses = query({
  args: { materialId: v.id("materials") },
  handler: async (ctx, { materialId }) => {
    return await ctx.db
      .query("thicknesses")
      .withIndex("by_material", (q) => q.eq("materialId", materialId))
      .collect();
  },
});

// Seed materials from the SCS catalog. Idempotent — skips if already seeded.
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("materials").first();
    if (existing) return { seeded: false, reason: "already-populated" };

    let inserted = 0;
    for (const mat of Object.values(SCS_MATERIALS)) {
      const matId = await ctx.db.insert("materials", {
        name: mat.name,
        category: mat.category,
        sendCutSendName: mat.name,
        canBend: mat.canBend,
        canPowderCoat: mat.canPowderCoat,
        minThickness: Math.min(...mat.thicknesses),
        maxThickness: Math.max(...mat.thicknesses),
        maxSheetWidth: mat.maxSheet.width,
        maxSheetHeight: mat.maxSheet.height,
        description: undefined,
      });
      for (const t of mat.thicknesses) {
        await ctx.db.insert("thicknesses", {
          materialId: matId,
          inches: t,
          mm: Math.round(t * 25.4 * 100) / 100,
        });
      }
      inserted += 1;
    }
    return { seeded: true, count: inserted };
  },
});

export const capabilities = query({
  args: {},
  handler: async () => ({
    cutting: {
      minThicknessInches: 0.018,
      maxThicknessInches: 0.5,
      maxSheetInches: { width: 60, height: 120 },
    },
    bending: { maxAngleDegrees: 180, minRadiusMultiplier: 1 },
    finishing: ["powder_coat", "anodize", "plating"],
    fileFormats: ["dxf", "svg", "pdf"],
    uploadUrl: "https://sendcutsend.com/upload",
    turnaround: "3-5 business days",
  }),
});
