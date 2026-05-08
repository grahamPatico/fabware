// convex/cad/validate/rules/print3dMinWall.ts
//
// Rule: mfg.print-3d-min-wall
//
// For 3-D printed parts, walls thinner than the minimum printable wall for the
// chosen material will not print reliably (under-extrusion, delamination, or
// failed bridging). Fires as an error when:
//
//   extrude.distance < MIN_WALL[material]
//
// Only fires when original.process is "print_3d".
// Only non-suppressed extrude features are checked.
//
// Per-material minimum wall thickness (mm):
//   pla    — 1.2 mm  (standard 0.4 mm nozzle, 3-wall minimum)
//   abs    — 1.5 mm  (ABS warps; thicker walls improve dimensional stability)
//   nylon  — 1.0 mm  (nylon is flexible; 1 mm is achievable with fine nozzles)
//   resin  — 0.5 mm  (SLA/DLP resin; very high resolution)
//   default — 1.2 mm (matches PLA as a safe fallback for unknown materials)

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import type { ExtrudeFeature } from "../../ir/types";

/** Per-material minimum printable wall thickness in mm. */
const MIN_WALL_MM: Record<string, number> = {
  pla:   1.2,
  abs:   1.5,
  nylon: 1.0,
  resin: 0.5,
};

const DEFAULT_MIN_WALL = 1.2; // mm — safe fallback (matches PLA)

/**
 * mfg.print-3d-min-wall
 *
 * Emits an error for every non-suppressed extrude feature whose distance is
 * less than the minimum printable wall for the part's material. Only active
 * when `original.process` is "print_3d".
 */
export function print3dMinWall(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  if (original.process !== "print_3d") return [];

  const materialKey = (original.material ?? "").toLowerCase().trim();
  const minWall =
    materialKey in MIN_WALL_MM ? MIN_WALL_MM[materialKey] : DEFAULT_MIN_WALL;

  const out: Violation[] = [];

  for (const f of resolved.features) {
    if (f.kind !== "extrude" || f.suppressed) continue;
    const extrude = f as ExtrudeFeature;
    const distance = extrude.distance as number;

    if (distance < minWall) {
      out.push({
        ruleId: "mfg.print-3d-min-wall",
        severity: "error",
        message: `Extrude "${extrude.id}" thickness ${distance}mm is below the ${minWall}mm minimum wall for 3-D printing (material: ${materialKey || "default"}).`,
        agentMessage: `Increase the extrude distance for "${extrude.id}" to at least ${minWall}mm so the part prints reliably with the chosen material.`,
        location: { kind: "feature", id: extrude.id },
      });
    }
  }

  return out;
}
