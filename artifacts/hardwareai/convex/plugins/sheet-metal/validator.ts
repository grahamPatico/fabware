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
      // agentMessage is the message + any suggestion. Plan 4 will craft per-rule
      // imperative phrasings; for now this is a serviceable best-effort.
      agentMessage: r.suggestion ? `${r.message} ${r.suggestion}` : r.message,
    });
  }
  return violations;
}
