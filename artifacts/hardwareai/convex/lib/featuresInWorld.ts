import type { PartDsl, HoleFeature } from "./dsl";
import { transformPoint, type Pose, type WorldPoint } from "./positions";

export interface HoleInstance {
  featureName: string;
  diameter: number;
  local: { x: number; y: number; z: number };
  worldPoint: WorldPoint;
}

function holeLocalPositions(hole: HoleFeature, width: number, height: number): Array<{ x: number; y: number; z: number }> {
  const inset = hole.inset ?? 0.375;
  const positions: Array<{ x: number; y: number; z: number }> = [];
  switch (hole.pattern) {
    case "corner": {
      const n = Math.min(hole.count, 4);
      const corners = [
        { x: inset,         y: inset         },
        { x: width - inset, y: inset         },
        { x: inset,         y: height - inset },
        { x: width - inset, y: height - inset },
      ];
      for (let i = 0; i < n; i++) positions.push({ ...corners[i], z: 0 });
      if (hole.count > 4) {
        const edges = [
          { x: width / 2, y: inset          },
          { x: width / 2, y: height - inset },
          { x: inset,     y: height / 2     },
          { x: width - inset, y: height / 2 },
        ];
        for (let i = 0; i < hole.count - 4; i++) positions.push({ ...edges[i % 4], z: 0 });
      }
      break;
    }
    case "center":
      positions.push({ x: width / 2, y: height / 2, z: 0 });
      break;
    case "top_row": {
      const y = height - inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) positions.push({ x: inset + i * step, y, z: 0 });
      break;
    }
    case "bottom_row": {
      const y = inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) positions.push({ x: inset + i * step, y, z: 0 });
      break;
    }
  }
  return positions;
}

export function holeWorldPositions(dsl: PartDsl, pose: Pose): HoleInstance[] {
  const instances: HoleInstance[] = [];
  for (const feat of dsl.features) {
    if (feat.kind !== "hole") continue;
    const locals = holeLocalPositions(feat, dsl.width, dsl.height);
    for (const local of locals) {
      instances.push({
        featureName: feat.name,
        diameter: feat.diameter,
        local,
        worldPoint: transformPoint(local, pose),
      });
    }
  }
  return instances;
}
