// Per-part + per-project weight estimator. Computes flat-pattern area × thickness × density.
// For non-rectangle outlines (polygon / star / circle / regular_polygon), uses the
// outline's true area; for default rectangles uses width × height.

import type { PartDsl, Outline } from "./dsl";
import { densityFor } from "./scsRules";

export function outlineArea(outline: Outline | undefined, fallbackW: number, fallbackH: number): number {
  if (!outline || outline.kind === "rectangle") return fallbackW * fallbackH;
  if (outline.kind === "circle") return Math.PI * outline.radius * outline.radius;
  if (outline.kind === "regular_polygon") {
    // Area of regular n-gon with circumradius R: 0.5 * n * R^2 * sin(2π/n)
    const { sides, radius } = outline;
    return 0.5 * sides * radius * radius * Math.sin((2 * Math.PI) / sides);
  }
  if (outline.kind === "star") {
    // Star is 2n triangles around the center. Sum each triangle's area.
    const { numPoints, outerRadius, innerRadius } = outline;
    const total = numPoints * 2;
    let area = 0;
    for (let i = 0; i < total; i++) {
      const r0 = i % 2 === 0 ? outerRadius : innerRadius;
      const r1 = (i + 1) % 2 === 0 ? outerRadius : innerRadius;
      const a0 = (i / total) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / total) * Math.PI * 2 - Math.PI / 2;
      const x0 = r0 * Math.cos(a0), y0 = r0 * Math.sin(a0);
      const x1 = r1 * Math.cos(a1), y1 = r1 * Math.sin(a1);
      // Shoelace contribution for triangle (origin, p0, p1)
      area += 0.5 * Math.abs(x0 * y1 - x1 * y0);
    }
    return area;
  }
  // polygon — shoelace
  const { points } = outline;
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface PartWeight {
  /** in² */
  area: number;
  /** in³ — area × thickness */
  volume: number;
  /** lb */
  pounds: number;
  /** kg (= lb / 2.2046) */
  kg: number;
}

export function estimatePartWeight(dsl: PartDsl): PartWeight {
  // Compute the area of the flat pattern. Holes subtract proportional area
  // when present — circular cutout area is π * (Ø/2)².
  const baseArea = outlineArea(dsl.outline, dsl.width, dsl.height);
  let holeArea = 0;
  for (const f of dsl.features) {
    if (f.kind === "hole") {
      const r = f.diameter / 2;
      holeArea += f.count * Math.PI * r * r;
    } else if (f.kind === "slot") {
      // Slot is rectangle minus two semicircles + circular caps; approximate as
      // length × width (the typical SCS slot shape is a stadium with the same area).
      holeArea += f.count * f.length * f.width;
    }
  }
  const area = Math.max(0, baseArea - holeArea);
  const volume = area * dsl.thickness;
  const density = densityFor(dsl.material);
  const pounds = volume * density;
  return { area, volume, pounds, kg: pounds / 2.2046 };
}
