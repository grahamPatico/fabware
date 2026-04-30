// convex/cad/validate/manufacturingTier.ts
//
// Tier-4 (manufacturing-tier) validator. Runs on a ResolvedIr (post-resolve,
// all parameter expressions already evaluated to numbers).
//
// Rules are composed from individual rule files under rules/.

import type { ResolvedIr } from "../resolve/resolveIr";
import type { CadIr } from "../ir/types";
import type { Violation } from "../../plugins/types";
import { holeEdgeDistance } from "./rules/holeEdgeDistance";
import { minWallThickness } from "./rules/minWallThickness";
import { boltClearance } from "./rules/boltClearance";
import { minBendRadius } from "./rules/minBendRadius";
import { laserCutMinHole } from "./rules/laserCutMinHole";
import { laserCutMinSlot } from "./rules/laserCutMinSlot";

/**
 * Validate manufacturing-tier concerns against a resolved IR.
 *
 * @param resolved  IR with all parameter expressions already evaluated to numbers.
 * @param original  Raw (pre-resolution) IR — used by process-specific rules that
 *                  read string fields (e.g. `process`) which the resolver doesn't touch.
 *
 * Returns an empty array when no violations are found.
 */
export function validateManufacturingTier(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  return [
    ...holeEdgeDistance(resolved),
    ...minWallThickness(resolved),
    ...boltClearance(resolved),
    ...minBendRadius(resolved),
    ...laserCutMinHole(resolved, original),
    ...laserCutMinSlot(resolved, original),
  ];
}
