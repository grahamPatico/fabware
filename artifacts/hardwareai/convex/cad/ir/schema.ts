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

// ── Phase 7: Sketch Constraint schemas ──────────────────────────────────────

const SketchPointRef = z.object({
  entity: z.string(),
  point: z.enum(["start", "end", "center"]),
});

export const SketchConstraintSchema = z.discriminatedUnion("kind", [
  // Point-ref constraints
  z.object({ kind: z.literal("coincident"), id: z.string(), a: SketchPointRef, b: SketchPointRef }),
  z.object({ kind: z.literal("distance"),   id: z.string(), a: SketchPointRef, b: SketchPointRef, distance: ParamRef }),
  // Entity-ref pair constraints
  z.object({ kind: z.literal("parallel"),      id: z.string(), a: z.string(), b: z.string() }),
  z.object({ kind: z.literal("perpendicular"), id: z.string(), a: z.string(), b: z.string() }),
  z.object({ kind: z.literal("tangent"),       id: z.string(), a: z.string(), b: z.string() }),
  z.object({ kind: z.literal("equal"),         id: z.string(), a: z.string(), b: z.string() }),
  z.object({ kind: z.literal("angle"),         id: z.string(), a: z.string(), b: z.string(), angle: ParamRef }),
  // Single-entity constraints
  z.object({ kind: z.literal("horizontal"), id: z.string(), entity: z.string() }),
  z.object({ kind: z.literal("vertical"),   id: z.string(), entity: z.string() }),
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
  constraints: z.array(SketchConstraintSchema).optional(),
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

const RevolveFeature = z.object({
  ...Base, kind: z.literal("revolve"),
  profile: Snake,
  axis: z.enum(["x", "y", "z"]),
  angle: ParamRef,
}).superRefine((val, ctx) => {
  const a = typeof val.angle === "number" ? val.angle : null;
  if (a !== null && (a <= 0 || a > 360)) {
    ctx.addIssue({ code: "custom", message: "revolve angle must be > 0 and ≤ 360 degrees" });
  }
});

const ShellFeature = z.object({
  ...Base, kind: z.literal("shell"),
  thickness: ParamRef,
  removedFaces: z.array(FaceRef).min(1),
});

const BendFlangeFeature = z.object({
  ...Base, kind: z.literal("bend_flange"),
  face: FaceRef,
  angle: ParamRef,
  radius: ParamRef,
  length: ParamRef,
  thickness: ParamRef,
});

const SweepFeature = z.object({
  ...Base,
  kind: z.literal("sweep"),
  profile: Snake,
  path: Snake,
});

const LoftFeature = z.object({
  ...Base,
  kind: z.literal("loft"),
  profiles: z.array(Snake).min(2),
});

const WeldTabFeature = z.object({
  ...Base,
  kind: z.literal("weld_tab"),
  face: FaceRef,
  length: ParamRef,
  width: ParamRef,
  thickness: ParamRef,
  position: Point2D,
});

export const FeatureSchema = z.discriminatedUnion("kind", [
  ExtrudeFeature, CutExtrudeFeature,
  FilletFeature, ChamferFeature,
  HoleFeature, PatternFeature,
  RevolveFeature, ShellFeature, BendFlangeFeature,
  SweepFeature, LoftFeature, WeldTabFeature,
]);

// ── Phase 4: Assembly schemas ────────────────────────────────────────────────

// CadIrSchema is self-referential through PartRef.ir. To break the TS cycle
// we annotate CadIrSchema as z.ZodType<unknown> and use z.lazy() for PartRef.
// Callers that need a typed CadIr use `as CadIr` at the parse boundary.

export const CadIrSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
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
    // Phase 4 assembly fields (optional)
    parts: z.record(Snake, PartRefSchema).optional(),
    joints: z.record(Snake, JointSchema).optional(),
    connections: z.array(ConnectionSchema).optional(),
  })
);

// ── Phase 9: PartRef union (inline | external) ───────────────────────────────
//
// InlinePartRef has an OPTIONAL `kind` field (for backward compat with Phase 4
// IRs that omit it). z.discriminatedUnion cannot be used here because the
// discriminator is optional — use z.union instead.
//
// Both schemas use z.lazy so that InlinePartRef.ir can reference CadIrSchema.

const OriginSchema = z.object({ x: ParamRef, y: ParamRef, z: ParamRef });
const RotationSchema = z.object({ rx: ParamRef, ry: ParamRef, rz: ParamRef });

const InlinePartRefSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: Snake,
    kind: z.literal("inline").optional(),
    ir: CadIrSchema,
    origin: OriginSchema.optional(),
    rotation: RotationSchema.optional(),
  })
);

const ExternalPartRefSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: Snake,
    kind: z.literal("external"),
    vendor: z.string().min(1),
    partNumber: z.string().min(1),
    description: z.string().optional(),
    origin: OriginSchema.optional(),
    rotation: RotationSchema.optional(),
    boundingBox: z.object({ width: ParamRef, height: ParamRef, depth: ParamRef }).optional(),
  })
);

// PartRef references CadIrSchema recursively — must use z.lazy
const PartRefSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([InlinePartRefSchema as z.ZodType<unknown>, ExternalPartRefSchema as z.ZodType<unknown>])
);

const AxisRefSchema = z.union([
  z.object({ kind: z.literal("standard"), axis: z.enum(["x", "y", "z"]) }),
  z.object({ kind: z.literal("edge"), part: Snake, feature: Snake, query: EdgeQuery }),
]);

const JointSchema = z.object({
  id: Snake,
  parent: Snake,
  child: Snake,
  type: z.enum(["fixed", "revolute", "linear"]),
  axis: AxisRefSchema.optional(),
  limits: z.object({
    lower: z.number(),
    upper: z.number(),
    unit: z.enum(["deg", "rad", "mm", "in"]),
  }).optional(),
  origin: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
});

const ConnectionSchema = z.object({
  partA: Snake,
  featureA: Snake,
  partB: Snake,
  featureB: Snake,
  type: z.enum(["face_mate", "bolt_pattern", "snap_fit"]),
});
