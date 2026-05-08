// artifacts/hardwareai/convex/cad/validate/schemaTier.ts
import type { CadIr, Feature, SketchConstraint } from "../ir/types";
import type { Violation } from "../../plugins/types";

function v(ruleId: string, message: string, agent: string, location?: Violation["location"]): Violation {
  return { ruleId, severity: "error", message, agentMessage: agent, location };
}

/** Collect all sketch entity ids referenced by a constraint. */
function constraintEntityRefs(c: SketchConstraint): string[] {
  switch (c.kind) {
    case "coincident":
    case "distance":
      return [c.a.entity, c.b.entity];
    case "parallel":
    case "perpendicular":
    case "tangent":
    case "equal":
    case "angle":
      return [c.a, c.b];
    case "horizontal":
    case "vertical":
      return [c.entity];
  }
}

export function validateSchemaTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];
  const seenFeatureIds = new Set<string>();
  const featureIndexById = new Map<string, number>();

  for (let i = 0; i < ir.features.length; i++) {
    const f = ir.features[i];
    if (seenFeatureIds.has(f.id)) {
      out.push(v(
        "schema.duplicate-feature-id",
        `Feature id "${f.id}" is duplicated`,
        `Rename one of the features with id "${f.id}".`,
        { kind: "feature", id: f.id },
      ));
    }
    seenFeatureIds.add(f.id);
    featureIndexById.set(f.id, i);
  }

  function refsToFeatureIds(f: Feature): string[] {
    switch (f.kind) {
      case "fillet":
      case "chamfer":
        return f.edges.map(e => e.feature);
      case "hole":
        return [f.face.feature];
      case "pattern":
        return [f.source];
      default:
        return [];
    }
  }

  for (let i = 0; i < ir.features.length; i++) {
    const f = ir.features[i];
    if (f.kind === "extrude" || f.kind === "cut_extrude") {
      if (!ir.sketches[f.profile]) {
        out.push(v(
          "schema.unresolved-sketch-ref",
          `Feature "${f.id}" references missing sketch "${f.profile}"`,
          `Add a sketch with id "${f.profile}" before feature "${f.id}", or change the profile reference.`,
          { kind: "feature", id: f.id },
        ));
      }
    }
    for (const ref of refsToFeatureIds(f)) {
      const idx = featureIndexById.get(ref);
      if (idx === undefined) {
        out.push(v(
          "schema.unresolved-feature-ref",
          `Feature "${f.id}" references missing feature "${ref}"`,
          `Either add feature "${ref}" before "${f.id}" or change the reference.`,
          { kind: "feature", id: f.id },
        ));
      } else if (idx > i) {
        out.push(v(
          "schema.forward-feature-ref",
          `Feature "${f.id}" references later feature "${ref}"`,
          `Reorder so "${ref}" comes before "${f.id}".`,
          { kind: "feature", id: f.id },
        ));
      }
    }
  }

  // ── Phase 7: Sketch Constraint checks ───────────────────────────────────────

  for (const [sketchId, sketch] of Object.entries(ir.sketches)) {
    if (!sketch.constraints || sketch.constraints.length === 0) continue;

    // Build set of entity ids in this sketch
    const entityIds = new Set(sketch.geometry.map((g) => g.id));

    const seenConstraintIds = new Set<string>();
    for (const c of sketch.constraints) {
      // Duplicate constraint ids
      if (seenConstraintIds.has(c.id)) {
        out.push(v(
          "schema.duplicate-constraint-id",
          `Sketch "${sketchId}" has duplicate constraint id "${c.id}"`,
          `Rename one of the constraints with id "${c.id}" in sketch "${sketchId}".`,
        ));
      }
      seenConstraintIds.add(c.id);

      // Collect entity ids referenced by this constraint
      const referencedEntityIds = constraintEntityRefs(c);
      for (const entityId of referencedEntityIds) {
        if (!entityIds.has(entityId)) {
          out.push(v(
            "schema.constraint-unresolved-entity-ref",
            `Constraint "${c.id}" in sketch "${sketchId}" references missing entity "${entityId}"`,
            `Add entity "${entityId}" to sketch "${sketchId}", or update the constraint reference.`,
          ));
        }
      }
    }
  }

  // ── Phase 4: Joint / Connection checks ──────────────────────────────────────

  const partIds = new Set<string>(Object.keys(ir.parts ?? {}));

  if (ir.joints) {
    const seenJointIds = new Set<string>();
    for (const [, joint] of Object.entries(ir.joints)) {
      // Duplicate joint ids
      if (seenJointIds.has(joint.id)) {
        out.push(v(
          "schema.duplicate-joint-id",
          `Joint id "${joint.id}" is duplicated`,
          `Rename one of the joints with id "${joint.id}".`,
        ));
      }
      seenJointIds.add(joint.id);

      // Joint parent/child must reference known parts
      if (!partIds.has(joint.parent)) {
        out.push(v(
          "schema.joint-missing-part",
          `Joint "${joint.id}" references unknown parent part "${joint.parent}"`,
          `Add a part with id "${joint.parent}" or fix the joint's parent reference.`,
        ));
      }
      if (!partIds.has(joint.child)) {
        out.push(v(
          "schema.joint-missing-part",
          `Joint "${joint.id}" references unknown child part "${joint.child}"`,
          `Add a part with id "${joint.child}" or fix the joint's child reference.`,
        ));
      }
    }
  }

  if (ir.connections) {
    for (const conn of ir.connections) {
      if (!partIds.has(conn.partA)) {
        out.push(v(
          "schema.connection-missing-part",
          `Connection references unknown part "${conn.partA}"`,
          `Add a part with id "${conn.partA}" or fix the connection's partA reference.`,
        ));
      }
      if (!partIds.has(conn.partB)) {
        out.push(v(
          "schema.connection-missing-part",
          `Connection references unknown part "${conn.partB}"`,
          `Add a part with id "${conn.partB}" or fix the connection's partB reference.`,
        ));
      }
    }
  }

  return out;
}
