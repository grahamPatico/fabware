// convex/cad/codegen/features/pattern.ts
import type { PatternFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a linear pattern feature.
 *
 * Generates a list of Location objects evenly spaced along the specified axis,
 * then uses them in a Locations context to replicate the source feature.
 *
 * Produces:
 *   <id>_locations = [Location((<x>, <y>, <z>)), ...]
 *   with Locations(*<id>_locations):
 *       <source>.copy()
 *   report_entities("<id>", <parent_body>)
 */
export function emitPattern(
  f: PatternFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const spacingExpr = refOrLit(f.spacing as number, ir);
  const spacingValue = f.spacing as number;
  const lines: string[] = [];

  // Build Location list
  const locListName = `${f.id}_locations`;
  const locItems: string[] = [];

  for (let i = 0; i < f.count; i++) {
    let x = 0, y = 0, z = 0;
    const offset = i * spacingValue;
    switch (f.axis) {
      case "x": x = offset; break;
      case "y": y = offset; break;
      case "z": z = offset; break;
    }
    locItems.push(`    Location((${x}, ${y}, ${z}))`);
  }

  lines.push(`${locListName} = [`);
  lines.push(...locItems.map((loc, i) => i < locItems.length - 1 ? `${loc},` : loc));
  lines.push(`]`);

  lines.push(`with Locations(*${locListName}):`);
  lines.push(`    ${f.source}.copy()`);

  // report_entities references the parent body
  const bodyRef = parentBodyId ?? "None";
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  // Suppress unused variable warning for spacingExpr if it's not a literal
  void spacingExpr;

  return lines;
}
