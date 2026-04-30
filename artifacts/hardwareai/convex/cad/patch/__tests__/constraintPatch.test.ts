// artifacts/hardwareai/convex/cad/patch/__tests__/constraintPatch.test.ts
// Phase 7 — Task 6: add_constraint / remove_constraint patch tests

import { describe, expect, it } from "vitest";
import { applyPatch } from "../apply";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function irWithSketch(): CadIr {
  return {
    ...emptyIr("mm"),
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          { kind: "line", id: "l2", p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
        ],
      },
    },
  };
}

describe("applyPatch — add_constraint / remove_constraint (Phase 7)", () => {
  it("add_constraint appends a constraint to a sketch", () => {
    const result = applyPatch(irWithSketch(), {
      kind: "modify_sketch",
      sketchId: "sk1",
      op: {
        kind: "add_constraint",
        constraint: { kind: "parallel", id: "par1", a: "l1", b: "l2" },
      },
    });
    expect(result.schemaViolations).toEqual([]);
    expect(result.ir.sketches.sk1.constraints).toHaveLength(1);
    expect(result.ir.sketches.sk1.constraints![0].id).toBe("par1");
  });

  it("remove_constraint removes a constraint by id", () => {
    const base: CadIr = {
      ...irWithSketch(),
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
            { kind: "line", id: "l2", p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
          ],
          constraints: [
            { kind: "parallel", id: "par1", a: "l1", b: "l2" },
            { kind: "horizontal", id: "h1", entity: "l1" },
          ],
        },
      },
    };
    const result = applyPatch(base, {
      kind: "modify_sketch",
      sketchId: "sk1",
      op: { kind: "remove_constraint", constraintId: "par1" },
    });
    expect(result.schemaViolations).toEqual([]);
    expect(result.ir.sketches.sk1.constraints).toHaveLength(1);
    expect(result.ir.sketches.sk1.constraints![0].id).toBe("h1");
  });

  it("add_constraint on a sketch with no prior constraints creates constraints array", () => {
    const result = applyPatch(irWithSketch(), {
      kind: "modify_sketch",
      sketchId: "sk1",
      op: {
        kind: "add_constraint",
        constraint: { kind: "horizontal", id: "h1", entity: "l1" },
      },
    });
    expect(result.schemaViolations).toEqual([]);
    const constraints = result.ir.sketches.sk1.constraints;
    expect(Array.isArray(constraints)).toBe(true);
    expect(constraints).toHaveLength(1);
  });

  it("add_constraint with unresolved entity ref returns schema violation", () => {
    const result = applyPatch(irWithSketch(), {
      kind: "modify_sketch",
      sketchId: "sk1",
      op: {
        kind: "add_constraint",
        constraint: { kind: "parallel", id: "par1", a: "l1", b: "l_missing" }, // l_missing not in sketch
      },
    });
    // The schema tier will catch the unresolved entity ref
    expect(result.schemaViolations.some(v => v.ruleId === "schema.constraint-unresolved-entity-ref")).toBe(true);
    // IR should be unchanged (patch rejected)
    expect(result.ir.sketches.sk1.constraints).toBeUndefined();
  });
});
