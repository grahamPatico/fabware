// convex/cad/validate/__tests__/rules-laserCutMinHole.test.ts
//
// Unit tests for the mfg.laser-cut-min-hole rule.
//
// Rule: hole.diameter < sheet_thickness → error
//       when process ∈ { laser_cut, sheet_metal_bend }
//
// Sheet thickness = distance of the first non-suppressed extrude feature.

import { describe, expect, it } from "vitest";
import { laserCutMinHole } from "../rules/laserCutMinHole";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolved(opts: {
  sheetThickness: number;
  holeDiameter: number;
}): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [{ kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 100, height: 100 }],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "plate",
        profile: "sk1",
        distance: opts.sheetThickness,
        operation: "new_body",
      },
      {
        kind: "hole",
        id: "h1",
        face: { feature: "plate", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: opts.holeDiameter,
        type: "simple",
      },
    ],
  };
}

function makeOriginal(process: CadIr["process"]): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {},
    features: [],
    process,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("laserCutMinHole rule", () => {
  it("emits mfg.laser-cut-min-hole when diameter < thickness for laser_cut", () => {
    // thickness=3mm, diameter=2mm → 2 < 3 → violation
    const resolved = makeResolved({ sheetThickness: 3, holeDiameter: 2 });
    const original = makeOriginal("laser_cut");
    const violations = laserCutMinHole(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.laser-cut-min-hole");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("hole");
    expect(violations[0].location?.id).toBe("h1");
  });

  it("emits mfg.laser-cut-min-hole when diameter < thickness for sheet_metal_bend", () => {
    // thickness=4mm, diameter=3mm → 3 < 4 → violation
    const resolved = makeResolved({ sheetThickness: 4, holeDiameter: 3 });
    const original = makeOriginal("sheet_metal_bend");
    const violations = laserCutMinHole(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.laser-cut-min-hole");
  });

  it("returns no violations when diameter equals thickness (boundary)", () => {
    // thickness=3mm, diameter=3mm → 3 >= 3 → no violation
    const resolved = makeResolved({ sheetThickness: 3, holeDiameter: 3 });
    const original = makeOriginal("laser_cut");
    const violations = laserCutMinHole(resolved, original);
    expect(violations).toEqual([]);
  });

  it("returns no violations when process is cnc (rule inactive)", () => {
    // CNC doesn't have this constraint — rule should be silent
    const resolved = makeResolved({ sheetThickness: 3, holeDiameter: 1 });
    const original = makeOriginal("cnc");
    const violations = laserCutMinHole(resolved, original);
    expect(violations).toEqual([]);
  });
});
