// convex/cad/compile/fabricationCost.ts
//
// Fabrication-cost compiler — Phase 12, Task 4.
//
// Estimates the cost (USD) of fabricating the inline parts in a CadIr assembly
// based on their estimated volume, the part material, and the material's
// cost-per-kg rate.
//
// Formula per part:
//   volume_cm3 = estimateVolume(partIr) / 1000   (mm³ → cm³)
//   mass_g     = volume_cm3 × material.densityGcm3
//   mass_kg    = mass_g / 1000
//   cost_usd   = mass_kg × material.costPerKgUsd
//
// External parts are SKIPPED — they are already counted in the BOM pricing
// compiled by compileCost().
//
// Top-level "rootless" IRs (no `parts` field) are treated as a single part
// with partId "root".

import type { CadIr, InlinePartRef } from "../ir/types";
import { estimateVolume } from "./volume";
import { lookupMaterial, type MaterialEntry } from "./materials";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FabCostLine {
  partId: string;
  material: MaterialEntry;
  /** Estimated volume of the part in mm³. */
  volumeMm3: number;
  /** Estimated mass in kg. */
  massKg: number;
  /** Fabrication cost in USD (massKg × material.costPerKgUsd). */
  costUsd: number;
}

export interface FabCostResult {
  lines: FabCostLine[];
  /** Sum of all per-part fabrication costs in USD. */
  totalUsd: number;
}

// ── compileFabricationCost ────────────────────────────────────────────────────

/**
 * Estimate the total fabrication cost for all inline parts in a CadIr assembly.
 *
 * - External parts are skipped (already covered by BOM pricing).
 * - Inline parts without any extrude features have volumeMm3 = 0 and costUsd = 0.
 * - The root IR (no `parts` field) is treated as a single inline part ("root").
 * - Material is resolved from part.ir.material (if set) or falls back to the
 *   root ir.material, then to the default (aluminum).
 *
 * @param ir Root CadIr (may be single-part or an assembly)
 * @returns  FabCostResult with per-line and total fabrication cost
 */
export function compileFabricationCost(ir: CadIr): FabCostResult {
  const lines: FabCostLine[] = [];

  if (ir.parts && Object.keys(ir.parts).length > 0) {
    // Assembly with explicit parts
    for (const part of Object.values(ir.parts)) {
      // Skip external parts — they're already in BOM cost
      if ("kind" in part && part.kind === "external") continue;

      const inlinePart = part as InlinePartRef;
      const partIr = inlinePart.ir;

      // Resolve material: part-level material wins, then root-level, then default
      const materialName = partIr.material ?? ir.material;
      const material = lookupMaterial(materialName);

      const volumeMm3 = estimateVolume(partIr);
      const volumeCm3 = volumeMm3 / 1000;
      const massKg = (volumeCm3 * material.densityGcm3) / 1000;
      const costUsd = massKg * material.costPerKgUsd;

      lines.push({
        partId: inlinePart.id,
        material,
        volumeMm3,
        massKg,
        costUsd,
      });
    }
  } else {
    // Single-part IR (no parts field) — treat root as one inline part "root"
    const materialName = ir.material;
    const material = lookupMaterial(materialName);

    const volumeMm3 = estimateVolume(ir);
    const volumeCm3 = volumeMm3 / 1000;
    const massKg = (volumeCm3 * material.densityGcm3) / 1000;
    const costUsd = massKg * material.costPerKgUsd;

    lines.push({
      partId: "root",
      material,
      volumeMm3,
      massKg,
      costUsd,
    });
  }

  const totalUsd = lines.reduce((sum, l) => sum + l.costUsd, 0);
  return { lines, totalUsd };
}
