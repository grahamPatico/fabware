// Pairwise OBB intersection check across every part in the assembly. We emit
// one rule per failing pair so the UI's existing rule-aggregation can group
// them. A single passing rule is emitted when nothing collides, so the user
// always sees a green "no intersections" chip rather than silence.

import type { Doc } from "../_generated/dataModel";
import { obbIntersect } from "./intersect";
import { partToObb } from "./partBox";

export interface IntersectionRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
  partId?: string;
}

const TOLERANCE_INCHES = 0.005;

export function computeIntersectionRules(parts: Doc<"parts">[]): IntersectionRuleResult[] {
  if (parts.length < 2) {
    return [{
      id: "parts_dont_intersect",
      label: "No part intersections",
      status: "pass",
      message: "Nothing to check yet.",
    }];
  }

  const obbs = parts.map(p => ({ part: p, obb: partToObb(p) }));
  const rules: IntersectionRuleResult[] = [];

  for (let i = 0; i < obbs.length; i++) {
    for (let j = i + 1; j < obbs.length; j++) {
      const a = obbs[i], b = obbs[j];
      const r = obbIntersect(a.obb, b.obb, TOLERANCE_INCHES);
      if (!r.intersect) continue;
      const depthIn = r.depth;
      const depthMm = depthIn * 25.4;
      const status: "warn" | "fail" = depthIn < 0.020 ? "warn" : "fail";
      rules.push({
        id: "parts_dont_intersect",
        label: "Part intersection",
        status,
        message:
          `${a.part.label} (${a.part.role}) and ${b.part.label} (${b.part.role}) ` +
          `overlap by ${depthIn.toFixed(3)}" (${depthMm.toFixed(2)} mm).`,
        suggestion:
          status === "fail"
            ? `Move one of these parts by at least ${depthIn.toFixed(3)}" so they no longer share volume.`
            : `Tiny overlap — usually a tolerance issue. Snap the parts to nominal positions.`,
        partId: a.part._id as unknown as string,
      });
    }
  }

  if (rules.length === 0) {
    rules.push({
      id: "parts_dont_intersect",
      label: "No part intersections",
      status: "pass",
      message: `Checked ${(obbs.length * (obbs.length - 1)) / 2} part pairs — none overlap.`,
    });
  }

  return rules;
}
