// convex/cad/validate/__tests__/rules-laserCutMinSlot.test.ts
//
// Unit tests for the mfg.laser-cut-min-slot rule.
//
// Rule: narrowest dimension of a cut_extrude profile sketch < sheet_thickness → error
//       when process ∈ { laser_cut, sheet_metal_bend }
//
// Sheet thickness = distance of the first non-suppressed extrude feature.

import { describe, expect, it } from "vitest";
import { laserCutMinSlot } from "../rules/laserCutMinSlot";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolvedWithRectSlot(opts: {
  sheetThickness: number;
  slotWidth: number;
  slotHeight: number;
}): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      plate_sk: {
        id: "plate_sk",
        plane: "XY",
        geometry: [{ kind: "rect", id: "plate_r", center: { x: 0, y: 0 }, width: 100, height: 100 }],
      },
      slot_sk: {
        id: "slot_sk",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "slot_r",
            center: { x: 0, y: 0 },
            width: opts.slotWidth,
            height: opts.slotHeight,
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "plate",
        profile: "plate_sk",
        distance: opts.sheetThickness,
        operation: "new_body",
      },
      {
        kind: "cut_extrude",
        id: "slot1",
        profile: "slot_sk",
        distance: opts.sheetThickness,
        through: true,
      },
    ],
  };
}

function makeResolvedWithCircleSlot(opts: {
  sheetThickness: number;
  circleRadius: number;
}): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      plate_sk: {
        id: "plate_sk",
        plane: "XY",
        geometry: [{ kind: "rect", id: "plate_r", center: { x: 0, y: 0 }, width: 100, height: 100 }],
      },
      circle_sk: {
        id: "circle_sk",
        plane: "XY",
        geometry: [
          { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: opts.circleRadius },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "plate",
        profile: "plate_sk",
        distance: opts.sheetThickness,
        operation: "new_body",
      },
      {
        kind: "cut_extrude",
        id: "circle_cut",
        profile: "circle_sk",
        distance: opts.sheetThickness,
        through: true,
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

describe("laserCutMinSlot rule", () => {
  it("emits mfg.laser-cut-min-slot for narrow rect slot with laser_cut process", () => {
    // thickness=3mm, slot 2×20mm → narrowest=2 < 3 → violation
    const resolved = makeResolvedWithRectSlot({
      sheetThickness: 3,
      slotWidth: 2,
      slotHeight: 20,
    });
    const original = makeOriginal("laser_cut");
    const violations = laserCutMinSlot(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.laser-cut-min-slot");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("slot");
    expect(violations[0].location?.id).toBe("slot1");
  });

  it("emits mfg.laser-cut-min-slot for narrow rect slot with sheet_metal_bend process", () => {
    // thickness=4mm, slot 3×10mm → narrowest=3 < 4 → violation
    const resolved = makeResolvedWithRectSlot({
      sheetThickness: 4,
      slotWidth: 3,
      slotHeight: 10,
    });
    const original = makeOriginal("sheet_metal_bend");
    const violations = laserCutMinSlot(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.laser-cut-min-slot");
  });

  it("returns no violations when slot width equals thickness (boundary — rect)", () => {
    // thickness=3mm, slot 3×20mm → narrowest=3 >= 3 → no violation
    const resolved = makeResolvedWithRectSlot({
      sheetThickness: 3,
      slotWidth: 3,
      slotHeight: 20,
    });
    const original = makeOriginal("laser_cut");
    const violations = laserCutMinSlot(resolved, original);
    expect(violations).toEqual([]);
  });

  it("returns no violations when process is print_3d (rule inactive)", () => {
    // 3D printing doesn't have this constraint — rule should be silent
    const resolved = makeResolvedWithRectSlot({
      sheetThickness: 3,
      slotWidth: 1,
      slotHeight: 10,
    });
    const original = makeOriginal("print_3d");
    const violations = laserCutMinSlot(resolved, original);
    expect(violations).toEqual([]);
  });
});
