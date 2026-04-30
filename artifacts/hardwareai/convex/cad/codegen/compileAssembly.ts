// convex/cad/codegen/compileAssembly.ts
import type { CadIr, PartId, InlinePartRef } from "../ir/types";
import { resolveIr } from "../resolve/resolveIr";
import { compileToBuild123d } from "./compileToBuild123d";

/**
 * Compile a multi-part assembly IR into per-part build123d Python scripts.
 *
 * For each inline part in `ir.parts`, resolves the part's inline CadIr and
 * compiles it to a build123d Python script. External parts (kind === "external")
 * are skipped — they have no inline geometry to compile.
 *
 * Returns a map of part id → Python script string.
 *
 * If `ir.parts` is undefined (single-part IR), returns an empty object.
 * Existing callers that work with single-part IRs continue to use
 * `compileToBuild123d(resolveIr(ir))` directly.
 */
export function compileAssembly(ir: CadIr): Record<PartId, string> {
  if (!ir.parts) return {};

  const result: Record<PartId, string> = {};
  for (const [partId, partRef] of Object.entries(ir.parts)) {
    // Phase 9: skip external parts — no inline geometry to compile
    if ("kind" in partRef && partRef.kind === "external") continue;
    const inline = partRef as InlinePartRef;
    const resolved = resolveIr(inline.ir as CadIr);
    result[partId] = compileToBuild123d(resolved);
  }
  return result;
}
