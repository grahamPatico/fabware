// convex/cad/validate/rules/laserCutMinHole.ts
//
// Rule: mfg.laser-cut-min-hole
//
// For laser-cut and sheet-metal-bend parts, holes whose diameter is smaller
// than the material thickness will not cut cleanly (the laser spot / punch
// cannot fit through). Fires as an error when:
//
//   hole.diameter < material_thickness
//
// Material thickness is taken from the first non-suppressed `extrude` feature
// in the part's feature list — the convention for flat-sheet parts where the
// main body extrude represents the sheet.
//
// This rule only fires when original.process is "laser_cut" or
// "sheet_metal_bend".

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import type { HoleFeature, ExtrudeFeature } from "../../ir/types";

/** Return the distance of the first non-suppressed extrude, or undefined. */
function sheetThickness(resolved: ResolvedIr): number | undefined {
  for (const f of resolved.features) {
    if (f.kind === "extrude" && !f.suppressed) {
      return (f as ExtrudeFeature).distance as number;
    }
  }
  return undefined;
}

/**
 * mfg.laser-cut-min-hole
 *
 * Emits an error for every hole whose diameter is less than the part's sheet
 * thickness. Only active when `original.process` is "laser_cut" or
 * "sheet_metal_bend".
 */
export function laserCutMinHole(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  const process = original.process;
  if (process !== "laser_cut" && process !== "sheet_metal_bend") return [];

  const thickness = sheetThickness(resolved);
  if (thickness === undefined) return [];

  const out: Violation[] = [];

  for (const f of resolved.features) {
    if (f.kind !== "hole" || f.suppressed) continue;
    const hole = f as HoleFeature;
    const diameter = hole.diameter as number;

    if (diameter < thickness) {
      out.push({
        ruleId: "mfg.laser-cut-min-hole",
        severity: "error",
        message: `Hole "${hole.id}" diameter ${diameter}mm is less than sheet thickness ${thickness}mm. Laser-cut holes must have diameter ≥ material thickness.`,
        agentMessage: `Increase hole "${hole.id}" diameter to at least ${thickness}mm (the sheet thickness) so the laser beam can clear the material.`,
        location: { kind: "hole", id: hole.id },
      });
    }
  }

  return out;
}
