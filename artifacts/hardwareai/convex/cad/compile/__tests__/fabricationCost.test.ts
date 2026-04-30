// convex/cad/compile/__tests__/fabricationCost.test.ts
// Phase 12 Task 4 — Fabrication-cost compiler tests

import { describe, expect, it } from "vitest";
import { compileFabricationCost } from "../fabricationCost";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function simpleExtrudeIr(width: number, height: number, depth: number, material?: string): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {
      sk: {
        id: "sk",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "r", center: { x: 0, y: 0 }, width, height },
        ],
      },
    },
    features: [
      { kind: "extrude", id: "ex", profile: "sk", distance: depth, operation: "new_body" },
    ],
    ...(material !== undefined ? { material } : {}),
  };
}

describe("compileFabricationCost", () => {
  it("returns root line for single-part IR with no parts field", () => {
    // 80 × 60 × 3 = 14,400 mm³ = 14.4 cm³
    // aluminum: 2.7 g/cm³ × 14.4 = 38.88 g = 0.03888 kg × $8/kg = $0.31104
    const ir = simpleExtrudeIr(80, 60, 3, "aluminum");
    const result = compileFabricationCost(ir);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].partId).toBe("root");
    expect(result.lines[0].volumeMm3).toBeCloseTo(14400, 4);
    expect(result.lines[0].costUsd).toBeCloseTo(0.31104, 4);
    expect(result.totalUsd).toBeCloseTo(0.31104, 4);
  });

  it("skips external parts in assembly", () => {
    const bodyIr = simpleExtrudeIr(100, 80, 10, "aluminum");
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", kind: "inline", ir: bodyIr },
        screw: { id: "screw", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      },
    };
    const result = compileFabricationCost(ir);
    // Only "body" contributes — screw is external
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].partId).toBe("body");
  });

  it("uses steel density and cost when material is 'steel'", () => {
    // 100 × 100 × 5 = 50,000 mm³ = 50 cm³
    // steel: 7.85 g/cm³ × 50 = 392.5 g = 0.3925 kg × $5/kg = $1.9625
    const ir = simpleExtrudeIr(100, 100, 5, "steel");
    const result = compileFabricationCost(ir);
    expect(result.lines[0].material.densityGcm3).toBe(7.85);
    expect(result.lines[0].costUsd).toBeCloseTo(1.9625, 4);
  });

  it("falls back to aluminum when material is not specified", () => {
    const ir = simpleExtrudeIr(80, 60, 3); // no material
    const result = compileFabricationCost(ir);
    expect(result.lines[0].material.densityGcm3).toBe(2.7);
  });

  it("sums multiple inline parts correctly", () => {
    // body:  80 × 60 × 3 = 14,400 mm³ aluminum → $0.31104
    // lid:   80 × 60 × 1.5 = 7,200 mm³ aluminum → $0.15552
    const bodyIr = simpleExtrudeIr(80, 60, 3, "aluminum");
    const lidIr = simpleExtrudeIr(80, 60, 1.5, "aluminum");
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", kind: "inline", ir: bodyIr },
        lid: { id: "lid", kind: "inline", ir: lidIr },
      },
    };
    const result = compileFabricationCost(ir);
    expect(result.lines).toHaveLength(2);
    expect(result.totalUsd).toBeCloseTo(0.31104 + 0.15552, 4);
  });
});
