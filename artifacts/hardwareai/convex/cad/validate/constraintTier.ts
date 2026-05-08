// artifacts/hardwareai/convex/cad/validate/constraintTier.ts
//
// Tier 2 — Sketch Constraint Validation (Phase 7)
//
// Checks:
//   1. Contradiction detection: entity that has both horizontal and vertical constraint.
//   2. DOF heuristic: flag severely over-constrained sketches (warn, not error).
//
// The real constraint solver comes in Phase 8. This tier's job is to catch
// obvious mistakes (contradictory axis constraints) and give early warning
// of over-constraining. All Tier 2 violations are "warn" severity except
// contradictions which are "error".

import type { CadIr, SketchConstraint } from "../ir/types";
import type { Violation } from "../../plugins/types";

function warn(ruleId: string, message: string, agent: string): Violation {
  return { ruleId, severity: "warn", message, agentMessage: agent };
}

function err(ruleId: string, message: string, agent: string): Violation {
  return { ruleId, severity: "error", message, agentMessage: agent };
}

/**
 * Count of DOF consumed by a constraint kind.
 * This is a rough approximation — not solver-accurate.
 */
function dofConsumed(c: SketchConstraint): number {
  switch (c.kind) {
    case "coincident":    return 2; // fixes 2D point
    case "distance":      return 1;
    case "parallel":      return 1;
    case "perpendicular": return 1;
    case "tangent":       return 1;
    case "equal":         return 1;
    case "angle":         return 1;
    case "horizontal":    return 1;
    case "vertical":      return 1;
  }
}

/**
 * Approximate DOF of a sketch entity in 2D.
 * rect: 4 (center x/y + width + height); circle: 3 (center x/y + radius); line: 4 (p1 + p2)
 */
function entityDof(kind: string): number {
  switch (kind) {
    case "rect":   return 4;
    case "circle": return 3;
    case "line":   return 4;
    default:       return 3;
  }
}

export function validateConstraintTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];

  for (const [sketchId, sketch] of Object.entries(ir.sketches)) {
    if (!sketch.constraints || sketch.constraints.length === 0) continue;

    // ── 1. Contradiction: entity with both horizontal and vertical constraint ──
    const horizontalEntities = new Set<string>();
    const verticalEntities = new Set<string>();

    for (const c of sketch.constraints) {
      if (c.kind === "horizontal") horizontalEntities.add(c.entity);
      if (c.kind === "vertical")   verticalEntities.add(c.entity);
    }

    for (const entityId of horizontalEntities) {
      if (verticalEntities.has(entityId)) {
        out.push(err(
          "constraint.contradictory-axis",
          `Entity "${entityId}" in sketch "${sketchId}" has both horizontal and vertical constraints`,
          `Remove either the horizontal or vertical constraint on entity "${entityId}" in sketch "${sketchId}". A line cannot be both horizontal and vertical simultaneously.`,
        ));
      }
    }

    // ── 2. DOF heuristic: severely over-constrained sketch ───────────────────
    // Total DOF of all entities in the sketch
    const totalEntityDof = sketch.geometry.reduce((sum, g) => sum + entityDof(g.kind), 0);
    // Total DOF consumed by constraints
    const totalConstraintDof = sketch.constraints.reduce((sum, c) => sum + dofConsumed(c), 0);

    // Flag as over-constrained if constraint DOF > 2 × entity DOF
    // (2× threshold avoids false positives from redundant but valid constraint patterns)
    if (totalConstraintDof > 2 * totalEntityDof && totalEntityDof > 0) {
      out.push(warn(
        "constraint.over-constrained",
        `Sketch "${sketchId}" appears severely over-constrained (${totalConstraintDof} constraint DOF vs ${totalEntityDof} entity DOF)`,
        `Review constraints in sketch "${sketchId}". The sketch has significantly more constraints than geometry DOF. Remove redundant constraints. (Note: precise DOF analysis requires the Phase 8 constraint solver.)`,
      ));
    }
  }

  return out;
}
