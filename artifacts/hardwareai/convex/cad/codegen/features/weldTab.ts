// convex/cad/codegen/features/weldTab.ts
import type { WeldTabFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a weld_tab feature.
 *
 * A weld tab is a small rectangular protrusion (tab) added to an existing body
 * face. It is modelled as a Rectangle sketch at a given position + extrude inside
 * the parent body context.
 *
 * Produces:
 *   with <parent_body>:
 *       with Locations((<pos.x>, <pos.y>)):
 *           with BuildSketch():
 *               Rectangle(<length>, <width>)
 *           extrude(amount=<thickness>)
 *   report_entities("<id>", <parent_body>)
 *
 * weld_tab modifies the parent body in-place — callers should keep parentBodyId unchanged.
 */
export function emitWeldTab(
  f: WeldTabFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const lengthExpr = refOrLit(f.length as number, ir);
  const widthExpr = refOrLit(f.width as number, ir);
  const thicknessExpr = refOrLit(f.thickness as number, ir);
  const pos = f.position as { x: number; y: number };
  const posX = refOrLit(pos.x, ir);
  const posY = refOrLit(pos.y, ir);

  const faceRef = f.face as { feature: string; tag: string };
  const bodyRef = parentBodyId ?? faceRef.feature;

  const lines: string[] = [];
  lines.push(`with ${bodyRef}:`);
  lines.push(`    with Locations((${posX}, ${posY})):`);
  lines.push(`        with BuildSketch():`);
  lines.push(`            Rectangle(${lengthExpr}, ${widthExpr})`);
  lines.push(`        extrude(amount=${thicknessExpr})`);
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
