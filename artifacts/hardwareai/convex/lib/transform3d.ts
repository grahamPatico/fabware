// Transform3d — single source of truth for the two distinct XYZ Euler
// conventions in this codebase, plus the data → renderer frame conversion
// adapters.
//
// **Two conventions, not one.** Caught during the centralization sweep:
// `intersect.ts` and `obj.ts` had matrices that look similar but encode
// different rotation orders.
//
//   eulerAxesThreeJs(rx, ry, rz)
//     Mirrors three.js's `Matrix4.makeRotationFromEuler` with order='XYZ'.
//     Matrix M = Rx · Ry · Rz applied left-to-right to a column basis
//     vector — Z is applied first, then Y, then X. Use this anywhere
//     that has to agree with three.js's renderer.
//
//   eulerAxesDataFrame(rx, ry, rz)
//     Matches `positions.ts`'s `rotateAroundX → rotateAroundY → rotateAroundZ`
//     pipeline — X is applied first, then Y, then Z. Used by data-frame
//     consumers (OBJ exporter, future STEP exporter) that don't go through
//     three.js.
//
// The two formulas DIFFER for multi-axis rotations (π/2 around X + π/2
// around Z gives different basis vectors). For single-axis rotations they
// agree, which is why most archetypes look fine under either — but the
// composite wall rotations in hinged_enclosure / box_with_lid / divided_tray
// are the canary that bisected the difference.

import type { Pose } from "./positions";

export type Vec3 = [number, number, number];

/**
 * Three.js XYZ-Euler matrix columns. Matches Matrix4.makeRotationFromEuler
 * with order='XYZ' element-for-element. Use anywhere that has to agree with
 * the renderer (SAT intersection check, future renderer-side hit-testing).
 */
export function eulerAxesThreeJs(rx: number, ry: number, rz: number): [Vec3, Vec3, Vec3] {
  const a = Math.cos(rx), b = Math.sin(rx);
  const c = Math.cos(ry), d = Math.sin(ry);
  const e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    [c * e,         af + be * d,    bf - ae * d],
    [-c * f,        ae - bf * d,    be + af * d],
    [d,             -b * c,         a * c],
  ];
}

/**
 * Data-frame XYZ Euler matrix columns — apply X, then Y, then Z to a column
 * basis vector. Matches `positions.ts`'s rotation pipeline. Use for any
 * consumer that operates in the data frame and doesn't go through three.js
 * (OBJ exporter, future STEP exporter, future DXF for non-planar parts).
 */
export function eulerAxesDataFrame(rx: number, ry: number, rz: number): [Vec3, Vec3, Vec3] {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const ax: Vec3 = [cy * cz, cy * sz, -sy];
  const ay: Vec3 = [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy];
  const az: Vec3 = [cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy];
  return [ax, ay, az];
}

/**
 * Apply local-frame coordinates through pre-computed axes plus a translation.
 * Matrix is column-vector — `local` is multiplied as a column.
 */
export function applyAxes(axes: [Vec3, Vec3, Vec3], translation: Vec3, local: Vec3): Vec3 {
  const [ax, ay, az] = axes;
  const [lx, ly, lz] = local;
  return [
    translation[0] + ax[0] * lx + ay[0] * ly + az[0] * lz,
    translation[1] + ax[1] * lx + ay[1] * ly + az[1] * lz,
    translation[2] + ax[2] * lx + ay[2] * ly + az[2] * lz,
  ];
}

/**
 * Renderer-frame translation tuple — the `[x, z, y]` permutation the renderer
 * uses (`<mesh position={...} />`). Anything computing a three.js position
 * from a Pose goes through this.
 */
export function posePositionRenderer(pose: Pose): Vec3 {
  return [pose.x, pose.z, pose.y];
}

/**
 * Renderer-frame Euler tuple — the `[rotX, rotZ, rotY]` permutation
 * (`<mesh rotation={...} />`). Anything that builds a renderer-frame
 * orientation from a Pose goes through this.
 */
export function poseEulerRendererArgs(pose: Pose): [number, number, number] {
  return [pose.rotX, pose.rotZ, pose.rotY];
}

/**
 * Renderer-frame OBB axes derived from a Pose. The combination of the
 * renderer-frame Euler permutation + `eulerAxesThreeJs` is the recipe the
 * SAT intersection check uses; centralizing it here means the two callers
 * (intersect, future renderer-side hit-testing) can never drift.
 */
export function rendererAxesFromPose(pose: Pose): [Vec3, Vec3, Vec3] {
  const [rx, ry, rz] = poseEulerRendererArgs(pose);
  return eulerAxesThreeJs(rx, ry, rz);
}
