// convex/cad/compile/materials.ts
//
// Material catalog — Phase 12, Task 1.
//
// Provides a built-in table of common engineering materials with density (g/cm³)
// and indicative cost-per-kg (USD/kg) for fabrication-cost estimation.
//
// `lookupMaterial` resolves a material name (case-insensitive) with a sensible
// default fallback so the volume estimator always has a material to work with.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MaterialEntry {
  /** Canonical display name. */
  name: string;
  /** Density in g/cm³. */
  densityGcm3: number;
  /** Indicative per-kg machining / raw stock cost in USD/kg. */
  costPerKgUsd: number;
}

// ── Built-in materials ────────────────────────────────────────────────────────
//
// 6 common engineering materials. Values are approximate mid-market US prices
// for machined or formed stock; adjust via custom catalogs for project pricing.

export const BUILTIN_MATERIALS: Record<string, MaterialEntry> = {
  aluminum: {
    name: "Aluminum (6061)",
    densityGcm3: 2.7,
    costPerKgUsd: 8,
  },
  steel: {
    name: "Steel (mild/1020)",
    densityGcm3: 7.85,
    costPerKgUsd: 5,
  },
  stainless: {
    name: "Stainless Steel (304)",
    densityGcm3: 8.0,
    costPerKgUsd: 12,
  },
  pla: {
    name: "PLA (3D print)",
    densityGcm3: 1.24,
    costPerKgUsd: 25,
  },
  abs: {
    name: "ABS (3D print)",
    densityGcm3: 1.05,
    costPerKgUsd: 22,
  },
  nylon: {
    name: "Nylon (PA12)",
    densityGcm3: 1.01,
    costPerKgUsd: 30,
  },
};

/** Default material used when none is specified or the lookup yields no match. */
export const DEFAULT_MATERIAL = BUILTIN_MATERIALS["aluminum"]!;

// ── lookupMaterial ────────────────────────────────────────────────────────────

/**
 * Look up a material by name (case-insensitive) from a catalog.
 *
 * Resolution order:
 *  1. Exact key match (lower-cased) in the supplied catalog.
 *  2. Substring match: first catalog key that includes the search term.
 *  3. `DEFAULT_MATERIAL` (aluminum) if no match is found.
 *
 * @param name    Material name / key to search for (e.g. "Aluminum", "steel").
 * @param catalog Custom catalog to search — defaults to BUILTIN_MATERIALS.
 */
export function lookupMaterial(
  name: string | undefined,
  catalog: Record<string, MaterialEntry> = BUILTIN_MATERIALS,
): MaterialEntry {
  if (!name) return DEFAULT_MATERIAL;

  const lower = name.toLowerCase().trim();

  // 1. Exact key match
  if (lower in catalog) return catalog[lower]!;

  // 2. Substring match (first key that contains the search term)
  for (const [key, entry] of Object.entries(catalog)) {
    if (key.includes(lower) || lower.includes(key)) return entry;
  }

  // 3. Fallback
  return DEFAULT_MATERIAL;
}
