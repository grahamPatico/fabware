// artifacts/hardwareai/convex/cad/validate/__tests__/constraintTier.test.ts
// Phase 7 — Task 4: Tier 2 constraint validation tests

import { describe, expect, it } from "vitest";
import { validateConstraintTier } from "../constraintTier";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("validateConstraintTier — Tier 2 (Phase 7)", () => {
  it("returns no violations for an IR with no constraints", () => {
    const violations = validateConstraintTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          ],
        },
      },
    }));
    expect(violations).toHaveLength(0);
  });

  it("detects contradictory horizontal+vertical constraints on the same entity as error", () => {
    const violations = validateConstraintTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          ],
          constraints: [
            { kind: "horizontal", id: "h1", entity: "l1" },
            { kind: "vertical",   id: "v1", entity: "l1" }, // contradicts h1
          ],
        },
      },
    }));
    const contraViolation = violations.find(v => v.ruleId === "constraint.contradictory-axis");
    expect(contraViolation).toBeDefined();
    expect(contraViolation?.severity).toBe("error");
  });

  it("does not flag horizontal and vertical constraints on different entities", () => {
    const violations = validateConstraintTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
            { kind: "line", id: "l2", p1: { x: 5, y: 0 }, p2: { x: 5, y: 10 } },
          ],
          constraints: [
            { kind: "horizontal", id: "h1", entity: "l1" },
            { kind: "vertical",   id: "v1", entity: "l2" }, // different entity — fine
          ],
        },
      },
    }));
    expect(violations.filter(v => v.ruleId === "constraint.contradictory-axis")).toHaveLength(0);
  });

  it("flags severely over-constrained sketch as a warning", () => {
    // 1 line entity = 4 DOF. Threshold = 2 * 4 = 8. Add 9 constraints (9 DOF) to exceed it.
    const constraints = Array.from({ length: 9 }, (_, i) => ({
      kind: "equal" as const,
      id: `eq${i}`,
      a: "l1",
      b: "l2",
    }));
    const violations = validateConstraintTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          ],
          constraints,
        },
      },
    }));
    const overConstrainedViolation = violations.find(v => v.ruleId === "constraint.over-constrained");
    expect(overConstrainedViolation).toBeDefined();
    expect(overConstrainedViolation?.severity).toBe("warn");
  });

  it("returns no violations for an empty IR (no sketches)", () => {
    const violations = validateConstraintTier(emptyIr("mm"));
    expect(violations).toHaveLength(0);
  });
});
