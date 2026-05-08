// convex/cad/validate/rules/minBendRadius.ts
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";

/**
 * mfg.min-bend-radius rule
 *
 * For every bend_flange feature, the inner bend radius must be ≥ the sheet
 * thickness. Bending to a radius tighter than the sheet thickness causes
 * cracking along the bend line in most ductile sheet metals.
 *
 * Rule: r >= thickness
 */
export function minBendRadius(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];
  for (const f of ir.features) {
    if (f.kind === "bend_flange") {
      const r = f.radius as number;
      const t = f.thickness as number;
      if (r < t) {
        out.push({
          ruleId: "mfg.min-bend-radius",
          severity: "error",
          message: `Bend flange "${f.id}" inner radius ${r}mm is less than sheet thickness ${t}mm. Minimum bend radius is 1× thickness.`,
          agentMessage: `Increase the bend radius for "${f.id}" to at least ${t}mm (equal to the sheet thickness ${t}mm).`,
          location: { kind: "feature", id: f.id },
        });
      }
    }
  }
  return out;
}
