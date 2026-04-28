import { z } from "zod/v4";
import type { Archetype, ProjectScope, Tier } from "./types";
import { registerArchetype } from "./registry";
import type { PartDsl } from "../lib/dsl";

const paramSchema = z.object({
  shelfWidth: z.number().positive(),
  shelfDepth: z.number().positive(),
  bracketHeight: z.number().positive(),
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(4),
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", fastenerPartNumber: "91251A540", fastenerCount: 4 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const dims = scope.referenceScale?.dimensions;
  return {
    shelfWidth:    dims?.w ?? 24,
    shelfDepth:    dims?.d ?? 12,
    bracketHeight: dims?.h ?? 6,
    material,
    thickness:     tier.thickness!,
    fastenerPartNumber: tier.fastenerPartNumber!,
    fastenerCount: tier.fastenerCount!,
  };
}

function makePlate(partType: PartDsl["partType"], w: number, h: number, p: Params, features: PartDsl["features"] = []): PartDsl {
  return {
    version: 1,
    partType,
    material: p.material,
    thickness: p.thickness,
    width: w,
    height: h,
    depth: null,
    features,
    finish: null,
    assemblyRefs: [],
  };
}

function generate(params: Params, _scope: ProjectScope) {
  const t = params.thickness;
  const mountingHoleDia = 0.266;

  const shelfHole: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    inset: 0.375,
  };

  const bracketFeatures: PartDsl["features"] = [
    {
      kind: "bend",
      name: "main_bend",
      axis: "horizontal",
      positionRatio: 0.5,
      angle: 90,
      radius: 0.062,
    },
    {
      kind: "hole",
      name: "mounting_hole",
      count: params.fastenerCount,
      diameter: mountingHoleDia,
      pattern: "bottom_row",
      inset: 0.375,
    },
  ];

  const parts = [
    {
      role: "shelf",
      label: "Shelf",
      dsl: makePlate("plate", params.shelfWidth, params.shelfDepth, params, [shelfHole]),
      position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
    },
    // Brackets stand vertically as thin plates in the YZ plane (their thickness
    // is along world X, so they sit at the left/right edges of the shelf and
    // extend downward by bracketHeight along Z and along the shelf's depth
    // along Y). rotX=π/2 + rotZ=π/2 rotates a flat plate into that orientation
    // under three.js's Euler XYZ order.
    {
      role: "bracket_left",
      label: "Bracket — Left",
      dsl: makePlate("bracket", params.shelfDepth, params.bracketHeight, params, bracketFeatures),
      position: { x: t / 2, y: 0, z: -(params.bracketHeight + t) / 2, rotX: Math.PI / 2, rotY: Math.PI / 2, rotZ: 0 },
    },
    {
      role: "bracket_right",
      label: "Bracket — Right",
      dsl: makePlate("bracket", params.shelfDepth, params.bracketHeight, params, bracketFeatures),
      position: { x: params.shelfWidth - t / 2, y: 0, z: -(params.bracketHeight + t) / 2, rotX: Math.PI / 2, rotY: Math.PI / 2, rotZ: 0 },
    },
  ];

  const hw = [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }];

  const interfaces = [
    { kind: "bolted" as const, roleA: "bracket_left",  roleB: "shelf", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "bracket_right", roleB: "shelf", featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: hw },
  ];

  return { parts, interfaces };
}

export const shelfWithBrackets: Archetype<Params> = registerArchetype({
  id: "shelf_with_brackets",
  label: "Shelf with Brackets",
  description: "Flat shelf panel supported by two L-brackets. Standard wall-mounted storage solution.",
  tags: ["shelf", "bracket", "storage", "wall-mount", "indoor"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="20" width="56" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="8,26 8,44 20,44" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="56,26 56,44 44,44" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
});
