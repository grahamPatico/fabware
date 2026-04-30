// convex/cad/codegen/compileToBuild123d.ts
import type { ResolvedIr } from "../resolve/resolveIr";
import { emitParameters } from "./emitParameters";
import { emitFeature, type EmitContext } from "./emitFeature";

/**
 * Compile a resolved CAD IR into a build123d Python script string.
 *
 * The generated script:
 *   1. Emits named parameter variables at the top
 *   2. Iterates features and dispatches to per-kind emitters
 *   3. Ends with an export call referencing the last body
 */
export function compileToBuild123d(ir: ResolvedIr): string {
  const lines: string[] = [];

  // Header
  lines.push("from build123d import *");
  lines.push("");

  // Parameter declarations
  const paramLines = emitParameters(ir);
  lines.push(...paramLines);
  if (paramLines.length > 0) lines.push("");

  // Feature emission
  let ctx: EmitContext = { parentBodyId: null };

  for (const f of ir.features) {
    const result = emitFeature(f, ir, ctx);
    lines.push(...result.lines);
    lines.push("");
    ctx = result.ctxOut;
  }

  // Export the final body
  if (ctx.parentBodyId !== null) {
    lines.push(`export_step(${ctx.parentBodyId}.part, "output.step")`);
  }

  return lines.join("\n");
}
