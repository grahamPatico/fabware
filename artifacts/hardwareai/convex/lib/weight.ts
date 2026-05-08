// Per-part weight estimator. Reads the FlatPattern's pre-computed area,
// subtracts hole and slot areas, multiplies by thickness × material density.

import type { PartDsl } from "./dsl";
import { densityFor } from "./scsRules";
import { flatPattern, type FlatPattern } from "./flatPattern";

export interface PartWeight {
  /** in² */
  area: number;
  /** in³ — net area × thickness */
  volume: number;
  /** lb */
  pounds: number;
  /** kg (= lb / 2.2046) */
  kg: number;
}

export function estimatePartWeight(dsl: PartDsl): PartWeight {
  const pattern = flatPattern(dsl);
  return weightFromPattern(pattern, dsl);
}

/**
 * Variant that takes a pre-computed FlatPattern. Cheaper when a caller
 * already needs the pattern for another reason (DXF, cost, simulator).
 */
export function weightFromPattern(pattern: FlatPattern, dsl: PartDsl): PartWeight {
  let holeArea = 0;
  for (const h of pattern.holes) {
    const r = h.diameter / 2;
    holeArea += Math.PI * r * r;
  }
  for (const s of pattern.slots) {
    holeArea += s.length * s.width;
  }
  const area = Math.max(0, pattern.outlineArea - holeArea);
  const volume = area * dsl.thickness;
  const density = densityFor(dsl.material);
  const pounds = volume * density;
  return { area, volume, pounds, kg: pounds / 2.2046 };
}
