// artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

describe("CadIrSchema", () => {
  it("accepts a minimal valid IR", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { length: { id: "length", value: 120, unit: "mm" } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects camelCase parameter ids", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { holeSpacing: { id: "holeSpacing", value: 90 } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow(/snake_case/);
  });

  it("rejects unknown feature kinds", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [{ kind: "loft", id: "x", profiles: [] }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

import { emptyIr } from "../empty";

describe("emptyIr", () => {
  it("returns a valid IR that round-trips through CadIrSchema", () => {
    const ir = emptyIr("mm");
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
    expect(ir.schemaVersion).toBe(1);
    expect(ir.units).toBe("mm");
    expect(ir.features).toEqual([]);
  });
});

// ── Phase 3: HoleFeature sub-type schema tests ───────────────────────────────

const baseHoleIr = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  sketches: {},
};

function makeHoleFeature(overrides: Record<string, unknown>) {
  return {
    ...baseHoleIr,
    features: [
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
        type: "simple",
        ...overrides,
      },
    ],
  };
}

describe("HoleFeature schema — Phase 3 sub-types", () => {
  it("accepts type=simple with no sub-objects", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "simple" }))).not.toThrow();
  });

  it("accepts type=countersink with countersink sub-object", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "countersink", countersink: { angle: 90, diameter: 12 } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=countersink without countersink sub-object", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "countersink" }))).toThrow(
      /countersink sub-object is required/,
    );
  });

  it("accepts type=counterbore with counterbore sub-object", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "counterbore", counterbore: { diameter: 10, depth: 4 } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=threaded without thread sub-object", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "threaded" }))).toThrow(
      /thread sub-object is required/,
    );
  });

  it("accepts type=threaded with valid thread spec M6x1.0", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "M6x1.0" } }),
      ),
    ).not.toThrow();
  });

  it("accepts type=threaded with valid thread spec 1/4-20", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "1/4-20" } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=threaded with invalid thread spec", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "bad-spec" } }),
      ),
    ).toThrow(/thread spec must match/);
  });
});
