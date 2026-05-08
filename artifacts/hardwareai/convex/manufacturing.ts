// Manufacturability primer query. Walks every sheet-metal part in a project,
// runs validatePartByKind (which already merges sheet-metal rules + bendSim
// rules) and the simulator step list, and returns a compact structured
// summary the agent can consume via its `check_manufacturing` tool.
//
// This closes the agent self-repair loop: instead of waiting for the user to
// say "the bend is too tight," the agent can call this between tool calls
// and act on the failures it surfaces.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { PartDslSchema } from "./lib/dsl";
import { validatePartByKind } from "./lib/partValidator";
import { simulatePart } from "./lib/bendSim";
import { estimatePartWeight } from "./lib/weight";
import { estimatePartCost } from "./lib/cost";

export const costSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{
    perPart: Array<{ partId: string; role: string; label: string; material: number; cuts: number; bends: number; finish: number; totalUsd: number }>;
    totals: { totalUsd: number; sheetMetalParts: number };
  }> => {
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const perPart: Array<{ partId: string; role: string; label: string; material: number; cuts: number; bends: number; finish: number; totalUsd: number }> = [];
    let total = 0;
    let sheetCount = 0;
    for (const p of parts) {
      if ((p.kind ?? "sheet_metal") !== "sheet_metal" || !p.dslJson) continue;
      const parsed = PartDslSchema.safeParse(JSON.parse(p.dslJson));
      if (!parsed.success) continue;
      sheetCount += 1;
      const c = estimatePartCost(parsed.data);
      total += c.totalUsd;
      perPart.push({
        partId: p._id as unknown as string,
        role: p.role, label: p.label,
        material: c.material, cuts: c.cuts, bends: c.bends, finish: c.finish, totalUsd: c.totalUsd,
      });
    }
    return { perPart, totals: { totalUsd: total, sheetMetalParts: sheetCount } };
  },
});

export const weightSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{
    perPart: Array<{ partId: string; role: string; label: string; material: string | null; thickness: number | null; pounds: number; kg: number; areaIn2: number }>;
    totals: { pounds: number; kg: number; sheetMetalParts: number };
  }> => {
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const perPart: Array<{ partId: string; role: string; label: string; material: string | null; thickness: number | null; pounds: number; kg: number; areaIn2: number }> = [];
    let totalLb = 0;
    let sheetCount = 0;
    for (const p of parts) {
      if ((p.kind ?? "sheet_metal") !== "sheet_metal" || !p.dslJson) continue;
      const parsed = PartDslSchema.safeParse(JSON.parse(p.dslJson));
      if (!parsed.success) continue;
      sheetCount += 1;
      const w = estimatePartWeight(parsed.data);
      totalLb += w.pounds;
      perPart.push({
        partId: p._id as unknown as string,
        role: p.role, label: p.label,
        material: p.material ?? null,
        thickness: p.thickness ?? null,
        pounds: w.pounds, kg: w.kg, areaIn2: w.area,
      });
    }
    return {
      perPart,
      totals: { pounds: totalLb, kg: totalLb / 2.2046, sheetMetalParts: sheetCount },
    };
  },
});

export interface PartManufacturingReport {
  partId: string;
  role: string;
  label: string;
  material: string | null;
  thickness: number | null;
  failures: number;
  warnings: number;
  rules: Array<{ id: string; label: string; status: string; message: string; suggestion?: string }>;
  steps: Array<{ id: string; kind: string; label: string; failures: number; warnings: number }>;
}

export const summarizeForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{
    perPart: PartManufacturingReport[];
    totals: { parts: number; sheetMetalParts: number; failures: number; warnings: number };
  }> => {
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const perPart: PartManufacturingReport[] = [];
    let totalFails = 0;
    let totalWarns = 0;
    let sheetCount = 0;

    for (const p of parts) {
      if ((p.kind ?? "sheet_metal") !== "sheet_metal") continue;
      sheetCount += 1;
      const validation = validatePartByKind(p);
      const failures = validation.rules.filter(r => r.status === "fail").length;
      const warnings = validation.rules.filter(r => r.status === "warn").length;
      totalFails += failures;
      totalWarns += warnings;

      // Per-step summary from the simulator (when DSL parses).
      let stepSummary: PartManufacturingReport["steps"] = [];
      if (p.dslJson) {
        const parsed = PartDslSchema.safeParse(JSON.parse(p.dslJson));
        if (parsed.success) {
          stepSummary = simulatePart(parsed.data).map(s => ({
            id: s.id, kind: s.kind, label: s.label,
            failures: s.rules.filter(r => r.status === "fail").length,
            warnings: s.rules.filter(r => r.status === "warn").length,
          }));
        }
      }

      perPart.push({
        partId: p._id as unknown as string,
        role: p.role,
        label: p.label,
        material: p.material ?? null,
        thickness: p.thickness ?? null,
        failures, warnings,
        rules: validation.rules,
        steps: stepSummary,
      });
    }

    return {
      perPart,
      totals: { parts: parts.length, sheetMetalParts: sheetCount, failures: totalFails, warnings: totalWarns },
    };
  },
});
