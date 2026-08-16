import { threadFromPartNumber, type ThreadSpec } from "./fastenerSpecs";
import { citeBending, citeCatalog, citeCutting, type ScsLiveSku } from "./scsLive";

export interface MaterialRule {
  name: string;
  category: "steel" | "aluminum" | "stainless" | "copper" | "brass" | "acrylic";
  thicknesses: number[];
  canBend: boolean;
  canPowderCoat: boolean;
  maxSheet: { width: number; height: number };
  bendRadiusMultiplier: number;
  minHoleMultiplier: number;
  textureKey: string;
}

/** Density in lb/in³ by SCS material category. */
export const MATERIAL_DENSITY: Record<MaterialRule["category"], number> = {
  steel: 0.284,
  stainless: 0.290,
  aluminum: 0.098,
  copper: 0.323,
  brass: 0.305,
  acrylic: 0.043,
};

/**
 * Approximate SCS material cost in USD per in² at a "reference" thickness;
 * scaled linearly by `(thickness / referenceThickness)` for first-order accuracy.
 * Numbers are derived from public SCS quote checks 2026-Q1; treat them as
 * order-of-magnitude (±30%). Real quotes always come from SCS itself.
 */
export const MATERIAL_COST_PER_IN2: Record<MaterialRule["category"], { rate: number; refThickness: number }> = {
  steel:     { rate: 0.06, refThickness: 0.075 },
  stainless: { rate: 0.18, refThickness: 0.075 },
  aluminum:  { rate: 0.12, refThickness: 0.075 },
  copper:    { rate: 0.30, refThickness: 0.075 },
  brass:     { rate: 0.28, refThickness: 0.075 },
  acrylic:   { rate: 0.05, refThickness: 0.118 },
};

/** Per-foot of cut perimeter (in USD). */
export const CUT_RATE_PER_FT = 0.50;
/** Per-bend (in USD). SCS charges roughly this per bend on small parts. */
export const BEND_RATE = 1.50;
/** Powder coat: $/ft² of surface area (one side). */
export const POWDER_COAT_RATE_PER_FT2 = 5.00;
/** Minimum charge per part to cover handling. */
export const MIN_CHARGE_PER_PART = 3.00;

export function costPerIn2(material: string | undefined, thickness: number): number {
  const m = material ? SCS_MATERIALS[material] : undefined;
  const cat = m?.category ?? "steel";
  const { rate, refThickness } = MATERIAL_COST_PER_IN2[cat];
  return rate * (thickness / refThickness);
}

export function densityFor(material: string | undefined): number {
  if (!material) return MATERIAL_DENSITY.steel;
  const m = SCS_MATERIALS[material];
  if (m) return MATERIAL_DENSITY[m.category];
  // Fallback heuristic by name
  const lower = material.toLowerCase();
  if (lower.includes("acrylic")) return MATERIAL_DENSITY.acrylic;
  if (lower.includes("aluminum")) return MATERIAL_DENSITY.aluminum;
  if (lower.includes("stainless")) return MATERIAL_DENSITY.stainless;
  if (lower.includes("copper")) return MATERIAL_DENSITY.copper;
  if (lower.includes("brass")) return MATERIAL_DENSITY.brass;
  return MATERIAL_DENSITY.steel;
}

export const POWDER_COAT_COLORS = [
  "Black", "White", "Red", "Blue", "Green",
  "Yellow", "Orange", "Gray", "Silver", "Bronze",
] as const;

export const PART_TYPES = [
  "bracket", "plate", "enclosure", "angle", "channel", "tab", "gusset",
] as const;

const STD_THICKNESSES = [
  0.024, 0.030, 0.036, 0.048, 0.060, 0.075, 0.090, 0.105,
  0.120, 0.135, 0.160, 0.187, 0.250,
];

// US sheet-metal gauge names for steel (close enough for stainless/galvanized too).
// Aluminum uses different gauge numbers, so we only show gauges for steel categories.
const STEEL_GAUGES: Array<{ gauge: string; inches: number }> = [
  { gauge: "26 ga", inches: 0.018 },
  { gauge: "24 ga", inches: 0.024 },
  { gauge: "22 ga", inches: 0.030 },
  { gauge: "20 ga", inches: 0.036 },
  { gauge: "18 ga", inches: 0.048 },
  { gauge: "16 ga", inches: 0.060 },
  { gauge: "14 ga", inches: 0.075 },
  { gauge: "13 ga", inches: 0.090 },
  { gauge: "12 ga", inches: 0.105 },
  { gauge: "11 ga", inches: 0.120 },
  { gauge: "10 ga", inches: 0.135 },
  { gauge: "7 ga", inches: 0.187 },
  { gauge: "3 ga", inches: 0.250 },
];

export function gaugeNameFor(thicknessIn: number, materialName: string): string | null {
  const mat = SCS_MATERIALS[materialName];
  if (!mat) return null;
  if (mat.category !== "steel" && mat.category !== "stainless") return null;
  let best: { gauge: string; inches: number } | null = null;
  let bestDiff = Infinity;
  for (const g of STEEL_GAUGES) {
    const d = Math.abs(g.inches - thicknessIn);
    if (d < bestDiff) {
      bestDiff = d;
      best = g;
    }
  }
  // Only label as a gauge if we're within 0.005" of the canonical gauge thickness.
  if (best && bestDiff <= 0.005) return best.gauge;
  return null;
}

// Default insets used by the geometry engine (kept in sync with featureGraph.ts).
export const DEFAULT_HOLE_INSET = 0.375;
export const DEFAULT_SLOT_INSET = 0.5;

// Detect when a thickness value was clearly entered in millimeters (e.g. 1.8796 mm
// for 14 gauge steel). Heuristic: a value is treated as mm only if it (a) lies above
// the entire stocked-inch range AND (b) when divided by 25.4 lands within 2% of a
// stocked thickness for any material. This avoids misclassifying genuine inch inputs
// like "1.0" or "0.5" plate (which we want to flag as out-of-range, not silently
// shrink to 24 gauge).
function maybeCoerceMm(
  thicknessIn: number,
  material: MaterialRule,
): { value: number; wasMm: boolean } {
  if (thicknessIn <= 0.3 || thicknessIn >= 12) {
    return { value: thicknessIn, wasMm: false };
  }
  const asInches = thicknessIn / 25.4;
  for (const stocked of material.thicknesses) {
    if (Math.abs(asInches - stocked) / stocked < 0.02) {
      return { value: asInches, wasMm: true };
    }
  }
  return { value: thicknessIn, wasMm: false };
}

export const SCS_MATERIALS: Record<string, MaterialRule> = {
  "Mild Steel (CRS)": {
    name: "Mild Steel (CRS)",
    category: "steel",
    thicknesses: [0.030, 0.036, 0.048, 0.060, 0.075, 0.090, 0.105, 0.120, 0.135, 0.187, 0.250],
    canBend: true,
    canPowderCoat: true,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 1.0,
    minHoleMultiplier: 1.0,
    textureKey: "mild-steel",
  },
  "Galvanized Steel": {
    name: "Galvanized Steel",
    category: "steel",
    thicknesses: [0.030, 0.048, 0.060, 0.075, 0.090, 0.105, 0.135],
    canBend: true,
    canPowderCoat: false,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 1.0,
    minHoleMultiplier: 1.0,
    textureKey: "galvanized",
  },
  "Stainless Steel 304": {
    name: "Stainless Steel 304",
    category: "stainless",
    thicknesses: [0.024, 0.036, 0.048, 0.060, 0.075, 0.090, 0.105, 0.120, 0.135, 0.187, 0.250],
    canBend: true,
    canPowderCoat: true,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 1.5,
    minHoleMultiplier: 1.0,
    textureKey: "stainless",
  },
  "Stainless Steel 316": {
    name: "Stainless Steel 316",
    category: "stainless",
    thicknesses: [0.024, 0.036, 0.048, 0.060, 0.075, 0.090, 0.120, 0.187],
    canBend: true,
    canPowderCoat: true,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 1.5,
    minHoleMultiplier: 1.0,
    textureKey: "stainless",
  },
  "Aluminum 5052": {
    name: "Aluminum 5052",
    category: "aluminum",
    thicknesses: [0.025, 0.032, 0.040, 0.050, 0.063, 0.080, 0.100, 0.125, 0.160, 0.190, 0.250],
    canBend: true,
    canPowderCoat: true,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 1.0,
    minHoleMultiplier: 1.0,
    textureKey: "brushed-aluminum",
  },
  "Aluminum 6061": {
    name: "Aluminum 6061",
    category: "aluminum",
    thicknesses: [0.040, 0.063, 0.080, 0.100, 0.125, 0.160, 0.190, 0.250],
    canBend: false,
    canPowderCoat: true,
    maxSheet: { width: 43, height: 43 },
    bendRadiusMultiplier: 2.0,
    minHoleMultiplier: 1.0,
    textureKey: "brushed-aluminum",
  },
  "Copper": {
    name: "Copper",
    category: "copper",
    thicknesses: [0.032, 0.040, 0.050, 0.063, 0.080, 0.125],
    canBend: true,
    canPowderCoat: false,
    maxSheet: { width: 36, height: 36 },
    bendRadiusMultiplier: 1.0,
    minHoleMultiplier: 1.0,
    textureKey: "copper",
  },
  "Brass": {
    name: "Brass",
    category: "brass",
    thicknesses: [0.032, 0.040, 0.050, 0.063, 0.080, 0.125],
    canBend: true,
    canPowderCoat: false,
    maxSheet: { width: 36, height: 36 },
    bendRadiusMultiplier: 1.0,
    minHoleMultiplier: 1.0,
    textureKey: "brass",
  },
  "Acrylic Clear": {
    name: "Acrylic Clear",
    category: "acrylic",
    thicknesses: [0.060, 0.118, 0.177, 0.236, 0.354, 0.472],
    canBend: false,
    canPowderCoat: false,
    maxSheet: { width: 32, height: 32 },
    bendRadiusMultiplier: 99,
    minHoleMultiplier: 1.0,
    textureKey: "acrylic-clear",
  },
  "Acrylic Black": {
    name: "Acrylic Black",
    category: "acrylic",
    thicknesses: [0.060, 0.118, 0.177, 0.236, 0.354, 0.472],
    canBend: false,
    canPowderCoat: false,
    maxSheet: { width: 32, height: 32 },
    bendRadiusMultiplier: 99,
    minHoleMultiplier: 1.0,
    textureKey: "acrylic-black",
  },
};

export function listMaterialNames(): string[] {
  return Object.keys(SCS_MATERIALS);
}

export type RuleStatus = "pass" | "warn" | "fail" | "na";

export interface RuleResult {
  id: string;
  label: string;
  status: RuleStatus;
  message: string;
  suggestion?: Partial<SpecInput>;
}

export interface SpecInput {
  partType?: string | null;
  material?: string | null;
  thickness?: number | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  bendRadius?: number | null;
  bendAngles?: string | null;
  holePattern?: string | null;
  powderCoat?: boolean | null;
  powderCoatColor?: string | null;
  assemblyRefs?: Array<{ mcmasterPartNumber: string; quantity: number }> | null;
}

export interface ValidationResult {
  rules: RuleResult[];
  hasFailures: boolean;
  snappedSpec: Partial<SpecInput>;
}

function snapToNearest(value: number, options: number[]): number {
  let best = options[0];
  let bestDiff = Math.abs(value - best);
  for (const o of options) {
    const d = Math.abs(value - o);
    if (d < bestDiff) {
      bestDiff = d;
      best = o;
    }
  }
  return best;
}

interface HolePattern {
  count: number;
  diameter: number;
  pattern: string;
}

function safeParseHoles(s: string | null | undefined): HolePattern | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (typeof o.diameter === "number" && typeof o.count === "number") {
      return { count: o.count, diameter: o.diameter, pattern: o.pattern ?? "corner" };
    }
  } catch {
    return null;
  }
  return null;
}

// Slots only exist in the DSL — the legacy SpecInput doesn't carry them.
// validateSpec runs against the legacy shape so this returns null today.
// When DSL-level validation lands, replace this with a real DSL traversal so
// Rule 8 can also flag oversized slots.
function safeParseSlots(_spec: SpecInput): { length: number; width: number } | null {
  return null;
}

function safeParseAngles(s: string | null | undefined): number[] {
  if (!s) return [];
  try {
    const o = JSON.parse(s);
    if (Array.isArray(o)) return o.filter((n) => typeof n === "number");
  } catch {
    return [];
  }
  return [];
}

/**
 * Validate a spec against the SCS catalog.
 *
 * `live` is the SendCutSend SKU that matches this material + thickness in the
 * cached official feeds (see lib/scsLive.ts + convex/scsSync.ts). When it's
 * null — no cache yet, unmapped material, off-catalog thickness — behavior is
 * exactly the hand-maintained snapshot's. When present, its published numbers
 * override the snapshot's heuristics and every message cites the feed field it
 * came from.
 */
export function validateSpec(spec: SpecInput, live: ScsLiveSku | null = null): ValidationResult {
  const rules: RuleResult[] = [];
  const snapped: Partial<SpecInput> = {};

  // Rule 1: Material is in catalog
  let mat: MaterialRule | null = null;
  if (!spec.material) {
    rules.push({
      id: "material",
      label: "Material in catalog",
      status: "fail",
      message: "No material selected.",
      suggestion: { material: "Mild Steel (CRS)" },
    });
    snapped.material = "Mild Steel (CRS)";
    mat = SCS_MATERIALS["Mild Steel (CRS)"];
  } else if (!SCS_MATERIALS[spec.material]) {
    const fallback = "Mild Steel (CRS)";
    rules.push({
      id: "material",
      label: "Material in catalog",
      status: "fail",
      message: `"${spec.material}" is not stocked by Send Cut Send. Using ${fallback}.`,
      suggestion: { material: fallback },
    });
    snapped.material = fallback;
    mat = SCS_MATERIALS[fallback];
  } else {
    mat = SCS_MATERIALS[spec.material];
    rules.push({
      id: "material",
      label: "Material in catalog",
      status: "pass",
      message: `${mat.name} is available.`,
    });
  }

  // Rule 2: Thickness is offered for this material (with mm coercion + gauge naming)
  const tRaw = spec.thickness ?? null;
  const coerced = tRaw != null ? maybeCoerceMm(tRaw, mat) : null;
  const t = coerced ? coerced.value : null;
  const wasMm = coerced?.wasMm ?? false;
  let effectiveT = t;
  const matched = t != null ? mat.thicknesses.find((s) => Math.abs(s - t) < 1e-4) ?? null : null;
  if (t == null) {
    const def = mat.thicknesses[Math.floor(mat.thicknesses.length / 3)];
    rules.push({
      id: "thickness",
      label: "Thickness offered",
      status: "fail",
      message: "Thickness not specified.",
      suggestion: { thickness: def },
    });
    snapped.thickness = def;
    effectiveT = def;
  } else if (matched == null) {
    const minT = mat.thicknesses[0];
    const maxT = mat.thicknesses[mat.thicknesses.length - 1];
    if (t < minT || t > maxT) {
      const snap = t < minT ? minT : maxT;
      const gauge = gaugeNameFor(snap, mat.name);
      const mmNote = wasMm ? `${tRaw}mm (= ${t.toFixed(4)}")` : `${tRaw}"`;
      rules.push({
        id: "thickness",
        label: "Thickness offered",
        status: "fail",
        message: `${mmNote} is outside the ${minT}"–${maxT}" range for ${mat.name}. Snapping to ${snap}"${gauge ? ` (${gauge})` : ""}.`,
        suggestion: { thickness: snap },
      });
      snapped.thickness = snap;
      effectiveT = snap;
    } else {
      const snap = snapToNearest(t, mat.thicknesses);
      const gauge = gaugeNameFor(snap, mat.name);
      const mmNote = wasMm ? `${tRaw}mm (= ${t.toFixed(4)}")` : `${tRaw}"`;
      rules.push({
        id: "thickness",
        label: "Thickness offered",
        status: "warn",
        message: `${mmNote} is not a stocked thickness — nearest stocked is ${snap}"${gauge ? ` (${gauge})` : ""}.`,
        suggestion: { thickness: snap },
      });
      snapped.thickness = snap;
      effectiveT = snap;
    }
  } else {
    const gauge = gaugeNameFor(matched, mat.name);
    rules.push({
      id: "thickness",
      label: "Thickness offered",
      status: "pass",
      message: `${matched}"${gauge ? ` (${gauge})` : ""} is stocked for ${mat.name}.`,
    });
    if (wasMm) snapped.thickness = matched;
    effectiveT = matched;
  }

  // Live rule: stock status is catalog-side and per-SKU. Warn only — SCS still
  // accepts the order, it just won't ship until the material is back.
  if (live?.outOfStock) {
    rules.push({
      id: "stock",
      label: "SKU in stock at Send Cut Send",
      status: "warn",
      message: `SKU currently out of stock at SendCutSend: ${live.sku} (${mat.name}${live.thickness != null ? ` ${live.thickness}"` : ""}) — ${citeCatalog(live.sku, "out_of_stock")}.`,
    });
  }

  // Rule 3: Sheet size within capacity. The live SKU's published max part size
  // wins when SCS ships one for it (G90 Galvanized omits it in both feeds, so
  // that material still falls back to the snapshot's max sheet).
  const w = spec.width ?? null;
  const h = spec.height ?? null;
  const liveMax = live?.maxPartSize ?? null;
  const maxW = liveMax ? liveMax.w : mat.maxSheet.width;
  const maxH = liveMax ? liveMax.h : mat.maxSheet.height;
  const maxCite = liveMax && live ? ` (${citeCutting(live.sku, "max_part_size")})` : "";
  // SCS's live envelope is rectangular (44 × 30), so a 20"×40" part fits
  // rotated. The snapshot's envelopes are square, where this reduces to the
  // original per-axis comparison.
  const exceedsMax =
    w != null &&
    h != null &&
    (Math.max(w, h) > Math.max(maxW, maxH) || Math.min(w, h) > Math.min(maxW, maxH));
  if (w == null || h == null) {
    rules.push({
      id: "sheet",
      label: "Sheet size within max",
      status: "warn",
      message: "Overall dimensions not fully specified.",
    });
  } else if (exceedsMax) {
    const snapW = w >= h ? Math.min(w, Math.max(maxW, maxH)) : Math.min(w, Math.min(maxW, maxH));
    const snapH = w >= h ? Math.min(h, Math.min(maxW, maxH)) : Math.min(h, Math.max(maxW, maxH));
    rules.push({
      id: "sheet",
      label: "Sheet size within max",
      status: "fail",
      message: `Part exceeds ${maxW}"×${maxH}" max for ${mat.name}${maxCite}.`,
      suggestion: { width: snapW, height: snapH },
    });
    snapped.width = snapW;
    snapped.height = snapH;
  } else {
    rules.push({
      id: "sheet",
      label: "Sheet size within max",
      status: "pass",
      message: `${w}"×${h}" fits ${maxW}"×${maxH}" max${maxCite}.`,
    });
  }

  // Live rule: SCS publishes a per-SKU minimum part size (min_part_length ×
  // min_part_width). Read conservatively — a part under the min width in BOTH
  // directions can't be cut at all (fail); one whose long side is under
  // min_part_length is probably too small but may still be orientable inside
  // the published envelope (warn).
  if (live && w != null && h != null && (live.minPartWidth != null || live.minPartLength != null)) {
    const minPW = live.minPartWidth;
    const minPL = live.minPartLength;
    const envelope = `${minPL ?? "?"}"×${minPW ?? "?"}"`;
    if (minPW != null && w < minPW && h < minPW) {
      rules.push({
        id: "min-part-size",
        label: "Part meets SCS minimum size",
        status: "fail",
        message: `${w}"×${h}" is below the ${envelope} minimum part size for ${live.sku} (${citeCutting(live.sku, "min_part_width")}).`,
      });
    } else if (minPL != null && Math.max(w, h) < minPL) {
      rules.push({
        id: "min-part-size",
        label: "Part meets SCS minimum size",
        status: "warn",
        message: `Longest side ${Math.max(w, h)}" is under the ${minPL}" minimum part length for ${live.sku} (${citeCutting(live.sku, "min_part_length")}).`,
      });
    } else {
      rules.push({
        id: "min-part-size",
        label: "Part meets SCS minimum size",
        status: "pass",
        message: `${w}"×${h}" clears the ${envelope} minimum for ${live.sku}.`,
      });
    }
  }

  // Rule 4: Hole diameter vs thickness
  const holes = safeParseHoles(spec.holePattern);
  if (holes && effectiveT != null) {
    // The live SKU's published min_hole_size replaces both the global 0.04"
    // floor and the 1×-thickness multiplier heuristic.
    const liveMinHole = live?.minHoleSize ?? null;
    const minHole = liveMinHole ?? Math.max(0.04, effectiveT * mat.minHoleMultiplier);
    const holeLabel = liveMinHole != null ? "Min hole ≥ SCS minimum" : "Min hole ≥ thickness";
    const holeBasis =
      liveMinHole != null && live ? ` (${citeCutting(live.sku, "min_hole_size")})` : " (1× thickness)";
    if (holes.diameter < minHole) {
      const snapD = Math.round(minHole * 1000) / 1000;
      const newPattern = JSON.stringify({ ...holes, diameter: snapD });
      rules.push({
        id: "hole-diameter",
        label: holeLabel,
        status: "fail",
        message: `${holes.diameter}" hole is below ${minHole.toFixed(3)}" minimum${holeBasis}.`,
        suggestion: { holePattern: newPattern },
      });
      snapped.holePattern = newPattern;
    } else {
      rules.push({
        id: "hole-diameter",
        label: holeLabel,
        status: "pass",
        message:
          liveMinHole != null && live
            ? `${holes.diameter}" ≥ ${minHole.toFixed(3)}" minimum${holeBasis}.`
            : `${holes.diameter}" ≥ ${minHole.toFixed(3)}" minimum.`,
      });
    }

    // Rule 5: Hole-to-edge spacing
    const margin = DEFAULT_HOLE_INSET;
    const minEdge = effectiveT * 2;
    if (margin < minEdge) {
      rules.push({
        id: "hole-edge",
        label: "Hole-to-edge ≥ 2× thickness",
        status: "warn",
        message: `Corner margin ${margin}" is below recommended ${minEdge.toFixed(3)}".`,
      });
    } else {
      rules.push({
        id: "hole-edge",
        label: "Hole-to-edge ≥ 2× thickness",
        status: "pass",
        message: `Margin ${margin}" ≥ ${minEdge.toFixed(3)}".`,
      });
    }
  } else if (holes) {
    rules.push({
      id: "hole-diameter",
      label: "Min hole ≥ thickness",
      status: "na",
      message: "Holes present but thickness undefined.",
    });
  } else {
    rules.push({
      id: "hole-diameter",
      label: "Min hole ≥ thickness",
      status: "na",
      message: "No holes in this part.",
    });
  }

  // Rule 6: Bend radius
  const angles = safeParseAngles(spec.bendAngles);
  if (angles.length > 0) {
    // With live data the per-SKU `bending_specs` block (or its absence) is
    // authoritative: SCS gates bending per thickness, not per material, so the
    // snapshot's whole-material `canBend` flag is the coarser signal.
    const bendingOffered = live ? live.bending != null : mat.canBend;
    if (!bendingOffered) {
      rules.push({
        id: "bend-allowed",
        label: "Bending supported",
        status: "fail",
        message: live
          ? `SCS does not offer bending for this SKU (${live.sku}, ${mat.name}${live.thickness != null ? ` ${live.thickness}"` : ""}) — no bending_specs in sendcutsend-specs.json materials[sku=${live.sku}]. Remove bends or change material/thickness.`
          : `${mat.name} cannot be bent by Send Cut Send. Remove bends or change material.`,
        suggestion: { bendAngles: "[]", bendRadius: null },
      });
      snapped.bendAngles = "[]";
      snapped.bendRadius = null;
    } else if (effectiveT != null) {
      const minR = Math.round(effectiveT * mat.bendRadiusMultiplier * 1000) / 1000;
      const r = spec.bendRadius ?? 0;
      if (r < minR) {
        rules.push({
          id: "bend-radius",
          label: "Bend radius ≥ material min",
          status: "fail",
          message: `Bend radius ${r}" is below ${minR}" minimum for ${effectiveT}" ${mat.name}.`,
          suggestion: { bendRadius: minR },
        });
        snapped.bendRadius = minR;
      } else {
        rules.push({
          id: "bend-radius",
          label: "Bend radius ≥ material min",
          status: "pass",
          message: `Bend radius ${r}" ≥ ${minR}" minimum.`,
        });
      }
    }

    // Live bending limits. Warn where the geometry reasoning is approximate
    // (we don't know which edge the bend runs along); fail only on the angle,
    // which is a direct cited violation.
    const bending = live?.bending ?? null;
    if (live && bending) {
      const effR = bending.effectiveBendRadius;
      if (effR != null) {
        const r = spec.bendRadius ?? 0;
        if (r < effR) {
          rules.push({
            id: "bend-effective-radius",
            label: "Bend radius matches SCS tooling",
            status: "warn",
            message: `Requested R${r}" is tighter than the R${effR}" Send Cut Send tools ${live.sku} at — the formed radius will come out near R${effR}" (${citeBending(live.sku, "effective_bend_radius")}).`,
          });
        } else {
          rules.push({
            id: "bend-effective-radius",
            label: "Bend radius matches SCS tooling",
            status: "pass",
            message: `R${r}" ≥ the R${effR}" SCS tools ${live.sku} at.`,
          });
        }
      }

      const maxAngle = bending.maxBendAngle;
      if (maxAngle != null) {
        const over = angles.filter((a) => a > maxAngle);
        if (over.length > 0) {
          rules.push({
            id: "bend-max-angle",
            label: "Bend angle within SCS max",
            status: "fail",
            message: `Bend angle${over.length > 1 ? "s" : ""} ${over.join("°, ")}° exceed${over.length > 1 ? "" : "s"} the ${maxAngle}° maximum for ${live.sku} (${citeBending(live.sku, "max_bend_angle")}).`,
          });
        } else {
          rules.push({
            id: "bend-max-angle",
            label: "Bend angle within SCS max",
            status: "pass",
            message: `All bend angles within the ${maxAngle}° maximum for ${live.sku}.`,
          });
        }
      }

      // Approximate: the bend line can't be longer than the part's longest
      // side, so compare against that rather than guessing the bend axis.
      const maxBendLen = bending.maxBendLength;
      if (maxBendLen != null && w != null && h != null && Math.max(w, h) > maxBendLen) {
        rules.push({
          id: "bend-length",
          label: "Bend line within SCS press capacity",
          status: "warn",
          message: `Longest side ${Math.max(w, h)}" exceeds the ${maxBendLen}" max bend length for ${live.sku} — a bend running that way won't fit the press brake (${citeBending(live.sku, "max_bend_length")}).`,
        });
      }
    }
  } else {
    rules.push({
      id: "bend-radius",
      label: "Bend radius ≥ material min",
      status: "na",
      message: "No bends specified.",
    });
  }

  // Rule 7: Powder coat compatibility
  if (spec.powderCoat) {
    if (!mat.canPowderCoat) {
      rules.push({
        id: "powder-coat",
        label: "Powder coat available",
        status: "fail",
        message: `${mat.name} is not powder-coated by Send Cut Send.`,
        suggestion: { powderCoat: false, powderCoatColor: null },
      });
      snapped.powderCoat = false;
      snapped.powderCoatColor = null;
    } else if (
      spec.powderCoatColor &&
      !POWDER_COAT_COLORS.includes(spec.powderCoatColor as (typeof POWDER_COAT_COLORS)[number])
    ) {
      rules.push({
        id: "powder-coat",
        label: "Powder coat available",
        status: "warn",
        message: `Color "${spec.powderCoatColor}" not in standard palette — defaulting to Black.`,
        suggestion: { powderCoatColor: "Black" },
      });
      snapped.powderCoatColor = "Black";
    } else {
      rules.push({
        id: "powder-coat",
        label: "Powder coat available",
        status: "pass",
        message: `Powder coat ${spec.powderCoatColor ?? "Black"} OK on ${mat.name}.`,
      });
    }
  } else {
    rules.push({
      id: "powder-coat",
      label: "Powder coat available",
      status: "na",
      message: "No finish requested.",
    });
  }

  // Rule 8: Hole and slot patterns fit within the part perimeter. Catches the
  // snowman-washer failure mode where a pattern radius / oversized feature
  // punches through the outside edge.
  if (w != null && h != null) {
    const minDim = Math.min(w, h);
    const failures: string[] = [];
    if (holes) {
      const requiredSpan = holes.diameter + 2 * DEFAULT_HOLE_INSET;
      if (requiredSpan > minDim) {
        failures.push(
          `Ø${holes.diameter}" holes with ${DEFAULT_HOLE_INSET}" inset need at least ${requiredSpan.toFixed(3)}" of clear space — part is only ${minDim}" on its short side.`,
        );
      }
    }
    // Slot fit: a slot needs (length + 2*inset) along its long axis and
    // (width + 2*inset) across. We don't know slot orientation from the
    // legacy spec, so check the worst case against minDim.
    const slots = safeParseSlots(spec);
    if (slots) {
      const requiredSpan = Math.max(slots.length, slots.width) + 2 * DEFAULT_SLOT_INSET;
      if (requiredSpan > minDim) {
        failures.push(
          `${slots.length}"×${slots.width}" slots with ${DEFAULT_SLOT_INSET}" inset need at least ${requiredSpan.toFixed(3)}" of clear space — part is only ${minDim}" on its short side.`,
        );
      }
    }
    if (failures.length > 0) {
      rules.push({
        id: "pattern-fit",
        label: "Features fit inside perimeter",
        status: "fail",
        message: failures.join(" "),
      });
    } else if (holes || slots) {
      rules.push({
        id: "pattern-fit",
        label: "Features fit inside perimeter",
        status: "pass",
        message: `Pattern fits within ${w}"×${h}" perimeter.`,
      });
    } else {
      rules.push({
        id: "pattern-fit",
        label: "Features fit inside perimeter",
        status: "na",
        message: "No hole or slot pattern to check.",
      });
    }
  } else {
    rules.push({
      id: "pattern-fit",
      label: "Features fit inside perimeter",
      status: "na",
      message: "Dimensions not specified.",
    });
  }

  // Rule: mounting holes must match the clearance size for the fastener in
  // assemblyRefs. If the user adds a 1/4-20 cap screw the mounting_hole must
  // be 0.266", not 0.25" (nominal) or 0.125" (half-size).
  const mountingHoles = safeParseHoles(spec.holePattern);
  const fasteners = Array.isArray(spec.assemblyRefs) ? spec.assemblyRefs : [];
  const fastenerThreads = fasteners
    .map((f) => threadFromPartNumber(f.mcmasterPartNumber))
    .filter((t): t is ThreadSpec => t != null);

  if (fastenerThreads.length > 0 && mountingHoles) {
    // Use the largest thread (assume bigger wins when multiple fasteners disagree).
    const primary = fastenerThreads.reduce((a, b) =>
      a.clearanceIn >= b.clearanceIn ? a : b,
    );
    const clearance = primary.clearanceIn;
    const diff = Math.abs(mountingHoles.diameter - clearance);
    if (diff <= 0.005) {
      rules.push({
        id: "fastener-clearance",
        label: "Mounting holes match fastener thread",
        status: "pass",
        message: `Ø${mountingHoles.diameter.toFixed(3)}\" is the correct clearance hole for ${primary.label}.`,
      });
    } else if (mountingHoles.diameter < primary.nominalIn) {
      rules.push({
        id: "fastener-clearance",
        label: "Mounting holes too small for fastener",
        status: "fail",
        message: `Ø${mountingHoles.diameter.toFixed(3)}\" is smaller than the ${primary.label} nominal diameter (${primary.nominalIn.toFixed(3)}\"). Use Ø${clearance.toFixed(3)}\" clearance instead.`,
        suggestion: {
          holePattern: JSON.stringify({
            count: mountingHoles.count,
            diameter: clearance,
            pattern: mountingHoles.pattern,
          }),
        },
      });
      snapped.holePattern = JSON.stringify({
        count: mountingHoles.count,
        diameter: clearance,
        pattern: mountingHoles.pattern,
      });
    } else {
      rules.push({
        id: "fastener-clearance",
        label: "Mounting holes sized for different fastener",
        status: "warn",
        message: `Ø${mountingHoles.diameter.toFixed(3)}\" doesn't match ${primary.label} clearance (Ø${clearance.toFixed(3)}\"). Holes will be sloppy or the screw won't fit cleanly.`,
        suggestion: {
          holePattern: JSON.stringify({
            count: mountingHoles.count,
            diameter: clearance,
            pattern: mountingHoles.pattern,
          }),
        },
      });
    }
  } else if (fasteners.length > 0 && fastenerThreads.length === 0) {
    rules.push({
      id: "fastener-clearance",
      label: "Assembly parts attached",
      status: "pass",
      message: `${fasteners.length} assembly part${fasteners.length === 1 ? "" : "s"} attached (no threaded fasteners to match to mounting holes).`,
    });
  }

  const hasFailures = rules.some((r) => r.status === "fail");
  return { rules, hasFailures, snappedSpec: snapped };
}

export function applySnap(spec: SpecInput, snap: Partial<SpecInput>): SpecInput {
  return { ...spec, ...snap };
}
