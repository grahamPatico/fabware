// convex/cad/validate/rules/jointRangeCollision.ts
//
// Tier 5 rule: assembly.joint-range-collision
//
// For each revolute or linear joint with limits, sample 5 poses across
// the joint's motion range. For each pose, transform the child part's
// bounding box and check it against every other part's static bbox.
//
// The child part's bbox is computed in two steps:
//   1. Local bbox (from inline IR or declared boundingBox for external)
//   2. Apply the child's static origin offset (no rotation — that was Phase 8)
//   3. For each sampled pose, apply the pose to the origin-shifted bbox
//
// The joint endpoints (joint.parent and joint.child) are excluded from the
// interference check — the body/lid of a hinged enclosure naturally sweep
// near each other (that's the joint's purpose).
//
// Severity: always "warn" (AABB is conservative — false positives are likely
// for large sweeps near adjacent geometry).

import type { CadIr, InlinePartRef, ExternalPartRef } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import { computePartBbox, type AABB } from "../../geometry/partBbox";
import { transformBbox } from "../../geometry/transform";
import { sampleJointPoses, applyPoseToBbox } from "../../geometry/jointPose";

// ── AABB overlap (strict — touching is OK) ────────────────────────────────────

function aabbOverlap(a: AABB, b: AABB): boolean {
  if (a.maxX <= b.minX || b.maxX <= a.minX) return false;
  if (a.maxY <= b.minY || b.maxY <= a.minY) return false;
  if (a.maxZ <= b.minZ || b.maxZ <= a.minZ) return false;
  return true;
}

// ── Static bbox helpers ───────────────────────────────────────────────────────

/** Compute the local AABB for a part, before any origin offset or rotation. */
function getLocalBbox(partRef: InlinePartRef | ExternalPartRef): AABB | null {
  if ("kind" in partRef && partRef.kind === "external") {
    const ext = partRef as ExternalPartRef;
    if (!ext.boundingBox) return null;
    const bb = ext.boundingBox as { width: number; height: number; depth: number };
    return {
      minX: -bb.width / 2,  maxX: bb.width / 2,
      minY: -bb.height / 2, maxY: bb.height / 2,
      minZ: 0,              maxZ: bb.depth,
    };
  }
  return computePartBbox((partRef as InlinePartRef).ir);
}

/** Resolve numeric origin from a PartRef (ParamRef values → 0 if not number). */
function resolveOrigin(partRef: InlinePartRef | ExternalPartRef): { x: number; y: number; z: number } {
  const raw = partRef.origin ?? { x: 0, y: 0, z: 0 };
  return {
    x: typeof raw.x === "number" ? raw.x : 0,
    y: typeof raw.y === "number" ? raw.y : 0,
    z: typeof raw.z === "number" ? raw.z : 0,
  };
}

/** Resolve numeric rotation from a PartRef. */
function resolveRotation(
  partRef: InlinePartRef | ExternalPartRef,
): { rx: number; ry: number; rz: number } | undefined {
  const raw = partRef.rotation;
  if (!raw) return undefined;
  return {
    rx: typeof raw.rx === "number" ? raw.rx : 0,
    ry: typeof raw.ry === "number" ? raw.ry : 0,
    rz: typeof raw.rz === "number" ? raw.rz : 0,
  };
}

/**
 * Compute the static (resting-pose) AABB for a part in the assembly frame,
 * applying origin + rotation exactly as partsInterfere does.
 */
function getStaticBbox(partRef: InlinePartRef | ExternalPartRef): AABB | null {
  const local = getLocalBbox(partRef);
  if (local === null) return null;
  const origin = resolveOrigin(partRef);
  const rotation = resolveRotation(partRef);
  return transformBbox(local, origin, rotation);
}

// ── Main rule ────────────────────────────────────────────────────────────────

const SAMPLES = 5;

/**
 * Check each revolute/linear joint for swept-range collisions with other parts.
 */
export function jointRangeCollision(ir: CadIr): Violation[] {
  const out: Violation[] = [];

  const parts = ir.parts ?? {};
  const joints = ir.joints ?? {};
  const partEntries = Object.entries(parts);

  if (partEntries.length < 2) return out;

  // Pre-compute static bboxes for all parts (reused for every joint check)
  const staticBboxes = new Map<string, AABB | null>();
  for (const [id, partRef] of partEntries) {
    staticBboxes.set(id, getStaticBbox(partRef));
  }

  for (const [, joint] of Object.entries(joints)) {
    // Only check revolute and linear joints that have limits
    if (joint.type !== "revolute" && joint.type !== "linear") continue;
    if (!joint.limits) continue;

    const childId = joint.child;
    const childRef = parts[childId];
    if (!childRef) continue;

    // Step 1: local bbox of child
    const childLocal = getLocalBbox(childRef);
    if (childLocal === null) continue; // no geometry to check

    // Step 2: apply child's static origin offset (translation only)
    const childOrigin = resolveOrigin(childRef);
    const childWithOrigin = transformBbox(childLocal, childOrigin, undefined);

    // IDs to exclude from the check (the joint endpoints themselves)
    const excluded = new Set([joint.parent, joint.child]);

    // Step 3: sample poses and check against all other parts
    const poses = sampleJointPoses(joint, SAMPLES);

    for (const pose of poses) {
      const sweptBbox = applyPoseToBbox(childWithOrigin, pose);

      for (const [otherId, otherBbox] of staticBboxes) {
        if (excluded.has(otherId)) continue;
        if (otherBbox === null) continue;

        if (aabbOverlap(sweptBbox, otherBbox)) {
          out.push({
            ruleId: "assembly.joint-range-collision",
            severity: "warn",
            message: `Joint "${joint.id}": child part "${childId}" may collide with "${otherId}" during motion`,
            agentMessage:
              `Joint "${joint.id}" sweeps child part "${childId}" into the bounding box of "${otherId}" ` +
              `at one or more sampled positions across its motion range [${joint.limits.lower}–${joint.limits.upper} ${joint.limits.unit}]. ` +
              `Check for geometry interference and adjust part origins or joint limits to create clearance. ` +
              `Note: bounding-box sweep check is conservative — verify with exact geometry if this appears to be a false positive.`,
          });
          // One violation per (joint, other-part) pair — don't repeat for each pose
          break;
        }
      }
    }
  }

  // Deduplicate: keep only one violation per (jointId, otherPartId) pair
  const seen = new Set<string>();
  return out.filter(v => {
    const key = v.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
