import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";

const DEFAULT_MIN_WALL = 2; // mm

export function minWallThickness(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];
  for (const f of ir.features) {
    if (f.kind === "extrude" && (f.distance as number) < DEFAULT_MIN_WALL) {
      out.push({
        ruleId: "mfg.min-wall-thickness",
        severity: "error",
        message: `Extrude "${f.id}" thickness ${f.distance as number}mm is below the ${DEFAULT_MIN_WALL}mm minimum wall thickness.`,
        agentMessage: `Increase the extrude distance for "${f.id}" to at least ${DEFAULT_MIN_WALL}mm, or change the parameter that drives it.`,
        location: { kind: "feature", id: f.id },
      });
    }
  }
  return out;
}
