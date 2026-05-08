// convex/cad/compile/__tests__/volume.test.ts
// Phase 12 Task 3 — Volume estimator tests

import { describe, expect, it } from "vitest";
import { estimateVolume } from "../volume";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function rectIr(width: number, height: number, depth: number, cornerRadius?: number): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {
      sk: {
        id: "sk",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "r",
            center: { x: 0, y: 0 },
            width,
            height,
            ...(cornerRadius !== undefined ? { cornerRadius } : {}),
          },
        ],
      },
    },
    features: [
      { kind: "extrude", id: "ex", profile: "sk", distance: depth, operation: "new_body" },
    ],
  };
}

function circleIr(radius: number, depth: number): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {
      sk: {
        id: "sk",
        plane: "XY",
        geometry: [
          { kind: "circle", id: "c", center: { x: 0, y: 0 }, radius },
        ],
      },
    },
    features: [
      { kind: "extrude", id: "ex", profile: "sk", distance: depth, operation: "new_body" },
    ],
  };
}

describe("estimateVolume", () => {
  it("returns 0 for an empty IR with no features", () => {
    expect(estimateVolume(emptyIr("mm"))).toBe(0);
  });

  it("computes rect × depth correctly", () => {
    // 80 × 60 × 3 = 14,400 mm³
    const vol = estimateVolume(rectIr(80, 60, 3));
    expect(vol).toBeCloseTo(14400, 6);
  });

  it("computes circle × depth correctly (π × r² × d)", () => {
    // π × 10² × 5 = 1570.796...
    const vol = estimateVolume(circleIr(10, 5));
    expect(vol).toBeCloseTo(Math.PI * 10 * 10 * 5, 4);
  });

  it("ignores cornerRadius (rect treated as full bounding box)", () => {
    // 80 × 60 × 3 with cornerRadius=4 → still 14,400 mm³ (corner not subtracted)
    const vol = estimateVolume(rectIr(80, 60, 3, 4));
    expect(vol).toBeCloseTo(14400, 6);
  });

  it("subtracts cut_extrude volume", () => {
    // Base: 100 × 100 × 10 = 100,000 mm³
    // Cut hole: circle r=5 through 10 mm = π × 25 × 10 = 785.4 mm³
    // Net ≈ 99,214.6 mm³
    const ir: CadIr = {
      schemaVersion: 1,
      units: "mm",
      parameters: {},
      sketches: {
        base_sk: {
          id: "base_sk",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "base_r", center: { x: 0, y: 0 }, width: 100, height: 100 },
          ],
        },
        hole_sk: {
          id: "hole_sk",
          plane: "XY",
          geometry: [
            { kind: "circle", id: "hole_c", center: { x: 0, y: 0 }, radius: 5 },
          ],
        },
      },
      features: [
        { kind: "extrude", id: "base_ex", profile: "base_sk", distance: 10, operation: "new_body" },
        { kind: "cut_extrude", id: "cut_ex", profile: "hole_sk", distance: 10 },
      ],
    };
    const expected = 100 * 100 * 10 - Math.PI * 5 * 5 * 10;
    expect(estimateVolume(ir)).toBeCloseTo(expected, 3);
  });
});

// ── Phase 15: polygon area ───────────────────────────────────────────────────

describe("estimateVolume — Phase 15 polygon geometry", () => {
  it("polygon extrude: area = (n/2) × r² × sin(2π/n)", () => {
    // Hexagon (n=6), r=10, depth=5
    // area = (6/2) × 100 × sin(2π/6) = 3 × 100 × sin(60°) = 300 × (√3/2) ≈ 259.808
    // volume = area × depth ≈ 1299.038
    const n = 6;
    const r = 10;
    const depth = 5;
    const expectedArea = (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
    const expectedVolume = expectedArea * depth;

    const ir: CadIr = {
      schemaVersion: 1,
      units: "mm",
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "polygon", id: "pg", center: { x: 0, y: 0 }, sides: n, radius: r }],
        },
      },
      features: [
        { kind: "extrude", id: "ex", profile: "sk", distance: depth, operation: "new_body" },
      ],
    };
    expect(estimateVolume(ir)).toBeCloseTo(expectedVolume, 4);
  });
});
