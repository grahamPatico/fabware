// convex/cad/geometry/__tests__/partBbox.test.ts
import { describe, expect, it } from "vitest";
import { computePartBbox } from "../partBbox";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr {
  return { ...emptyIr("mm"), ...extra };
}

describe("computePartBbox", () => {
  it("returns null for a part with no extrude or revolve features", () => {
    expect(computePartBbox(emptyIr("mm"))).toBeNull();
  });

  it("returns correct AABB for a simple rect extrude", () => {
    const result = computePartBbox(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 40, height: 20 },
          ],
        },
      },
      features: [
        { id: "ex1", kind: "extrude", profile: "sk1", distance: 10, operation: "new_body" },
      ],
    }));
    expect(result).not.toBeNull();
    expect(result!.minX).toBeCloseTo(-20);
    expect(result!.maxX).toBeCloseTo(20);
    expect(result!.minY).toBeCloseTo(-10);
    expect(result!.maxY).toBeCloseTo(10);
    expect(result!.minZ).toBeCloseTo(0);
    expect(result!.maxZ).toBeCloseTo(10);
  });

  it("returns correct AABB for a circle extrude", () => {
    const result = computePartBbox(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 15 },
          ],
        },
      },
      features: [
        { id: "ex1", kind: "extrude", profile: "sk1", distance: 30, operation: "new_body" },
      ],
    }));
    expect(result).not.toBeNull();
    expect(result!.minX).toBeCloseTo(-15);
    expect(result!.maxX).toBeCloseTo(15);
    expect(result!.minY).toBeCloseTo(-15);
    expect(result!.maxY).toBeCloseTo(15);
    expect(result!.minZ).toBeCloseTo(0);
    expect(result!.maxZ).toBeCloseTo(30);
  });

  it("grows bbox across multiple extrude features", () => {
    const result = computePartBbox(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 20, height: 20 },
          ],
        },
        sk2: {
          id: "sk2",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "r2", center: { x: 30, y: 0 }, width: 20, height: 20 },
          ],
        },
      },
      features: [
        { id: "ex1", kind: "extrude", profile: "sk1", distance: 10, operation: "new_body" },
        { id: "ex2", kind: "extrude", profile: "sk2", distance: 5,  operation: "add" },
      ],
    }));
    expect(result).not.toBeNull();
    expect(result!.minX).toBeCloseTo(-10);
    expect(result!.maxX).toBeCloseTo(40);
    expect(result!.minZ).toBeCloseTo(0);
    expect(result!.maxZ).toBeCloseTo(10);
  });

  it("returns conservative cylinder bbox for a revolve feature (axis=y)", () => {
    // Profile: rect centered at (20,0), width=10, height=30 => revolving around Y
    // radius from Y axis = max(|20-5|, |20+5|) = max(15, 25) = 25
    // Y extent = [-15, 15]
    const result = computePartBbox(ir({
      sketches: {
        sk1: {
          id: "sk1",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "r1", center: { x: 20, y: 0 }, width: 10, height: 30 },
          ],
        },
      },
      features: [
        { id: "rv1", kind: "revolve", profile: "sk1", axis: "y", angle: 360 },
      ],
    }));
    expect(result).not.toBeNull();
    // Cylinder along Y, radius 25
    expect(result!.minX).toBeCloseTo(-25);
    expect(result!.maxX).toBeCloseTo(25);
    expect(result!.minZ).toBeCloseTo(-25);
    expect(result!.maxZ).toBeCloseTo(25);
    expect(result!.minY).toBeCloseTo(-15);
    expect(result!.maxY).toBeCloseTo(15);
  });
});
