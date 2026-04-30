// convex/cad/codegen/features/hole.ts
import type { HoleFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a simple hole feature.
 *
 * Produces:
 *   with Locations((<x>, <y>, 0), ...):
 *       Hole(radius=<diam> / 2, depth=<depth>)
 *   report_entities("<id>", <parent_body>)
 */
export function emitHole(
  f: HoleFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const diamExpr = refOrLit(f.diameter as number, ir);
  const lines: string[] = [];

  // Emit Locations context with each position
  const posArgs = (f.positions as Array<{ x: number; y: number }>)
    .map((p) => `(${p.x}, ${p.y}, 0)`)
    .join(", ");

  lines.push(`with Locations(${posArgs}):`);

  // Build Hole call
  const radiusExpr = `${diamExpr} / 2`;
  if (f.depth !== undefined) {
    const depthExpr = refOrLit(f.depth as number, ir);
    lines.push(`    Hole(radius=${radiusExpr}, depth=${depthExpr})`);
  } else {
    lines.push(`    Hole(radius=${radiusExpr})`);
  }

  // report_entities references the parent body
  const bodyRef = parentBodyId ?? "None";
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
