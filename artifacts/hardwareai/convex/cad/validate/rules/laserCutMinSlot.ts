// convex/cad/validate/rules/laserCutMinSlot.ts
//
// Rule: mfg.laser-cut-min-slot
//
// For laser-cut and sheet-metal-bend parts, cut_extrude features whose
// narrowest sketch dimension is smaller than the material thickness will not
// cut cleanly. Fires as an error when:
//
//   min(width, height)  <  material_thickness  (for rect sketches)
//   2 × radius          <  material_thickness  (for circle sketches)
//
// Material thickness is taken from the first non-suppressed `extrude` feature
// in the part's feature list — the convention for flat-sheet parts.
//
// This rule only fires when original.process is "laser_cut" or
// "sheet_metal_bend". At most one violation is emitted per cut_extrude feature
// even if the sketch has multiple entities.

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import type { CutExtrudeFeature, ExtrudeFeature } from "../../ir/types";

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
 * mfg.laser-cut-min-slot
 *
 * Emits an error for every cut_extrude whose profile sketch's narrowest
 * dimension is less than the part's sheet thickness. Only active when
 * `original.process` is "laser_cut" or "sheet_metal_bend".
 */
export function laserCutMinSlot(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  const process = original.process;
  if (process !== "laser_cut" && process !== "sheet_metal_bend") return [];

  const thickness = sheetThickness(resolved);
  if (thickness === undefined) return [];

  const out: Violation[] = [];

  for (const f of resolved.features) {
    if (f.kind !== "cut_extrude" || f.suppressed) continue;
    const cut = f as CutExtrudeFeature;

    const sketch = resolved.sketches[cut.profile];
    if (!sketch) continue;

    // Check each geometry entity in the sketch; emit at most one violation per
    // cut_extrude (break after the first failing entity).
    for (const g of sketch.geometry) {
      let narrowest: number;

      if (g.kind === "rect") {
        narrowest = Math.min(g.width as number, g.height as number);
      } else if (g.kind === "circle") {
        narrowest = 2 * (g.radius as number);
      } else {
        continue; // line entities don't define a slot width
      }

      if (narrowest < thickness) {
        out.push({
          ruleId: "mfg.laser-cut-min-slot",
          severity: "error",
          message: `Cut extrude "${cut.id}" narrowest dimension ${narrowest}mm is less than sheet thickness ${thickness}mm. Laser-cut slots must be at least as wide as the material thickness.`,
          agentMessage: `Widen the slot in cut extrude "${cut.id}" to at least ${thickness}mm so the laser kerf can clear the material.`,
          location: { kind: "slot", id: cut.id },
        });
        break; // one violation per cut_extrude is enough
      }
    }
  }

  return out;
}
