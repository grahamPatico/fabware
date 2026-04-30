// convex/cad/codegen/emitParameters.ts
import type { ResolvedIr } from "../resolve/resolveIr";

/**
 * Emit Python variable declarations for all resolved parameters.
 * E.g.  thickness = 3
 *       length = 120
 */
export function emitParameters(ir: ResolvedIr): string[] {
  return Object.entries(ir.resolvedParameters).map(
    ([name, value]) => `${name} = ${value}`
  );
}
