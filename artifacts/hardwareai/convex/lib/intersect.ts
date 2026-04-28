// OBB-OBB intersection via Separating Axis Theorem.
//
// IMPORTANT: this file operates in the renderer (three.js) frame, not the data
// frame the parts table stores. `poseObb` applies the same Y↔Z swap as
// AssembledView, and `eulerXyzToAxes` mirrors three.js's
// Matrix4.makeRotationFromEuler('XYZ'). If you change either, read
// `docs/conventions/coordinate-frames.md` first — the SAT and the renderer
// must stay in lock-step or the validator and visual will silently disagree.
//
// We model every part as a single oriented bounding box in the assembly frame.
// For sheet metal that's an exact fit (the part IS a rectangular plate). For
// 3D-printed and purchased parts it's the part's overall bounding box — good
// enough to catch gross interferences (a knob inside a wall, a bolt through
// the back of a panel) without the cost of a full mesh-mesh test.
//
// Touching faces produce zero overlap on the contact axis and therefore do
// NOT count as intersection. Only positive volumetric overlap is reported.

import type { Pose } from "./positions";
import { posePositionRenderer, rendererAxesFromPose } from "./transform3d";

export type Vec3 = [number, number, number];

export interface Obb {
  center: Vec3;
  halfExtents: Vec3;
  axes: [Vec3, Vec3, Vec3];
}

const EPS = 1e-8;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function lenSq(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

/**
 * Build the OBB in the same frame the renderer uses for boxGeometry. The data
 * frame swaps (y, z) → (z, y) at the world level (see AssembledView's
 * `position={[x, z, y]}` / `rotation={[rotX, rotZ, rotY]}`), and box-local
 * axes are aligned with that swapped frame. SAT is frame-invariant, so doing
 * the entire test in this frame gives the right answer with one consistent
 * convention. The Pose → renderer frame conversion lives in `transform3d.ts`.
 */
export function poseObb(pose: Pose, size: Vec3): Obb {
  return {
    center: posePositionRenderer(pose),
    halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2],
    axes: rendererAxesFromPose(pose),
  };
}

// Re-export so callers that imported `eulerXyzToAxes` from this file keep working.
export { eulerAxesThreeJs as eulerXyzToAxes } from "./transform3d";

export interface IntersectResult {
  intersect: boolean;
  /** Penetration depth in same units as halfExtents. 0 if no intersection. */
  depth: number;
}

/**
 * SAT for two OBBs. Tolerance lets us treat surfaces that touch within a small
 * gap as non-intersecting (sheet-metal walls share faces with the base plate;
 * floating-point noise should not flag them).
 */
export function obbIntersect(a: Obb, b: Obb, tolerance = 1e-4): IntersectResult {
  const T = sub(b.center, a.center);
  const candidates: Vec3[] = [
    a.axes[0], a.axes[1], a.axes[2],
    b.axes[0], b.axes[1], b.axes[2],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const c = cross(a.axes[i], b.axes[j]);
      if (lenSq(c) > EPS) candidates.push(c);
    }
  }
  let minDepth = Infinity;
  for (const axis of candidates) {
    const ra = a.halfExtents[0] * Math.abs(dot(a.axes[0], axis))
      + a.halfExtents[1] * Math.abs(dot(a.axes[1], axis))
      + a.halfExtents[2] * Math.abs(dot(a.axes[2], axis));
    const rb = b.halfExtents[0] * Math.abs(dot(b.axes[0], axis))
      + b.halfExtents[1] * Math.abs(dot(b.axes[1], axis))
      + b.halfExtents[2] * Math.abs(dot(b.axes[2], axis));
    const d = Math.abs(dot(T, axis));
    const overlap = ra + rb - d;
    const axisLen = Math.sqrt(lenSq(axis));
    const normOverlap = overlap / axisLen;
    if (normOverlap < tolerance) return { intersect: false, depth: 0 };
    if (normOverlap < minDepth) minDepth = normOverlap;
  }
  return { intersect: true, depth: minDepth };
}
