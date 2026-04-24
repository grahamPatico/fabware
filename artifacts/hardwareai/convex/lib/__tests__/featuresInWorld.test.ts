import { describe, it, expect } from "vitest";
import { holeWorldPositions } from "../featuresInWorld";
import type { PartDsl } from "../dsl";
import type { Pose } from "../positions";

describe("holeWorldPositions", () => {
  it("returns an empty array when a part has no hole features", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    expect(holeWorldPositions(dsl, pose)).toEqual([]);
  });

  it("computes corner hole positions for a 4x3 plate with 0.375 inset, pose at origin", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [{
        kind: "hole", name: "mounting_hole", count: 4,
        diameter: 0.266, pattern: "corner", inset: 0.375,
      }],
      finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const holes = holeWorldPositions(dsl, pose);
    expect(holes).toHaveLength(4);
    // Expected corners: (0.375, 0.375), (3.625, 0.375), (0.375, 2.625), (3.625, 2.625)
    const sorted = holes.map(h => `${h.worldPoint.x.toFixed(3)},${h.worldPoint.y.toFixed(3)}`).sort();
    expect(sorted).toEqual(["0.375,0.375", "0.375,2.625", "3.625,0.375", "3.625,2.625"]);
  });

  it("translates hole positions when the part is offset", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [{
        kind: "hole", name: "mounting_hole", count: 4,
        diameter: 0.266, pattern: "corner", inset: 0.375,
      }],
      finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 10, y: 20, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const holes = holeWorldPositions(dsl, pose);
    expect(holes.map(h => h.worldPoint.x).sort()).toEqual([10.375, 10.375, 13.625, 13.625]);
  });
});
