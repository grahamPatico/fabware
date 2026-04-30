// convex/cad/validate/__tests__/rules-print3dMinWall.test.ts
//
// Unit tests for the mfg.print-3d-min-wall rule.
//
// Rule: extrude.distance < MIN_WALL[material] → error
//       only when process === "print_3d"

import { describe, expect, it } from "vitest";
import { print3dMinWall } from "../rules/print3dMinWall";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolved(distance: number): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 50, height: 50 },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "wall1",
        profile: "sk1",
        distance,
        operation: "new_body",
      },
    ],
  };
}

function makeOriginal(
  process: CadIr["process"],
  material?: string,
): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {},
    features: [],
    process,
    material,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("print3dMinWall rule", () => {
  it("emits mfg.print-3d-min-wall for PLA when distance < 1.2mm", () => {
    // PLA min wall = 1.2 mm; distance = 0.8 mm → violation
    const resolved = makeResolved(0.8);
    const original = makeOriginal("print_3d", "pla");
    const violations = print3dMinWall(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.print-3d-min-wall");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("feature");
    expect(violations[0].location?.id).toBe("wall1");
  });

  it("returns no violations when distance meets PLA minimum exactly", () => {
    // PLA min wall = 1.2 mm; distance = 1.2 mm → boundary → no violation
    const resolved = makeResolved(1.2);
    const original = makeOriginal("print_3d", "pla");
    const violations = print3dMinWall(resolved, original);
    expect(violations).toEqual([]);
  });

  it("uses ABS minimum (1.5mm) when material is abs", () => {
    // ABS min wall = 1.5 mm; distance = 1.3 mm → violation
    const resolved = makeResolved(1.3);
    const original = makeOriginal("print_3d", "abs");
    const violations = print3dMinWall(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.print-3d-min-wall");
    expect(violations[0].message).toContain("1.5mm");
  });

  it("returns no violations when process is not print_3d (rule inactive)", () => {
    // laser_cut with thin wall → rule should not fire
    const resolved = makeResolved(0.5);
    const original = makeOriginal("laser_cut", "pla");
    const violations = print3dMinWall(resolved, original);
    expect(violations).toEqual([]);
  });
});
