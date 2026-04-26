import type { ProcessPlugin, PartContext, Violation } from "../plugins/types";

export interface SpecialistResult<TDsl> {
  status: "ok" | "escalated";
  violations: Violation[];
  repairedDsl: TDsl;
  autoRepairedCount: number;
}

/**
 * One pass of validate → auto-repair (single attempt per violation) → re-validate.
 * Plan 3 will extend this into the full two-tier loop with R repair turns and
 * cascade re-validation; Plan 2 keeps it single-pass because no autoRepair functions
 * exist yet (every plugin.autoRepair returns null today).
 */
export function runSpecialistOnce<TDsl>(
  plugin: ProcessPlugin<TDsl>,
  dsl: TDsl,
  ctx: PartContext,
): SpecialistResult<TDsl> {
  let current = dsl;
  let autoRepairedCount = 0;
  const initial = plugin.validate(current, ctx);
  for (const v of initial) {
    const repaired = plugin.autoRepair(current, v);
    if (repaired !== null) {
      current = repaired;
      autoRepairedCount += 1;
    }
  }
  const remaining = autoRepairedCount > 0 ? plugin.validate(current, ctx) : initial;
  return {
    status: remaining.length === 0 ? "ok" : "escalated",
    violations: remaining,
    repairedDsl: current,
    autoRepairedCount,
  };
}
