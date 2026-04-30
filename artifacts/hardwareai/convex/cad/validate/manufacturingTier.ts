// convex/cad/validate/manufacturingTier.ts
//
// Tier-4 (manufacturing-tier) validator. Runs on a ResolvedIr (post-resolve,
// all parameter expressions already evaluated to numbers).
//
// Phase 1 rules implemented:
//   mfg.hole-edge-distance — hole centre must be at least (1.5 * d + d/2) mm
//                            from every edge of the parent extrude's bounding rect.

import type { ResolvedIr } from "../resolve/resolveIr";
import type { Violation } from "../../plugins/types";
import type { ExtrudeFeature, HoleFeature } from "../ir/types";

interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function viol(
  ruleId: string,
  message: string,
  agentMessage: string,
  location?: Violation["location"],
): Violation {
  return { ruleId, severity: "error", message, agentMessage, location };
}

/**
 * Build a feature-id → bounding-box map for every `extrude` feature whose
 * profile sketch contains a `rect` entity. Only this combination is recognised
 * in Phase 1.
 */
function buildBBoxMap(ir: ResolvedIr): Map<string, BBox> {
  const map = new Map<string, BBox>();

  for (const feature of ir.features) {
    if (feature.kind !== "extrude") continue;
    const extrude = feature as ExtrudeFeature;

    const sketch = ir.sketches[extrude.profile];
    if (!sketch) continue;

    const rect = sketch.geometry.find((g) => g.kind === "rect");
    if (!rect || rect.kind !== "rect") continue;

    // rect.center, rect.width, rect.height are all already resolved numbers
    const cx = rect.center.x as number;
    const cy = rect.center.y as number;
    const hw = (rect.width as number) / 2;
    const hh = (rect.height as number) / 2;

    map.set(extrude.id, {
      minX: cx - hw,
      maxX: cx + hw,
      minY: cy - hh,
      maxY: cy + hh,
    });
  }

  return map;
}

/**
 * Validate manufacturing-tier concerns against a resolved IR.
 * Returns an empty array when no violations are found.
 */
export function validateManufacturingTier(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];
  const bboxMap = buildBBoxMap(ir);

  for (const feature of ir.features) {
    if (feature.kind !== "hole") continue;
    const hole = feature as HoleFeature;

    const parentExtrudeId = hole.face.feature;
    const bbox = bboxMap.get(parentExtrudeId);
    if (!bbox) continue; // parent extrude not recognised (e.g. non-rect profile)

    const diameter = hole.diameter as number;
    const minAllowed = 1.5 * diameter + diameter / 2;

    for (const pos of hole.positions) {
      const px = pos.x as number;
      const py = pos.y as number;

      const edgeDist = Math.min(
        px - bbox.minX,
        bbox.maxX - px,
        py - bbox.minY,
        bbox.maxY - py,
      );

      if (edgeDist < minAllowed) {
        out.push(
          viol(
            "mfg.hole-edge-distance",
            `Hole "${hole.id}" is ${edgeDist.toFixed(2)} mm from the nearest edge (minimum ${minAllowed.toFixed(2)} mm for ⌀${diameter} mm)`,
            `Move hole "${hole.id}" so that every position is at least ${minAllowed.toFixed(2)} mm from the nearest part edge (rule: 1.5 × diameter + diameter / 2 for ⌀${diameter} mm holes).`,
            { kind: "hole", id: hole.id },
          ),
        );
        break; // one violation per hole feature is enough
      }
    }
  }

  return out;
}
