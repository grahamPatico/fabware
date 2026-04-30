// convex/cad/compile/bom.ts
//
// BOM (Bill of Materials) compiler — Phase 9.
//
// Recursively walks an assembly IR, aggregating all ExternalPartRef entries by
// (vendor, partNumber) key. Inline parts are recursed into; external parts are
// counted but not recursed (they are opaque purchased components).
//
// Returns a BomLine[] sorted by vendor then partNumber.

import type { CadIr, InlinePartRef, ExternalPartRef } from "../ir/types";

export interface BomLine {
  vendor: string;
  partNumber: string;
  description?: string;
  quantity: number;
}

/**
 * Compile a Bill of Materials from a CadIr assembly.
 *
 * - External parts (kind === "external") are aggregated by vendor + partNumber.
 * - Inline parts (kind === "inline" or kind absent) are recursed into so that
 *   nested assemblies contribute their external parts too.
 * - Single-part IRs (no `parts` field) return an empty array.
 *
 * @param ir Root CadIr (may be a single-part or an assembly)
 * @returns  Sorted BomLine[] ready for rendering / export
 */
export function compileBom(ir: CadIr): BomLine[] {
  const counts = new Map<string, { vendor: string; partNumber: string; description?: string; qty: number }>();

  function visit(node: CadIr): void {
    if (!node.parts) return;

    for (const part of Object.values(node.parts)) {
      if ("kind" in part && part.kind === "external") {
        const ext = part as ExternalPartRef;
        const key = `${ext.vendor}::${ext.partNumber}`;
        const existing = counts.get(key);
        if (existing) {
          existing.qty += 1;
        } else {
          counts.set(key, {
            vendor: ext.vendor,
            partNumber: ext.partNumber,
            description: ext.description,
            qty: 1,
          });
        }
      } else {
        // Inline part — recurse into its sub-assembly
        const inline = part as InlinePartRef;
        visit(inline.ir);
      }
    }
  }

  visit(ir);

  // Sort by vendor then partNumber, map to BomLine
  return Array.from(counts.values())
    .sort((a, b) => {
      const vendorCmp = a.vendor.localeCompare(b.vendor);
      if (vendorCmp !== 0) return vendorCmp;
      return a.partNumber.localeCompare(b.partNumber);
    })
    .map(({ vendor, partNumber, description, qty }) => ({
      vendor,
      partNumber,
      ...(description !== undefined ? { description } : {}),
      quantity: qty,
    }));
}
