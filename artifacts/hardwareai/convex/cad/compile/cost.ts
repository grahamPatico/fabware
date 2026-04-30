// convex/cad/compile/cost.ts
//
// Cost compiler — Phase 10.
//
// Walks a CadIr assembly, looks up each ExternalPartRef by vendor+partNumber in
// a PricingDb, and returns a CostResult summarising per-line and total cost.
//
// Parts without a price entry are reported with unitCost undefined and excluded
// from the total.

import type { CadIr, ExternalPartRef } from "../ir/types";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Map of "Vendor::PartNumber" → unit price in USD. */
export type PricingDb = Record<string, number>;

export interface CostLine {
  /** Part id in the assembly. */
  partId: string;
  vendor: string;
  partNumber: string;
  description?: string;
  unitCost: number | undefined;
  quantity: number;
  /** Line total = unitCost × quantity, or undefined when unitCost is unknown. */
  lineTotal: number | undefined;
}

export interface CostResult {
  lines: CostLine[];
  /** Sum of all known line totals (USD). Lines with no price data are excluded. */
  totalKnown: number;
  /** True if at least one external part had no price in the PricingDb. */
  hasMissingPrices: boolean;
}

// ── Built-in pricing database ─────────────────────────────────────────────────
//
// Small starter set of commonly used fasteners and bearings.
// Values are approximate US list prices in USD per unit.

export const BUILTIN_PRICING: PricingDb = {
  "McMaster-Carr::91290A115": 0.42,  // M6 × 10 SHCS
  "McMaster-Carr::91290A130": 0.55,  // M6 × 25 SHCS
  "McMaster-Carr::91294A150": 0.75,  // M6 × 40 SHCS
  "McMaster-Carr::91100A030": 0.08,  // M3 hex nut
  "McMaster-Carr::91100A060": 0.15,  // M6 hex nut
  "McMaster-Carr::92141A012": 0.05,  // M3 flat washer
  "Misumi::B-6800ZZ":         3.20,  // 6800ZZ deep-groove ball bearing
};

// ── compileCost ───────────────────────────────────────────────────────────────

/**
 * Compile a cost roll-up from a CadIr assembly.
 *
 * @param ir      Root CadIr (may be single-part or an assembly)
 * @param pricing PricingDb to consult — defaults to BUILTIN_PRICING
 * @returns       CostResult with per-line costs and total
 */
export function compileCost(ir: CadIr, pricing: PricingDb = BUILTIN_PRICING): CostResult {
  // Aggregate quantities by vendor+partNumber (same key space as compileBom)
  const aggregated = new Map<string, {
    partId: string;
    vendor: string;
    partNumber: string;
    description?: string;
    quantity: number;
  }>();

  function visit(node: CadIr): void {
    if (!node.parts) return;

    for (const part of Object.values(node.parts)) {
      if ("kind" in part && part.kind === "external") {
        const ext = part as ExternalPartRef;
        const key = `${ext.vendor}::${ext.partNumber}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity += 1;
        } else {
          aggregated.set(key, {
            partId: ext.id,
            vendor: ext.vendor,
            partNumber: ext.partNumber,
            description: ext.description,
            quantity: 1,
          });
        }
      } else {
        // Inline part — recurse into its sub-assembly
        const inlinePart = part as { ir: CadIr };
        visit(inlinePart.ir);
      }
    }
  }

  visit(ir);

  // Build CostLine entries
  const lines: CostLine[] = [];
  let totalKnown = 0;
  let hasMissingPrices = false;

  for (const [key, entry] of aggregated) {
    const unitCost = pricing[key];
    const lineTotal = unitCost !== undefined ? unitCost * entry.quantity : undefined;

    if (unitCost !== undefined) {
      totalKnown += lineTotal!;
    } else {
      hasMissingPrices = true;
    }

    lines.push({
      partId: entry.partId,
      vendor: entry.vendor,
      partNumber: entry.partNumber,
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      unitCost,
      quantity: entry.quantity,
      lineTotal,
    });
  }

  // Sort by vendor then partNumber for deterministic output
  lines.sort((a, b) => {
    const vc = a.vendor.localeCompare(b.vendor);
    if (vc !== 0) return vc;
    return a.partNumber.localeCompare(b.partNumber);
  });

  return { lines, totalKnown, hasMissingPrices };
}
