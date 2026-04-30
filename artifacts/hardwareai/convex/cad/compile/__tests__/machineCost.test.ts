// convex/cad/compile/__tests__/machineCost.test.ts
// Phase 13 Task 4 — machine-cost compiler tests

import { describe, expect, it } from "vitest";
import { compileMachineCost } from "../machineCost";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

// Helper: build a simple single-extrude IR
function simpleRectIr(
  width: number,
  height: number,
  depth: number,
  process?: CadIr["process"],
): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {
      sk: {
        id: "sk",
        plane: "XY",
        geometry: [{ kind: "rect", id: "r", center: { x: 0, y: 0 }, width, height }],
      },
    },
    features: [
      { kind: "extrude", id: "ex", profile: "sk", distance: depth, operation: "new_body" },
    ],
    ...(process !== undefined ? { process } : {}),
  };
}

describe("compileMachineCost", () => {
  it("returns empty perPart and zero total when process is 'none'", () => {
    const ir = simpleRectIr(100, 80, 5, "none");
    const result = compileMachineCost(ir);
    expect(result.perPart).toHaveLength(0);
    expect(result.totalUsd).toBe(0);
  });

  it("returns empty perPart and zero total when process is undefined", () => {
    const ir = simpleRectIr(100, 80, 5); // no process field
    const result = compileMachineCost(ir);
    expect(result.perPart).toHaveLength(0);
    expect(result.totalUsd).toBe(0);
  });

  it("laser_cut: setupUsd + perimeter × cutUsdPerMm", () => {
    // 80 × 60 rect → perimeter = 2×(80+60) = 280 mm
    // laser_cut: setupUsd=15, cutUsdPerMm=0.005
    // costUsd = 15 + 280 × 0.005 = 15 + 1.4 = 16.4
    const ir = simpleRectIr(80, 60, 3, "laser_cut");
    const result = compileMachineCost(ir);
    expect(result.perPart).toHaveLength(1);
    const line = result.perPart[0]!;
    expect(line.partId).toBe("root");
    expect(line.setupUsd).toBe(15);
    expect(line.variableUsd).toBeCloseTo(1.4, 6);
    expect(line.costUsd).toBeCloseTo(16.4, 6);
    expect(result.totalUsd).toBeCloseTo(16.4, 6);
  });

  it("print_3d: setupUsd + volumeMm3 × buildUsdPerMm3", () => {
    // 80 × 60 × 10 = 48,000 mm³
    // print_3d: setupUsd=5, buildUsdPerMm3=0.0002
    // costUsd = 5 + 48000 × 0.0002 = 5 + 9.6 = 14.6
    const ir = simpleRectIr(80, 60, 10, "print_3d");
    const result = compileMachineCost(ir);
    expect(result.perPart).toHaveLength(1);
    const line = result.perPart[0]!;
    expect(line.setupUsd).toBe(5);
    expect(line.variableUsd).toBeCloseTo(9.6, 6);
    expect(line.costUsd).toBeCloseTo(14.6, 6);
  });

  it("sheet_metal_bend: setupUsd + bendCount × bendUsdEach", () => {
    // sheet with 3 bend_flange features (2 active + 1 suppressed)
    // sheet_metal_bend: setupUsd=20, bendUsdEach=2
    // bendCount = 2 → variableUsd = 4, costUsd = 24
    const ir: CadIr = {
      schemaVersion: 1,
      units: "mm",
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "rect", id: "r", center: { x: 0, y: 0 }, width: 100, height: 80 }],
        },
      },
      features: [
        { kind: "extrude", id: "plate", profile: "sk", distance: 2, operation: "new_body" },
        {
          kind: "bend_flange",
          id: "bend1",
          face: { feature: "plate", tag: "east" },
          angle: 90,
          radius: 2,
          length: 20,
          thickness: 2,
        },
        {
          kind: "bend_flange",
          id: "bend2",
          face: { feature: "plate", tag: "west" },
          angle: 90,
          radius: 2,
          length: 20,
          thickness: 2,
        },
        {
          kind: "bend_flange",
          id: "bend3_suppressed",
          face: { feature: "plate", tag: "north" },
          angle: 45,
          radius: 2,
          length: 10,
          thickness: 2,
          suppressed: true, // this one is suppressed → not counted
        },
      ],
      process: "sheet_metal_bend",
    };

    const result = compileMachineCost(ir);
    expect(result.perPart).toHaveLength(1);
    const line = result.perPart[0]!;
    expect(line.setupUsd).toBe(20);
    expect(line.variableUsd).toBe(4); // 2 bends × $2
    expect(line.costUsd).toBe(24);
    expect(result.totalUsd).toBe(24);
  });

  it("skips external parts in assembly; only inline parts with non-none process contribute", () => {
    // body: laser_cut → contributes
    // ext:  external  → skipped
    // lid:  process=none → skipped
    const bodyIr = simpleRectIr(100, 80, 3, "laser_cut");
    const lidIr = simpleRectIr(100, 80, 2, "none");

    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", kind: "inline", ir: bodyIr },
        screw: { id: "screw", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
        lid: { id: "lid", kind: "inline", ir: lidIr },
      },
    };

    const result = compileMachineCost(ir);
    // Only body contributes (laser_cut); screw is external; lid is "none"
    expect(result.perPart).toHaveLength(1);
    expect(result.perPart[0]!.partId).toBe("body");
    // body: 100×80 rect → perimeter=360; laser_cut: 15 + 360×0.005 = 15 + 1.8 = 16.8
    expect(result.totalUsd).toBeCloseTo(16.8, 6);
  });
});
