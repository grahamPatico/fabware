// Live SendCutSend manufacturing rules — a pure parser over SCS's two official
// machine-readable feeds:
//
//   catalog: https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json
//   specs:   https://cdn.sendcutsend.com/specs/sendcutsend-specs.json
//
// Both are SKU-keyed (one SKU per material × thickness) and carry per-SKU
// numbers the hand-maintained snapshot in `scsRules.ts` can't: the real min
// hole size, min hole-to-edge, min part size, stock status, and per-SKU
// bending limits. Values arrive as a mix of numbers, numeric strings, "N/A",
// and missing keys, so every read here is defensive — an unparsable value
// becomes `null`, never a fabricated number.
//
// Pure: no fetch, no Convex, no I/O. Fetching + caching lives in
// `convex/scsSync.ts`; consumption lives in `scsRules.validateSpec`.

/** Official ordering catalog (SKUs, stock status, size limits). */
export const SCS_CATALOG_URL = "https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json";
/** Official engineering specs (cutting + bending limits, SKU-keyed to the catalog). */
export const SCS_SPECS_URL = "https://cdn.sendcutsend.com/specs/sendcutsend-specs.json";

/**
 * How far a requested thickness may sit from a catalog SKU's thickness and
 * still be considered the same stock. SCS lists 0.059" where fabware's
 * snapshot says 0.060", so an exact match would miss most SKUs.
 */
export const THICKNESS_TOLERANCE_IN = 0.0015;

/** Per-SKU bending limits. Only 57 of 178 SKUs have `bending_specs` at all. */
export interface ScsLiveBending {
  minFlangeBefore: number | null;
  minFlangeAfter: number | null;
  maxBendLength: number | null;
  effectiveBendRadius: number | null;
  maxBendAngle: number | null;
  kFactor: number | null;
  bendDeduction: number | null;
  bendReliefDepth: number | null;
}

/** One SCS SKU — a single material at a single thickness. */
export interface ScsLiveSku {
  sku: string;
  thickness: number | null;
  outOfStock: boolean;
  cuttingProcess: string | null;
  minHoleSize: number | null;
  minBridgeSize: number | null;
  minHoleToEdge: number | null;
  minPartLength: number | null;
  minPartWidth: number | null;
  maxPartSize: { w: number; h: number } | null;
  /** null when SCS does not offer bending for this SKU. */
  bending: ScsLiveBending | null;
}

/** Parsed feeds, keyed by the *fabware* material name (see `CATALOG_NAME_TO_FABWARE`). */
export interface ScsLiveRules {
  generatedAt: string | null;
  materials: Record<string, ScsLiveSku[]>;
}

/**
 * SCS catalog `name` → the key used in `SCS_MATERIALS` (scsRules.ts).
 * Verified against the 2026-04-29 feed. SCS materials with no fabware
 * counterpart (titanium, HDPE, carbon fiber, …) are skipped entirely — this
 * parser is a live overlay on the existing catalog, not a replacement for it.
 */
export const CATALOG_NAME_TO_FABWARE: Record<string, string> = {
  "A36/1008 Mild Steel": "Mild Steel (CRS)",
  "G90 Galvanized": "Galvanized Steel",
  "Stainless Steel (304 Series)": "Stainless Steel 304",
  "Stainless Steel (316 Series)": "Stainless Steel 316",
  "5052 H32 Aluminum": "Aluminum 5052",
  "6061 T6 Aluminum": "Aluminum 6061",
  "Copper": "Copper",
  "Brass": "Brass",
  "Acrylic-Clear": "Acrylic Clear",
  "Acrylic-Black": "Acrylic Black",
};

/**
 * Coerce a feed value to a number. Handles real numbers, numeric strings
 * ("0.025", "+0.005", "44.0"), and the sentinels the feeds actually emit
 * ("N/A", null, missing). Anything else → null.
 */
export function num(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const trimmed = x.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "N/A") return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a size string into inches. The feeds are inconsistent about spacing
 * and casing — "44 x 30", "3.0x3.0", "1.00 x 2.00" all appear. Unparsable →
 * null (the caller falls back to the snapshot's max sheet).
 */
export function parseSize(raw: unknown): { w: number; h: number } | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)\s*x\s*([0-9]*\.?[0-9]+)$/);
  if (!m) return null;
  const w = num(m[1]);
  const h = num(m[2]);
  if (w == null || h == null || w <= 0 || h <= 0) return null;
  return { w, h };
}

function asRecord(x: unknown): Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x.trim() : null;
}

function parseBending(raw: unknown): ScsLiveBending | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  return {
    minFlangeBefore: num(b.min_flange_length_before_bend),
    minFlangeAfter: num(b.min_flange_length_after_bend),
    maxBendLength: num(b.max_bend_length),
    effectiveBendRadius: num(b.effective_bend_radius),
    maxBendAngle: num(b.max_bend_angle),
    kFactor: num(b.k_factor),
    bendDeduction: num(b.bend_deduction),
    bendReliefDepth: num(b.bend_relief_depth),
  };
}

/**
 * Join the catalog + specs feeds on `sku` and bucket the result by fabware
 * material name. A catalog entry with no matching specs entry still yields a
 * SKU (stock status and size limits are catalog-side); its cutting/bending
 * numbers just come back null.
 */
export function parseScsFeeds(catalogJson: unknown, specsJson: unknown): ScsLiveRules {
  const catalog = asRecord(catalogJson);
  const specs = asRecord(specsJson);

  const specsBySku = new Map<string, Record<string, unknown>>();
  for (const entry of asArray(specs.materials)) {
    const e = asRecord(entry);
    const sku = asString(e.sku);
    if (sku) specsBySku.set(sku, e);
  }

  const materials: Record<string, ScsLiveSku[]> = {};
  for (const entry of asArray(catalog.materials)) {
    const c = asRecord(entry);
    const sku = asString(c.sku);
    const catalogName = asString(c.name);
    if (!sku || !catalogName) continue;
    const fabwareName = CATALOG_NAME_TO_FABWARE[catalogName];
    if (!fabwareName) continue;

    const spec = specsBySku.get(sku) ?? {};
    const cutting = asRecord(spec.cutting_specs);

    materials[fabwareName] ??= [];
    materials[fabwareName].push({
      sku,
      thickness: num(c.thickness),
      outOfStock: c.out_of_stock === true,
      cuttingProcess: asString(cutting.cutting_process) ?? asString(c.cutting_process),
      minHoleSize: num(cutting.min_hole_size),
      minBridgeSize: num(cutting.min_bridge_size),
      minHoleToEdge: num(cutting.min_hole_to_edge),
      minPartLength: num(cutting.min_part_length),
      minPartWidth: num(cutting.min_part_width),
      // Both feeds carry the same string; prefer the specs feed and fall back
      // to the catalog. G90 Galvanized omits it in both → null.
      maxPartSize: parseSize(cutting.max_part_size) ?? parseSize(c.max_part_size),
      bending: parseBending(spec.bending_specs),
    });
  }

  // Thickness-ascending so the list reads like a gauge chart in logs/debug.
  for (const list of Object.values(materials)) {
    list.sort((a, b) => (a.thickness ?? Infinity) - (b.thickness ?? Infinity));
  }

  const meta = asRecord(specs._meta);
  const catalogMeta = asRecord(catalog._meta);
  return {
    generatedAt: asString(meta.generated_at) ?? asString(catalogMeta.generated_at),
    materials,
  };
}

/**
 * Find the SKU for a fabware material name + thickness. Returns the closest
 * stocked thickness within `THICKNESS_TOLERANCE_IN`, or null when the material
 * isn't mapped, the rules aren't cached yet, or no thickness is close enough.
 */
export function liveSkuFor(
  rules: ScsLiveRules | null,
  material: string | undefined,
  thickness: number,
): ScsLiveSku | null {
  if (!rules || !material || !Number.isFinite(thickness)) return null;
  const candidates = rules.materials[material];
  if (!candidates || candidates.length === 0) return null;
  let best: ScsLiveSku | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    if (c.thickness == null) continue;
    const diff = Math.abs(c.thickness - thickness);
    // +1e-9 so the documented boundary is inclusive despite binary rounding
    // (0.0495 - 0.048 evaluates to 0.0015000000000000013).
    if (diff <= THICKNESS_TOLERANCE_IN + 1e-9 && diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

/** Cite a `cutting_specs` field in a rule message, so the number is traceable. */
export function citeCutting(sku: string, field: string): string {
  return `per sendcutsend-specs.json materials[sku=${sku}].cutting_specs.${field}`;
}

/** Cite a `bending_specs` field in a rule message. */
export function citeBending(sku: string, field: string): string {
  return `per sendcutsend-specs.json materials[sku=${sku}].bending_specs.${field}`;
}

/** Cite a catalog-feed field in a rule message. */
export function citeCatalog(sku: string, field: string): string {
  return `per sendcutsend-catalog.json materials[sku=${sku}].${field}`;
}
