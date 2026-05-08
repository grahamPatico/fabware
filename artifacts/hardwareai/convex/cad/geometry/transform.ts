// convex/cad/geometry/transform.ts
//
// Transform a local AABB into the assembly frame.
//
// - If rotation is undefined or all components are zero, simply translate
//   the box by the origin offset (exact).
// - If any rotation component is non-zero, conservatively expand the box to
//   a sphere centered at the local bbox center with radius = half-diagonal,
//   then translate. This is always a superset of the rotated box.

import type { AABB } from "./partBbox";

/**
 * Transform a local AABB into the assembly frame.
 *
 * @param local    The local-frame AABB (from computePartBbox)
 * @param origin   Translation offset { x, y, z } (assembly units)
 * @param rotation Optional Euler rotation { rx, ry, rz } in degrees
 * @returns        AABB in the assembly frame
 */
export function transformBbox(
  local: AABB,
  origin: { x: number; y: number; z: number },
  rotation?: { rx: number; ry: number; rz: number },
): AABB {
  const hasRotation =
    rotation !== undefined &&
    (rotation.rx !== 0 || rotation.ry !== 0 || rotation.rz !== 0);

  if (!hasRotation) {
    // Pure translation — exact result
    return {
      minX: local.minX + origin.x,
      maxX: local.maxX + origin.x,
      minY: local.minY + origin.y,
      maxY: local.maxY + origin.y,
      minZ: local.minZ + origin.z,
      maxZ: local.maxZ + origin.z,
    };
  }

  // Conservative: expand to bounding sphere, then translate
  const cx = (local.minX + local.maxX) / 2;
  const cy = (local.minY + local.maxY) / 2;
  const cz = (local.minZ + local.maxZ) / 2;

  const dx = (local.maxX - local.minX) / 2;
  const dy = (local.maxY - local.minY) / 2;
  const dz = (local.maxZ - local.minZ) / 2;

  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Translate center to assembly frame, then expand by radius
  const acx = cx + origin.x;
  const acy = cy + origin.y;
  const acz = cz + origin.z;

  return {
    minX: acx - r, maxX: acx + r,
    minY: acy - r, maxY: acy + r,
    minZ: acz - r, maxZ: acz + r,
  };
}
