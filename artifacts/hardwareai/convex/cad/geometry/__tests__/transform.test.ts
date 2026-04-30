// convex/cad/geometry/__tests__/transform.test.ts
import { describe, expect, it } from "vitest";
import { transformBbox } from "../transform";
import type { AABB } from "../partBbox";

const box: AABB = { minX: -10, maxX: 10, minY: -5, maxY: 5, minZ: 0, maxZ: 20 };

describe("transformBbox", () => {
  it("translates only when rotation is undefined", () => {
    const result = transformBbox(box, { x: 50, y: 0, z: 0 });
    expect(result.minX).toBeCloseTo(40);
    expect(result.maxX).toBeCloseTo(60);
    expect(result.minY).toBeCloseTo(-5);
    expect(result.maxY).toBeCloseTo(5);
    expect(result.minZ).toBeCloseTo(0);
    expect(result.maxZ).toBeCloseTo(20);
  });

  it("translates only when rotation is all zeros", () => {
    const result = transformBbox(box, { x: 0, y: 10, z: 5 }, { rx: 0, ry: 0, rz: 0 });
    expect(result.minX).toBeCloseTo(-10);
    expect(result.maxX).toBeCloseTo(10);
    expect(result.minY).toBeCloseTo(5);
    expect(result.maxY).toBeCloseTo(15);
    expect(result.minZ).toBeCloseTo(5);
    expect(result.maxZ).toBeCloseTo(25);
  });

  it("sphere-expands when any rotation component is non-zero", () => {
    // box: minX=-10, maxX=10, minY=-5, maxY=5, minZ=0, maxZ=20
    // center: (0, 0, 10), half-extents: (10, 5, 10)
    // radius = sqrt(10^2 + 5^2 + 10^2) = sqrt(100+25+100) = sqrt(225) = 15
    // origin: (100, 0, 0)
    // assembly center: (100, 0, 10)
    // sphere box: [85, 115] x [-15, 15] x [-5, 25]
    const result = transformBbox(box, { x: 100, y: 0, z: 0 }, { rx: 0, ry: 45, rz: 0 });
    const r = 15;
    expect(result.minX).toBeCloseTo(100 - r);
    expect(result.maxX).toBeCloseTo(100 + r);
    expect(result.minY).toBeCloseTo(-r);
    expect(result.maxY).toBeCloseTo(r);
    expect(result.minZ).toBeCloseTo(10 - r);
    expect(result.maxZ).toBeCloseTo(10 + r);
  });
});
