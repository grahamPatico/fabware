// convex/cad/validate/rules/print3dBedSize.ts
//
// Rule: mfg.print-3d-bed-size
//
// For 3-D printed parts, warns when the part's axis-aligned bounding box
// (AABB) exceeds the standard FDM print bed dimensions of 220 × 220 × 250 mm.
//
// Fires as a warning (not an error) — prints larger than the default bed are
// sometimes achievable by splitting the model or using a larger machine, but
// the agent should alert the user so they can make an informed decision.
//
// Only fires when original.process is "print_3d".
// Returns [] for empty parts (computePartBbox returns null).

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import { computePartBbox } from "../../geometry/partBbox";

/** Standard FDM print bed limits (mm). */
const BED_X = 220;
const BED_Y = 220;
const BED_Z = 250;

/**
 * mfg.print-3d-bed-size
 *
 * Emits a warning when the part's AABB exceeds 220 × 220 × 250 mm. Only
 * active when `original.process` is "print_3d".
 */
export function print3dBedSize(
  _resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  if (original.process !== "print_3d") return [];

  const bbox = computePartBbox(original);
  if (bbox === null) return []; // no extrude/revolve features — nothing to measure

  const sizeX = bbox.maxX - bbox.minX;
  const sizeY = bbox.maxY - bbox.minY;
  const sizeZ = bbox.maxZ - bbox.minZ;

  if (sizeX <= BED_X && sizeY <= BED_Y && sizeZ <= BED_Z) return [];

  return [
    {
      ruleId: "mfg.print-3d-bed-size",
      severity: "warn",
      message: `Part bounding box ${sizeX.toFixed(1)}×${sizeY.toFixed(1)}×${sizeZ.toFixed(1)}mm exceeds the standard 3-D print bed (${BED_X}×${BED_Y}×${BED_Z}mm). The part may not fit on a standard FDM printer.`,
      agentMessage: `The part is ${sizeX.toFixed(1)}×${sizeY.toFixed(1)}×${sizeZ.toFixed(1)}mm but the default print bed is ${BED_X}×${BED_Y}×${BED_Z}mm. Consider splitting the model, scaling it down, or using a larger printer.`,
      location: { kind: "part", id: "root" },
    },
  ];
}
