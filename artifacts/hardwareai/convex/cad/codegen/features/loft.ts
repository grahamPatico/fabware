// convex/cad/codegen/features/loft.ts
import type { LoftFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";

/**
 * Emit build123d Python for a loft feature.
 *
 * Produces:
 *   with BuildPart() as <id>:
 *       with BuildSketch() as _s0:
 *           ...profile 0 geometry...
 *       with BuildSketch() as _s1:
 *           ...profile 1 geometry...
 *       loft(sections=[_s0, _s1, ...])
 *   report_entities("<id>", <id>)
 *
 * A loft creates a new body — callers should update parentBodyId to f.id.
 */
export function emitLoft(
  f: LoftFeature,
  ir: ResolvedIr,
  _parentBodyId: string | null
): string[] {
  const lines: string[] = [];

  lines.push(`with BuildPart() as ${f.id}:`);

  const sectionVars: string[] = [];

  for (let i = 0; i < f.profiles.length; i++) {
    const varName = `_s${i}`;
    sectionVars.push(varName);
    const sketch = ir.sketches[f.profiles[i]];
    if (sketch) {
      lines.push(`    with BuildSketch() as ${varName}:`);
      for (const g of sketch.geometry) {
        switch (g.kind) {
          case "rect":
            if (g.cornerRadius !== undefined && (g.cornerRadius as number) > 0) {
              lines.push(`        RectangleRounded(${g.width}, ${g.height}, ${g.cornerRadius})`);
            } else {
              lines.push(`        Rectangle(${g.width}, ${g.height})`);
            }
            break;
          case "circle":
            lines.push(`        Circle(${g.radius})`);
            break;
          case "line":
            lines.push(`        Line((${g.p1.x}, ${g.p1.y}), (${g.p2.x}, ${g.p2.y}))`);
            break;
        }
      }
    }
  }

  lines.push(`    loft(sections=[${sectionVars.join(", ")}])`);
  lines.push(`report_entities("${f.id}", ${f.id})`);

  return lines;
}
