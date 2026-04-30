// convex/cad/validate/rules/partsInterfere.ts
//
// Tier 5 rule: assembly.parts-interfere
//
// For every pair of parts in the assembly, compute their AABBs in the
// assembly frame and check for overlap.
//
// Severity:
//   "error"  — neither part is rotated (bbox is exact)
//   "warn"   — at least one part is rotated (bbox is a conservative sphere
//              expansion; may be a false positive)
//
// Touching parts (edges/faces coinciding) are NOT flagged — the overlap
// test uses strict inequality so that touching == non-overlapping.

import type { CadIr, InlinePartRef, ExternalPartRef } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import { computePartBbox, type AABB } from "../../geometry/partBbox";
import { transformBbox } from "../../geometry/transform";

function aabbOverlap(a: AABB, b: AABB): boolean {
  // Two AABBs overlap iff they overlap on ALL three axes (strict inequality)
  if (a.maxX <= b.minX || b.maxX <= a.minX) return false;
  if (a.maxY <= b.minY || b.maxY <= a.minY) return false;
  if (a.maxZ <= b.minZ || b.maxZ <= a.minZ) return false;
  return true;
}

function isRotated(rotation?: { rx: number; ry: number; rz: number }): boolean {
  if (rotation === undefined) return false;
  return rotation.rx !== 0 || rotation.ry !== 0 || rotation.rz !== 0;
}

/**
 * Check every pair of parts in the assembly for AABB interference.
 * Returns a violation for each overlapping pair.
 */
export function partsInterfere(ir: CadIr): Violation[] {
  const out: Violation[] = [];

  const parts = ir.parts ?? {};
  const partEntries = Object.entries(parts);

  if (partEntries.length < 2) return out;

  // Compute transformed AABBs for each part (cache them)
  type PartInfo = {
    id: string;
    bbox: AABB | null;
    rotated: boolean;
  };

  const infos: PartInfo[] = partEntries.map(([, partRef]) => {
    // ── Phase 9: handle external parts ──────────────────────────────────────
    let local: AABB | null;
    if ("kind" in partRef && partRef.kind === "external") {
      const ext = partRef as ExternalPartRef;
      if (!ext.boundingBox) {
        // No declared bbox — skip interference check for this part
        return { id: partRef.id, bbox: null, rotated: false };
      }
      const bb = ext.boundingBox as { width: number; height: number; depth: number };
      local = {
        minX: -bb.width / 2,  maxX: bb.width / 2,
        minY: -bb.height / 2, maxY: bb.height / 2,
        minZ: 0,              maxZ: bb.depth,
      };
    } else {
      const inline = partRef as InlinePartRef;
      local = computePartBbox(inline.ir);
    }

    if (local === null) {
      return { id: partRef.id, bbox: null, rotated: false };
    }
    const rawOrigin = partRef.origin ?? { x: 0, y: 0, z: 0 };
    const origin = {
      x: typeof rawOrigin.x === "number" ? rawOrigin.x : 0,
      y: typeof rawOrigin.y === "number" ? rawOrigin.y : 0,
      z: typeof rawOrigin.z === "number" ? rawOrigin.z : 0,
    };
    const rawRot = partRef.rotation;
    const rotation = rawRot
      ? {
          rx: typeof rawRot.rx === "number" ? rawRot.rx : 0,
          ry: typeof rawRot.ry === "number" ? rawRot.ry : 0,
          rz: typeof rawRot.rz === "number" ? rawRot.rz : 0,
        }
      : undefined;
    const worldBbox = transformBbox(local, origin, rotation);
    return {
      id: partRef.id,
      bbox: worldBbox,
      rotated: isRotated(rotation),
    };
  });

  // Check every pair
  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const a = infos[i];
      const b = infos[j];

      // Skip parts with no geometry (null bbox)
      if (a.bbox === null || b.bbox === null) continue;

      if (aabbOverlap(a.bbox, b.bbox)) {
        const conservative = a.rotated || b.rotated;
        const severity: Violation["severity"] = conservative ? "warn" : "error";
        const qualifier = conservative
          ? " (conservative AABB — verify actual geometry)"
          : "";

        out.push({
          ruleId: "assembly.parts-interfere",
          severity,
          message: `Parts "${a.id}" and "${b.id}" have overlapping bounding boxes${qualifier}`,
          agentMessage: `Parts "${a.id}" and "${b.id}" appear to occupy the same space. ` +
            `Check their origin offsets and ensure there is a gap between them. ` +
            (conservative
              ? `Note: the bounding box was conservatively expanded due to rotation — ` +
                `verify with exact geometry if this appears to be a false positive.`
              : `Adjust the origin of one part to eliminate the overlap.`),
        });
      }
    }
  }

  return out;
}
