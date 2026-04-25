// Assembly-frame math. The assembly frame's origin is (0,0,0); each part has
// a 6-DOF `position` in that frame. Feature positions are local to the part's
// own frame. This file gives us the conversion both ways, and exposes a
// small API the interface validation rules use.

export interface Pose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export interface LocalPoint {
  x: number;
  y: number;
  z: number;
}

export type WorldPoint = LocalPoint;

function rotateAroundX(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotateAroundY(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotateAroundZ(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

/**
 * Transform a point from a part's local frame into world (assembly) space.
 * Rotation order: X then Y then Z (consistent with Three.js Euler default).
 */
export function transformPoint(local: LocalPoint, pose: Pose): WorldPoint {
  let p = local;
  p = rotateAroundX(p, pose.rotX);
  p = rotateAroundY(p, pose.rotY);
  p = rotateAroundZ(p, pose.rotZ);
  return { x: p.x + pose.x, y: p.y + pose.y, z: p.z + pose.z };
}

/**
 * For a hole at `holeLocal` (relative to the part's local origin), compute
 * its position in the world frame given the part's pose.
 */
export function computeMatingFrame(holeLocal: LocalPoint, pose: Pose): WorldPoint {
  return transformPoint(holeLocal, pose);
}

/** Euclidean distance in 3D. */
export function distance(a: WorldPoint, b: WorldPoint): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
