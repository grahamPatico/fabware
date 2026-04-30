// convex/cad/codegen/features/shell.ts
import type { ShellFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Map a face tag to a build123d face selector expression.
 *
 * The Phase 1 report_helpers.py tags faces by Z extreme:
 *   top    = highest Z → parent.faces().sort_by(Axis.Z)[-1]
 *   bottom = lowest Z  → parent.faces().sort_by(Axis.Z)[0]
 *   other  → # TODO comment + [-1] fallback
 */
function faceSelector(parentBodyId: string, tag: string): string {
  if (tag === "top") {
    return `${parentBodyId}.faces().sort_by(Axis.Z)[-1]`;
  }
  if (tag === "bottom") {
    return `${parentBodyId}.faces().sort_by(Axis.Z)[0]`;
  }
  // Unknown tag — emit a TODO and fall back to [-1]
  return `${parentBodyId}.faces().sort_by(Axis.Z)[-1]  # TODO: resolve tag "${tag}"`;
}

/**
 * Emit build123d Python for a shell feature.
 *
 * Produces:
 *   shell(<parent>.part, amount=-<thickness>, openings=[<face_selectors>])
 *   report_entities("<id>", <parent_body>)
 *
 * shell modifies the parent body in-place.
 */
export function emitShell(
  f: ShellFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const thicknessExpr = refOrLit(f.thickness as number, ir);
  const lines: string[] = [];

  // Determine which body to shell — prefer parentBodyId, fall back to first removedFace's feature
  const bodyRef =
    parentBodyId ?? (f.removedFaces[0] as { feature: string; tag: string }).feature;

  // Build face selectors for removed (open) faces
  const faceArgs = (f.removedFaces as Array<{ feature: string; tag: string }>)
    .map((fr) => faceSelector(bodyRef, fr.tag))
    .join(", ");

  lines.push(`shell(${bodyRef}.part, amount=-${thicknessExpr}, openings=[${faceArgs}])`);
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
