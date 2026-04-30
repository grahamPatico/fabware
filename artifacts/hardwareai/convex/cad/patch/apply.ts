// artifacts/hardwareai/convex/cad/patch/apply.ts
import type { CadIr } from "../ir/types";
import type { Patch } from "./types";
import { validateSchemaTier } from "../validate/schemaTier";
import type { Violation } from "../../plugins/types";

export interface ApplyResult {
  ir: CadIr;
  schemaViolations: Violation[];
}

export function applyPatch(parent: CadIr, patch: Patch): ApplyResult {
  const candidate = applyToCandidate(parent, patch);
  const violations = validateSchemaTier(candidate);
  if (violations.length > 0) {
    return { ir: parent, schemaViolations: violations };
  }
  return { ir: candidate, schemaViolations: [] };
}

function applyToCandidate(parent: CadIr, patch: Patch): CadIr {
  switch (patch.kind) {
    case "set_parameter":
      return { ...parent, parameters: { ...parent.parameters, [patch.param.id]: patch.param } };
    case "add_feature":
      return { ...parent, features: [...parent.features, patch.feature] };
    case "modify_feature":
    case "suppress":
    case "unsuppress":
    case "reorder_feature":
    case "remove":
      throw new Error(`patch kind "${patch.kind}" not implemented in Phase 1`);
  }
}
