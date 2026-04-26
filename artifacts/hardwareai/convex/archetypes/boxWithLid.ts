import { z } from "zod/v4";
import type { Archetype, ProjectScope, Tier } from "./types";
import { registerArchetype } from "./registry";
import type { PartDsl } from "../lib/dsl";

const paramSchema = z.object({
  innerWidth: z.number().positive(),
  innerDepth: z.number().positive(),
  innerHeight: z.number().positive(),
  material: z.string(),
  thickness: z.number().positive(),
  powderCoat: z.boolean(),
  powderCoatColor: z.string(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().positive(),
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)", powderCoat: false, powderCoatColor: "Black", fastenerPartNumber: "91251A540", fastenerCount: 4 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)", powderCoat: true,  powderCoatColor: "Black", fastenerPartNumber: "91251A540", fastenerCount: 4 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", powderCoat: true, powderCoatColor: "Black", fastenerPartNumber: "91251A540", fastenerCount: 4 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const inner = scope.referenceScale?.dimensions ?? { w: 12, d: 12, h: 12 };
  return {
    innerWidth: inner.w,
    innerDepth: inner.d,
    innerHeight: inner.h,
    material,
    thickness: tier.thickness!,
    powderCoat: tier.powderCoat!,
    powderCoatColor: tier.powderCoatColor!,
    fastenerPartNumber: tier.fastenerPartNumber!,
    fastenerCount: tier.fastenerCount!,
  };
}

function makePlate(_name: string, w: number, h: number, p: Params, holeFeature?: PartDsl["features"][number]): PartDsl {
  return {
    version: 1,
    partType: "plate",
    material: p.material,
    thickness: p.thickness,
    width: w,
    height: h,
    depth: null,
    features: holeFeature ? [holeFeature] : [],
    finish: p.powderCoat ? { type: "powder_coat", color: p.powderCoatColor } : null,
    assemblyRefs: [],
  };
}

function generate(params: Params, _scope: ProjectScope) {
  const t = params.thickness;
  const outerW = params.innerWidth + 2 * t;
  const outerD = params.innerDepth + 2 * t;
  const innerH = params.innerHeight;
  const mountingHoleDia = 0.266;
  const hole = (count: number) => ({
    kind: "hole" as const, name: "mounting_hole", count, diameter: mountingHoleDia,
    pattern: "bottom_row" as const, inset: 0.375,
  });

  const cx = params.innerWidth / 2;
  const cy = params.innerDepth / 2;
  const cz = innerH / 2;
  const parts = [
    { role: "base",       label: "Base",         dsl: makePlate("base",       outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "corner" as const }),   position: { x: cx,           y: cy,                z: -t / 2,         rotX: 0,           rotY: 0, rotZ: 0 } },
    { role: "wall_front", label: "Wall — Front", dsl: makePlate("wall_front", outerW, innerH, params, hole(params.fastenerCount)),                                       position: { x: cx,           y: -t / 2,            z: cz,             rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_back",  label: "Wall — Back",  dsl: makePlate("wall_back",  outerW, innerH, params, hole(params.fastenerCount)),                                       position: { x: cx,           y: params.innerDepth + t / 2, z: cz,     rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_left",  label: "Wall — Left",  dsl: makePlate("wall_left",  outerD, innerH, params, hole(params.fastenerCount)),                                       position: { x: -t / 2,       y: cy,                z: cz,             rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
    { role: "wall_right", label: "Wall — Right", dsl: makePlate("wall_right", outerD, innerH, params, hole(params.fastenerCount)),                                       position: { x: params.innerWidth + t / 2, y: cy, z: cz,             rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
    { role: "lid",        label: "Lid",          dsl: makePlate("lid",        outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "bottom_row" as const }), position: { x: cx,           y: cy,                z: innerH + t / 2, rotX: 0,           rotY: 0, rotZ: 0 } },
  ];

  const hw = [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }];

  const interfaces = [
    // 4 wall-to-base bolted
    { kind: "bolted" as const, roleA: "base", roleB: "wall_front", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_back",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_left",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_right", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    // 4 lid-to-wall bolted
    { kind: "bolted" as const, roleA: "lid", roleB: "wall_front", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "lid", roleB: "wall_back",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "lid", roleB: "wall_left",  featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "lid", roleB: "wall_right", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
  ];

  return { parts, interfaces };
}

export const boxWithLid: Archetype<Params> = registerArchetype({
  id: "box_with_lid",
  label: "Box with removable lid",
  description: "5-sided box + removable lid. Simplest enclosure. Good for prototypes.",
  tags: ["enclosure", "storage", "indoor"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="14" width="56" height="30" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="56" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3,2"/></svg>`,
});
