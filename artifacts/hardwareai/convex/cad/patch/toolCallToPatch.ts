// convex/cad/patch/toolCallToPatch.ts
//
// Pure helper: convert an agent-emitted tool call (name + input) into a typed
// Patch object, or null if the tool name is unrecognized or the input shape
// is invalid. Lives here (not in the specialist) so unit tests can exercise
// the dispatcher round-trip (agent tool call → Patch → applyPatch → compile)
// without pulling in Convex/anthropic dependencies.

import type { Patch } from "./types";
import type {
  CadIr,
  Connection,
  ExternalPartRef,
  Feature,
  Joint,
  ParameterDef,
  PartRef,
  PlaneRef,
  SketchConstraint,
  SketchDef,
  SketchEntity,
} from "../ir/types";

/**
 * Convert an agent tool call (name + input) to a typed Patch, or null if the
 * tool name is not recognized or the input shape is invalid.
 *
 * The dispatcher is intentionally permissive about pass-through fields (e.g.
 * `origin`, `rotation`) — applyPatch / the schema-tier validator catches
 * structural errors. The dispatcher's job is to (1) reject obviously-malformed
 * tool calls and (2) pluck and propagate every documented field on the tool
 * input into the constructed Patch.
 */
export function toolCallToPatch(tool: { name: string; input: unknown }): Patch | null {
  const inp = tool.input as Record<string, unknown>;

  if (tool.name === "set_parameter") {
    if (
      typeof inp?.id !== "string" ||
      (typeof inp?.value !== "number" && typeof inp?.value !== "string")
    ) {
      return null;
    }
    const param: ParameterDef = {
      id: inp.id as string,
      value: inp.value as number | string,
      unit: inp.unit as ParameterDef["unit"],
      description: typeof inp.description === "string" ? inp.description : undefined,
      bounds: inp.bounds as ParameterDef["bounds"],
    };
    return { kind: "set_parameter", param };
  }

  if (tool.name === "add_feature") {
    if (!inp?.feature || typeof inp.feature !== "object") return null;
    return { kind: "add_feature", feature: inp.feature as Feature };
  }

  if (tool.name === "modify_feature") {
    if (typeof inp?.featureId !== "string" || !inp?.changes || typeof inp.changes !== "object") return null;
    return { kind: "modify_feature", featureId: inp.featureId, changes: inp.changes as Partial<Feature> };
  }

  if (tool.name === "suppress") {
    if (typeof inp?.featureId !== "string") return null;
    return { kind: "suppress", featureId: inp.featureId };
  }

  if (tool.name === "unsuppress") {
    if (typeof inp?.featureId !== "string") return null;
    return { kind: "unsuppress", featureId: inp.featureId };
  }

  if (tool.name === "reorder_feature") {
    if (typeof inp?.featureId !== "string") return null;
    return {
      kind: "reorder_feature",
      featureId: inp.featureId,
      beforeFeatureId: typeof inp.beforeFeatureId === "string" ? inp.beforeFeatureId : undefined,
      afterFeatureId: typeof inp.afterFeatureId === "string" ? inp.afterFeatureId : undefined,
    };
  }

  if (tool.name === "remove") {
    if (
      typeof inp?.entityType !== "string" ||
      !["parameter", "sketch", "feature"].includes(inp.entityType) ||
      typeof inp?.id !== "string"
    ) {
      return null;
    }
    return {
      kind: "remove",
      entityType: inp.entityType as "parameter" | "sketch" | "feature",
      id: inp.id,
    };
  }

  if (tool.name === "add_sketch") {
    if (!inp?.sketch || typeof inp.sketch !== "object") return null;
    return { kind: "add_sketch", sketch: inp.sketch as SketchDef };
  }

  if (tool.name === "modify_sketch") {
    if (typeof inp?.sketchId !== "string" || !inp?.op || typeof inp.op !== "object") return null;
    const op = inp.op as Record<string, unknown>;
    if (typeof op.kind !== "string") return null;

    switch (op.kind) {
      case "set_plane":
        if (!op.plane) return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "set_plane", plane: op.plane as PlaneRef } };
      case "add_entity":
        if (!op.entity || typeof op.entity !== "object") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "add_entity", entity: op.entity as SketchEntity } };
      case "remove_entity":
        if (typeof op.entityId !== "string") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "remove_entity", entityId: op.entityId } };
      case "modify_entity":
        if (typeof op.entityId !== "string" || !op.changes) return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "modify_entity", entityId: op.entityId, changes: op.changes as Partial<SketchEntity> } };
      case "add_constraint":
        if (!op.constraint || typeof op.constraint !== "object") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "add_constraint", constraint: op.constraint as SketchConstraint } };
      case "remove_constraint":
        if (typeof op.constraintId !== "string") return null;
        return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "remove_constraint", constraintId: op.constraintId } };
      default:
        return null;
    }
  }

  // ── Phase 4: Assembly tool dispatchers ──────────────────────────────────────

  if (tool.name === "add_part") {
    if (typeof inp?.id !== "string") return null;
    const isExternal = inp?.kind === "external";
    if (isExternal) {
      if (typeof inp?.vendor !== "string" || typeof inp?.partNumber !== "string") return null;
      const part: PartRef = {
        id: inp.id,
        kind: "external",
        vendor: inp.vendor,
        partNumber: inp.partNumber,
        description: typeof inp.description === "string" ? inp.description : undefined,
        origin: inp.origin as PartRef["origin"],
        rotation: inp.rotation as PartRef["rotation"],
        boundingBox: inp.boundingBox as ExternalPartRef["boundingBox"],
        // Phase 19 gap-closure: propagate stepUrl so agent-authored STEP imports
        // round-trip through patch grammar → applyPatch → compileAssembly →
        // emitImportStep. Without this, agents could request external parts
        // with a STEP URL but the URL would be silently dropped before reaching
        // applyPatch, defeating EXTERNAL-01's downstream consumer (Phase 18).
        stepUrl: typeof inp.stepUrl === "string" ? inp.stepUrl : undefined,
      };
      return { kind: "add_part", part };
    }
    // Inline variant (default)
    if (!inp?.ir || typeof inp.ir !== "object") return null;
    const part: PartRef = {
      id: inp.id,
      kind: inp.kind === "inline" ? "inline" : undefined,
      ir: inp.ir as CadIr,
      origin: inp.origin as PartRef["origin"],
      rotation: inp.rotation as PartRef["rotation"],
    };
    return { kind: "add_part", part };
  }

  if (tool.name === "add_joint") {
    if (
      typeof inp?.id !== "string" ||
      typeof inp?.parent !== "string" ||
      typeof inp?.child !== "string" ||
      typeof inp?.type !== "string"
    ) return null;
    const joint: Joint = {
      id: inp.id,
      parent: inp.parent,
      child: inp.child,
      type: inp.type as Joint["type"],
      axis: inp.axis as Joint["axis"],
      limits: inp.limits as Joint["limits"],
      origin: inp.origin as Joint["origin"],
    };
    return { kind: "add_joint", joint };
  }

  if (tool.name === "add_connection") {
    if (
      typeof inp?.partA !== "string" ||
      typeof inp?.featureA !== "string" ||
      typeof inp?.partB !== "string" ||
      typeof inp?.featureB !== "string" ||
      typeof inp?.type !== "string"
    ) return null;
    const connection: Connection = {
      partA: inp.partA,
      featureA: inp.featureA,
      partB: inp.partB,
      featureB: inp.featureB,
      type: inp.type as Connection["type"],
    };
    return { kind: "add_connection", connection };
  }

  return null;
}
