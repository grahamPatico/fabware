// First-pass cost estimator for sheet-metal parts. Uses public-ballpark
// SCS rates from scsRules; the goal is to land within ~30% of an actual
// SCS quote so the user gets relative cost feedback while iterating, not
// to replace getting a real quote at submission time.

import type { PartDsl, Outline } from "./dsl";
import { outlineArea } from "./weight";
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

/**
 * Cut perimeter in inches: outline perimeter + sum of hole / slot perimeters.
 */
function perimeterInches(outline: Outline | undefined, fallbackW: number, fallbackH: number): number {
  if (!outline || outline.kind === "rectangle") return 2 * (fallbackW + fallbackH);
  if (outline.kind === "circle") return 2 * Math.PI * outline.radius;
  if (outline.kind === "regular_polygon") {
    const { sides, radius } = outline;
    const sideLen = 2 * radius * Math.sin(Math.PI / sides);
    return sides * sideLen;
  }
  if (outline.kind === "star") {
    const { numPoints, outerRadius, innerRadius } = outline;
    const total = numPoints * 2;
    let perim = 0;
    for (let i = 0; i < total; i++) {
      const r0 = i % 2 === 0 ? outerRadius : innerRadius;
      const r1 = (i + 1) % 2 === 0 ? outerRadius : innerRadius;
      const a0 = (i / total) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / total) * Math.PI * 2 - Math.PI / 2;
      const dx = r1 * Math.cos(a1) - r0 * Math.cos(a0);
      const dy = r1 * Math.sin(a1) - r0 * Math.sin(a0);
      perim += Math.sqrt(dx * dx + dy * dy);
    }
    return perim;
  }
  // polygon
  const { points } = outline;
  if (points.length < 3) return 0;
  let perim = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    perim += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }
  return perim;
}

export function estimatePartCost(dsl: PartDsl): PartCost {
  const baseArea = outlineArea(dsl.outline, dsl.width, dsl.height);
  const material = baseArea * costPerIn2(dsl.material, dsl.thickness);

  // Cut perimeter: outline + each hole's circumference + each slot's perimeter
  let perim = perimeterInches(dsl.outline, dsl.width, dsl.height);
  for (const f of dsl.features) {
    if (f.kind === "hole") {
      perim += f.count * Math.PI * f.diameter;
    } else if (f.kind === "slot") {
      // Stadium perimeter: 2*length + π*width (semicircle caps).
      perim += f.count * (2 * f.length + Math.PI * f.width);
    }
  }
  const cuts = (perim / 12) * CUT_RATE_PER_FT;

  let bends = 0;
  for (const f of dsl.features) {
    if (f.kind === "bend") bends += BEND_RATE;
  }

  let finish = 0;
  if (dsl.finish?.type === "powder_coat") {
    // Both faces ≈ 2 × area; convert in² → ft².
    const ft2 = (2 * baseArea) / 144;
    finish = ft2 * POWDER_COAT_RATE_PER_FT2;
  }

  const subtotal = material + cuts + bends + finish;
  const totalUsd = Math.max(subtotal, MIN_CHARGE_PER_PART);
  return { material, cuts, bends, finish, totalUsd, perimeterIn: perim };
}
