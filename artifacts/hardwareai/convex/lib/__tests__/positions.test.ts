import { describe, it, expect } from "vitest";
import { transformPoint, computeMatingFrame, type Pose, type LocalPoint } from "../positions";

describe("transformPoint", () => {
  it("returns the local point when pose is identity", () => {
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const p: LocalPoint = { x: 1, y: 2, z: 3 };
    expect(transformPoint(p, pose)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("applies translation", () => {
    const pose: Pose = { x: 10, y: 20, z: 30, rotX: 0, rotY: 0, rotZ: 0 };
    const p: LocalPoint = { x: 1, y: 2, z: 3 };
    expect(transformPoint(p, pose)).toEqual({ x: 11, y: 22, z: 33 });
  });

  it("applies Z rotation (90°)", () => {
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: Math.PI / 2 };
    const p: LocalPoint = { x: 1, y: 0, z: 0 };
    const r = transformPoint(p, pose);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(1, 5);
    expect(r.z).toBeCloseTo(0, 5);
  });
});

describe("computeMatingFrame", () => {
  it("places a hole at the expected world position for a translated panel", () => {
    const pose: Pose = { x: 100, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    // A panel 10x10, hole at 2,2 locally (local origin = lower-left corner)
    const holeLocal: LocalPoint = { x: 2, y: 2, z: 0 };
    const frame = computeMatingFrame(holeLocal, pose);
    expect(frame).toEqual({ x: 102, y: 2, z: 0 });
  });
});
