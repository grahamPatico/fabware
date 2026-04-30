// convex/cad/ir/__tests__/budget-schema.test.ts
// Phase 10 Task 2 — CadIr.budget field schema tests

import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

const BASE_IR = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  sketches: {},
  features: [],
};

describe("CadIr.budget schema field (Phase 10)", () => {
  it("accepts a CadIr without a budget field (optional)", () => {
    expect(() => CadIrSchema.parse(BASE_IR)).not.toThrow();
  });

  it("accepts a CadIr with a positive budget value", () => {
    const ir = { ...BASE_IR, budget: 25.00 };
    const result = CadIrSchema.parse(ir) as typeof ir;
    expect((result as { budget?: number }).budget).toBe(25.00);
  });

  it("rejects a budget of zero (must be positive)", () => {
    const ir = { ...BASE_IR, budget: 0 };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });

  it("rejects a negative budget", () => {
    const ir = { ...BASE_IR, budget: -5 };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
