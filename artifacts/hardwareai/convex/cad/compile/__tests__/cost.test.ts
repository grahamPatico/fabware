// convex/cad/compile/__tests__/cost.test.ts
// Phase 10 Task 1 — compileCost + BUILTIN_PRICING tests

import { describe, expect, it } from "vitest";
import { compileCost, BUILTIN_PRICING } from "../cost";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function assemblyIr(parts: CadIr["parts"]): CadIr {
  return { ...emptyIr("mm"), parts };
}

describe("BUILTIN_PRICING", () => {
  it("contains M6 SHCS (91290A115) and M6 nut (91100A060)", () => {
    expect(BUILTIN_PRICING["McMaster-Carr::91290A115"]).toBe(0.42);
    expect(BUILTIN_PRICING["McMaster-Carr::91100A060"]).toBe(0.15);
  });
});

describe("compileCost", () => {
  it("returns empty lines and zero total for a single-part IR with no parts field", () => {
    const result = compileCost(emptyIr("mm"));
    expect(result.lines).toHaveLength(0);
    expect(result.totalKnown).toBe(0);
    expect(result.hasMissingPrices).toBe(false);
  });

  it("computes cost for known external parts", () => {
    // 2 × M6 SHCS @ $0.42 = $0.84
    // 2 × M6 nut  @ $0.15 = $0.30
    // total = $1.14
    const ir = assemblyIr({
      s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      s2: { id: "s2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      n1: { id: "n1", kind: "external", vendor: "McMaster-Carr", partNumber: "91100A060" },
      n2: { id: "n2", kind: "external", vendor: "McMaster-Carr", partNumber: "91100A060" },
    });
    const result = compileCost(ir);
    expect(result.hasMissingPrices).toBe(false);
    expect(result.totalKnown).toBeCloseTo(1.14, 6);
    // Two lines: screws + nuts
    expect(result.lines).toHaveLength(2);
    const screwLine = result.lines.find(l => l.partNumber === "91290A115");
    expect(screwLine).toBeDefined();
    expect(screwLine!.quantity).toBe(2);
    expect(screwLine!.unitCost).toBe(0.42);
    expect(screwLine!.lineTotal).toBeCloseTo(0.84, 6);
  });

  it("marks hasMissingPrices when a part has no price entry", () => {
    const ir = assemblyIr({
      x1: { id: "x1", kind: "external", vendor: "Unknown", partNumber: "XYZ-999" },
    });
    const result = compileCost(ir, BUILTIN_PRICING);
    expect(result.hasMissingPrices).toBe(true);
    expect(result.totalKnown).toBe(0);
    expect(result.lines[0].unitCost).toBeUndefined();
    expect(result.lines[0].lineTotal).toBeUndefined();
  });

  it("accepts a custom pricing db that overrides built-ins", () => {
    const customPricing = { "McMaster-Carr::91290A115": 1.00 };
    const ir = assemblyIr({
      s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
    });
    const result = compileCost(ir, customPricing);
    expect(result.lines[0].unitCost).toBe(1.00);
    expect(result.totalKnown).toBeCloseTo(1.00, 6);
  });
});
