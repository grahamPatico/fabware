// convex/cad/codegen/features/chamfer.ts
import type { ChamferFeature, EdgeQuery } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Map an EdgeQuery to a build123d edge selector expression.
 */
function edgeSelector(featureId: string, query: EdgeQuery): string {
  if (query === "all") {
    return `${featureId}.edges()`;
  }
  if (query === "top_loop") {
    return `${featureId}.edges().filter_by(Axis.Z)`;
  }
  if (query === "bottom_loop") {
    return `${featureId}.edges().filter_by(Axis.Z, reverse=True)`;
  }
  // { tag: string }
  return `${featureId}.edges().filter_by(tag="${(query as { tag: string }).tag}")`;
}

/**
 * Emit build123d Python for a chamfer feature.
 *
 * Produces:
 *   chamfer(<edge_selector>, <length>)
 *   report_entities("<id>", <parent_body>)
 */
export function emitChamfer(
  f: ChamferFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const distExpr = refOrLit(f.distance as number, ir);
  const lines: string[] = [];

  // Build edge selectors
  const edgeSelectors = f.edges.map((e) => edgeSelector(e.feature, e.query));
  const edgesArg = edgeSelectors.join(", ");

  lines.push(`chamfer(${edgesArg}, ${distExpr})`);

  // report_entities references the parent body (chamfer modifies it in-place)
  const bodyRef = parentBodyId ?? "None";
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
