// convex/cad/validate/rules/cncPocketTooDeep.ts
//
// Rule: mfg.cnc-pocket-too-deep
//
// CNC end mills have a limited flute length relative to their diameter. Cutting
// a pocket deeper than 5× the tool diameter causes excessive tool deflection,
// chatter, and potential breakage. The industry rule-of-thumb is:
//
//   cut depth ≤ 5 × toolDiameter
//
// This rule inspects cut_extrude features and fires a warning when the feature's
// distance (cut depth) exceeds 5× the tool diameter.
//
// Only fires when original.process === "cnc".
// Severity: warn (rule-of-thumb — achievable with pecking / step-down strategies,
// but should alert the agent so the user can make an informed decision).
//
// DEFAULT_TOOL_D = 6.35 mm (1/4" end mill) — used when cncToolDiameter is absent.

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import type { CutExtrudeFeature } from "../../ir/types";

/** Default CNC end-mill diameter in mm (1/4" end mill). */
export const DEFAULT_TOOL_D = 6.35;

/** Maximum recommended depth-to-diameter ratio for CNC end mills. */
const MAX_DEPTH_TO_DIAMETER = 5;

/**
 * mfg.cnc-pocket-too-deep
 *
 * Emits a warning for every cut_extrude whose distance (cut depth) exceeds
 * 5× the tool diameter. Only active when `original.process` is "cnc".
 */
export function cncPocketTooDeep(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  if (original.process !== "cnc") return [];

  const toolDiameter = (original.cncToolDiameter ?? DEFAULT_TOOL_D) as number;
  const maxDepth = MAX_DEPTH_TO_DIAMETER * toolDiameter;

  const out: Violation[] = [];

  for (const f of resolved.features) {
    if (f.kind !== "cut_extrude" || f.suppressed) continue;
    const cut = f as CutExtrudeFeature;
    const depth = cut.distance as number;

    if (depth > maxDepth) {
      out.push({
        ruleId: "mfg.cnc-pocket-too-deep",
        severity: "warn",
        message: `Cut extrude "${cut.id}" depth ${depth}mm exceeds 5× tool diameter (${maxDepth}mm for Ø${toolDiameter}mm tool). Deep pockets cause tool deflection and may break the end mill.`,
        agentMessage: `Reduce the depth of cut extrude "${cut.id}" to at most ${maxDepth}mm (5× Ø${toolDiameter}mm tool diameter), or specify a larger cncToolDiameter. If the full depth is required, use a step-down (pecking) strategy and inform the user.`,
        location: { kind: "feature", id: cut.id },
      });
    }
  }

  return out;
}
