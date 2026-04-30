// artifacts/hardwareai/convex/cad/patch/types.ts
import type { Feature, SketchDef, SketchEntity, PlaneRef } from "../ir/types";

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
  | { kind: "modify_entity"; entityId: string; changes: Partial<SketchEntity> };

export interface ModifySketchPatch {
  kind: "modify_sketch";
  sketchId: string;
  op: ModifySketchOp;
}

export type Patch =
  | SetParameterPatch
  | AddFeaturePatch
  | ModifyFeaturePatch
  | SuppressPatch
  | ReorderFeaturePatch
  | RemovePatch
  | AddSketchPatch
  | ModifySketchPatch;
