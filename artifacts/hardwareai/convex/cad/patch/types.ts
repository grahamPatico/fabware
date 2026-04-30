// artifacts/hardwareai/convex/cad/patch/types.ts
import type { Feature, SketchDef, SketchEntity, PlaneRef, PartRef, Joint, Connection, SketchConstraint } from "../ir/types";

export interface SetParameterPatch {
  kind: "set_parameter";
  param: import("../ir/types").ParameterDef;
}

export interface AddFeaturePatch {
  kind: "add_feature";
  feature: Feature;
}

export interface ModifyFeaturePatch {
  kind: "modify_feature";
  featureId: string;
  changes: Partial<Feature>;
}

export interface SuppressPatch {
  kind: "suppress" | "unsuppress";
  featureId: string;
}

export interface ReorderFeaturePatch {
  kind: "reorder_feature";
  featureId: string;
  beforeFeatureId?: string;
  afterFeatureId?: string;
}

export interface RemovePatch {
  kind: "remove";
  entityType: "parameter" | "sketch" | "feature";
  id: string;
}

export interface AddSketchPatch {
  kind: "add_sketch";
  sketch: SketchDef;
}

export type ModifySketchOp =
  | { kind: "set_plane"; plane: PlaneRef }
  | { kind: "add_entity"; entity: SketchEntity }
  | { kind: "remove_entity"; entityId: string }
  | { kind: "modify_entity"; entityId: string; changes: Partial<SketchEntity> }
  | { kind: "add_constraint"; constraint: SketchConstraint }
  | { kind: "remove_constraint"; constraintId: string };

export interface ModifySketchPatch {
  kind: "modify_sketch";
  sketchId: string;
  op: ModifySketchOp;
}

// ── Phase 4: Assembly patches ────────────────────────────────────────────────

export interface AddPartPatch {
  kind: "add_part";
  part: PartRef;
}

export interface AddJointPatch {
  kind: "add_joint";
  joint: Joint;
}

export interface AddConnectionPatch {
  kind: "add_connection";
  connection: Connection;
}

export type Patch =
  | SetParameterPatch
  | AddFeaturePatch
  | ModifyFeaturePatch
  | SuppressPatch
  | ReorderFeaturePatch
  | RemovePatch
  | AddSketchPatch
  | ModifySketchPatch
  | AddPartPatch
  | AddJointPatch
  | AddConnectionPatch;
