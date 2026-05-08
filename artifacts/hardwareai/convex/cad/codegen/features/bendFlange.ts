// convex/cad/codegen/features/bendFlange.ts
import type { BendFlangeFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a bend_flange feature.
 *
 * NOTE: Real sheet-metal bending requires the build123d sheet-metal extension
 * or manual construction with Plane/Locations/extrude/fillet. For Phase 5,
 * we emit a descriptive comment, a placeholder pass, and a report_entities call
 * so the entity registry gets populated. The min-bend-radius rule still fires
 * so the agent gets validation feedback.
 *
 * Produces:
 *   # bend_flange <id>: face=<feature>.<tag>, angle=<angle>deg, radius=<radius>, length=<length>, thickness=<thickness>
 *   with <parent_body>:
 *       pass  # placeholder — sheet-metal bend codegen not yet implemented
 *   report_entities("<id>", <parent_body>)
 */
export function emitBendFlange(
  f: BendFlangeFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const angleExpr = refOrLit(f.angle as number, ir);
  const radiusExpr = refOrLit(f.radius as number, ir);
  const lengthExpr = refOrLit(f.length as number, ir);
  const thicknessExpr = refOrLit(f.thickness as number, ir);
  const faceRef = f.face as { feature: string; tag: string };

  const bodyRef = parentBodyId ?? faceRef.feature;

  const lines: string[] = [];
  lines.push(
    `# bend_flange ${f.id}: face=${faceRef.feature}.${faceRef.tag}, angle=${angleExpr}deg, radius=${radiusExpr}, length=${lengthExpr}, thickness=${thicknessExpr}`
  );
  lines.push(`with ${bodyRef}:`);
  lines.push(`    pass  # placeholder — sheet-metal bend codegen not yet implemented`);
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
