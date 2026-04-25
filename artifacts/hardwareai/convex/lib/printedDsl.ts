import { z } from "zod/v4";

export const PRINTED_MATERIALS = ["PLA", "PETG", "Nylon", "ABS", "Resin"] as const;

const Box = z.object({
  kind: z.literal("box"),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
});

const Cylinder = z.object({
  kind: z.literal("cylinder"),
  radius: z.number().positive(),
  height: z.number().positive(),
});

const PlateWithHoles = z.object({
  kind: z.literal("plate_with_holes"),
  width: z.number().positive(),
  depth: z.number().positive(),
  thickness: z.number().positive(),
  holes: z.array(z.object({
    x: z.number(), y: z.number(),
    diameter: z.number().positive(),
  })).default([]),
});

const Primitive = z.discriminatedUnion("kind", [Box, Cylinder, PlateWithHoles]);

const HoleThrough = z.object({
  kind: z.literal("hole_through"),
  name: z.string(),
  x: z.number(), y: z.number(),
  diameter: z.number().positive(),
});

const Boss = z.object({
  kind: z.literal("boss"),
  name: z.string(),
  x: z.number(), y: z.number(),
  diameter: z.number().positive(),
  height: z.number().positive(),
});

const Pocket = z.object({
  kind: z.literal("pocket"),
  name: z.string(),
  x: z.number(), y: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  depthZ: z.number().positive(),
});

const Feature = z.discriminatedUnion("kind", [HoleThrough, Boss, Pocket]);

export const PrintedDslSchema = z.object({
  version: z.literal(1),
  kind: z.literal("printed"),
  material: z.enum(PRINTED_MATERIALS),
  layerHeight: z.number().positive(),  // mm
  infill: z.number().min(0).max(1),
  primitive: Primitive,
  features: z.array(Feature).default([]),
});
export type PrintedDsl = z.infer<typeof PrintedDslSchema>;

export function emptyPrintedDsl(): PrintedDsl {
  return {
    version: 1,
    kind: "printed",
    material: "PLA",
    layerHeight: 0.2,
    infill: 0.2,
    primitive: { kind: "box", width: 40, depth: 30, height: 5 },
    features: [],
  };
}

export function summarizePrinted(dsl: PrintedDsl): string {
  const p = dsl.primitive;
  const dim = p.kind === "box"
    ? `${p.width}×${p.depth}×${p.height} mm`
    : p.kind === "cylinder"
      ? `Ø${p.radius * 2}×${p.height} mm`
      : `${p.width}×${p.depth}×${p.thickness} mm plate`;
  return `${dsl.material}, ${dim}, ${dsl.features.length} feature${dsl.features.length === 1 ? "" : "s"}`;
}

export function boundingBox(dsl: PrintedDsl): { w: number; d: number; h: number } {
  const p = dsl.primitive;
  if (p.kind === "box") return { w: p.width, d: p.depth, h: p.height };
  if (p.kind === "cylinder") return { w: p.radius * 2, d: p.radius * 2, h: p.height };
  return { w: p.width, d: p.depth, h: p.thickness };
}
