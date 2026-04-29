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
  // Bracket flat-pattern is one piece; the bend folds the upper portion
  // up into the vertical wall-mount leg. Horizontal flange = lower
  // shelfDepth"; vertical leg = upper bracketHeight". bendY in flat coords.
  const totalBracketLen = params.shelfDepth + params.bracketHeight;
  const bendY = params.shelfDepth;

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
    role: "bolt_clear",
  };
  const shelfHoleRight: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole_right",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    positions: rightCluster,
    role: "bolt_clear",
  };
  // Horizontal flange holes (bolt up to the shelf): bottom_row in flat
  // coords, y=inset — well below the bend line so they sit on the fixed
  // flange post-bend.
  const bracketShelfHole: PartDsl["features"][number] = {
    kind: "hole",
    name: "mounting_hole",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "bottom_row",
    inset,
    role: "bolt_clear",
  };
  // Wall-mount holes on the vertical leg (top_row of flat pattern). After
  // the bend they end up in a plane perpendicular to the shelf, ready to
  // bolt to a wall part. The default archetype doesn't include a wall part,
  // so these holes show up but no interface validates them.
  const bracketWallHole: PartDsl["features"][number] = {
    kind: "hole",
    name: "wall_mount",
    count: params.fastenerCount,
    diameter: mountingHoleDia,
    pattern: "top_row",
    inset,
  };
  const bracketBend: PartDsl["features"][number] = {
    kind: "bend",
    name: "main_bend",
    axis: "horizontal",
    positionRatio: bendY / totalBracketLen,
    angle: 90,
    radius: 0.062,
  };

  const parts = [
    {
      role: "shelf",
      label: "Shelf",
      dsl: makePlate("plate", params.shelfWidth, params.shelfDepth, params, [shelfHoleLeft, shelfHoleRight]),
      position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
    },
    // L-brackets: horizontal flange under each end of the shelf, vertical
    // leg folded up at y=shelfDepth to mount to a wall (wall not included
    // in default archetype). Bend uses PostBendGeometry so hole_position
    // alignment evaluates the horizontal flange holes in their post-bend
    // world position (which equals the flat-pattern position, since they're
    // on the fixed flange).
    {
      role: "bracket_left",
      label: "Bracket — Left",
      dsl: makePlate("bracket", flangeWidth, totalBracketLen, params, [bracketBend, bracketShelfHole, bracketWallHole]),
      position: { x: 0, y: 0, z: -t, rotX: 0, rotY: 0, rotZ: 0 },
    },
    {
      role: "bracket_right",
      label: "Bracket — Right",
      dsl: makePlate("bracket", flangeWidth, totalBracketLen, params, [bracketBend, bracketShelfHole, bracketWallHole]),
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
