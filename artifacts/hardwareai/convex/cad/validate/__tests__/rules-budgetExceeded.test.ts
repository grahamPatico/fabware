// convex/cad/validate/__tests__/rules-budgetExceeded.test.ts
// Phase 10 Task 3 — budgetExceeded rule tests

import { describe, expect, it } from "vitest";
import { budgetExceeded } from "../rules/budgetExceeded";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function assemblyIr(parts: CadIr["parts"], budget?: number): CadIr {
  return { ...emptyIr("mm"), parts, ...(budget !== undefined ? { budget } : {}) };
}

describe("budgetExceeded rule", () => {
  it("returns no violations when budget is not set", () => {
    // 2 × M6 SHCS ($0.84) but no budget field → no violation
    const ir = assemblyIr({
      s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      s2: { id: "s2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
    });
    expect(budgetExceeded(ir)).toHaveLength(0);
  });

  it("returns no violations when cost is under budget", () => {
    // 1 × M6 SHCS = $0.42; budget $1.00
    const ir = assemblyIr(
      { s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" } },
      1.00,
    );
    expect(budgetExceeded(ir)).toHaveLength(0);
  });

  it("returns no violations when cost exactly equals budget", () => {
    // 1 × M6 SHCS = $0.42; budget exactly $0.42
    const ir = assemblyIr(
      { s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" } },
      0.42,
    );
    expect(budgetExceeded(ir)).toHaveLength(0);
  });

  it("returns a warn violation when cost exceeds budget", () => {
    // 2 × M6 SHCS = $0.84; budget $0.50 → over budget
    const ir = assemblyIr(
      {
        s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
        s2: { id: "s2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      },
      0.50,
    );
    const violations = budgetExceeded(ir);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("bom.budget-exceeded");
    expect(violations[0].severity).toBe("warn");
    expect(violations[0].message).toContain("$0.84");
    expect(violations[0].message).toContain("$0.50");
  });
});
