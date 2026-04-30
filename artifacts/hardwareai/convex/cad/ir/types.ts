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

export interface HoleFeature extends BaseFeature {
  kind: "hole";
  face: FaceRef;
  positions: Point2D[];
  diameter: ParamRef;
  depth?: ParamRef;
  type: "simple"; // countersink/counterbore/threaded come in Phase 3
}

export interface PatternFeature extends BaseFeature {
  kind: "pattern";
  source: FeatureId;            // feature to replicate
  axis: "x" | "y" | "z";
  count: number;
  spacing: ParamRef;
}

export type Feature =
  | ExtrudeFeature | CutExtrudeFeature
  | FilletFeature | ChamferFeature
  | HoleFeature | PatternFeature;

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
}
