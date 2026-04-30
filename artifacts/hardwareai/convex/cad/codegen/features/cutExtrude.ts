// convex/cad/codegen/features/cutExtrude.ts
import type { CutExtrudeFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";
import { emitSketchGeometry } from "../emitSketchGeometry";

/**
 * Emit build123d Python for a cut_extrude feature.
 *
 * Produces:
 *   with BuildPart() as <id>:
 *       with BuildSketch():
 *           ...sketch geometry...
 *       extrude(amount=<distance>, mode=Mode.SUBTRACT)
 *   report_entities("<id>", <id>)
 *
 * Supported sketch entity kinds: rect, circle, line, polygon, spline, arc
 * (arc emits a comment placeholder — see emitSketchGeometry.ts for details).
 */
export function emitCutExtrude(
  f: CutExtrudeFeature,
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
    lines.push(...emitSketchGeometry(ir, f.profile));
  }

  lines.push(`    extrude(amount=${distExpr}, mode=Mode.SUBTRACT)`);
  lines.push(`report_entities("${f.id}", ${f.id})`);

  return lines;
}
