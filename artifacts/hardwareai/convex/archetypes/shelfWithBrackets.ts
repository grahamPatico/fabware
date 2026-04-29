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

  // The shelf has TWO independent hole groups — one above each bracket.
  // Treating mounting as a single shared "mounting_hole" feature can't
  // simultaneously align with both brackets because the brackets sit at
  // different x positions on the shelf. Two named features lets each
  // bracket's interface reference its own group.
  const flangeWidth = Math.min(params.shelfDepth, 4); // L-bracket horizontal flange
  const inset = 0.375;
  const step = (flangeWidth - 2 * inset) / Math.max(params.fastenerCount - 1, 1);
  const rightX = params.shelfWidth - flangeWidth; // bracket_right origin

  // Bracket flanges are placed at world x ∈ [0, flangeWidth] (left) and
  // [rightX, rightX + flangeWidth] (right) with their flat-pattern bottom_row
  // at local y=inset, x = inset + i*step for i in [0..count-1].
  // Shelf holes need to coincide in world space; use explicit positions so
  // each cluster sits exactly under its bracket.
  const bracketLocalX = (i: number) => inset + i * step;
  const leftCluster = Array.from({ length: params.fastenerCount }, (_, i) =>
    ({ x: bracketLocalX(i), y: inset }));
  const rightCluster = Array.from({ length: params.fastenerCount }, (_, i) =>
    ({ x: rightX + bracketLocalX(i), y: inset }));

  const shelfHoleLeft: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole_left",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    positions: leftCluster,
  };
  const shelfHoleRight: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole_right",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    positions: rightCluster,
  };
  const bracketHole: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    inset,
  };

  const parts = [
    {
      role: "shelf",
      label: "Shelf",
      dsl: makePlate("plate", params.shelfWidth, params.shelfDepth, params, [shelfHoleLeft, shelfHoleRight]),
      position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
    },
    // Bracket flanges sit horizontally directly under each end of the shelf.
    // The L-bracket vertical leg (which would mount to a wall) is omitted
    // from this default archetype — modeling it requires a real bend-aware
    // pose that splits the bracket into two flanges joined at the bend.
    // Today the archetype models only the horizontal flange that bolts to
    // the shelf so we can guarantee bolts actually pass through both parts.
    {
      role: "bracket_left",
      label: "Bracket — Left flange",
      dsl: makePlate("bracket", flangeWidth, params.shelfDepth, params, [bracketHole]),
      position: { x: 0, y: 0, z: -t, rotX: 0, rotY: 0, rotZ: 0 },
    },
    {
      role: "bracket_right",
      label: "Bracket — Right flange",
      dsl: makePlate("bracket", flangeWidth, params.shelfDepth, params, [bracketHole]),
      position: { x: rightX, y: 0, z: -t, rotX: 0, rotY: 0, rotZ: 0 },
    },
  ];

  const hw = [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }];
  // Suppress unused-warning lint when step/insetX/insetY math depends on it implicitly.
  void step;

  const interfaces = [
    { kind: "bolted" as const, roleA: "bracket_left",  roleB: "shelf", featureA: "mounting_hole", featureB: "mounting_hole_left",  hardwareRefs: hw },
    { kind: "bolted" as const, roleA: "bracket_right", roleB: "shelf", featureA: "mounting_hole", featureB: "mounting_hole_right", hardwareRefs: hw },
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
