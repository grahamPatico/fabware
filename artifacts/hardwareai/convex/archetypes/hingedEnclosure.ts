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
  // doorFace = "top" → trunk/chest/box (lid on top, hinged at hingeSide edge).
  // doorFace = "front" → locker/cabinet/wardrobe (door on front, hinged on
  // left or right vertical edge).
  doorFace: z.enum(["top", "front"]).default("top"),
  hingeSide: z.enum(["back", "front", "left", "right"]),
  // bodyConstruction = "single_bend" → real fabricators bend a single sheet
  // and weld the seams; no fasteners on the body. "bolted_plates" → 5 plates
  // bolted together (serviceable but more parts + visible fasteners).
  // Default flips with tier (jerry-rigged + mvp → single_bend; commercial → bolted).
  bodyConstruction: z.enum(["single_bend", "bolted_plates"]).default("single_bend"),
  powderCoat: z.boolean(),
  powderCoatColor: z.string(),
  fastenerPartNumber: z.string(),
  hingePartNumber: z.string(),
  fastenerCount: z.number().int().positive(),
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)", powderCoat: false, powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)", powderCoat: true,  powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", powderCoat: true, powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const inner = scope.referenceScale?.dimensions ?? { w: 12, d: 12, h: 12 };
  // Heuristic: tall + narrow → locker; otherwise trunk (top-hinged).
  const tallNarrow = inner.h >= 1.5 * Math.max(inner.w, inner.d);
  const lockerWords = /\b(locker|cabinet|wardrobe|fridge|cupboard)\b/i;
  const isLocker = tallNarrow || lockerWords.test(scope.useCase ?? "");
  return {
    innerWidth: inner.w,
    innerDepth: inner.d,
    innerHeight: inner.h,
    material,
    thickness: tier.thickness!,
    doorFace: isLocker ? "front" : "top",
    hingeSide: isLocker ? "right" : "back",
    bodyConstruction: scope.tier === "commercial" ? "bolted_plates" : "single_bend",
    powderCoat: tier.powderCoat!,
    powderCoatColor: tier.powderCoatColor!,
    fastenerPartNumber: tier.fastenerPartNumber!,
    hingePartNumber: tier.hingePartNumber!,
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

  const base = {
    role: "base", label: "Base",
    dsl: makePlate("base", outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "corner" as const }),
    position: { x: cx, y: cy, z: -t / 2, rotX: 0, rotY: 0, rotZ: 0 },
  };
  const wallBack = {
    role: "wall_back", label: "Wall — Back",
    dsl: makePlate("wall_back", outerW, innerH, params, hole(params.fastenerCount)),
    position: { x: cx, y: params.innerDepth + t / 2, z: cz, rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
  };
  const wallLeft = {
    role: "wall_left", label: "Wall — Left",
    dsl: makePlate("wall_left", params.innerDepth, innerH, params, hole(params.fastenerCount)),
    position: { x: -t / 2, y: cy, z: cz, rotX: Math.PI / 2, rotY: Math.PI / 2, rotZ: 0 },
  };
  const wallRight = {
    role: "wall_right", label: "Wall — Right",
    dsl: makePlate("wall_right", params.innerDepth, innerH, params, hole(params.fastenerCount)),
    position: { x: params.innerWidth + t / 2, y: cy, z: cz, rotX: Math.PI / 2, rotY: Math.PI / 2, rotZ: 0 },
  };

  // Body joints become weld seams (no fasteners) when the body is one bent
  // plate; otherwise traditional bolted plates with fasteners.
  const isWelded = params.bodyConstruction === "single_bend";
  const bodyJoint = (roleA: string, roleB: string) =>
    isWelded
      ? { kind: "weld_seam" as const, roleA, roleB, featureA: "edge", featureB: "edge", hardwareRefs: [] as Array<{ mcmasterPartNumber: string; quantity: number; role?: string }> }
      : { kind: "bolted" as const, roleA, roleB, featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] };

  if (params.doorFace === "top") {
    const wallFront = {
      role: "wall_front", label: "Wall — Front",
      dsl: makePlate("wall_front", outerW, innerH, params, hole(params.fastenerCount)),
      position: { x: cx, y: -t / 2, z: cz, rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
    };
    const lid = {
      role: "lid", label: "Lid",
      dsl: makePlate("lid", outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "bottom_row" as const }),
      position: { x: cx, y: cy, z: innerH + t / 2, rotX: 0, rotY: 0, rotZ: 0 },
    };
    const parts = [base, wallFront, wallBack, wallLeft, wallRight, lid];
    const hingeRole = `wall_${params.hingeSide}`;
    const interfaces = [
      bodyJoint("base", "wall_front"),
      bodyJoint("base", "wall_back"),
      bodyJoint("base", "wall_left"),
      bodyJoint("base", "wall_right"),
      // Lid always hinges (must be removable), so this stays a hinge interface.
      { kind: "hinged" as const, roleA: "lid", roleB: hingeRole, featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: [{ mcmasterPartNumber: params.hingePartNumber, quantity: 2, role: "pivot" }] },
    ];
    return { parts, interfaces };
  }

  // doorFace === "front" — locker/cabinet style. Front opening becomes the
  // door, top is closed solid, hinge is on left or right vertical edge.
  const door = {
    role: "door_front", label: "Door — Front",
    dsl: makePlate("door_front", outerW, innerH, params, hole(params.fastenerCount)),
    position: { x: cx, y: -t / 2, z: cz, rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
  };
  const top = {
    role: "wall_top", label: "Top",
    dsl: makePlate("wall_top", outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "corner" as const }),
    position: { x: cx, y: cy, z: innerH + t / 2, rotX: 0, rotY: 0, rotZ: 0 },
  };
  const parts = [base, top, wallBack, wallLeft, wallRight, door];
  // hingeSide for front-door defaults to right; left allowed too. Map other
  // values to "right" so we always produce valid geometry.
  const hingeWall =
    params.hingeSide === "left" ? "wall_left"
    : params.hingeSide === "right" ? "wall_right"
    : "wall_right";
  const interfaces = [
    bodyJoint("base", "wall_back"),
    bodyJoint("base", "wall_left"),
    bodyJoint("base", "wall_right"),
    bodyJoint("wall_top", "wall_back"),
    bodyJoint("wall_top", "wall_left"),
    bodyJoint("wall_top", "wall_right"),
    // Door always hinges (must swing open).
    { kind: "hinged" as const, roleA: "door_front", roleB: hingeWall, featureA: "mounting_hole", featureB: "mounting_hole", hardwareRefs: [{ mcmasterPartNumber: params.hingePartNumber, quantity: 2, role: "pivot" }] },
  ];
  return { parts, interfaces };
}

export const hingedEnclosure: Archetype<Params> = registerArchetype({
  id: "hinged_enclosure",
  label: "Hinged Enclosure",
  description: "Base + 4 walls + hinged lid. Lockers, tool boxes, outdoor cabinets.",
  tags: ["enclosure", "storage", "outdoor-ok", "locker"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="56" height="34" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="56" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="12" x2="32" y2="44" stroke="currentColor" stroke-dasharray="2,2"/></svg>`,
});
