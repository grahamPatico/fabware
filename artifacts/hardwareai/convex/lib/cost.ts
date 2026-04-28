// First-pass cost estimator for sheet-metal parts. Uses public-ballpark
// SCS rates from scsRules; the goal is to land within ~30% of an actual
// SCS quote so the user gets relative cost feedback while iterating, not
// to replace getting a real quote at submission time.

import type { PartDsl } from "./dsl";
import { flatPattern, type FlatPattern } from "./flatPattern";
import {
  costPerIn2,
  CUT_RATE_PER_FT,
  BEND_RATE,
  POWDER_COAT_RATE_PER_FT2,
  MIN_CHARGE_PER_PART,
} from "./scsRules";

export interface PartCost {
  material: number;
  cuts: number;
  bends: number;
  finish: number;
  totalUsd: number;
  perimeterIn: number;
}

export function estimatePartCost(dsl: PartDsl): PartCost {
  return costFromPattern(flatPattern(dsl), dsl);
}

/**
 * Variant that takes a pre-computed FlatPattern. Use when a caller already
 * needs the pattern (DXF, weight, simulator) to avoid recomputing.
 */
export function costFromPattern(pattern: FlatPattern, dsl: PartDsl): PartCost {
  const material = pattern.outlineArea * costPerIn2(dsl.material, dsl.thickness);

  // Cut perimeter: outline + each hole's circumference + each slot's stadium.
  let perim = pattern.outlinePerimeter;
  for (const h of pattern.holes) perim += Math.PI * h.diameter;
  for (const s of pattern.slots) perim += 2 * s.length + Math.PI * s.width;
  const cuts = (perim / 12) * CUT_RATE_PER_FT;

  let bends = 0;
  for (const _ of pattern.bendTangents) bends += BEND_RATE;

  let finish = 0;
  if (dsl.finish?.type === "powder_coat") {
    const ft2 = (2 * pattern.outlineArea) / 144;
    finish = ft2 * POWDER_COAT_RATE_PER_FT2;
  }

  const subtotal = material + cuts + bends + finish;
  const totalUsd = Math.max(subtotal, MIN_CHARGE_PER_PART);
  return { material, cuts, bends, finish, totalUsd, perimeterIn: perim };
}
