import { describe, it, expect } from "vitest";
import { validatePartByKind } from "../partValidator";
import type { ScsLiveSku } from "../scsLive";

// CRS-048 as published by SCS (min_hole_to_edge = 0.02").
const CRS_048: ScsLiveSku = {
  sku: "CRS-048",
  thickness: 0.048,
  outOfStock: false,
  cuttingProcess: "Fiber Laser",
  minHoleSize: 0.018,
  minBridgeSize: 0.024,
  minHoleToEdge: 0.02,
  minPartLength: 0.375,
  minPartWidth: 0.25,
  maxPartSize: { w: 44, h: 30 },
  bending: {
    minFlangeBefore: 0.255,
    minFlangeAfter: 0.298,
    maxBendLength: 44,
    effectiveBendRadius: 0.045,
    maxBendAngle: 130,
    kFactor: 0.38,
    bendDeduction: 0.086,
    bendReliefDepth: 0.113,
  },
};

function sheetPart(dsl: Record<string, unknown>) {
  return {
    kind: "sheet_metal",
    dslJson: JSON.stringify({
      version: 1,
      partType: "bracket",
      material: "Mild Steel (CRS)",
      thickness: 0.048,
      width: 4,
      height: 3,
      depth: null,
      features: [],
      finish: null,
      assemblyRefs: [],
      ...dsl,
    }),
  };
}

const TIGHT_HOLE = {
  kind: "hole",
  name: "edge_hole",
  count: 4,
  diameter: 0.1,
  pattern: "corner",
  inset: 0.05,
};

const ROOMY_HOLE = {
  kind: "hole",
  name: "mounting_hole",
  count: 4,
  diameter: 0.25,
  pattern: "corner",
};

describe("validatePartByKind live hole-to-edge", () => {
  it("warns with the measured gap when a hole crowds the outline edge", () => {
    const result = validatePartByKind(sheetPart({ features: [TIGHT_HOLE] }), CRS_048);
    const r = result.rules.find((x) => x.id === "hole-to-edge-live");
    expect(r).toBeDefined();
    expect(r!.status).toBe("warn");
    // 0.05" inset minus the 0.05" hole radius leaves 0.000" of material.
    expect(r!.message).toContain('"edge_hole"');
    expect(r!.message).toContain("0.000\" of material");
    expect(r!.message).toContain(
      "per sendcutsend-specs.json materials[sku=CRS-048].cutting_specs.min_hole_to_edge",
    );
  });

  it("stays quiet when the hole clears the minimum", () => {
    const result = validatePartByKind(sheetPart({ features: [ROOMY_HOLE] }), CRS_048);
    expect(result.rules.find((x) => x.id === "hole-to-edge-live")).toBeUndefined();
  });

  it("skips non-rectangular outlines rather than guessing the nearest edge", () => {
    const result = validatePartByKind(
      sheetPart({
        outline: { kind: "star", numPoints: 5, outerRadius: 2, innerRadius: 1 },
        features: [TIGHT_HOLE],
      }),
      CRS_048,
    );
    expect(result.rules.find((x) => x.id === "hole-to-edge-live")).toBeUndefined();
  });

  it("adds nothing without live rules", () => {
    const result = validatePartByKind(sheetPart({ features: [TIGHT_HOLE] }));
    expect(result.rules.find((x) => x.id === "hole-to-edge-live")).toBeUndefined();
    expect(result.kind).toBe("sheet_metal");
  });
});
