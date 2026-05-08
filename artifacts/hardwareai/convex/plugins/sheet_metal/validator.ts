import { validateSpec, type RuleResult } from "../../lib/scsRules";
import type { Dsl } from "./dsl";
import type { PartContext, Violation } from "../types";

/**
 * Adapt the existing scsRules validator into the new contract.
 *
 * scsRules.validateSpec consumes a SpecInput shape (legacy) and returns a
 * ValidationResult with a flat list of RuleResult. The Dsl (PartDsl) we receive
 * is structurally compatible with SpecInput's expected fields, so we can pass
 * it straight through.
 *
 * Plan 4 will replace this whole file with per-rule modules, each providing
 * its own check() + autoRepair() and choosing its own tier.
 */
export function validate(dsl: Dsl, _ctx: PartContext): Violation[] {
  const result = validateSpec(dsl as never);
  const violations: Violation[] = [];
  for (const r of result.rules as RuleResult[]) {
    if (r.status === "pass" || r.status === "na") continue;
    const severity = r.status === "fail" ? "error" : "warn";
    violations.push({
      ruleId: `sheet.${r.id}`,
      severity,
      message: r.message,
      // agentMessage is imperative text for the agent. r.suggestion is a structured
      // Partial<SpecInput> shape, not text — it goes in suggestedFix where the agent
      // (Plan 3+) and the autoRepair function (Plan 4+) can interpret it as data.
      agentMessage: r.message,
      suggestedFix: r.suggestion,
    });
  }
  return violations;
}
