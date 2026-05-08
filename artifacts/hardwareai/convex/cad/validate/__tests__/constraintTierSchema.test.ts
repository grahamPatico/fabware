// artifacts/hardwareai/convex/cad/validate/__tests__/constraintTierSchema.test.ts
// Phase 7 — Task 3: Schema-tier constraint ref + duplicate-id tests

import { describe, expect, it } from "vitest";
import { validateSchemaTier } from "../schemaTier";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("validateSchemaTier — sketch constraint checks (Phase 7)", () => {
  it("returns no violations for a sketch with valid constraint refs", () => {
    const violations = validateSchemaTier(ir({
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
          ],
        },
      },
    }));
    expect(violations).toHaveLength(0);
  });

  it("detects a constraint referencing a missing entity", () => {
    const violations = validateSchemaTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          ],
          constraints: [
            { kind: "parallel", id: "par1", a: "l1", b: "l_missing" }, // l_missing does not exist
          ],
        },
      },
    }));
    expect(violations.some(v => v.ruleId === "schema.constraint-unresolved-entity-ref")).toBe(true);
  });

  it("detects duplicate constraint ids in the same sketch", () => {
    const violations = validateSchemaTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
            { kind: "line", id: "l2", p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
          ],
          constraints: [
            { kind: "parallel", id: "c_dup", a: "l1", b: "l2" },
            { kind: "horizontal", id: "c_dup", entity: "l1" }, // duplicate id
          ],
        },
      },
    }));
    expect(violations.some(v => v.ruleId === "schema.duplicate-constraint-id")).toBe(true);
  });

  it("detects a coincident constraint referencing a missing entity through SketchPointRef", () => {
    const violations = validateSchemaTier(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
          ],
          constraints: [
            {
              kind: "coincident",
              id: "coin1",
              a: { entity: "l1", point: "start" },
              b: { entity: "missing_entity", point: "end" }, // missing
            },
          ],
        },
      },
    }));
    expect(violations.some(v => v.ruleId === "schema.constraint-unresolved-entity-ref")).toBe(true);
  });
});
