// convex/cad/compile/processes.ts
//
// Manufacturing process catalog — Phase 13, Task 1.
//
// Defines the built-in set of manufacturing processes and a lookup helper.
// Each process drives machine-cost rates in machineCost.ts.
//
// Phase 13 v0 ships 5 processes:
//   laser_cut      — 2-D profile cut on a laser / plasma / waterjet table
//   cnc            — subtractive CNC milling / turning
//   print_3d       — additive 3-D printing (FDM / SLA / SLS)
//   sheet_metal_bend — press-brake bending (used with bend_flange features)
//   none           — no machine processing (default / hand-work only)

// ── Types ──────────────────────────────────────────────────────────────────────

/** Canonical machine-process name. Matches keys of BUILTIN_PROCESSES. */
export type ProcessName =
  | "laser_cut"
  | "cnc"
  | "print_3d"
  | "sheet_metal_bend"
  | "none";

export interface ProcessEntry {
  /** Display name (human-readable). */
  name: string;
  /** Per-part setup cost in USD. */
  setupUsd: number;
  /**
   * Per-mm of cut/perimeter travel in USD.
   * Used for laser_cut (cut length), 0 for processes that don't use it.
   */
  cutUsdPerMm: number;
  /**
   * Per-mm³ build rate in USD.
   * Used for print_3d (build volume), 0 for processes that don't use it.
   */
  buildUsdPerMm3: number;
  /**
   * Per-bend rate in USD.
   * Used for sheet_metal_bend (bend_flange count), 0 otherwise.
   */
  bendUsdEach: number;
  /**
   * Per-mm of material removed in USD (subtractive volume proxy).
   * Used for cnc. Phase 13 v0 leaves this at 0 (volume removal deferred).
   */
  removeUsd: number;
}

// ── Built-in process catalog ──────────────────────────────────────────────────

export const BUILTIN_PROCESSES: Record<ProcessName, ProcessEntry> = {
  laser_cut: {
    name: "Laser Cut",
    setupUsd: 15,
    cutUsdPerMm: 0.005,
    buildUsdPerMm3: 0,
    bendUsdEach: 0,
    removeUsd: 0,
  },
  cnc: {
    name: "CNC Milling",
    setupUsd: 50,
    cutUsdPerMm: 0,
    buildUsdPerMm3: 0,
    bendUsdEach: 0,
    removeUsd: 0, // volume_removed estimation deferred; see Phase 13 notes
  },
  print_3d: {
    name: "3-D Printing",
    setupUsd: 5,
    cutUsdPerMm: 0,
    buildUsdPerMm3: 0.0002,
    bendUsdEach: 0,
    removeUsd: 0,
  },
  sheet_metal_bend: {
    name: "Sheet Metal Bend",
    setupUsd: 20,
    cutUsdPerMm: 0,
    buildUsdPerMm3: 0,
    bendUsdEach: 2,
    removeUsd: 0,
  },
  none: {
    name: "None",
    setupUsd: 0,
    cutUsdPerMm: 0,
    buildUsdPerMm3: 0,
    bendUsdEach: 0,
    removeUsd: 0,
  },
};

// ── lookupProcess ─────────────────────────────────────────────────────────────

/**
 * Look up a process entry by name.
 *
 * Returns the matching ProcessEntry from BUILTIN_PROCESSES.
 * Falls back to the "none" entry when the name is undefined or not found.
 *
 * @param name  ProcessName or undefined (when the CadIr doesn't declare a process).
 * @returns     ProcessEntry (always defined — fallback is "none").
 */
export function lookupProcess(name: ProcessName | undefined): ProcessEntry {
  if (name === undefined) return BUILTIN_PROCESSES.none;
  return BUILTIN_PROCESSES[name] ?? BUILTIN_PROCESSES.none;
}
