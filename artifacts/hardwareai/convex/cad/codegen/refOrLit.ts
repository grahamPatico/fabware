// convex/cad/codegen/refOrLit.ts
import type { ResolvedIr } from "../resolve/resolveIr";

/**
 * Given a numeric value that was produced by resolveIr, attempt to find a
 * matching parameter name in ir.resolvedParameters so that we can emit the
 * parameter name instead of its literal value.
 *
 * This keeps the generated Python readable and parametric:
 *   extrude(amount=thickness)    ← preferred
 *   extrude(amount=3)            ← fallback when no parameter matches
 */
export function refOrLit(value: number, ir: ResolvedIr): string {
  for (const [name, v] of Object.entries(ir.resolvedParameters)) {
    if (v === value) return name;
  }
  return String(value);
}
