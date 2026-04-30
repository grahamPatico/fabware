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
