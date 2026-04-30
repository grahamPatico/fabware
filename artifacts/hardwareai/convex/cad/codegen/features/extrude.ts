// convex/cad/codegen/features/extrude.ts
import type { ExtrudeFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for an extrude feature.
 *
 * Produces:
 *   with BuildPart() as <id>:
 *       with BuildSketch():
 *           ...sketch geometry...
 *       extrude(amount=<distance>)
 *   report_entities("<id>", <id>)
 */
export function emitExtrude(
  f: ExtrudeFeature,
  ir: ResolvedIr,
  _parentBodyId: string | null
): string[] {
  const distExpr = refOrLit(f.distance as number, ir);
  const lines: string[] = [];

  lines.push(`with BuildPart() as ${f.id}:`);

  // Emit sketch geometry from the referenced profile
  const sketch = ir.sketches[f.profile];
  if (sketch) {
    lines.push(`    with BuildSketch():`);
    for (const g of sketch.geometry) {
      switch (g.kind) {
        case "rect":
          if (g.cornerRadius !== undefined && g.cornerRadius > 0) {
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

  lines.push(`    extrude(amount=${distExpr})`);
  lines.push(`report_entities("${f.id}", ${f.id})`);

  return lines;
}
