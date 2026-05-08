// convex/cad/geometry/__tests__/jointPose.test.ts
//
// Tests for Phase 11 Task 1: sampleJointPoses + applyPoseToBbox.

import { describe, expect, it } from "vitest";
import { sampleJointPoses, applyPoseToBbox } from "../jointPose";
import type { Joint } from "../../ir/types";
import type { AABB } from "../partBbox";

// ── sampleJointPoses ──────────────────────────────────────────────────────────

describe("sampleJointPoses", () => {
  it("revolute joint: returns n poses, first=lower, last=upper, rotation on correct axis", () => {
    const joint: Joint = {
      id: "hinge",
      parent: "body",
      child: "lid",
      type: "revolute",
      axis: { kind: "standard", axis: "y" },
      limits: { lower: 0, upper: 90, unit: "deg" },
    };
    const poses = sampleJointPoses(joint, 5);
    expect(poses).toHaveLength(5);
    // First pose at 0°, last at 90°
    expect(poses[0].rotation.ry).toBeCloseTo(0);
    expect(poses[4].rotation.ry).toBeCloseTo(90);
    // rx and rz should be 0 (rotation is around Y)
    for (const p of poses) {
      expect(p.rotation.rx).toBeCloseTo(0);
      expect(p.rotation.rz).toBeCloseTo(0);
      // Translation is always zero for revolute
      expect(p.translation.x).toBe(0);
      expect(p.translation.y).toBe(0);
      expect(p.translation.z).toBe(0);
    }
  });

  it("linear joint in mm: returns n poses, translation on correct axis", () => {
    const joint: Joint = {
      id: "slider",
      parent: "base",
      child: "carriage",
      type: "linear",
      axis: { kind: "standard", axis: "z" },
      limits: { lower: 0, upper: 50, unit: "mm" },
    };
    const poses = sampleJointPoses(joint, 5);
    expect(poses).toHaveLength(5);
    expect(poses[0].translation.z).toBeCloseTo(0);
    expect(poses[4].translation.z).toBeCloseTo(50);
    // Rotation should be zero for linear
    for (const p of poses) {
      expect(p.rotation.rx).toBeCloseTo(0);
      expect(p.rotation.ry).toBeCloseTo(0);
      expect(p.rotation.rz).toBeCloseTo(0);
    }
  });

  it("linear joint in inches: converts to mm (×25.4)", () => {
    const joint: Joint = {
      id: "slide_in",
      parent: "base",
      child: "arm",
      type: "linear",
      axis: { kind: "standard", axis: "x" },
      limits: { lower: 0, upper: 2, unit: "in" },
    };
    const poses = sampleJointPoses(joint, 3);
    expect(poses).toHaveLength(3);
    expect(poses[0].translation.x).toBeCloseTo(0);
    expect(poses[1].translation.x).toBeCloseTo(25.4); // 1 in = 25.4 mm
    expect(poses[2].translation.x).toBeCloseTo(50.8); // 2 in = 50.8 mm
  });

  it("fixed joint: returns single resting pose", () => {
    const joint: Joint = {
      id: "weld",
      parent: "frame",
      child: "plate",
      type: "fixed",
    };
    const poses = sampleJointPoses(joint);
    expect(poses).toHaveLength(1);
    expect(poses[0].rotation).toEqual({ rx: 0, ry: 0, rz: 0 });
    expect(poses[0].translation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("revolute joint with no limits: returns single resting pose", () => {
    const joint: Joint = {
      id: "spin",
      parent: "a",
      child: "b",
      type: "revolute",
      axis: { kind: "standard", axis: "z" },
      // no limits
    };
    const poses = sampleJointPoses(joint);
    expect(poses).toHaveLength(1);
    expect(poses[0].rotation).toEqual({ rx: 0, ry: 0, rz: 0 });
    expect(poses[0].translation).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ── applyPoseToBbox ──────────────────────────────────────────────────────────

describe("applyPoseToBbox", () => {
  const box: AABB = { minX: -10, maxX: 10, minY: -5, maxY: 5, minZ: 0, maxZ: 20 };

  it("pure-translation pose: translates bbox exactly (no rotation)", () => {
    const pose = {
      rotation: { rx: 0, ry: 0, rz: 0 },
      translation: { x: 50, y: 10, z: 5 },
    };
    const result = applyPoseToBbox(box, pose);
    expect(result.minX).toBeCloseTo(40);
    expect(result.maxX).toBeCloseTo(60);
    expect(result.minY).toBeCloseTo(5);
    expect(result.maxY).toBeCloseTo(15);
    expect(result.minZ).toBeCloseTo(5);
    expect(result.maxZ).toBeCloseTo(25);
  });

  it("rotation pose: conservatively expands bbox (sphere envelope)", () => {
    // box center=(0,0,10), half-extents=(10,5,10), r=sqrt(100+25+100)=15
    // pose: translation=(100,0,0), rotation=(0,45,0)
    // assembly center = (100,0,10); sphere expansion gives:
    //   minX=85, maxX=115, minY=-15, maxY=15, minZ=-5, maxZ=25
    const pose = {
      rotation: { rx: 0, ry: 45, rz: 0 },
      translation: { x: 100, y: 0, z: 0 },
    };
    const result = applyPoseToBbox(box, pose);
    expect(result.minX).toBeCloseTo(85);
    expect(result.maxX).toBeCloseTo(115);
    expect(result.minY).toBeCloseTo(-15);
    expect(result.maxY).toBeCloseTo(15);
    expect(result.minZ).toBeCloseTo(-5);
    expect(result.maxZ).toBeCloseTo(25);
  });
});
