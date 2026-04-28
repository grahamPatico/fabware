// Pose adapter for FlatPattern. Projects a Part's local-frame holes into
// world-space positions for consumers like the renderer's <BoltMeshes> and
// the assembly-rules hole-alignment checks.
//
// All local-frame iteration lives in `flatPattern.ts` — this file is the
// thin "apply Pose to FlatPattern" adapter. One adapter today (production);
// this is the seam where any future "transform without three.js" or
// "transform for export to a different frame" alternative would live.

import type { PartDsl } from "./dsl";
import { transformPoint, type Pose, type WorldPoint } from "./positions";
import { flatPattern } from "./flatPattern";

export interface HoleInstance {
  featureName: string;
  diameter: number;
  local: { x: number; y: number; z: number };
  worldPoint: WorldPoint;
}

export function holeWorldPositions(dsl: PartDsl, pose: Pose): HoleInstance[] {
  const pattern = flatPattern(dsl);
  return pattern.holes.map(h => {
    const local = { x: h.center.x, y: h.center.y, z: 0 };
    return {
      featureName: h.featureName,
      diameter: h.diameter,
      local,
      worldPoint: transformPoint(local, pose),
    };
  });
}
