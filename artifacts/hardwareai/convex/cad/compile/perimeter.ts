// convex/cad/compile/perimeter.ts
//
// Perimeter estimator — Phase 13, Task 3.
//
// Estimates the total cut-path length (in mm) for a single-part CadIr by
// walking its resolved feature timeline.
//
// Supported feature kinds and sketch geometry:
//
//   extrude (new_body | add) — the outer profile perimeter is the cut path:
//     rect:   2 × (width + height)
//     circle: 2 × π × radius
//     line:   Euclidean distance √((x2-x1)² + (y2-y1)²)
//     other geometry: 0
//
//   cut_extrude — interior cutout contributes its perimeter (same rules as above).
//
//   All other feature kinds are skipped.
//
// Suppressed features are always skipped.
// The result is in mm (same units as the IR).
//
// Note: This estimator works on resolved IRs (all ParamRefs are numbers).

import type { CadIr } from "../ir/types";
import { resolveIr, type ResolvedIr } from "../resolve/resolveIr";

// ── Profile perimeter helper ──────────────────────────────────────────────────

/**
 * Compute the total perimeter (mm) for all geometry in a resolved sketch.
 *
 * - rect:   2 × (width + height)
 * - circle: 2 × π × radius
 * - line:   Euclidean distance between p1 and p2
 * - other:  0
 */
function sketchPerimeter(resolved: ResolvedIr, profileId: string): number {
  const sketch = resolved.sketches[profileId];
  if (!sketch) return 0;

  let perimeter = 0;
  for (const entity of sketch.geometry) {
    if (entity.kind === "rect") {
      const w = entity.width as number;
      const h = entity.height as number;
      perimeter += 2 * (w + h);
    } else if (entity.kind === "circle") {
      const r = entity.radius as number;
      perimeter += 2 * Math.PI * r;
    } else if (entity.kind === "line") {
      const dx = (entity.p2.x as number) - (entity.p1.x as number);
      const dy = (entity.p2.y as number) - (entity.p1.y as number);
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    // unknown kinds: 0 contribution
  }
  return perimeter;
}

// ── estimatePerimeter ─────────────────────────────────────────────────────────

/**
 * Estimate the total cut-path perimeter of a single-part CadIr in mm.
 *
 * Walks extrude and cut_extrude features; all other feature kinds are skipped.
 * Does NOT recurse into sub-assemblies — call per-part for assemblies.
 *
 * @param ir  Single-part CadIr (or the sub-IR of an inline part).
 * @returns   Perimeter in mm (≥ 0).
 */
export function estimatePerimeter(ir: CadIr): number {
  const resolved = resolveIr(ir);
  let perimeter = 0;

  for (const feature of resolved.features) {
    if (feature.suppressed) continue;

    if (feature.kind === "extrude") {
      if (feature.operation === "new_body" || feature.operation === "add") {
        perimeter += sketchPerimeter(resolved, feature.profile);
      }
    } else if (feature.kind === "cut_extrude") {
      perimeter += sketchPerimeter(resolved, feature.profile);
    }
    // All other kinds: skip
  }

  return perimeter;
}
