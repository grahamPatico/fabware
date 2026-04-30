// convex/cad/codegen/features/sweep.ts
import type { SweepFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";

/**
 * Emit build123d Python for a sweep feature.
 *
 * Produces:
 *   with BuildPart() as <id>:
 *       with BuildSketch() as _profile:
 *           ...profile sketch geometry...
 *       with BuildLine() as _path:
 *           ...path sketch geometry (line)...
 *       sweep(sections=_profile, path=_path)
 *   report_entities("<id>", <id>)
 *
 * A sweep creates a new body — callers should update parentBodyId to f.id.
 */
export function emitSweep(
  f: SweepFeature,
  ir: ResolvedIr,
  _parentBodyId: string | null
): string[] {
  const lines: string[] = [];

  lines.push(`with BuildPart() as ${f.id}:`);

  // Emit profile sketch geometry
  const profileSketch = ir.sketches[f.profile];
  if (profileSketch) {
    lines.push(`    with BuildSketch() as _profile:`);
    for (const g of profileSketch.geometry) {
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

  // Emit path sketch geometry
  const pathSketch = ir.sketches[f.path];
  if (pathSketch) {
    lines.push(`    with BuildLine() as _path:`);
    for (const g of pathSketch.geometry) {
      switch (g.kind) {
        case "line":
          lines.push(`        Line((${g.p1.x}, ${g.p1.y}), (${g.p2.x}, ${g.p2.y}))`);
          break;
        case "rect":
          lines.push(`        Rectangle(${g.width}, ${g.height})`);
          break;
        case "circle":
          lines.push(`        Circle(${g.radius})`);
          break;
      }
    }
  }

  lines.push(`    sweep(sections=_profile, path=_path)`);
  lines.push(`report_entities("${f.id}", ${f.id})`);

  return lines;
}
