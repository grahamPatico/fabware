// Pairwise OBB intersection check across every part in the assembly. We emit
// one rule per failing pair so the UI's existing rule-aggregation can group
// them. A single passing rule is emitted when nothing collides, so the user
// always sees a green "no intersections" chip rather than silence.
//
// Hinged-part pairs get extra tolerance: a real hinge requires the door and
// the door-frame to share a small zone where the hinge hardware sits. The
// optional `interfaces` arg lets the caller declare which (partA, partB)
// pairs are intentionally connected — for hinged interfaces we permit up to
// HINGE_OVERLAP_TOLERANCE of overlap before reporting.

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

export interface IntersectionInterface {
  kind: string;
  partA: string;
  partB: string;
}

const TOLERANCE_INCHES = 0.005;
// Hinge hardware (butt / piano / concealed) lives in a 0.1–0.25" zone where
// the door and frame meet. Permit overlap up to this threshold before
// reporting a hinged-pair as a fail.
const HINGE_OVERLAP_TOLERANCE = 0.250;

export function computeIntersectionRules(
  parts: Doc<"parts">[],
  interfaces: IntersectionInterface[] = [],
): IntersectionRuleResult[] {
  if (parts.length < 2) {
    return [{
      id: "parts_dont_intersect",
      label: "No part intersections",
      status: "pass",
      message: "Nothing to check yet.",
    }];
  }

  // Index hinged pairs (unordered) for O(1) lookup during the inner loop.
  const hingedPairs = new Set<string>();
  for (const iface of interfaces) {
    if (iface.kind !== "hinged") continue;
    const key = iface.partA < iface.partB
      ? `${iface.partA}::${iface.partB}`
      : `${iface.partB}::${iface.partA}`;
    hingedPairs.add(key);
  }

  const obbs = parts.map(p => ({ part: p, obb: partToObb(p) }));
  const rules: IntersectionRuleResult[] = [];

  for (let i = 0; i < obbs.length; i++) {
    for (let j = i + 1; j < obbs.length; j++) {
      const a = obbs[i], b = obbs[j];
      const r = obbIntersect(a.obb, b.obb, TOLERANCE_INCHES);
      if (!r.intersect) continue;
      const aId = a.part._id as unknown as string;
      const bId = b.part._id as unknown as string;
      const key = aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
      const isHinged = hingedPairs.has(key);
      const depthIn = r.depth;
      // Hinges intentionally share a tiny volume where the hinge hardware
      // sits — pass when the overlap is within hinge tolerance.
      if (isHinged && depthIn <= HINGE_OVERLAP_TOLERANCE) continue;
      const depthMm = depthIn * 25.4;
      const status: "warn" | "fail" = depthIn < 0.020 ? "warn" : "fail";
      const hingedNote = isHinged
        ? ` (hinged interface — overlap exceeds ${HINGE_OVERLAP_TOLERANCE}" hinge zone)`
        : "";
      rules.push({
        id: "parts_dont_intersect",
        label: "Part intersection",
        status,
        message:
          `${a.part.label} (${a.part.role}) and ${b.part.label} (${b.part.role}) ` +
          `overlap by ${depthIn.toFixed(3)}" (${depthMm.toFixed(2)} mm)${hingedNote}.`,
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
