// Wavefront OBJ emitter for an assembly. Each part becomes one OBJ group
// containing a closed mesh in the assembly's world frame. We emit boxes (6
// faces, 12 triangles) for every part — exact for rectangular sheet metal,
// approximate for polygon outlines (loses non-rectangular silhouette but
// preserves overall envelope; a follow-up chunk will triangulate true
// outlines).
//
// OBJ is universally supported by viewers (Preview, MeshLab, Blender,
// SolidWorks import). Customers can spin a part and see the assembly without
// any Fabware-specific tooling.

import type { Doc } from "../_generated/dataModel";

type Vec3 = [number, number, number];
type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number };

/**
 * Build the rotation matrix (column-major) for an intrinsic XYZ Euler. Same
 * convention as `convex/lib/positions.ts` — apply rotateX, then rotateY,
 * then rotateZ.
 */
function eulerXyz(rx: number, ry: number, rz: number): { ax: Vec3; ay: Vec3; az: Vec3 } {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz · Ry · Rx (applied to a column vector). Columns are world-space images of e_x, e_y, e_z.
  const ax: Vec3 = [cy * cz, cy * sz, -sy];
  const ay: Vec3 = [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy];
  const az: Vec3 = [cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy];
  return { ax, ay, az };
}

function transform(local: Vec3, pose: Pose, ax: Vec3, ay: Vec3, az: Vec3): Vec3 {
  const [lx, ly, lz] = local;
  return [
    pose.x + ax[0] * lx + ay[0] * ly + az[0] * lz,
    pose.y + ax[1] * lx + ay[1] * ly + az[1] * lz,
    pose.z + ax[2] * lx + ay[2] * ly + az[2] * lz,
  ];
}

interface PartBox {
  role: string;
  size: Vec3;       // local box extents (width, thickness, height)
  pose: Pose;
}

function partBoxes(parts: Doc<"parts">[]): PartBox[] {
  const out: PartBox[] = [];
  for (const p of parts) {
    const kind = p.kind ?? "sheet_metal";
    if (kind === "purchased") {
      out.push({ role: p.role, size: [0.5, 0.5, 0.5], pose: p.position });
      continue;
    }
    if (kind === "printed") {
      // Use the legacy width/height/thickness fields stored on the row.
      out.push({
        role: p.role,
        size: [(p.width ?? 1), (p.thickness ?? 0.5), (p.height ?? 1)],
        pose: p.position,
      });
      continue;
    }
    out.push({
      role: p.role,
      size: [(p.width ?? 1), (p.thickness ?? 0.075), (p.height ?? 1)],
      pose: p.position,
    });
  }
  return out;
}

const BOX_LOCAL_VERTS: Vec3[] = [
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5],
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5],
  [-0.5, -0.5, +0.5], [+0.5, -0.5, +0.5],
  [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],
];

// 12 triangles, vertex indices into BOX_LOCAL_VERTS (1-based for OBJ output).
const BOX_FACES_1BASED: Array<[number, number, number]> = [
  // -Z face
  [1, 2, 3], [1, 3, 4],
  // +Z face
  [5, 7, 6], [5, 8, 7],
  // -Y face
  [1, 5, 6], [1, 6, 2],
  // +Y face
  [3, 7, 8], [3, 8, 4],
  // -X face
  [1, 4, 8], [1, 8, 5],
  // +X face
  [2, 6, 7], [2, 7, 3],
];

export function generateAssemblyObj(parts: Doc<"parts">[], projectName: string): string {
  const lines: string[] = [];
  lines.push("# Fabware assembly export");
  lines.push(`# Project: ${projectName}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Units: inches`);
  lines.push("");

  const boxes = partBoxes(parts);
  let vertexBase = 0;

  for (const b of boxes) {
    lines.push(`g ${b.role.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
    const { ax, ay, az } = eulerXyz(b.pose.rotX, b.pose.rotY, b.pose.rotZ);
    const [w, t, h] = b.size;
    for (const [lx, ly, lz] of BOX_LOCAL_VERTS) {
      const world = transform([lx * w, ly * t, lz * h], b.pose, ax, ay, az);
      lines.push(`v ${world[0].toFixed(4)} ${world[1].toFixed(4)} ${world[2].toFixed(4)}`);
    }
    for (const [a, c, d] of BOX_FACES_1BASED) {
      lines.push(`f ${a + vertexBase} ${c + vertexBase} ${d + vertexBase}`);
    }
    vertexBase += BOX_LOCAL_VERTS.length;
    lines.push("");
  }

  return lines.join("\n");
}
