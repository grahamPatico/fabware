// convex/cad/geometry/partBbox.ts
//
// Compute an axis-aligned bounding box (AABB) for a single part IR.
// Only extrude and revolve features grow the bounding box; all other
// feature kinds (cut, fillet, chamfer, hole, etc.) modify or subtract
// geometry and are skipped.
//
// Returns null if the part has no extrude or revolve features.

import type { CadIr } from "../ir/types";
import { resolveIr } from "../resolve/resolveIr";

export interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function grow(box: AABB, other: AABB): AABB {
  return {
    minX: Math.min(box.minX, other.minX),
    maxX: Math.max(box.maxX, other.maxX),
    minY: Math.min(box.minY, other.minY),
    maxY: Math.max(box.maxY, other.maxY),
    minZ: Math.min(box.minZ, other.minZ),
    maxZ: Math.max(box.maxZ, other.maxZ),
  };
}

/**
 * Compute a conservative AABB for the given part IR.
 *
 * - extrude: uses the sketch geometry (rect or circle) and the extrusion distance.
 * - revolve: encloses the profile in a cylinder (conservative).
 * - All other feature kinds are ignored.
 *
 * Returns null when no extrude/revolve features are found (empty part).
 */
export function computePartBbox(ir: CadIr): AABB | null {
  const resolved = resolveIr(ir);

  let result: AABB | null = null;

  for (const feature of resolved.features) {
    if (feature.kind === "extrude") {
      const sketch = resolved.sketches[feature.profile];
      if (!sketch) continue;

      const distance = feature.distance as number;

      for (const entity of sketch.geometry) {
        let entityBox: AABB;

        if (entity.kind === "rect") {
          const hw = (entity.width as number) / 2;
          const hh = (entity.height as number) / 2;
          const cx = entity.center.x as number;
          const cy = entity.center.y as number;
          // Sketch is on XY plane by default; extrusion goes in +Z direction
          entityBox = {
            minX: cx - hw, maxX: cx + hw,
            minY: cy - hh, maxY: cy + hh,
            minZ: 0,       maxZ: distance,
          };
        } else if (entity.kind === "circle") {
          const r = entity.radius as number;
          const cx = entity.center.x as number;
          const cy = entity.center.y as number;
          entityBox = {
            minX: cx - r, maxX: cx + r,
            minY: cy - r, maxY: cy + r,
            minZ: 0,      maxZ: distance,
          };
        } else {
          // "line" entity — skip (not a closed profile that generates volume)
          continue;
        }

        result = result === null ? entityBox : grow(result, entityBox);
      }
    } else if (feature.kind === "revolve") {
      // Conservative: enclose the revolved profile in a cylinder.
      // The cylinder radius = the max distance of any profile point from the
      // revolution axis; height = the Z extent of the profile.
      //
      // We look at the profile sketch geometry and compute the bounding extent.
      const sketch = resolved.sketches[feature.profile];
      if (!sketch) continue;

      // Find the profile's 2D bounding box first
      let pMinX = Infinity, pMaxX = -Infinity;
      let pMinY = Infinity, pMaxY = -Infinity;

      for (const entity of sketch.geometry) {
        if (entity.kind === "rect") {
          const hw = (entity.width as number) / 2;
          const hh = (entity.height as number) / 2;
          const cx = entity.center.x as number;
          const cy = entity.center.y as number;
          pMinX = Math.min(pMinX, cx - hw);
          pMaxX = Math.max(pMaxX, cx + hw);
          pMinY = Math.min(pMinY, cy - hh);
          pMaxY = Math.max(pMaxY, cy + hh);
        } else if (entity.kind === "circle") {
          const r = entity.radius as number;
          const cx = entity.center.x as number;
          const cy = entity.center.y as number;
          pMinX = Math.min(pMinX, cx - r);
          pMaxX = Math.max(pMaxX, cx + r);
          pMinY = Math.min(pMinY, cy - r);
          pMaxY = Math.max(pMaxY, cy + r);
        } else if (entity.kind === "line") {
          pMinX = Math.min(pMinX, entity.p1.x as number, entity.p2.x as number);
          pMaxX = Math.max(pMaxX, entity.p1.x as number, entity.p2.x as number);
          pMinY = Math.min(pMinY, entity.p1.y as number, entity.p2.y as number);
          pMaxY = Math.max(pMaxY, entity.p1.y as number, entity.p2.y as number);
        }
      }

      if (!isFinite(pMinX)) continue; // No geometry

      // Conservative cylinder: radius = max extent from revolution axis,
      // height = Y extent of profile (revolving around X axis by convention).
      // The revolution axis determines the cylinder orientation:
      //   axis="x": revolves around X → cylinder along X, radius in YZ plane
      //   axis="y": revolves around Y → cylinder along Y, radius in XZ plane
      //   axis="z": revolves around Z → cylinder along Z, radius in XY plane
      const axis = feature.axis;
      let cylinderBox: AABB;

      if (axis === "x") {
        // Profile is in XY plane; revolution around X. Y values define radius.
        const r = Math.max(Math.abs(pMinY), Math.abs(pMaxY));
        cylinderBox = {
          minX: pMinX, maxX: pMaxX,
          minY: -r,    maxY: r,
          minZ: -r,    maxZ: r,
        };
      } else if (axis === "y") {
        // Profile is in XY plane; revolution around Y. X values define radius.
        const r = Math.max(Math.abs(pMinX), Math.abs(pMaxX));
        cylinderBox = {
          minX: -r,    maxX: r,
          minY: pMinY, maxY: pMaxY,
          minZ: -r,    maxZ: r,
        };
      } else {
        // axis === "z": revolution around Z. Both X and Y define radius.
        const r = Math.max(Math.abs(pMinX), Math.abs(pMaxX), Math.abs(pMinY), Math.abs(pMaxY));
        cylinderBox = {
          minX: -r, maxX: r,
          minY: -r, maxY: r,
          minZ: 0,  maxZ: 0, // Profile is flat on XY plane when revolving around Z
        };
      }

      result = result === null ? cylinderBox : grow(result, cylinderBox);
    }
    // All other feature kinds: skip
  }

  return result;
}
