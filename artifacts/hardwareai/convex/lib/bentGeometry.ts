// Post-bend geometry. Lifts the FlatPattern through any single bend and
// returns the world-space hole positions you'd get after the bend is folded
// to its target angle. Replaces the flat-only path that featuresInWorld
// took before — and unblocks archetypes that need a flange folded against
// a mating part (L-brackets, locker doors, PEM-flange corners).
//
// Single bend only for now (covers shelf brackets, hinged enclosure flanges,
// most archetype workarounds we logged). Multi-bend traversal lives in a
// separate cycle (BendSequence — see CONTEXT.md "Bend awareness").
//
// The bend splits the FlatPattern into two flanges:
//   - fixed flange: the side the part's local frame stays on (stays in XY plane).
//   - rotated flange: the other side, rotated by `angle` around the bend tangent.
//
// Bend tangent in flat-pattern coords:
//   - axis: "horizontal" → tangent runs along local X at y = height * positionRatio.
//     (positionRatio splits height; rotated flange = y > tangent.)
//   - axis: "vertical"   → tangent runs along local Y at x = width  * positionRatio.
//     (positionRatio splits width;  rotated flange = x > tangent.)
//
// The fold direction is +Z (out of the flat plane) by convention. With a
// 90° bend the rotated flange ends up parallel to the local YZ (or XZ)
// plane depending on bend axis.

import type { PartDsl, BendFeature, HoleFeature } from "./dsl";
import { transformPoint, type Pose, type WorldPoint } from "./positions";
import { holePositionsFor } from "./flatPattern";

export interface BentHole {
  featureName: string;
  diameter: number;
  flange: "fixed" | "rotated";
  worldPoint: WorldPoint;
  faceNormalWorld: { x: number; y: number; z: number };
}

function findBend(dsl: PartDsl): BendFeature | null {
  const bend = dsl.features.find((f): f is BendFeature => f.kind === "bend");
  return bend ?? null;
}

function holeFeatures(dsl: PartDsl): HoleFeature[] {
  return dsl.features.filter((f): f is HoleFeature => f.kind === "hole");
}

// Apply a single bend at `tangent` along `axis` to a flat-pattern point.
// Returns local 3D coords (in part-local frame, with z=0 being the flat plane).
function liftThroughBend(
  pt: { x: number; y: number },
  bend: BendFeature,
  width: number,
  height: number,
): { local: { x: number; y: number; z: number }; flange: "fixed" | "rotated"; faceNormalLocal: { x: number; y: number; z: number } } {
  const angleRad = (bend.angle * Math.PI) / 180;
  if (bend.axis === "horizontal") {
    const tangent = height * bend.positionRatio;
    const isRotated = pt.y > tangent;
    if (!isRotated) {
      return { local: { x: pt.x, y: pt.y, z: 0 }, flange: "fixed", faceNormalLocal: { x: 0, y: 0, z: 1 } };
    }
    const dy = pt.y - tangent;
    // Rotate around X-axis at y=tangent. Fold direction +Z.
    const ny = tangent + dy * Math.cos(angleRad);
    const nz = dy * Math.sin(angleRad);
    // Flange normal: started as +Z; after rotating by angleRad around +X,
    // (0,0,1) → (0, -sin, cos).
    return {
      local: { x: pt.x, y: ny, z: nz },
      flange: "rotated",
      faceNormalLocal: { x: 0, y: -Math.sin(angleRad), z: Math.cos(angleRad) },
    };
  }
  // vertical
  const tangent = width * bend.positionRatio;
  const isRotated = pt.x > tangent;
  if (!isRotated) {
    return { local: { x: pt.x, y: pt.y, z: 0 }, flange: "fixed", faceNormalLocal: { x: 0, y: 0, z: 1 } };
  }
  const dx = pt.x - tangent;
  // Rotate around Y-axis at x=tangent. Fold direction +Z.
  const nx = tangent + dx * Math.cos(angleRad);
  const nz = dx * Math.sin(angleRad);
  // (0,0,1) rotated by angleRad around +Y → (sin, 0, cos).
  return {
    local: { x: nx, y: pt.y, z: nz },
    flange: "rotated",
    faceNormalLocal: { x: Math.sin(angleRad), y: 0, z: Math.cos(angleRad) },
  };
}

function rotateLocalDir(dir: { x: number; y: number; z: number }, pose: Pose): { x: number; y: number; z: number } {
  // Apply pose rotation only (no translation) — we want a world-frame direction.
  const origin = transformPoint({ x: 0, y: 0, z: 0 }, pose);
  const tip = transformPoint(dir, pose);
  return { x: tip.x - origin.x, y: tip.y - origin.y, z: tip.z - origin.z };
}

/**
 * For each hole feature on `dsl`, produce its post-bend world position. If
 * the part has no bend feature, this collapses to the flat-pattern path.
 */
export function holesPostBend(dsl: PartDsl, pose: Pose): BentHole[] {
  const bend = findBend(dsl);
  const out: BentHole[] = [];
  for (const h of holeFeatures(dsl)) {
    const positions = holePositionsFor(h, dsl.width, dsl.height);
    for (const p of positions) {
      if (!bend) {
        out.push({
          featureName: h.name,
          diameter: h.diameter,
          flange: "fixed",
          worldPoint: transformPoint({ x: p.x, y: p.y, z: 0 }, pose),
          faceNormalWorld: rotateLocalDir({ x: 0, y: 0, z: 1 }, pose),
        });
        continue;
      }
      const lifted = liftThroughBend(p, bend, dsl.width, dsl.height);
      out.push({
        featureName: h.name,
        diameter: h.diameter,
        flange: lifted.flange,
        worldPoint: transformPoint(lifted.local, pose),
        faceNormalWorld: rotateLocalDir(lifted.faceNormalLocal, pose),
      });
    }
  }
  return out;
}
