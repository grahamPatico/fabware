// convex/cad/validate/manufacturingTier.ts
//
// Tier-4 (manufacturing-tier) validator. Runs on a ResolvedIr (post-resolve,
// all parameter expressions already evaluated to numbers).
//
// Rules are composed from individual rule files under rules/.

import type { ResolvedIr } from "../resolve/resolveIr";
import type { Violation } from "../../plugins/types";
import { holeEdgeDistance } from "./rules/holeEdgeDistance";
import { minWallThickness } from "./rules/minWallThickness";
import { boltClearance } from "./rules/boltClearance";
import { minBendRadius } from "./rules/minBendRadius";

/**
 * Validate manufacturing-tier concerns against a resolved IR.
 * Returns an empty array when no violations are found.
 */
export function validateManufacturingTier(ir: ResolvedIr): Violation[] {
  return [
    ...holeEdgeDistance(ir),
    ...minWallThickness(ir),
    ...boltClearance(ir),
    ...minBendRadius(ir),
  ];
}
