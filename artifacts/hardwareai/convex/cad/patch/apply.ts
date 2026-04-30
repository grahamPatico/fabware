// artifacts/hardwareai/convex/cad/patch/apply.ts
import type { CadIr } from "../ir/types";
import type { Patch } from "./types";
import { validateSchemaTier } from "../validate/schemaTier";
import type { Violation } from "../../plugins/types";
import { CadIrSchema } from "../ir/schema";

export interface ApplyResult {
  ir: CadIr;
  schemaViolations: Violation[];
}

export function applyPatch(parent: CadIr, patch: Patch): ApplyResult {
  // Pre-check: for patches targeting existing features, guard missing target early
  if (
    patch.kind === "modify_feature" ||
    patch.kind === "suppress" ||
    patch.kind === "unsuppress"
  ) {
    const exists = parent.features.some(f => f.id === patch.featureId);
    if (!exists) {
      return {
        ir: parent,
        schemaViolations: [{
          ruleId: "schema.unresolved-feature-ref",
          severity: "error",
          message: `${patch.kind} target "${patch.featureId}" not found`,
          agentMessage: `No feature with id "${patch.featureId}" exists.`,
          location: { kind: "feature", id: patch.featureId },
        }],
      };
    }
  }

  const candidate = applyToCandidate(parent, patch);

  // Zod re-validation: catch structurally-invalid patches (e.g. changing feature kind)
  const zodResult = CadIrSchema.safeParse(candidate);
  if (!zodResult.success) {
    return {
      ir: parent,
      schemaViolations: zodResult.error.issues.map(issue => ({
        ruleId: "schema.zod-validation",
        severity: "error",
        message: `${issue.path.join(".")}: ${issue.message}`,
        agentMessage: `Patch produced invalid IR at ${issue.path.join(".")}: ${issue.message}`,
      })),
    };
  }

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
    case "modify_feature": {
      const idx = parent.features.findIndex(f => f.id === patch.featureId);
      if (idx === -1) return parent;
      const existing = parent.features[idx];
      return {
        ...parent,
        features: [
          ...parent.features.slice(0, idx),
          { ...existing, ...patch.changes } as never,
          ...parent.features.slice(idx + 1),
        ],
      };
    }
    case "suppress":
    case "unsuppress": {
      const idx = parent.features.findIndex(f => f.id === patch.featureId);
      if (idx === -1) return parent;
      return {
        ...parent,
        features: [
          ...parent.features.slice(0, idx),
          { ...parent.features[idx], suppressed: patch.kind === "suppress" },
          ...parent.features.slice(idx + 1),
        ],
      };
    }
    case "reorder_feature":
    case "remove":
      throw new Error(`patch kind "${patch.kind}" not yet implemented`);
  }
}
