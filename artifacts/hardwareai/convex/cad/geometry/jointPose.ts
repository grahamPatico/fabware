// convex/cad/geometry/jointPose.ts
//
// Joint pose sampler — Phase 11 Task 1.
//
// sampleJointPoses(joint, n):
//   Returns n poses linearly interpolated between the joint limits.
//   - revolute: samples degrees; axis = standard world axis (x/y/z)
//   - linear:   samples mm (converting "in" → mm via ×25.4)
//   - fixed / ball / rigid_group / no limits: returns a single resting pose
//     { rotation: {rx:0,ry:0,rz:0}, translation: {x:0,y:0,z:0} }
//
// applyPoseToBbox(bbox, pose):
//   Wraps transformBbox from Phase 8. Translation first, rotation second.

import type { Joint } from "../ir/types";
import type { AABB } from "./partBbox";
import { transformBbox } from "./transform";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JointPose {
  rotation: { rx: number; ry: number; rz: number };
  translation: { x: number; y: number; z: number };
}

// ── sampleJointPoses ──────────────────────────────────────────────────────────

const REST: JointPose = {
  rotation: { rx: 0, ry: 0, rz: 0 },
  translation: { x: 0, y: 0, z: 0 },
};

/**
 * Sample n poses for the given joint, linearly interpolated between limits.
 *
 * @param joint  The joint to sample poses for.
 * @param n      Number of poses to sample (default 5). Must be ≥ 1.
 * @returns      Array of JointPose. For fixed/no-limits joints, always returns [REST].
 */
export function sampleJointPoses(joint: Joint, n: number = 5): JointPose[] {
  if (joint.type === "revolute" && joint.limits) {
    const { lower, upper, unit } = joint.limits;

    // Convert to degrees
    const lowerDeg = unit === "rad" ? (lower * 180) / Math.PI : lower;
    const upperDeg = unit === "rad" ? (upper * 180) / Math.PI : upper;

    return sampleLinear(lowerDeg, upperDeg, n, (val) => {
      // Axis → rotation component
      const axis =
        joint.axis?.kind === "standard" ? joint.axis.axis : "z";
      return {
        rotation: axisRotation(axis, val),
        translation: { x: 0, y: 0, z: 0 },
      };
    });
  }

  if (joint.type === "linear" && joint.limits) {
    const { lower, upper, unit } = joint.limits;

    // Convert to mm
    const lowerMm = unit === "in" ? lower * 25.4 : lower;
    const upperMm = unit === "in" ? upper * 25.4 : upper;

    return sampleLinear(lowerMm, upperMm, n, (val) => {
      const axis =
        joint.axis?.kind === "standard" ? joint.axis.axis : "z";
      return {
        rotation: { rx: 0, ry: 0, rz: 0 },
        translation: axisTranslation(axis, val),
      };
    });
  }

  // fixed / no limits / unsupported type → single resting pose
  return [REST];
}

// ── applyPoseToBbox ──────────────────────────────────────────────────────────

/**
 * Apply a JointPose to an AABB, returning the transformed AABB.
 *
 * Delegates to transformBbox(local, translation, rotation).
 * Translation is applied first (as the origin offset), rotation second.
 */
export function applyPoseToBbox(bbox: AABB, pose: JointPose): AABB {
  return transformBbox(bbox, pose.translation, pose.rotation);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Sample n values linearly from lower to upper and map them to JointPose.
 * If n === 1, returns only the lower-bound value.
 */
function sampleLinear(
  lower: number,
  upper: number,
  n: number,
  mapper: (val: number) => JointPose,
): JointPose[] {
  const count = Math.max(1, Math.floor(n));
  if (count === 1) return [mapper(lower)];
  const poses: JointPose[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    poses.push(mapper(lower + t * (upper - lower)));
  }
  return poses;
}

function axisRotation(
  axis: "x" | "y" | "z",
  degrees: number,
): { rx: number; ry: number; rz: number } {
  return {
    rx: axis === "x" ? degrees : 0,
    ry: axis === "y" ? degrees : 0,
    rz: axis === "z" ? degrees : 0,
  };
}

function axisTranslation(
  axis: "x" | "y" | "z",
  mm: number,
): { x: number; y: number; z: number } {
  return {
    x: axis === "x" ? mm : 0,
    y: axis === "y" ? mm : 0,
    z: axis === "z" ? mm : 0,
  };
}
