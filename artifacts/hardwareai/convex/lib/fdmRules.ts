// Fused-Deposition-Modeling (FDM / plastic 3D-printing) process pack.
//
// Fabware's second process pack after SendCutSend. The SCS module designs
// flat-pattern sheet-metal parts; this module flags 3D-print manufacturability
// issues for parts that will be FDM-printed on a consumer-grade machine
// (Bambu X1, Prusa MK4, Anycubic Kobra, etc.).
//
// Out of scope in this iteration: STL / 3MF export. The current Fabware part
// DSL describes flat patterns with bends, not volumetric solids. To support
// real 3D-printed parts we need either:
//   (a) a thickened-shell extension of the flat DSL (extrude perimeter by
//       wallThickness, boolean in all features), or
//   (b) a parallel volumetric DSL for true 3D parts (boxes, cylinders,
//       lattices, threaded bosses, etc.).
// For now this module just flags rule violations on the existing flat DSL so
// users know whether their flat-plate design could also be printed.

import type { PartDsl } from "./dsl";
import type { RuleResult } from "./scsRules";

export interface FdmMachineProfile {
  name: string;
  nozzleDiameter: number; // mm
  layerHeight: number; // mm (typical)
  maxBridgeLength: number; // mm (unsupported span)
  maxOverhangDeg: number; // degrees from vertical
  buildVolume: { width: number; depth: number; height: number }; // mm
}

// Sensible-default consumer FDM profile. Works for Bambu P1/X1, Prusa MK4,
// Creality K1, etc. at 0.4 mm nozzle + 0.2 mm layer.
export const DEFAULT_FDM_PROFILE: FdmMachineProfile = {
  name: "Generic 0.4mm / 0.2mm FDM",
  nozzleDiameter: 0.4,
  layerHeight: 0.2,
  maxBridgeLength: 10, // mm
  maxOverhangDeg: 45,
  buildVolume: { width: 256, depth: 256, height: 256 },
};

export interface FdmValidationResult {
  rules: RuleResult[];
  hasFailures: boolean;
  profile: FdmMachineProfile;
}

const IN_PER_MM = 1 / 25.4;
const MM_PER_IN = 25.4;

function inToMm(inches: number): number {
  return inches * MM_PER_IN;
}

export function validateFdm(
  dsl: PartDsl,
  profile: FdmMachineProfile = DEFAULT_FDM_PROFILE,
): FdmValidationResult {
  const rules: RuleResult[] = [];

  // Rule 1: minimum wall thickness (2x nozzle diameter for two perimeters).
  const minWallMm = profile.nozzleDiameter * 2;
  const thicknessMm = inToMm(dsl.thickness);
  if (thicknessMm < minWallMm) {
    rules.push({
      id: "fdm-wall-thickness",
      label: "Wall thickness below printable minimum",
      status: "fail",
      message: `Thickness ${thicknessMm.toFixed(2)} mm is below the ${minWallMm.toFixed(1)} mm minimum (2× ${profile.nozzleDiameter} mm nozzle) for reliable walls.`,
    });
  } else if (thicknessMm < minWallMm * 1.5) {
    rules.push({
      id: "fdm-wall-thickness",
      label: "Wall thickness marginal for FDM",
      status: "warn",
      message: `Thickness ${thicknessMm.toFixed(2)} mm is printable but will have only two perimeters and little room for infill — consider ≥ ${(minWallMm * 1.5).toFixed(1)} mm.`,
    });
  } else {
    rules.push({
      id: "fdm-wall-thickness",
      label: "Wall thickness OK for FDM",
      status: "pass",
      message: `Thickness ${thicknessMm.toFixed(2)} mm prints cleanly on a ${profile.nozzleDiameter} mm nozzle.`,
    });
  }

  // Rule 2: build volume fit (treat flat part as planar footprint for now).
  const partWMm = inToMm(dsl.width);
  const partHMm = inToMm(dsl.height);
  const vol = profile.buildVolume;
  // Allow the part to be oriented with either side along X.
  const fitsFlat =
    (partWMm <= vol.width && partHMm <= vol.depth) ||
    (partHMm <= vol.width && partWMm <= vol.depth);
  if (!fitsFlat) {
    rules.push({
      id: "fdm-build-volume",
      label: "Part exceeds FDM build volume",
      status: "fail",
      message: `Part footprint ${partWMm.toFixed(0)}×${partHMm.toFixed(0)} mm does not fit ${profile.buildVolume.width}×${profile.buildVolume.depth} mm build plate. Split the part or print on a larger machine.`,
    });
  } else {
    rules.push({
      id: "fdm-build-volume",
      label: "Part fits FDM build plate",
      status: "pass",
      message: `Footprint ${partWMm.toFixed(0)}×${partHMm.toFixed(0)} mm fits the ${vol.width}×${vol.depth} mm plate.`,
    });
  }

  // Rule 3: hole diameter vs nozzle — holes smaller than ~2× nozzle print
  // closed or extremely rough.
  const minHoleMm = profile.nozzleDiameter * 2;
  const holes = dsl.features.filter((f) => f.kind === "hole");
  if (holes.length > 0) {
    const minHoleInDsl = Math.min(...holes.map((h) => inToMm(h.diameter)));
    if (minHoleInDsl < minHoleMm) {
      rules.push({
        id: "fdm-min-hole",
        label: "Holes too small for FDM",
        status: "warn",
        message: `Smallest hole is ${minHoleInDsl.toFixed(2)} mm — FDM closes holes below ${minHoleMm.toFixed(1)} mm. Drill post-print or enlarge to ≥ ${(minHoleMm * 1.25).toFixed(1)} mm.`,
      });
    } else {
      rules.push({
        id: "fdm-min-hole",
        label: "Holes sized for FDM",
        status: "pass",
        message: `All holes ≥ ${minHoleMm.toFixed(1)} mm.`,
      });
    }
  }

  // Rule 4: bends are not printable as-is — a "bent" flat pattern must be
  // printed flat and bent mechanically, which isn't how FDM works.
  const bends = dsl.features.filter((f) => f.kind === "bend");
  if (bends.length > 0) {
    rules.push({
      id: "fdm-bends",
      label: "Bent parts require a volumetric model",
      status: "warn",
      message: `This part has ${bends.length} bend${bends.length === 1 ? "" : "s"}. FDM prints solid geometry, not bent sheet. Print as a flat plate or redesign as a pre-formed L/U-channel solid.`,
    });
  }

  // Rule 5: finish note — powder coat is SCS-specific.
  if (dsl.finish?.type === "powder_coat") {
    rules.push({
      id: "fdm-finish",
      label: "Powder coat not applicable to FDM",
      status: "warn",
      message: "Powder coat is a steel-finishing process. For printed plastic, use spray paint or vapor-smoothing instead.",
    });
  }

  const hasFailures = rules.some((r) => r.status === "fail");
  return { rules, hasFailures, profile };
}

export function supportedFdmProcesses(): string[] {
  return ["FDM / FFF (generic 0.4 mm)"];
}

export { IN_PER_MM, MM_PER_IN };
