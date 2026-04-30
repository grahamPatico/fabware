// convex/cad/validate/__tests__/rules-print3dBedSize.test.ts
//
// Unit tests for the mfg.print-3d-bed-size rule.
//
// Rule: part AABB > 220×220×250mm → warn
//       only when process === "print_3d"

import { describe, expect, it } from "vitest";
import { print3dBedSize } from "../rules/print3dBedSize";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal CadIr with a single rect extrude of the given dimensions.
 * The AABB will be exactly width × height in XY and depth in Z.
 */
function makeIr(width: number, height: number, depth: number): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "r1",
            center: { x: 0, y: 0 },
            width,
            height,
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "body",
        profile: "sk1",
        distance: depth,
        operation: "new_body",
      },
    ],
    process: "print_3d",
  };
}

// Minimal resolved IR (unused by print3dBedSize — it calls computePartBbox(original))
const DUMMY_RESOLVED: ResolvedIr = {
  schemaVersion: 1,
  units: "mm",
  resolvedParameters: {},
  sketches: {},
  features: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("print3dBedSize rule", () => {
  it("emits mfg.print-3d-bed-size when part exceeds bed in X", () => {
    // 250×100×100 mm → X (250) > 220 → violation
    const ir = makeIr(250, 100, 100);
    const violations = print3dBedSize(DUMMY_RESOLVED, ir);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.print-3d-bed-size");
    expect(violations[0].severity).toBe("warn");
  });

  it("emits mfg.print-3d-bed-size when part exceeds bed in Z", () => {
    // 100×100×260 mm → Z (260) > 250 → violation
    const ir = makeIr(100, 100, 260);
    const violations = print3dBedSize(DUMMY_RESOLVED, ir);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.print-3d-bed-size");
  });

  it("returns no violations when part fits within bed limits", () => {
    // 200×200×200 mm → all dimensions within 220×220×250 → no violation
    const ir = makeIr(200, 200, 200);
    const violations = print3dBedSize(DUMMY_RESOLVED, ir);
    expect(violations).toEqual([]);
  });

  it("returns no violations when process is not print_3d (rule inactive)", () => {
    // Large part but process is cnc → rule should not fire
    const ir = { ...makeIr(300, 300, 300), process: "cnc" as const };
    const violations = print3dBedSize(DUMMY_RESOLVED, ir);
    expect(violations).toEqual([]);
  });
});
