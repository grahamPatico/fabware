// convex/cad/codegen/features/revolve.ts
import type { RevolveFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a revolve feature.
 *
 * Produces:
 *   with BuildPart() as <id>:
 *       with BuildSketch():
 *           ...sketch geometry...
 *       revolve(revolution_arc=<angle>)
 *   report_entities("<id>", <id>)
 *
 * The revolve creates a new body, so callers should update parentBodyId to f.id.
 */
export function emitRevolve(
  f: RevolveFeature,
  ir: ResolvedIr,
  _parentBodyId: string | null
): string[] {
  const angleExpr = refOrLit(f.angle as number, ir);
  const lines: string[] = [];

  lines.push(`with BuildPart() as ${f.id}:`);

  // Emit sketch geometry from the referenced profile
  const sketch = ir.sketches[f.profile];
  if (sketch) {
    lines.push(`    with BuildSketch():`);
    for (const g of sketch.geometry) {
      switch (g.kind) {
        case "rect":
          if (g.cornerRadius !== undefined && (g.cornerRadius as number) > 0) {
            lines.push(
              `        RectangleRounded(${g.width}, ${g.height}, ${g.cornerRadius})`
            );
          } else {
            lines.push(`        Rectangle(${g.width}, ${g.height})`);
          }
          break;
        case "circle":
          lines.push(`        Circle(${g.radius})`);
          break;
        case "line":
          lines.push(
            `        Line((${g.p1.x}, ${g.p1.y}), (${g.p2.x}, ${g.p2.y}))`
          );
          break;
      }
    }
  }

  lines.push(`    revolve(revolution_arc=${angleExpr})`);
  lines.push(`report_entities("${f.id}", ${f.id})`);

  return lines;
}
