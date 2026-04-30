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

import type { CadIr } from "../../ir/types";
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
    const localBbox = computePartBbox(partRef.ir);
    if (localBbox === null) {
      return { id: partRef.id, bbox: null, rotated: false };
    }
    const origin = partRef.origin ?? { x: 0, y: 0, z: 0 };
    const rotation = partRef.rotation
      ? { rx: partRef.rotation.rx, ry: partRef.rotation.ry, rz: partRef.rotation.rz }
      : undefined;
    const worldBbox = transformBbox(localBbox, origin, rotation);
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
