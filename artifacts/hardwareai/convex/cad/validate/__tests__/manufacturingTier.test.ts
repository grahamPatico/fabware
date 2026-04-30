import { describe, expect, it } from "vitest";
import { validateManufacturingTier } from "../manufacturingTier";
import type { ResolvedIr } from "../../resolve/resolveIr";

// Helper to build a minimal ResolvedIr with one extrude (rect profile) and one hole
function makeIr(overrides: {
  rectCenter?: { x: number; y: number };
  rectWidth?: number;
  rectHeight?: number;
  holePositions?: Array<{ x: number; y: number }>;
  holeDiameter?: number;
}): ResolvedIr {
  const {
    rectCenter = { x: 0, y: 0 },
    rectWidth = 100,
    rectHeight = 100,
    holePositions = [{ x: 0, y: 0 }],
    holeDiameter = 5,
  } = overrides;

  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "r1",
            center: rectCenter,
            width: rectWidth,
            height: rectHeight,
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "ex1",
        profile: "sk1",
        distance: 10,
        operation: "new_body",
      },
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: holePositions,
        diameter: holeDiameter,
        type: "simple",
      },
    ],
  };
}

describe("validateManufacturingTier", () => {
  it("emits mfg.hole-edge-distance when hole is too close to part edge", () => {
    // rect: center=(0,0), width=100, height=100 → x in [-50, 50], y in [-50, 50]
    // hole at (48, 0), diameter=5
    // edge distance from +x wall: 50 - 48 = 2
    // threshold: 1.5 * 5 + 5/2 = 7.5 + 2.5 = 10
    // 2 < 10 → violation expected
    const resolved = makeIr({ holePositions: [{ x: 48, y: 0 }], holeDiameter: 5 });
    const violations = validateManufacturingTier(resolved);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.hole-edge-distance");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("hole");
  });

  it("returns no violations when hole is well within part bounds", () => {
    // rect: center=(0,0), 100×100 → x in [-50, 50], y in [-50, 50]
    // hole at (0, 0), diameter=5
    // min edge distance: 50 in every direction
    // threshold: 1.5 * 5 + 5/2 = 10
    // 50 >= 10 → no violation
    const resolved = makeIr({ holePositions: [{ x: 0, y: 0 }], holeDiameter: 5 });
    const violations = validateManufacturingTier(resolved);
    expect(violations).toEqual([]);
  });
});
