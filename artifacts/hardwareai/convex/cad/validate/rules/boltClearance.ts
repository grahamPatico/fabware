// convex/cad/validate/rules/boltClearance.ts
//
// Rule: mfg.bolt-clearance
// A counterbore hole's counterbore diameter must be at least 1.2 × the
// through-hole (pilot) diameter to leave enough wall material for the bolt
// head to seat properly.
//
// Rule only fires for holes with type === "counterbore".

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";
import type { HoleFeature } from "../../ir/types";

function viol(
  ruleId: string,
  message: string,
  agentMessage: string,
  location?: Violation["location"],
): Violation {
  return { ruleId, severity: "error", message, agentMessage, location };
}

/**
 * Returns violations for counterbore holes whose counterbore diameter
 * is less than 1.2 × the pilot (through-hole) diameter.
 */
export function boltClearance(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];

  for (const feature of ir.features) {
    if (feature.kind !== "hole") continue;
    const hole = feature as HoleFeature;
    if (hole.type !== "counterbore") continue;
    if (!hole.counterbore) continue;

    const pilotDiameter = (hole as { diameter: number }).diameter;
    const cboreDiameter = (hole.counterbore as { diameter: number; depth: number }).diameter;

    const minCbore = 1.2 * pilotDiameter;

    if (cboreDiameter < minCbore) {
      out.push(
        viol(
          "mfg.bolt-clearance",
          `Hole "${hole.id}" counterbore diameter ${cboreDiameter.toFixed(2)} mm is less than 1.2 × pilot diameter (${minCbore.toFixed(2)} mm minimum for ⌀${pilotDiameter} mm pilot).`,
          `Increase the counterbore diameter for "${hole.id}" to at least ${minCbore.toFixed(2)} mm (rule: counterbore.diameter ≥ 1.2 × pilot diameter for ⌀${pilotDiameter} mm holes).`,
          { kind: "hole", id: hole.id },
        ),
      );
    }
  }

  return out;
}
