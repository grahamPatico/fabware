import { z } from "zod/v4";
import type { Archetype, ProjectScope, Tier } from "./types";
import { registerArchetype } from ".";
import type { PartDsl } from "../lib/dsl";

const paramSchema = z.object({
  bracketLength: z.number().positive(),
  bracketHeight: z.number().positive(),
  panelWidth: z.number().positive(),
  panelHeight: z.number().positive(),
  bendAngle: z.number().min(1).max(180),
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(8),
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2, bendAngle: 90 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)",    fastenerPartNumber: "91251A540", fastenerCount: 2, bendAngle: 90 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", fastenerPartNumber: "91251A540", fastenerCount: 2, bendAngle: 90 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const dims = scope.referenceScale?.dimensions;
  return {
    bracketLength: dims?.w ?? 3,
    bracketHeight: dims?.h ?? 3,
    panelWidth:    dims ? dims.w * 2 : 6,
    panelHeight:   dims ? dims.h * 2 : 6,
    bendAngle:     tier.bendAngle!,
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

  const bracketFeatures: PartDsl["features"] = [
    {
      kind: "bend",
      name: "main_bend",
      axis: "horizontal",
      positionRatio: 0.5,
      angle: params.bendAngle,
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

  const panelFeatures: PartDsl["features"] = [
    {
      kind: "hole",
      name: "mounting_hole",
      count: params.fastenerCount,
      diameter: mountingHoleDia,
      pattern: "top_row",
      inset: 0.375,
    },
  ];

  const parts = [
    {
      role: "bracket",
      label: "Bracket",
      dsl: makePlate("bracket", params.bracketLength, params.bracketHeight, params, bracketFeatures),
      position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
    },
    {
      role: "panel",
      label: "Panel",
      dsl: makePlate("plate", params.panelWidth, params.panelHeight, params, panelFeatures),
      position: { x: 0, y: 0, z: -t, rotX: 0, rotY: 0, rotZ: 0 },
    },
  ];

  const interfaces = [
    {
      kind: "bolted" as const,
      roleA: "bracket",
      roleB: "panel",
      featureA: "mounting_hole",
      featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }],
    },
  ];

  return { parts, interfaces };
}

export const bracketPlusPanel: Archetype<Params> = registerArchetype({
  id: "bracket_plus_panel",
  label: "Bracket + Panel",
  description: "Single bent bracket fastened to a flat panel. Great for wall-mounted fixtures and simple supports.",
  tags: ["bracket", "panel", "mounting", "indoor"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="28" width="56" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="4,28 4,8 20,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
});
