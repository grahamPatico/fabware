// convex/cad/compile/volume.ts
//
// Volume estimator — Phase 12, Task 3.
//
// Estimates the manufactured volume (in mm³) for a single-part CadIr by walking
// its resolved feature timeline:
//
//  - extrude (new_body / add): adds sketch-profile area × distance.
//    Supported profile geometry: rect (width × height) and circle (π × r²).
//    Other geometry kinds (line, etc.) contribute 0 area.
//    cornerRadius is ignored — slight overestimate; acceptable for Phase 12 v0.
//
//  - cut_extrude: subtracts sketch-profile area × distance.
//    The net volume is clamped to 0 (cannot go negative).
//
//  - All other feature kinds (fillet, chamfer, hole, shell, pattern, revolve,
//    bend_flange, sweep, loft, weld_tab) are skipped — they modify existing
//    bodies or have complex geometry that Phase 12 does not attempt to estimate.
//    The conservative result is a slight overestimate for subtractive ops and
//    0 contribution for additive ops that aren't extrude-based.
//
// The result is in mm³ (same units as the IR).

import type { CadIr } from "../ir/types";
import { resolveIr, type ResolvedIr } from "../resolve/resolveIr";

// ── Area helper ────────────────────────────────────────────────────────────────

/**
 * Compute the 2-D cross-sectional area (mm²) of the first usable profile
 * geometry entity in a resolved sketch.
 *
 * - rect: width × height (cornerRadius ignored)
 * - circle: π × r²
 * - line (and any unknown kind): contributes 0
 *
 * Returns the sum of all usable entity areas in the sketch (usually one body
 * per extrude, but multi-body sketches are rare; summing is conservative).
 */
function sketchArea(
  resolved: ResolvedIr,
  profileId: string,
): number {
  const sketch = resolved.sketches[profileId];
  if (!sketch) return 0;

  let area = 0;
  for (const entity of sketch.geometry) {
    if (entity.kind === "rect") {
      area += (entity.width as number) * (entity.height as number);
    } else if (entity.kind === "circle") {
      const r = entity.radius as number;
      area += Math.PI * r * r;
    }
    // "line" and unknown kinds: 0 contribution
  }
  return area;
}

// ── estimateVolume ────────────────────────────────────────────────────────────

/**
 * Estimate the manufactured volume of a single-part CadIr in mm³.
 *
 * Does NOT recurse into sub-assemblies (use per-part calls for assemblies).
 *
 * @param ir Single-part CadIr (or the sub-IR of an inline part).
 * @returns  Volume in mm³ (≥ 0).
 */
export function estimateVolume(ir: CadIr): number {
  const resolved = resolveIr(ir);
  let volume = 0;

  for (const feature of resolved.features) {
    if (feature.suppressed) continue;

    if (feature.kind === "extrude") {
      // Only new_body and add operations grow volume; cut/intersect handled via cut_extrude
      if (feature.operation === "new_body" || feature.operation === "add") {
        const area = sketchArea(resolved, feature.profile);
        volume += area * (feature.distance as number);
      }
    } else if (feature.kind === "cut_extrude") {
      const area = sketchArea(resolved, feature.profile);
      volume -= area * (feature.distance as number);
    }
    // All other kinds: skip
  }

  // Volume cannot be negative (over-aggressive cuts assumed to remove material,
  // not add it back).
  return Math.max(0, volume);
}
