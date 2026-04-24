import { z } from "zod/v4";
import type { Archetype, GeneratedPart, InterfaceSpec, ProjectScope, Tier } from "./types";
import { registerArchetype } from "./registry";
import type { PartDsl } from "../lib/dsl";

const paramSchema = z.object({
  innerWidth: z.number().positive(),
  innerDepth: z.number().positive(),
  innerHeight: z.number().positive(),
  dividerCount: z.number().int().min(0).max(10),
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(8),
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2, dividerCount: 2 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2, dividerCount: 2 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", fastenerPartNumber: "91251A540", fastenerCount: 4, dividerCount: 2 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const inner = scope.referenceScale?.dimensions ?? { w: 12, d: 12, h: 4 };
  return {
    innerWidth:    inner.w,
    innerDepth:    inner.d,
    innerHeight:   inner.h,
    dividerCount:  tier.dividerCount!,
    material,
    thickness:     tier.thickness!,
    fastenerPartNumber: tier.fastenerPartNumber!,
    fastenerCount: tier.fastenerCount!,
  };
}

function makePlate(w: number, h: number, p: Params, holeFeature?: PartDsl["features"][number]): PartDsl {
  return {
    version: 1,
    partType: "plate",
    material: p.material,
    thickness: p.thickness,
    width: w,
    height: h,
    depth: null,
    features: holeFeature ? [holeFeature] : [],
    finish: null,
    assemblyRefs: [],
  };
}

function generate(params: Params, _scope: ProjectScope) {
  const t = params.thickness;
  const outerW = params.innerWidth + 2 * t;
  const outerD = params.innerDepth + 2 * t;
  const innerH = params.innerHeight;
  const mountingHoleDia = 0.266;
  const cornerHole = {
    kind: "hole" as const, name: "mounting_hole", count: params.fastenerCount,
    diameter: mountingHoleDia, pattern: "corner" as const, inset: 0.375,
  };
  const bottomRowHole = {
    kind: "hole" as const, name: "mounting_hole", count: params.fastenerCount,
    diameter: mountingHoleDia, pattern: "bottom_row" as const, inset: 0.375,
  };
  const dividerHole = {
    kind: "hole" as const, name: "mounting_hole", count: params.fastenerCount,
    diameter: mountingHoleDia, pattern: "corner" as const, inset: 0.375,
  };

  const parts: GeneratedPart[] = [
    { role: "base",       label: "Base",         dsl: makePlate(outerW, outerD, params, cornerHole),    position: { x: 0,                 y: 0,                     z: 0,          rotX: 0,           rotY: 0, rotZ: 0 } },
    { role: "wall_front", label: "Wall — Front", dsl: makePlate(outerW, innerH, params, bottomRowHole), position: { x: 0,                 y: -t,                    z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_back",  label: "Wall — Back",  dsl: makePlate(outerW, innerH, params, bottomRowHole), position: { x: 0,                 y: params.innerDepth,     z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_left",  label: "Wall — Left",  dsl: makePlate(outerD, innerH, params, bottomRowHole), position: { x: -t,                y: params.innerDepth / 2, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
    { role: "wall_right", label: "Wall — Right", dsl: makePlate(outerD, innerH, params, bottomRowHole), position: { x: params.innerWidth, y: params.innerDepth / 2, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
  ];

  // Add dividers, evenly spaced along the width
  for (let i = 0; i < params.dividerCount; i++) {
    const xPos = params.innerWidth * ((i + 1) / (params.dividerCount + 1));
    parts.push({
      role: `divider_${i}`,
      label: `Divider ${i + 1}`,
      dsl: makePlate(params.innerDepth, innerH, params, dividerHole),
      position: { x: xPos, y: params.innerDepth / 2, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 },
    });
  }

  const hw = [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }];

  const interfaces: InterfaceSpec[] = [
    // 4 wall-to-base
    { kind: "bolted", roleA: "base", roleB: "wall_front", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted", roleA: "base", roleB: "wall_back",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted", roleA: "base", roleB: "wall_left",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted", roleA: "base", roleB: "wall_right", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
  ];

  // 2 interfaces per divider (to wall_left and wall_right)
  for (let i = 0; i < params.dividerCount; i++) {
    interfaces.push({ kind: "bolted", roleA: `divider_${i}`, roleB: "wall_left",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw });
    interfaces.push({ kind: "bolted", roleA: `divider_${i}`, roleB: "wall_right", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw });
  }

  return { parts, interfaces };
}

export const dividedTray: Archetype<Params> = registerArchetype({
  id: "divided_tray",
  label: "Divided Tray",
  description: "Open tray with adjustable dividers. Ideal for parts bins, organizers, and sorting trays.",
  tags: ["tray", "organizer", "storage", "indoor"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="12" width="56" height="32" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="25" y1="12" x2="25" y2="44" stroke="currentColor" stroke-width="1.5"/><line x1="43" y1="12" x2="43" y2="44" stroke="currentColor" stroke-width="1.5"/></svg>`,
});
