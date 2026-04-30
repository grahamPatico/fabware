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
  // Pre-check: for modify_sketch, guard missing sketch early
  if (patch.kind === "modify_sketch") {
    if (!parent.sketches[patch.sketchId]) {
      return {
        ir: parent,
        schemaViolations: [{
          ruleId: "schema.unresolved-sketch-ref",
          severity: "error",
          message: `Sketch "${patch.sketchId}" not found`,
          agentMessage: `No sketch with id "${patch.sketchId}" exists. Check the sketch id and try again.`,
        }],
      };
    }
  }

  // Pre-check: for add_sketch, guard duplicate sketch id
  if (patch.kind === "add_sketch") {
    if (parent.sketches[patch.sketch.id]) {
      return {
        ir: parent,
        schemaViolations: [{
          ruleId: "schema.duplicate-sketch-id",
          severity: "error",
          message: `Sketch id "${patch.sketch.id}" already exists`,
          agentMessage: `A sketch with id "${patch.sketch.id}" already exists. Use a unique id.`,
        }],
      };
    }
  }

  // Pre-check: for patches targeting existing features, guard missing target early
  if (
    patch.kind === "modify_feature" ||
    patch.kind === "suppress" ||
    patch.kind === "unsuppress" ||
    patch.kind === "reorder_feature"
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

  // For reorder_feature, also guard the anchor feature (beforeFeatureId / afterFeatureId)
  if (patch.kind === "reorder_feature") {
    const anchorId = patch.beforeFeatureId ?? patch.afterFeatureId;
    if (anchorId !== undefined) {
      const anchorExists = parent.features.some(f => f.id === anchorId);
      if (!anchorExists) {
        return {
          ir: parent,
          schemaViolations: [{
            ruleId: "schema.unresolved-feature-ref",
            severity: "error",
            message: `reorder_feature anchor "${anchorId}" not found`,
            agentMessage: `No feature with id "${anchorId}" exists.`,
            location: { kind: "feature", id: anchorId },
          }],
        };
      }
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
    case "reorder_feature": {
      const fromIdx = parent.features.findIndex(f => f.id === patch.featureId);
      if (fromIdx === -1) return parent;
      const moved = parent.features[fromIdx];
      const remaining = [
        ...parent.features.slice(0, fromIdx),
        ...parent.features.slice(fromIdx + 1),
      ];
      let toIdx: number;
      if (patch.beforeFeatureId !== undefined) {
        toIdx = remaining.findIndex(f => f.id === patch.beforeFeatureId);
        if (toIdx === -1) return parent;
      } else if (patch.afterFeatureId !== undefined) {
        const afterIdx = remaining.findIndex(f => f.id === patch.afterFeatureId);
        if (afterIdx === -1) return parent;
        toIdx = afterIdx + 1;
      } else {
        // No anchor: move to end
        return { ...parent, features: [...remaining, moved] };
      }
      return {
        ...parent,
        features: [...remaining.slice(0, toIdx), moved, ...remaining.slice(toIdx)],
      };
    }
    case "remove": {
      if (patch.entityType === "parameter") {
        const { [patch.id]: _removed, ...rest } = parent.parameters;
        return { ...parent, parameters: rest };
      }
      if (patch.entityType === "sketch") {
        const { [patch.id]: _removed, ...rest } = parent.sketches;
        return { ...parent, sketches: rest };
      }
      if (patch.entityType === "feature") {
        return {
          ...parent,
          features: parent.features.filter(f => f.id !== patch.id),
        };
      }
      return parent;
    }

    case "add_sketch":
      return {
        ...parent,
        sketches: { ...parent.sketches, [patch.sketch.id]: patch.sketch },
      };

    case "modify_sketch": {
      const sketch = parent.sketches[patch.sketchId];
      if (!sketch) return parent;

      const op = patch.op;
      if (op.kind === "set_plane") {
        return {
          ...parent,
          sketches: {
            ...parent.sketches,
            [patch.sketchId]: { ...sketch, plane: op.plane },
          },
        };
      }
      if (op.kind === "add_entity") {
        return {
          ...parent,
          sketches: {
            ...parent.sketches,
            [patch.sketchId]: {
              ...sketch,
              geometry: [...sketch.geometry, op.entity],
            },
          },
        };
      }
      if (op.kind === "remove_entity") {
        return {
          ...parent,
          sketches: {
            ...parent.sketches,
            [patch.sketchId]: {
              ...sketch,
              geometry: sketch.geometry.filter((g) => g.id !== op.entityId),
            },
          },
        };
      }
      if (op.kind === "modify_entity") {
        const geometry = sketch.geometry.map((g) =>
          g.id === op.entityId
            ? ({ ...g, ...op.changes } as never)
            : g,
        );
        return {
          ...parent,
          sketches: {
            ...parent.sketches,
            [patch.sketchId]: { ...sketch, geometry },
          },
        };
      }
      return parent;
    }
  }
}
