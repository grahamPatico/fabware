// convex/cad/codegen/emitSketchGeometry.ts
//
// Shared helper: emit build123d Python lines for all sketch geometry entities
// in a given resolved sketch, indented to the specified depth (spaces).
//
// Supported entity kinds:
//   rect    → Rectangle(w, h) or RectangleRounded(w, h, r)
//   circle  → Circle(r)
//   line    → Line((x1,y1), (x2,y2))
//   polygon → RegularPolygon(radius=r, side_count=n)    [Phase 15]
//   spline  → Spline([(x1,y1), (x2,y2), ...])           [Phase 15]
//   arc     → # arc <id>: center=(cx,cy) r=R angle=[start..end]deg
//             (open-path; exact build123d arc construction is deferred to
//              Phase 15+ kernel work — a comment placeholder is emitted)

import type { ResolvedIr } from "../resolve/resolveIr";

/**
 * Emit indented Python lines for all geometry entities in the named sketch.
 * Returns an empty array if the sketch is not found.
 *
 * @param ir        Resolved IR (all ParamRefs already evaluated to numbers).
 * @param profileId Id of the sketch to render.
 * @param indent    Indentation string prepended to every emitted line (default: 8 spaces).
 */
export function emitSketchGeometry(
  ir: ResolvedIr,
  profileId: string,
  indent = "        ",
): string[] {
  const sketch = ir.sketches[profileId];
  if (!sketch) return [];

  const lines: string[] = [];

  for (const g of sketch.geometry) {
    switch (g.kind) {
      case "rect":
        if (g.cornerRadius !== undefined && g.cornerRadius > 0) {
          lines.push(`${indent}RectangleRounded(${g.width}, ${g.height}, ${g.cornerRadius})`);
        } else {
          lines.push(`${indent}Rectangle(${g.width}, ${g.height})`);
        }
        break;

      case "circle":
        lines.push(`${indent}Circle(${g.radius})`);
        break;

      case "line":
        lines.push(`${indent}Line((${g.p1.x}, ${g.p1.y}), (${g.p2.x}, ${g.p2.y}))`);
        break;

      // ── Phase 15: new entity kinds ──────────────────────────────────────────

      case "polygon":
        // Regular polygon circumscribed in a circle of radius r with n sides.
        // sides is always an integer literal — no parameter reference possible
        // (it drives the polygon vertex count, not a continuous dimension).
        lines.push(`${indent}RegularPolygon(radius=${g.radius}, side_count=${g.sides})`);
        break;

      case "spline":
        // Open polyline / spline through the listed control points.
        // Coordinates are always resolved numbers at this stage.
        {
          const ptList = g.points.map((p) => `(${p.x},${p.y})`).join(", ");
          lines.push(`${indent}Spline([${ptList}])`);
        }
        break;

      case "arc":
        // Exact build123d arc construction (RadiusArc, TangentArc, etc.) requires
        // kernel-level curve continuity work deferred to a future phase.
        // Phase 15 v0 emits a comment placeholder so the script is still parseable.
        // Angles are in DEGREES (see SketchEntity arc type JSDoc).
        lines.push(
          `${indent}# arc ${g.id}: center=(${g.center.x},${g.center.y}) r=${g.radius} angle=[${g.startAngle}..${g.endAngle}]deg`,
        );
        break;
    }
  }

  return lines;
}
