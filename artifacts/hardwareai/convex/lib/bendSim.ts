// Laser + bend manufacturability simulator. Walks a sheet-metal DSL and
// produces an ordered list of fabrication steps:
//
//   step 0  Cut       — laser cuts the flat outline; checks max sheet, material
//                       cuttability.
//   step k  Bend k    — folds at the k-th bend feature; per-bend checks for
//                       material bend ability, min bend radius, flange length,
//                       hole-to-bend distance.
//   final   Interfere — pairwise check for parallel bends sharing material.
//
// Each step carries its own list of pass/warn/fail rules so the UI can render
// a step-by-step validation strip (chunk 2.7b will animate it). Backend used
// directly in `validatePartByKind` so the bend rules also surface in the
// existing assembly-rules panel.

import type { PartDsl, BendFeature, HoleFeature } from "./dsl";
import { SCS_MATERIALS, type MaterialRule } from "./scsRules";

export type SimStatus = "pass" | "warn" | "fail";

export interface SimRule {
  id: string;
  label: string;
  status: SimStatus;
  message: string;
  suggestion?: string;
}

export interface SimStep {
  id: string;
  /** "cut" | "bend" | "interference" — used by the UI to pick an icon. */
  kind: "cut" | "bend" | "interference";
  label: string;
  rules: SimRule[];
}

const FALLBACK: MaterialRule = SCS_MATERIALS["Mild Steel (CRS)"];

function pass(id: string, label: string, message: string): SimRule {
  return { id, label, status: "pass", message };
}
function fail(id: string, label: string, message: string, suggestion?: string): SimRule {
  return { id, label, status: "fail", message, suggestion };
}
function warn(id: string, label: string, message: string, suggestion?: string): SimRule {
  return { id, label, status: "warn", message, suggestion };
}

function holeLocalPositions(hole: HoleFeature, width: number, height: number): Array<{ x: number; y: number }> {
  const inset = hole.inset ?? 0.375;
  const out: Array<{ x: number; y: number }> = [];
  switch (hole.pattern) {
    case "corner": {
      const n = Math.min(hole.count, 4);
      const corners = [
        { x: inset,         y: inset          },
        { x: width - inset, y: inset          },
        { x: inset,         y: height - inset },
        { x: width - inset, y: height - inset },
      ];
      for (let i = 0; i < n; i++) out.push(corners[i]);
      break;
    }
    case "center":
      out.push({ x: width / 2, y: height / 2 });
      break;
    case "top_row": {
      const y = height - inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) out.push({ x: inset + i * step, y });
      break;
    }
    case "bottom_row": {
      const y = inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) out.push({ x: inset + i * step, y });
      break;
    }
  }
  return out;
}

export function simulatePart(dsl: PartDsl): SimStep[] {
  const mat = SCS_MATERIALS[dsl.material] ?? FALLBACK;
  const t = dsl.thickness;
  const steps: SimStep[] = [];

  // ============================================================
  // STEP 0 — Laser cut
  // ============================================================
  const cutRules: SimRule[] = [];
  const fitsW = dsl.width <= mat.maxSheet.width;
  const fitsH = dsl.height <= mat.maxSheet.height;
  cutRules.push(fitsW && fitsH
    ? pass("sheet_size", "Within max sheet",
        `${dsl.width.toFixed(2)}" × ${dsl.height.toFixed(2)}" fits ${mat.maxSheet.width}" × ${mat.maxSheet.height}".`)
    : fail("sheet_size", "Exceeds max sheet",
        `${dsl.width.toFixed(2)}" × ${dsl.height.toFixed(2)}" exceeds ${mat.name}'s ${mat.maxSheet.width}" × ${mat.maxSheet.height}" sheet.`,
        "Split into smaller parts or pick a material with a larger max sheet."));

  const okThickness = mat.thicknesses.some(g => Math.abs(g - t) < 0.0006);
  cutRules.push(okThickness
    ? pass("thickness_in_catalog", "Standard gauge", `${t}" is a stocked thickness for ${mat.name}.`)
    : warn("thickness_in_catalog", "Non-standard gauge",
        `${t}" is not in ${mat.name}'s catalog (${mat.thicknesses.join(", ")}). SCS will quote special order.`));

  // Hole-to-edge distance: every hole's outer rim must sit at least 2*t from
  // the part outline. SCS will laser through closer, but the rim deforms during
  // material handling. Rule applies to all sheet-metal regardless of bends.
  const holes = dsl.features.filter((f): f is HoleFeature => f.kind === "hole");
  if (holes.length > 0) {
    const minClear = 2 * t;
    let worstName = "";
    let worstDist = Infinity;
    for (const h of holes) {
      const r = h.diameter / 2;
      const positions = holeLocalPositions(h, dsl.width, dsl.height);
      for (const p of positions) {
        const distToEdge = Math.min(p.x, p.y, dsl.width - p.x, dsl.height - p.y) - r;
        if (distToEdge < minClear && distToEdge < worstDist) {
          worstDist = distToEdge;
          worstName = h.name;
        }
      }
    }
    if (worstDist === Infinity) {
      cutRules.push(pass("hole_to_edge", "Hole-to-edge distance OK",
        `All holes at least ${minClear.toFixed(3)}" + radius from the part outline.`));
    } else if (worstDist < 0) {
      cutRules.push(fail("hole_to_edge", "Hole breaks the outline",
        `${worstName}: hole rim is ${(-worstDist).toFixed(3)}" past the edge — it cuts through the part outline.`,
        `Move the hole at least ${minClear.toFixed(3)}" inside the part edge.`));
    } else {
      cutRules.push(warn("hole_to_edge", "Hole near edge",
        `${worstName}: rim sits ${worstDist.toFixed(3)}" from the nearest edge; recommend ≥ ${minClear.toFixed(3)}" so it doesn't deform during cutting.`,
        `Move the hole inward to at least ${minClear.toFixed(3)}" of clearance.`));
    }
  }

  // Top-level material compatibility — surfaces gotchas (powder coat on a
  // non-coatable material, requested bend on a non-bendable material,
  // unusual bend-radius multiplier) once at the cut step. Per-bend rules
  // still fire for individual bend feasibility.
  const hasBendFeature = dsl.features.some(f => f.kind === "bend");
  const wantsPowderCoat = dsl.finish?.type === "powder_coat";
  const compatNotes: string[] = [];
  let compatStatus: SimStatus = "pass";
  if (wantsPowderCoat && !mat.canPowderCoat) {
    compatStatus = "fail";
    compatNotes.push(`${mat.name} can't be powder coated.`);
  }
  if (hasBendFeature && !mat.canBend) {
    compatStatus = "fail";
    compatNotes.push(`${mat.name} can't be press-brake bent.`);
  }
  if (mat.bendRadiusMultiplier > 1.001 && mat.bendRadiusMultiplier < 90) {
    if (compatStatus !== "fail") compatStatus = compatStatus === "warn" ? "warn" : "warn";
    compatNotes.push(`${mat.name} requires bend radius ≥ ${mat.bendRadiusMultiplier.toFixed(1)} × thickness (${(mat.bendRadiusMultiplier * t).toFixed(3)}" at ${t}").`);
  }
  if (compatStatus === "pass") {
    cutRules.push(pass("material_compat", "Material vs features",
      `${mat.name} supports the requested features (${hasBendFeature ? "bend, " : ""}${wantsPowderCoat ? "powder coat, " : ""}cut).`));
  } else if (compatStatus === "warn") {
    cutRules.push(warn("material_compat", "Material caveat", compatNotes.join(" ")));
  } else {
    cutRules.push(fail("material_compat", "Material incompatible with requested features",
      compatNotes.join(" "),
      "Switch material or remove the incompatible feature (bend / powder coat)."));
  }

  steps.push({ id: "step_cut", kind: "cut", label: "Laser cut flat pattern", rules: cutRules });

  // ============================================================
  // BEND STEPS — one per bend feature, in DSL order
  // ============================================================
  const bends = dsl.features.filter((f): f is BendFeature => f.kind === "bend");
  bends.forEach((bend, i) => {
    const rules: SimRule[] = [];

    // Material bendability
    if (!mat.canBend) {
      rules.push(fail("material_bendable", "Material cannot bend",
        `${mat.name} cannot be press-brake bent. Acrylic and 6061 aluminum are common offenders.`,
        "Switch to a bendable material (Mild Steel, 5052 Aluminum, Stainless 304) or split into bolted plates."));
    } else {
      rules.push(pass("material_bendable", "Material bendable", `${mat.name} bends on a press brake.`));
    }

    // Min bend radius
    const minR = t * mat.bendRadiusMultiplier;
    rules.push(bend.radius >= minR - 0.0005
      ? pass("min_bend_radius", "Bend radius OK",
          `R${bend.radius.toFixed(3)}" ≥ min R${minR.toFixed(3)}" for ${mat.name} at ${t}".`)
      : fail("min_bend_radius", "Bend radius too tight",
          `R${bend.radius.toFixed(3)}" < min R${minR.toFixed(3)}" — outer fiber will crack.`,
          `Use radius ≥ ${minR.toFixed(3)}" or thinner material.`));

    // Min flange length (≥ 4× thickness past the bend tangent)
    const minFlange = 4 * t;
    const lengthAlongAxis = bend.axis === "horizontal" ? dsl.height : dsl.width;
    const bendLine = bend.positionRatio * lengthAlongAxis;
    const flangeA = bendLine;
    const flangeB = lengthAlongAxis - bendLine;
    const shortFlange = Math.min(flangeA, flangeB);
    rules.push(shortFlange >= minFlange - 0.0005
      ? pass("min_flange", "Flange length OK",
          `Shorter side ${shortFlange.toFixed(2)}" ≥ min ${minFlange.toFixed(2)}".`)
      : fail("min_flange", "Flange too short",
          `Shorter flange ${shortFlange.toFixed(2)}" < ${minFlange.toFixed(2)}" — die can't grip.`,
          `Move the bend toward the part center, or extend the part to ≥ ${(2 * minFlange).toFixed(2)}" along the bend axis.`));

    // Hole-to-bend clearance (≥ 2× thickness from bend tangent OR holes will distort)
    const minHoleClear = 2 * t;
    const holes = dsl.features.filter((f): f is HoleFeature => f.kind === "hole");
    let holeClearOk = true;
    let worstHoleDist = Infinity;
    let worstHoleName = "";
    for (const h of holes) {
      const positions = holeLocalPositions(h, dsl.width, dsl.height);
      for (const p of positions) {
        const distFromBend = bend.axis === "horizontal"
          ? Math.abs(p.y - bendLine)
          : Math.abs(p.x - bendLine);
        const required = minHoleClear + h.diameter / 2;
        if (distFromBend < required) {
          holeClearOk = false;
          if (distFromBend < worstHoleDist) {
            worstHoleDist = distFromBend;
            worstHoleName = h.name;
          }
        }
      }
    }
    if (holes.length === 0) {
      rules.push(pass("hole_to_bend", "Hole clearance N/A", "No holes on this part."));
    } else if (holeClearOk) {
      rules.push(pass("hole_to_bend", "Hole-to-bend clearance OK",
        `All holes ≥ ${minHoleClear.toFixed(3)}" + radius from the bend tangent.`));
    } else {
      rules.push(warn("hole_to_bend", "Hole near bend",
        `${worstHoleName} sits ${worstHoleDist.toFixed(3)}" from the bend; will distort during forming.`,
        `Move the hole at least ${minHoleClear.toFixed(3)}" past the bend tangent.`));
    }

    steps.push({
      id: `step_bend_${i}`,
      kind: "bend",
      label: `Bend ${i + 1}: ${bend.angle}° ${bend.axis}, R${bend.radius.toFixed(3)}"`,
      rules,
    });
  });

  // ============================================================
  // INTERFERENCE — parallel bends too close
  // ============================================================
  if (bends.length >= 2) {
    const rules: SimRule[] = [];
    let sawAny = false;
    for (let i = 0; i < bends.length; i++) {
      for (let j = i + 1; j < bends.length; j++) {
        if (bends[i].axis !== bends[j].axis) continue;
        const len = bends[i].axis === "horizontal" ? dsl.height : dsl.width;
        const dist = Math.abs(bends[i].positionRatio - bends[j].positionRatio) * len;
        const required = 4 * t;
        sawAny = true;
        if (dist < required - 0.0005) {
          rules.push(fail(`interference_${i}_${j}`, "Bend interference",
            `${bends[i].name} and ${bends[j].name} are only ${dist.toFixed(3)}" apart — needs ≥ ${required.toFixed(3)}" of flat between them.`,
            `Move one bend, increase part length, or switch to thinner material.`));
        } else {
          rules.push(pass(`interference_${i}_${j}`, "Bend pair clear",
            `${bends[i].name} ↔ ${bends[j].name}: ${dist.toFixed(3)}" apart (≥ ${required.toFixed(3)}").`));
        }
      }
    }
    if (sawAny) {
      steps.push({ id: "step_interference", kind: "interference", label: "Bend-bend interference", rules });
    }
  }

  return steps;
}

/**
 * Flatten the simulator's per-step rules into a single rules list, prefixed
 * with each rule's step label. Used by `validatePartByKind` so the bend
 * checks land in the existing assembly-rules panel today, before the
 * dedicated simulator UI ships.
 */
export function bendRulesForPartValidator(dsl: PartDsl): Array<{
  id: string; label: string; status: SimStatus; message: string; suggestion?: string;
}> {
  const out: Array<{ id: string; label: string; status: SimStatus; message: string; suggestion?: string }> = [];
  for (const step of simulatePart(dsl)) {
    for (const r of step.rules) {
      // Skip the cosmetic pass-state rules from the cut step; assembly panel
      // already shows max-sheet style checks elsewhere.
      if (step.kind === "cut" && r.status === "pass") continue;
      out.push({
        id: `sim_${r.id}`,
        label: `${step.label} — ${r.label}`,
        status: r.status,
        message: r.message,
        suggestion: r.suggestion,
      });
    }
  }
  return out;
}
