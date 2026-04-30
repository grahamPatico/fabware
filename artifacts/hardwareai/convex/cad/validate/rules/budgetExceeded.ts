// convex/cad/validate/rules/budgetExceeded.ts
//
// Phase 10: budget rule.
//
// If `ir.budget` is set, compile the BOM cost using BUILTIN_PRICING and emit a
// warning if the total known cost exceeds the budget.
//
// Severity is "warn" (not "error") because:
//   1. Missing prices make the total an underestimate — the design may or may
//      not be over budget.
//   2. Budget is a soft constraint; the agent should surface it to the user
//      rather than hard-blocking codegen.

import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import { compileCost, BUILTIN_PRICING } from "../../compile/cost";

/**
 * Check whether the assembly's BOM cost exceeds `ir.budget`.
 *
 * @returns A warn-severity violation array (0 or 1 items).
 */
export function budgetExceeded(ir: CadIr): Violation[] {
  if (ir.budget === undefined) return [];

  const { totalKnown, hasMissingPrices } = compileCost(ir, BUILTIN_PRICING);

  if (totalKnown <= ir.budget) return [];

  const missingNote = hasMissingPrices
    ? " (some parts have no price data and are excluded from this total)"
    : "";

  return [
    {
      ruleId: "bom.budget-exceeded",
      severity: "warn",
      message: `BOM cost $${totalKnown.toFixed(2)} exceeds budget $${ir.budget.toFixed(2)}${missingNote}`,
      agentMessage:
        `The known BOM cost ($${totalKnown.toFixed(2)}) exceeds the stated budget ` +
        `($${ir.budget.toFixed(2)})${missingNote}. ` +
        `Consider reducing the number of external parts, substituting cheaper alternatives, ` +
        `or increasing the budget field.`,
    },
  ];
}
