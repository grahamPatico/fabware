// convex/cad/validate/__tests__/rules-jointRangeCollision.test.ts
//
// Tests for Phase 11 Task 2: jointRangeCollision rule.

import { describe, expect, it } from "vitest";
import { jointRangeCollision } from "../rules/jointRangeCollision";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr {
  return { ...emptyIr("mm"), ...extra };
}

// 20×20×10 mm box centered at X/Y=0, Z=0..10
function boxIr(): CadIr {
  return ir({
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 20, height: 20 },
        ],
      },
    },
    features: [
      { id: "ex1", kind: "extrude", profile: "sk1", distance: 10, operation: "new_body" },
    ],
  });
}

describe("jointRangeCollision", () => {
  it("returns no violations when no joints are present", () => {
    const result = jointRangeCollision(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: boxIr(), origin: { x: 40, y: 0, z: 0 } },
      },
    }));
    expect(result).toEqual([]);
  });

  it("returns no violations when a fixed joint is present (not sampled)", () => {
    const result = jointRangeCollision(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: boxIr(), origin: { x: 5, y: 0, z: 0 } },
      },
      joints: {
        j1: { id: "j1", parent: "a", child: "b", type: "fixed" },
      },
    }));
    // Fixed joints are not sampled
    expect(result).toEqual([]);
  });

  it("returns a warn when child sweeps into a third part during revolute motion", () => {
    // "arm" starts at z=100 (safe), but rotates around Y up to 180° and sweeps into "obstacle"
    // "arm" local bbox: [-10,10]×[-10,10]×[0,10]; origin at (0,0,100)
    // origin-shifted bbox center: (0,0,105); radius ≈ sqrt(10^2+10^2+5^2) ≈ 15
    // After sphere expansion for any rotation, the sphere (radius≈15 around (0,0,105)) sweeps widely.
    // "obstacle" sits at z=0: bbox [-10,10]×[-10,10]×[0,10]
    // For large rotations (near 180°) the arm swings near z=80..120 — but with sphere expansion
    // at origin=(0,0,100), conservative bbox at 90° pose covers z≈[85,120] → hits obstacle at z=0?
    // Let's make it unambiguous: obstacle at z=90, arm sweeps there.
    //
    // Simpler geometry: arm placed at z=0 (same as body), rotates around X axis 0→180°.
    // At 90° the arm is horizontal; at 180° it's flipped back.
    // Arm: [-10,10]×[-10,10]×[0,50] — a stick pointing up from origin.
    // Origin at (0,0,0). Body (joint parent) at same origin — excluded.
    // Obstacle: [-10,10]×[-10,10]×[0,10] at x=30 — close enough?
    // Actually with sphere expansion r=sqrt(10^2+10^2+25^2)≈29, swept sphere=[-29,29]×...
    // At 90° ry pose, center stays at (0,0,25), sphere (r=29) covers [-29,29] in X → hits obstacle at x=30? Just misses.
    //
    // Simplest approach: put the obstacle overlapping the sweep sphere directly.
    // Arm local bbox: [-5,5]×[-5,5]×[0,100] center=(0,0,50), r=sqrt(25+25+2500)≈50.5
    // After any rotation pose, sphere radius=50.5 centered at (0,0,50).
    // Obstacle at x=45, bbox: [-5,5]×[-5,5]×[0,10] → static bbox at x=45: [40,50]×...
    // 40 < 50.5 → overlaps sphere.
    const armIr = ir({
      sketches: {
        arm_sk: {
          id: "arm_sk",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "arm_r", center: { x: 0, y: 0 }, width: 10, height: 10 },
          ],
        },
      },
      features: [
        { id: "arm_ex", kind: "extrude", profile: "arm_sk", distance: 100, operation: "new_body" },
      ],
    });

    const obstacleIr = ir({
      sketches: {
        obs_sk: {
          id: "obs_sk",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "obs_r", center: { x: 0, y: 0 }, width: 10, height: 10 },
          ],
        },
      },
      features: [
        { id: "obs_ex", kind: "extrude", profile: "obs_sk", distance: 10, operation: "new_body" },
      ],
    });

    const result = jointRangeCollision(ir({
      parts: {
        body:     { id: "body",     ir: boxIr(),    origin: { x: 0,  y: 0, z: 0 } },
        arm:      { id: "arm",      ir: armIr,      origin: { x: 0,  y: 0, z: 0 } },
        obstacle: { id: "obstacle", ir: obstacleIr, origin: { x: 45, y: 0, z: 0 } },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "body",
          child: "arm",
          type: "revolute",
          axis: { kind: "standard", axis: "y" },
          limits: { lower: 0, upper: 90, unit: "deg" },
        },
      },
    }));

    const collisions = result.filter(v => v.ruleId === "assembly.joint-range-collision");
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(collisions[0].severity).toBe("warn");
    expect(collisions[0].message).toContain("arm");
    expect(collisions[0].message).toContain("obstacle");
  });

  it("excludes joint endpoints (parent and child) from collision check", () => {
    // Hinged enclosure: body (parent) and lid (child) connected by hinge.
    // Lid sweeps near body — but they must NOT be flagged since they're the joint endpoints.
    const bodyIrLocal = ir({
      sketches: {
        body_sk: {
          id: "body_sk",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "body_r", center: { x: 0, y: 0 }, width: 100, height: 80 },
          ],
        },
      },
      features: [
        { id: "body_ex", kind: "extrude", profile: "body_sk", distance: 30, operation: "new_body" },
      ],
    });

    const lidIrLocal = ir({
      sketches: {
        lid_sk: {
          id: "lid_sk",
          plane: "XY",
          geometry: [
            { kind: "rect", id: "lid_r", center: { x: 0, y: 0 }, width: 100, height: 80 },
          ],
        },
      },
      features: [
        { id: "lid_ex", kind: "extrude", profile: "lid_sk", distance: 10, operation: "new_body" },
      ],
    });

    // Body at z=0, lid at z=40 (10mm gap above 30mm body)
    const result = jointRangeCollision(ir({
      parts: {
        body: { id: "body", ir: bodyIrLocal, origin: { x: 0, y: 0, z: 0 } },
        lid:  { id: "lid",  ir: lidIrLocal,  origin: { x: 0, y: 0, z: 40 } },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "body",
          child: "lid",
          type: "revolute",
          axis: { kind: "standard", axis: "y" },
          limits: { lower: 0, upper: 120, unit: "deg" },
        },
      },
    }));

    // No collision should be flagged — body and lid are excluded (they're the joint endpoints)
    expect(result.filter(v => v.ruleId === "assembly.joint-range-collision")).toHaveLength(0);
  });

  it("returns no violations when child has no geometry (null bbox)", () => {
    // emptyIr() produces a part with no features → computePartBbox returns null → skip
    const result = jointRangeCollision(ir({
      parts: {
        body: { id: "body", ir: emptyIr("mm"), origin: { x: 0, y: 0, z: 0 } },
        arm:  { id: "arm",  ir: emptyIr("mm"), origin: { x: 5,  y: 0, z: 0 } },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "body",
          child: "arm",
          type: "revolute",
          axis: { kind: "standard", axis: "y" },
          limits: { lower: 0, upper: 90, unit: "deg" },
        },
      },
    }));
    expect(result).toEqual([]);
  });
});
