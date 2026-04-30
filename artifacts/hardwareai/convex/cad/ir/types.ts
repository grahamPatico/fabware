// artifacts/hardwareai/convex/cad/ir/types.ts
//
// All CAD IR TypeScript types. Intent layer only — no kernel-internal types here.

export type Units = "mm" | "in";

export type ParamId   = string; // ^[a-z][a-z0-9_]{0,31}$
export type SketchId  = string;
export type FeatureId = string;
export type PartId    = string;
export type JointId   = string;

export type FaceId    = string; // kernel-assigned: <featureId>.<tag>
export type EdgeId    = string;
export type VertexId  = string;

export type ParamRef = ParamId | number; // expression-string handled by evaluator

export interface ParameterDef {
  id: ParamId;
  value: number | string;          // string = expression
  unit?: "mm" | "in" | "deg" | "rad";
  description?: string;
  bounds?: { min?: number; max?: number };
}

export type PlaneRef =
  | "XY" | "XZ" | "YZ"
  | { face: FaceId };

export type Point2D = { x: ParamRef; y: ParamRef };

export type SketchEntity =
  | { kind: "rect"; id: string; center: Point2D; width: ParamRef; height: ParamRef; cornerRadius?: ParamRef }
  | { kind: "circle"; id: string; center: Point2D; radius: ParamRef }
  | { kind: "line"; id: string; p1: Point2D; p2: Point2D };

export interface SketchDef {
  id: SketchId;
  plane: PlaneRef;
  geometry: SketchEntity[];
}

export type FaceRef = { feature: FeatureId; tag: string };
export type EdgeQuery = "all" | "top_loop" | "bottom_loop" | { tag: string };
export type EdgeRef = { feature: FeatureId; query: EdgeQuery };

export interface BaseFeature {
  id: FeatureId;
  suppressed?: boolean;
  description?: string;
}

export interface ExtrudeFeature extends BaseFeature {
  kind: "extrude";
  profile: SketchId;
  distance: ParamRef;
  operation: "new_body" | "add" | "cut" | "intersect";
  direction?: "forward" | "reverse" | "symmetric";
}

export interface CutExtrudeFeature extends BaseFeature {
  kind: "cut_extrude";
  profile: SketchId;
  distance: ParamRef;
  through?: boolean;
}

export interface FilletFeature extends BaseFeature {
  kind: "fillet";
  edges: EdgeRef[];
  radius: ParamRef;
}

export interface ChamferFeature extends BaseFeature {
  kind: "chamfer";
  edges: EdgeRef[];
  distance: ParamRef;
}

export interface CounterSinkSpec {
  angle: ParamRef;   // included angle in degrees, e.g. 82 or 90
  diameter: ParamRef; // outer (large) diameter of the countersink
}

export interface CounterBoreSpec {
  diameter: ParamRef; // counterbore diameter (> hole diameter)
  depth: ParamRef;    // counterbore depth
}

export interface ThreadSpec {
  spec: string; // e.g. "M6x1.0", "1/4-20"
}

export interface HoleFeature extends BaseFeature {
  kind: "hole";
  face: FaceRef;
  positions: Point2D[];
  diameter: ParamRef;
  depth?: ParamRef;
  type: "simple" | "countersink" | "counterbore" | "threaded";
  countersink?: CounterSinkSpec;
  counterbore?: CounterBoreSpec;
  thread?: ThreadSpec;
}

export interface PatternFeature extends BaseFeature {
  kind: "pattern";
  source: FeatureId;            // feature to replicate
  axis: "x" | "y" | "z";
  count: number;
  spacing: ParamRef;
}

export interface RevolveFeature extends BaseFeature {
  kind: "revolve";
  profile: SketchId;
  axis: "x" | "y" | "z";
  angle: ParamRef;              // degrees (0 < angle ≤ 360)
}

export interface ShellFeature extends BaseFeature {
  kind: "shell";
  thickness: ParamRef;
  removedFaces: FaceRef[];      // faces to open (at least one)
}

export interface BendFlangeFeature extends BaseFeature {
  kind: "bend_flange";
  face: FaceRef;
  angle: ParamRef;              // bend angle in degrees
  radius: ParamRef;             // inner bend radius
  length: ParamRef;             // flange length
  thickness: ParamRef;          // sheet thickness
}

export interface SweepFeature extends BaseFeature {
  kind: "sweep";
  profile: SketchId;            // cross-section sketch
  path: SketchId;               // sweep-path sketch (line/spline)
}

export interface LoftFeature extends BaseFeature {
  kind: "loft";
  profiles: SketchId[];         // ordered list of ≥ 2 profile sketches to loft through
}

export interface WeldTabFeature extends BaseFeature {
  kind: "weld_tab";
  face: FaceRef;                // host face to attach the tab to
  length: ParamRef;             // tab length
  width: ParamRef;              // tab width
  thickness: ParamRef;          // tab thickness
  position: Point2D;            // 2-D offset of tab centre on the face
}

export type Feature =
  | ExtrudeFeature | CutExtrudeFeature
  | FilletFeature | ChamferFeature
  | HoleFeature | PatternFeature
  | RevolveFeature | ShellFeature | BendFlangeFeature
  | SweepFeature | LoftFeature | WeldTabFeature;

export interface EntityRegistry {
  faces:    Record<FaceId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  edges:    Record<EdgeId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  vertices: Record<VertexId, { feature: FeatureId; tag: string }>;
}

export interface CadIr {
  schemaVersion: 1;
  units: Units;
  parameters: Record<ParamId, ParameterDef>;
  sketches:   Record<SketchId, SketchDef>;
  features:   Feature[];
  entities?: EntityRegistry;
  // Phase 4: assembly fields (optional — single-part IRs omit them)
  parts?:       Record<PartId, PartRef>;
  joints?:      Record<JointId, Joint>;
  connections?: Connection[];
}

// ── Phase 4: Assembly types ──────────────────────────────────────────────────

/** Reference to a child part sub-assembly placed in an assembly. */
export interface PartRef {
  id: PartId;
  /** Inline CadIr for the sub-part. Recursive — assembles from IRs all the way down. */
  ir: CadIr;
  /** Translation offset of the part origin in the assembly frame (in assembly units). */
  origin?: { x: number; y: number; z: number };
  /** Euler rotation of the part in the assembly frame (degrees: rx, ry, rz). */
  rotation?: { rx: number; ry: number; rz: number };
}

/**
 * Axis reference: either a named standard axis or a geometry query.
 * The URDF compiler uses "standard" axes (x/y/z); "edge" requires geometry resolution.
 */
export type AxisRef =
  | { kind: "standard"; axis: "x" | "y" | "z" }
  | { kind: "edge"; part: PartId; feature: FeatureId; query: EdgeQuery };

/** Kinematic joint between two parts in an assembly. */
export interface Joint {
  id: JointId;
  parent: PartId;
  child: PartId;
  type: "fixed" | "revolute" | "linear";
  axis?: AxisRef;
  limits?: {
    lower: number;
    upper: number;
    unit: "deg" | "rad" | "mm" | "in";
  };
  origin?: { x: number; y: number; z: number };
}

/** Geometric/interface connection between two features (e.g. mating faces). */
export interface Connection {
  partA: PartId;
  featureA: FeatureId;
  partB: PartId;
  featureB: FeatureId;
  type: "face_mate" | "bolt_pattern" | "snap_fit";
}
