// convex/cad/compile/machineCost.ts
//
// Machine-cost compiler — Phase 13, Task 4.
//
// Estimates the machine / processing cost (USD) per part based on the
// manufacturing process declared in CadIr.process and the part's geometry.
//
// Formula per part (varies by process):
//
//   laser_cut:
//     costUsd = setupUsd + perimeter_mm × cutUsdPerMm
//
//   cnc:
//     costUsd = setupUsd + removeUsd (removeUsd=0 in Phase 13 v0; deferred)
//
//   print_3d:
//     costUsd = setupUsd + volumeMm3 × buildUsdPerMm3
//
//   sheet_metal_bend:
//     costUsd = setupUsd + bendCount × bendUsdEach
//     (bendCount = number of non-suppressed bend_flange features)
//
//   none (or undefined):
//     returns null — part is excluded from machine cost output
//
// External parts are always skipped (no machine processing).
// Top-level single-part IRs (no `parts` field) are treated as one part "root".

import type { CadIr, InlinePartRef } from "../ir/types";
import { lookupProcess } from "./processes";
import { estimatePerimeter } from "./perimeter";
import { estimateVolume } from "./volume";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MachineCostLine {
  partId: string;
  /** The process name resolved from the part IR. */
  process: string;
  /** Setup cost component in USD. */
  setupUsd: number;
  /**
   * Process-specific variable cost in USD.
   * For laser_cut: perimeter × cutUsdPerMm.
   * For print_3d: volume × buildUsdPerMm3.
   * For sheet_metal_bend: bendCount × bendUsdEach.
   * For cnc: removeUsd (0 in Phase 13 v0).
   * For none: 0.
   */
  variableUsd: number;
  /** Total machine cost for this part in USD (setupUsd + variableUsd). */
  costUsd: number;
}

export interface MachineCostResult {
  perPart: MachineCostLine[];
  /** Sum of all per-part machine costs in USD. */
  totalUsd: number;
}

// ── machineCostForPart ────────────────────────────────────────────────────────

/**
 * Compute the machine cost for a single inline part IR.
 *
 * Returns null if the process is "none" or undefined (no machine cost applies).
 *
 * @param partIr   The inline part's CadIr.
 * @param partId   The part id for reporting.
 * @returns        MachineCostLine or null.
 */
export function machineCostForPart(
  partIr: CadIr,
  partId: string,
): MachineCostLine | null {
  const processName = partIr.process;

  // "none" (or undefined) → skip
  if (!processName || processName === "none") return null;

  const proc = lookupProcess(processName);

  let variableUsd = 0;

  if (processName === "laser_cut") {
    const perimMm = estimatePerimeter(partIr);
    variableUsd = perimMm * proc.cutUsdPerMm;
  } else if (processName === "cnc") {
    // removeUsd = 0 in Phase 13 v0 (volume_removed estimation deferred)
    variableUsd = proc.removeUsd;
  } else if (processName === "print_3d") {
    const volMm3 = estimateVolume(partIr);
    variableUsd = volMm3 * proc.buildUsdPerMm3;
  } else if (processName === "sheet_metal_bend") {
    // Count non-suppressed bend_flange features
    const bendCount = partIr.features.filter(
      (f) => f.kind === "bend_flange" && !f.suppressed,
    ).length;
    variableUsd = bendCount * proc.bendUsdEach;
  }

  const costUsd = proc.setupUsd + variableUsd;

  return {
    partId,
    process: proc.name,
    setupUsd: proc.setupUsd,
    variableUsd,
    costUsd,
  };
}

// ── compileMachineCost ────────────────────────────────────────────────────────

/**
 * Compile machine cost for all inline parts in a CadIr assembly.
 *
 * - External parts are skipped (no machine processing — they are purchased).
 * - Inline parts with process="none" or no process are skipped (costUsd = 0).
 * - The root IR (no `parts` field) is treated as a single inline part "root".
 *
 * @param ir  Root CadIr (may be single-part or an assembly).
 * @returns   MachineCostResult with per-part lines and total.
 */
export function compileMachineCost(ir: CadIr): MachineCostResult {
  const perPart: MachineCostLine[] = [];

  if (ir.parts && Object.keys(ir.parts).length > 0) {
    // Assembly with explicit parts
    for (const part of Object.values(ir.parts)) {
      // Skip external parts — they are purchased, not machine-processed
      if ("kind" in part && part.kind === "external") continue;

      const inlinePart = part as InlinePartRef;
      const line = machineCostForPart(inlinePart.ir, inlinePart.id);
      if (line !== null) {
        perPart.push(line);
      }
    }
  } else {
    // Single-part IR — treat root as one inline part "root"
    const line = machineCostForPart(ir, "root");
    if (line !== null) {
      perPart.push(line);
    }
  }

  const totalUsd = perPart.reduce((sum, l) => sum + l.costUsd, 0);
  return { perPart, totalUsd };
}
