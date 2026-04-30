// artifacts/hardwareai/convex/cad/ir/__tests__/constraintSchema.test.ts
// Phase 7 — Task 2: Zod schema tests for SketchConstraintSchema

import { describe, expect, it } from "vitest";
import { SketchConstraintSchema } from "../schema";
import { CadIrSchema } from "../schema";

describe("SketchConstraintSchema — discriminated union", () => {
  it("accepts a valid coincident constraint", () => {
    const c = {
      kind: "coincident",
      id: "c1",
      a: { entity: "line1", point: "start" },
      b: { entity: "line2", point: "end" },
    };
    expect(() => SketchConstraintSchema.parse(c)).not.toThrow();
  });

  it("accepts a valid distance constraint with numeric distance", () => {
    const c = {
      kind: "distance",
      id: "d1",
      a: { entity: "line1", point: "start" },
      b: { entity: "circle1", point: "center" },
      distance: 10,
    };
    expect(() => SketchConstraintSchema.parse(c)).not.toThrow();
  });

  it("accepts a valid horizontal constraint (single entity)", () => {
    const c = { kind: "horizontal", id: "h1", entity: "line1" };
    expect(() => SketchConstraintSchema.parse(c)).not.toThrow();
  });

  it("accepts a valid angle constraint with param-ref angle", () => {
    const c = { kind: "angle", id: "ang1", a: "line1", b: "line2", angle: "draft_angle" };
    expect(() => SketchConstraintSchema.parse(c)).not.toThrow();
  });

  it("rejects an unknown constraint kind", () => {
    const c = { kind: "collinear", id: "x1", a: "line1", b: "line2" };
    expect(() => SketchConstraintSchema.parse(c)).toThrow();
  });

  it("rejects a coincident constraint with invalid point value", () => {
    const c = {
      kind: "coincident",
      id: "c1",
      a: { entity: "line1", point: "midpoint" }, // invalid — not start/end/center
      b: { entity: "line2", point: "end" },
    };
    expect(() => SketchConstraintSchema.parse(c)).toThrow();
  });

  it("CadIrSchema accepts a sketch with constraints", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY" as const,
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
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("CadIrSchema accepts a sketch without constraints (optional)", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {
        sk1: { id: "sk1", plane: "XY" as const, geometry: [] },
      },
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });
});
