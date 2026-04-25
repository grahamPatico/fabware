import type { PrintedDsl } from "./printedDsl";
import { boundingBox } from "./printedDsl";

const MIN_WALL_MM: Record<string, number> = {
  PLA: 1.2, PETG: 1.6, Nylon: 2.0, ABS: 1.5, Resin: 0.8,
};

const BED_MM = { x: 250, y: 250, z: 250 };  // generic FDM bed

export interface PrintedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

export function validatePrinted(dsl: PrintedDsl): {
  rules: PrintedRuleResult[];
  hasFailures: boolean;
} {
  const rules: PrintedRuleResult[] = [];
  const bb = boundingBox(dsl);

  // Rule 1: fits bed
  if (bb.w > BED_MM.x || bb.d > BED_MM.y || bb.h > BED_MM.z) {
    rules.push({
      id: "fits_bed", label: "Fits print bed", status: "fail",
      message: `Bounding box ${bb.w}×${bb.d}×${bb.h}mm exceeds 250×250×250mm bed.`,
      suggestion: "Reduce dimensions or split into multiple parts.",
    });
  } else {
    rules.push({ id: "fits_bed", label: "Fits print bed", status: "pass", message: `${bb.w}×${bb.d}×${bb.h}mm OK.` });
  }

  // Rule 2: min wall thickness — heuristic: smallest primitive dim in extrusion direction
  const minWall = MIN_WALL_MM[dsl.material] ?? 1.5;
  const smallest = Math.min(bb.w, bb.d, bb.h);
  if (smallest < minWall) {
    rules.push({
      id: "min_wall", label: "Minimum wall", status: "fail",
      message: `Smallest dim ${smallest}mm < ${minWall}mm for ${dsl.material}.`,
      suggestion: `Thicken to ≥ ${minWall}mm or switch to a stronger material.`,
    });
  } else if (smallest < minWall * 1.5) {
    rules.push({
      id: "min_wall", label: "Minimum wall", status: "warn",
      message: `${smallest}mm is close to ${dsl.material}'s ${minWall}mm minimum.`,
    });
  } else {
    rules.push({ id: "min_wall", label: "Minimum wall", status: "pass", message: `${smallest}mm OK.` });
  }

  // Rule 3: layer height vs detail
  if (dsl.layerHeight > 0.3) {
    rules.push({
      id: "layer_height", label: "Layer height", status: "warn",
      message: `Layer height ${dsl.layerHeight}mm coarse — may degrade fine features.`,
    });
  } else {
    rules.push({ id: "layer_height", label: "Layer height", status: "pass", message: `${dsl.layerHeight}mm OK.` });
  }

  // Rule 4: infill sanity
  if (dsl.infill < 0.15 && dsl.material !== "Resin") {
    rules.push({
      id: "infill", label: "Infill", status: "warn",
      message: `${Math.round(dsl.infill * 100)}% infill is low for ${dsl.material} structural parts.`,
      suggestion: "Bump to 20–30% for parts under load.",
    });
  } else {
    rules.push({ id: "infill", label: "Infill", status: "pass", message: `${Math.round(dsl.infill * 100)}% OK.` });
  }

  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}
