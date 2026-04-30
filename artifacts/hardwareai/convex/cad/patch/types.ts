// artifacts/hardwareai/convex/cad/patch/types.ts
import type { Feature, ParameterDef } from "../ir/types";

export interface SetParameterPatch {
  kind: "set_parameter";
  param: ParameterDef;
}

export interface AddFeaturePatch {
  kind: "add_feature";
  feature: Feature;
}

// Reserved for Phase 2+; included so tests don't break when added.
export interface ModifyFeaturePatch {
  kind: "modify_feature";
  featureId: string;
  changes: Partial<Feature>;
}
export interface SuppressPatch { kind: "suppress" | "unsuppress"; featureId: string; }
export interface ReorderFeaturePatch { kind: "reorder_feature"; featureId: string; beforeFeatureId?: string; afterFeatureId?: string; }
export interface RemovePatch { kind: "remove"; entityType: "parameter" | "sketch" | "feature"; id: string; }

export type Patch =
  | SetParameterPatch
  | AddFeaturePatch
  | ModifyFeaturePatch
  | SuppressPatch
  | ReorderFeaturePatch
  | RemovePatch;
