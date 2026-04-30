// artifacts/hardwareai/convex/cad/ir/schema.ts
import { z } from "zod/v4";

const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const Snake = z.string().regex(NAME_RE, "must be snake_case (a-z, 0-9, _) ≤32 chars");

const ParamRef = z.union([Snake, z.number()]);
const Point2D = z.object({ x: ParamRef, y: ParamRef });

const ParameterDef = z.object({
  id: Snake,
  value: z.union([z.number(), z.string()]),
  unit: z.enum(["mm", "in", "deg", "rad"]).optional(),
  description: z.string().max(200).optional(),
  bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
});

const PlaneRef = z.union([
  z.enum(["XY", "XZ", "YZ"]),
  z.object({ face: z.string() }),
]);

const SketchEntity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"),   id: Snake, center: Point2D, width: ParamRef, height: ParamRef, cornerRadius: ParamRef.optional() }),
  z.object({ kind: z.literal("circle"), id: Snake, center: Point2D, radius: ParamRef }),
  z.object({ kind: z.literal("line"),   id: Snake, p1: Point2D, p2: Point2D }),
]);

const SketchDef = z.object({
  id: Snake,
  plane: PlaneRef,
  geometry: z.array(SketchEntity),
});

const FaceRef = z.object({ feature: Snake, tag: z.string().max(32) });
const EdgeQuery = z.union([
  z.literal("all"),
  z.literal("top_loop"),
  z.literal("bottom_loop"),
  z.object({ tag: z.string().max(32) }),
]);
const EdgeRef = z.object({ feature: Snake, query: EdgeQuery });

const Base = { id: Snake, suppressed: z.boolean().optional(), description: z.string().max(200).optional() };

const ExtrudeFeature = z.object({
  ...Base,
  kind: z.literal("extrude"),
  profile: Snake,
  distance: ParamRef,
  operation: z.enum(["new_body", "add", "cut", "intersect"]),
  direction: z.enum(["forward", "reverse", "symmetric"]).optional(),
});

const CutExtrudeFeature = z.object({
  ...Base,
  kind: z.literal("cut_extrude"),
  profile: Snake,
  distance: ParamRef,
  through: z.boolean().optional(),
});

const FilletFeature = z.object({
  ...Base, kind: z.literal("fillet"), edges: z.array(EdgeRef).min(1), radius: ParamRef,
});
const ChamferFeature = z.object({
  ...Base, kind: z.literal("chamfer"), edges: z.array(EdgeRef).min(1), distance: ParamRef,
});
const THREAD_SPEC_RE = /^(M\d+(\.\d+)?(x\d+(\.\d+)?)?|\d+\/\d+-\d+)$/;

const CounterSinkSpec = z.object({
  angle: ParamRef,
  diameter: ParamRef,
});

const CounterBoreSpec = z.object({
  diameter: ParamRef,
  depth: ParamRef,
});

const ThreadSpec = z.object({
  spec: z.string().regex(THREAD_SPEC_RE, "thread spec must match e.g. M6x1.0 or 1/4-20"),
});

const HoleFeature = z.object({
  ...Base, kind: z.literal("hole"),
  face: FaceRef,
  positions: z.array(Point2D).min(1),
  diameter: ParamRef,
  depth: ParamRef.optional(),
  type: z.enum(["simple", "countersink", "counterbore", "threaded"]),
  countersink: CounterSinkSpec.optional(),
  counterbore: CounterBoreSpec.optional(),
  thread: ThreadSpec.optional(),
}).superRefine((val, ctx) => {
  if (val.type === "countersink" && !val.countersink) {
    ctx.addIssue({ code: "custom", message: "countersink sub-object is required when type is \"countersink\"" });
  }
  if (val.type === "counterbore" && !val.counterbore) {
    ctx.addIssue({ code: "custom", message: "counterbore sub-object is required when type is \"counterbore\"" });
  }
  if (val.type === "threaded" && !val.thread) {
    ctx.addIssue({ code: "custom", message: "thread sub-object is required when type is \"threaded\"" });
  }
});
const PatternFeature = z.object({
  ...Base, kind: z.literal("pattern"),
  source: Snake,
  axis: z.enum(["x", "y", "z"]),
  count: z.number().int().min(2).max(64),
  spacing: ParamRef,
});

export const FeatureSchema = z.discriminatedUnion("kind", [
  ExtrudeFeature, CutExtrudeFeature,
  FilletFeature, ChamferFeature,
  HoleFeature, PatternFeature,
]);

export const CadIrSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.enum(["mm", "in"]),
  parameters: z.record(Snake, ParameterDef),
  sketches: z.record(Snake, SketchDef),
  features: z.array(FeatureSchema),
  entities: z.object({
    faces: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    edges: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    vertices: z.record(z.string(), z.object({ feature: Snake, tag: z.string() })),
  }).optional(),
});
