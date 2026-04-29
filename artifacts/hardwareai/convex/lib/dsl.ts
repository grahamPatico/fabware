import { z } from "zod/v4";

export const DSL_VERSION = 1 as const;

const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SafeName = z
  .string()
  .regex(NAME_RE, "feature name must be snake_case (a-z, 0-9, _) and start with a letter")
  .max(32);
const SafeMaterial = z
  .string()
  .regex(/^[A-Za-z0-9 ()\/\-+.]{1,40}$/, "invalid material name");
const SafeColor = z
  .string()
  .regex(/^[A-Za-z0-9 \-]{1,30}$/, "invalid color");

const HoleSchema = z.object({
  kind: z.literal("hole"),
  name: SafeName,
  count: z.number().int().min(1).max(64),
  diameter: z.number().positive(),
  pattern: z.enum(["corner", "center", "top_row", "bottom_row"]),
  inset: z.number().nullish(),
  // Per-axis inset overrides. When present, take precedence over `inset`.
  // Needed when a part's hole pattern must align with a smaller mating part's
  // pattern (e.g. a bracket bolted to a wider panel).
  insetX: z.number().nullish(),
  insetY: z.number().nullish(),
});

const BendSchema = z.object({
  kind: z.literal("bend"),
  name: SafeName,
  axis: z.enum(["horizontal", "vertical"]),
  positionRatio: z.number().min(0).max(1).default(0.4),
  angle: z.number().min(1).max(180),
  radius: z.number().positive(),
});

const SlotSchema = z.object({
  kind: z.literal("slot"),
  name: SafeName,
  count: z.number().int().min(1).max(16),
  length: z.number().positive(),
  width: z.number().positive(),
  pattern: z.enum(["corner", "center", "top_row", "bottom_row"]),
});

// Tab features extend the part outline — small rectangular protrusions on a
// named edge that pass through matching slots on the mating part. Used as the
// male side of a weld_joint (tab-and-slot) interface.
const TabSchema = z.object({
  kind: z.literal("tab"),
  name: SafeName,
  count: z.number().int().min(1).max(16),
  length: z.number().positive(), // length along the edge
  width: z.number().positive(),  // protrusion depth out of the edge
  edge: z.enum(["top", "bottom", "left", "right"]),
});

const FilletSchema = z.object({
  kind: z.literal("fillet"),
  name: SafeName,
  radius: z.number().positive(),
  corners: z.enum(["all", "top", "bottom"]),
});

export const FeatureSchema = z.discriminatedUnion("kind", [
  HoleSchema,
  BendSchema,
  SlotSchema,
  TabSchema,
  FilletSchema,
]);
export type Feature = z.infer<typeof FeatureSchema>;
export type HoleFeature = z.infer<typeof HoleSchema>;
export type BendFeature = z.infer<typeof BendSchema>;
export type SlotFeatureT = z.infer<typeof SlotSchema>;
export type TabFeature = z.infer<typeof TabSchema>;
export type SlotFeature = z.infer<typeof SlotSchema>;
export type FilletFeature = z.infer<typeof FilletSchema>;

const AssemblyRefSchema = z.object({
  mcmasterPartNumber: z
    .string()
    .regex(/^[A-Z0-9\-]{3,32}$/i, "McMaster part number must be alphanumeric"),
  quantity: z.number().int().min(1).max(10_000),
  role: SafeName.nullish(),
});
export type AssemblyRef = z.infer<typeof AssemblyRefSchema>;

/**
 * Outline shape for a sheet-metal part. Lasers cut any 2D outline from a flat
 * sheet, so the part doesn't have to be a rectangle. `width` / `height` always
 * reflect the AABB of the outline so downstream code (validators, intersection
 * check, BOM, McMaster sizing) stays correct.
 */
const OutlineSchema = z.union([
  z.object({ kind: z.literal("rectangle") }),
  z.object({
    kind: z.literal("polygon"),
    // Points in inches, relative to the part's local origin (bottom-left of AABB).
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
  }),
  z.object({
    kind: z.literal("star"),
    numPoints: z.number().int().min(3).max(64),
    outerRadius: z.number().positive(),
    innerRadius: z.number().positive(),
  }),
  z.object({
    kind: z.literal("circle"),
    radius: z.number().positive(),
  }),
  z.object({
    kind: z.literal("regular_polygon"),
    sides: z.number().int().min(3).max(64),
    radius: z.number().positive(),
  }),
]);
export type Outline = z.infer<typeof OutlineSchema>;

export const PartDslSchema = z.object({
  version: z.literal(DSL_VERSION),
  partType: z.enum(["bracket", "plate", "enclosure", "angle", "channel", "tab", "gusset"]),
  material: SafeMaterial,
  thickness: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive().nullish(),
  outline: OutlineSchema.optional(),
  features: z.array(FeatureSchema).default([]),
  finish: z
    .object({
      type: z.literal("powder_coat"),
      color: SafeColor,
    })
    .nullish(),
  assemblyRefs: z.array(AssemblyRefSchema).default([]).optional(),
});
export type PartDsl = z.infer<typeof PartDslSchema>;

/**
 * Compute the AABB (width, height) of an outline. For rectangles, returns the
 * fallback width/height passed in.
 */
export function outlineAabb(outline: Outline | undefined, fallbackW: number, fallbackH: number): { width: number; height: number } {
  if (!outline || outline.kind === "rectangle") return { width: fallbackW, height: fallbackH };
  if (outline.kind === "circle") return { width: outline.radius * 2, height: outline.radius * 2 };
  if (outline.kind === "star") return { width: outline.outerRadius * 2, height: outline.outerRadius * 2 };
  if (outline.kind === "regular_polygon") return { width: outline.radius * 2, height: outline.radius * 2 };
  // polygon
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline.points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { width: Math.max(maxX - minX, 0.001), height: Math.max(maxY - minY, 0.001) };
}

export function emptyDsl(partType: PartDsl["partType"] = "bracket"): PartDsl {
  return {
    version: DSL_VERSION,
    partType,
    material: "Mild Steel (CRS)",
    thickness: 0.075,
    width: 4,
    height: 3,
    depth: null,
    features: [],
    finish: null,
    assemblyRefs: [],
  };
}

export interface LegacyPartShape {
  partType?: string | null;
  material?: string | null;
  thickness?: number | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  bendAngles?: string | null;
  bendRadius?: number | null;
  holePattern?: string | null;
  powderCoat?: boolean | null;
  powderCoatColor?: string | null;
  assemblyRefs?: Array<{ mcmasterPartNumber: string; quantity: number }> | null;
}

export function dslToLegacy(dsl: PartDsl): LegacyPartShape {
  const hole = dsl.features.find((f): f is HoleFeature => f.kind === "hole");
  const bend = dsl.features.find((f): f is BendFeature => f.kind === "bend");
  return {
    partType: dsl.partType,
    material: dsl.material,
    thickness: dsl.thickness,
    width: dsl.width,
    height: dsl.height,
    depth: dsl.depth ?? null,
    bendAngles: bend ? JSON.stringify([bend.angle]) : "[]",
    bendRadius: bend ? bend.radius : null,
    holePattern: hole
      ? JSON.stringify({ count: hole.count, diameter: hole.diameter, pattern: hole.pattern })
      : null,
    powderCoat: !!dsl.finish,
    powderCoatColor: dsl.finish?.color ?? null,
    assemblyRefs: (dsl.assemblyRefs ?? []).map((r) => ({
      mcmasterPartNumber: r.mcmasterPartNumber,
      quantity: r.quantity,
    })),
  };
}

export function legacyToDsl(spec: LegacyPartShape): PartDsl {
  const dsl: PartDsl = {
    version: DSL_VERSION,
    partType: ((spec.partType as PartDsl["partType"]) ?? "bracket"),
    material: spec.material ?? "Mild Steel (CRS)",
    thickness: spec.thickness ?? 0.075,
    width: spec.width ?? 4,
    height: spec.height ?? 3,
    depth: spec.depth ?? null,
    features: [],
    finish: spec.powderCoat
      ? { type: "powder_coat", color: spec.powderCoatColor ?? "Black" }
      : null,
  };
  if (spec.holePattern) {
    try {
      const h = JSON.parse(spec.holePattern);
      if (h && typeof h.diameter === "number" && typeof h.count === "number") {
        dsl.features.push({
          kind: "hole",
          name: "mounting_hole",
          count: h.count,
          diameter: h.diameter,
          pattern: (h.pattern ?? "corner") as HoleFeature["pattern"],
        });
      }
    } catch {
      // ignore
    }
  }
  if (spec.bendAngles && spec.bendAngles !== "[]") {
    try {
      const angles = JSON.parse(spec.bendAngles);
      if (Array.isArray(angles) && angles.length > 0 && typeof angles[0] === "number") {
        dsl.features.push({
          kind: "bend",
          name: "main_bend",
          axis: "horizontal",
          positionRatio: 0.4,
          angle: angles[0],
          radius: spec.bendRadius ?? 0.062,
        });
      }
    } catch {
      // ignore
    }
  }
  return dsl;
}

export function summarizeDsl(dsl: PartDsl): string {
  const parts: string[] = [];
  parts.push(`${dsl.partType} ${dsl.width}"×${dsl.height}"${dsl.depth ? `×${dsl.depth}"` : ""}`);
  parts.push(`${dsl.material} ${dsl.thickness}"`);
  for (const f of dsl.features) {
    if (f.kind === "hole") parts.push(`${f.count}× Ø${f.diameter}" ${f.pattern} holes`);
    else if (f.kind === "bend") parts.push(`${f.angle}° ${f.axis} bend R${f.radius}"`);
    else if (f.kind === "slot") parts.push(`${f.count}× ${f.length}"×${f.width}" slots`);
    else if (f.kind === "tab") parts.push(`${f.count}× ${f.length}"×${f.width}" tabs on ${f.edge}`);
    else if (f.kind === "fillet") parts.push(`R${f.radius}" fillets (${f.corners})`);
  }
  if (dsl.finish) parts.push(`powder coat ${dsl.finish.color}`);
  if (dsl.assemblyRefs && dsl.assemblyRefs.length > 0) {
    const total = dsl.assemblyRefs.reduce((a, r) => a + r.quantity, 0);
    parts.push(`+${total} assembly part${total === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}
