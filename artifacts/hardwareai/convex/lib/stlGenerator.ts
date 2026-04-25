import type { PrintedDsl } from "./printedDsl";

/**
 * Tiny ASCII STL writer. Produces a low-fidelity mesh from the primitive
 * (box → 12 triangles; cylinder → N×2 triangles around the side + caps;
 * plate_with_holes → simplified to a box for now). Good enough as a
 * placeholder for "give me a printable file" in slice 2; real CAD-quality
 * STL export waits for slice E.
 */
export function generateStl(dsl: PrintedDsl): string {
  const lines: string[] = [];
  lines.push("solid fabware_part");
  const tris = trianglesFor(dsl);
  for (const tri of tris) {
    const n = normalize(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
    lines.push(`  facet normal ${n.x} ${n.y} ${n.z}`);
    lines.push("    outer loop");
    for (const v of tri) {
      lines.push(`      vertex ${v.x} ${v.y} ${v.z}`);
    }
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push("endsolid fabware_part");
  return lines.join("\n");
}

type V3 = { x: number; y: number; z: number };
function v(x: number, y: number, z: number): V3 { return { x, y, z }; }
function sub(a: V3, b: V3): V3 { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
function cross(a: V3, b: V3): V3 {
  return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function normalize(a: V3): V3 {
  const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
  return v(a.x / m, a.y / m, a.z / m);
}

function boxTriangles(w: number, d: number, h: number): V3[][] {
  const x0 = 0, x1 = w, y0 = 0, y1 = d, z0 = 0, z1 = h;
  const c = [
    v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0),
    v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1),
  ];
  const tri = (a: number, b: number, cc: number): V3[] => [c[a], c[b], c[cc]];
  return [
    tri(0, 2, 1), tri(0, 3, 2),  // bottom
    tri(4, 5, 6), tri(4, 6, 7),  // top
    tri(0, 1, 5), tri(0, 5, 4),  // front
    tri(2, 3, 7), tri(2, 7, 6),  // back
    tri(1, 2, 6), tri(1, 6, 5),  // right
    tri(3, 0, 4), tri(3, 4, 7),  // left
  ];
}

function cylinderTriangles(r: number, h: number, segments = 24): V3[][] {
  const tris: V3[][] = [];
  const center0 = v(0, 0, 0);
  const center1 = v(0, 0, h);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = v(r * Math.cos(a0), r * Math.sin(a0), 0);
    const p1 = v(r * Math.cos(a1), r * Math.sin(a1), 0);
    const p2 = v(r * Math.cos(a0), r * Math.sin(a0), h);
    const p3 = v(r * Math.cos(a1), r * Math.sin(a1), h);
    tris.push([p0, p1, p3]);
    tris.push([p0, p3, p2]);
    tris.push([center0, p1, p0]);    // bottom cap
    tris.push([center1, p2, p3]);    // top cap
  }
  return tris;
}

function trianglesFor(dsl: PrintedDsl): V3[][] {
  const p = dsl.primitive;
  if (p.kind === "box") return boxTriangles(p.width, p.depth, p.height);
  if (p.kind === "cylinder") return cylinderTriangles(p.radius, p.height);
  return boxTriangles(p.width, p.depth, p.thickness);
}
