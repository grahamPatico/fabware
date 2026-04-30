// convex/cad/ir/__tests__/material-schema.test.ts
// Phase 12 Task 2 — CadIr.material field schema tests

import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

const BASE_IR = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  sketches: {},
  features: [],
};

describe("CadIr.material schema field (Phase 12)", () => {
  it("accepts a CadIr without a material field (optional)", () => {
    expect(() => CadIrSchema.parse(BASE_IR)).not.toThrow();
  });

  it("accepts a CadIr with a known material key string", () => {
    const ir = { ...BASE_IR, material: "aluminum" };
    const result = CadIrSchema.parse(ir) as typeof ir;
    expect((result as { material?: string }).material).toBe("aluminum");
  });

  it("rejects an empty string for material", () => {
    const ir = { ...BASE_IR, material: "" };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
