// convex/cad/compile/__tests__/perimeter.test.ts
// Phase 13 Task 3 — perimeter estimator tests

import { describe, expect, it } from "vitest";
import { estimatePerimeter } from "../perimeter";
import type { CadIr } from "../../ir/types";

function makeIr(features: CadIr["features"], sketches: CadIr["sketches"]): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches,
    features,
  };
}

describe("estimatePerimeter", () => {
  it("rect extrude: perimeter = 2 × (width + height)", () => {
    // 80 × 60 rect → 2 × (80 + 60) = 280
    const ir = makeIr(
      [{ kind: "extrude", id: "ex", profile: "sk", distance: 3, operation: "new_body" }],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "rect", id: "r", center: { x: 0, y: 0 }, width: 80, height: 60 }],
        },
      },
    );
    expect(estimatePerimeter(ir)).toBeCloseTo(280, 6);
  });

  it("circle extrude: perimeter = 2π × radius", () => {
    // radius = 10 → 2π × 10 ≈ 62.8318...
    const ir = makeIr(
      [{ kind: "extrude", id: "ex", profile: "sk", distance: 5, operation: "new_body" }],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "circle", id: "c", center: { x: 0, y: 0 }, radius: 10 }],
        },
      },
    );
    expect(estimatePerimeter(ir)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  it("line in cut_extrude: perimeter = Euclidean distance", () => {
    // line from (0,0) to (30,40) → √(900+1600) = √2500 = 50
    const ir = makeIr(
      [
        // base body (rect) — establishes the shape
        { kind: "extrude", id: "base", profile: "base_sk", distance: 5, operation: "new_body" },
        // cut with a line profile
        { kind: "cut_extrude", id: "slot", profile: "line_sk", distance: 5 },
      ],
      {
        base_sk: {
          id: "base_sk",
          plane: "XY",
          geometry: [{ kind: "rect", id: "r", center: { x: 0, y: 0 }, width: 100, height: 100 }],
        },
        line_sk: {
          id: "line_sk",
          plane: "XY",
          geometry: [{ kind: "line", id: "l", p1: { x: 0, y: 0 }, p2: { x: 30, y: 40 } }],
        },
      },
    );
    // base rect: 2×(100+100) = 400; cut line: 50
    expect(estimatePerimeter(ir)).toBeCloseTo(400 + 50, 6);
  });

  it("suppressed features are excluded from perimeter", () => {
    // Two rect extrudes — one suppressed; only the active one contributes
    const ir = makeIr(
      [
        { kind: "extrude", id: "active", profile: "sk", distance: 3, operation: "new_body" },
        {
          kind: "extrude",
          id: "hidden",
          profile: "sk",
          distance: 3,
          operation: "add",
          suppressed: true,
        },
      ],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "rect", id: "r", center: { x: 0, y: 0 }, width: 50, height: 20 }],
        },
      },
    );
    // Only active: 2×(50+20) = 140
    expect(estimatePerimeter(ir)).toBeCloseTo(140, 6);
  });
});

// ── Phase 15: new geometry kinds ─────────────────────────────────────────────

describe("estimatePerimeter — Phase 15 new geometry kinds", () => {
  it("polygon extrude: perimeter = n × 2 × r × sin(π/n)", () => {
    // Regular hexagon (n=6), r=10: 6 × 2 × 10 × sin(π/6) = 6 × 20 × 0.5 = 60
    const ir = makeIr(
      [{ kind: "extrude", id: "ex", profile: "sk", distance: 5, operation: "new_body" }],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [{ kind: "polygon", id: "pg", center: { x: 0, y: 0 }, sides: 6, radius: 10 }],
        },
      },
    );
    const expected = 6 * 2 * 10 * Math.sin(Math.PI / 6);
    expect(estimatePerimeter(ir)).toBeCloseTo(expected, 6);
  });

  it("arc extrude: arc length = r × (π/180) × |endAngle - startAngle|", () => {
    // 90-degree arc, radius=10: 10 × (π/180) × 90 = 10 × π/2 ≈ 15.708
    const ir = makeIr(
      [{ kind: "extrude", id: "ex", profile: "sk", distance: 5, operation: "new_body" }],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "arc",
              id: "a1",
              center: { x: 0, y: 0 },
              radius: 10,
              startAngle: 0,
              endAngle: 90,
            },
          ],
        },
      },
    );
    const expected = 10 * (Math.PI / 180) * 90;
    expect(estimatePerimeter(ir)).toBeCloseTo(expected, 6);
  });

  it("spline extrude: perimeter = sum of segment lengths", () => {
    // Points: (0,0) → (3,4) → (3,4+5=9)
    // seg0: √(9+16) = 5; seg1: √(0+25) = 5; total = 10
    const ir = makeIr(
      [{ kind: "extrude", id: "ex", profile: "sk", distance: 5, operation: "new_body" }],
      {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "spline",
              id: "sp1",
              points: [
                { x: 0, y: 0 },
                { x: 3, y: 4 },
                { x: 3, y: 9 },
              ],
            },
          ],
        },
      },
    );
    expect(estimatePerimeter(ir)).toBeCloseTo(10, 6);
  });
});
