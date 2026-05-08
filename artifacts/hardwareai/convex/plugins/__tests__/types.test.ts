import { describe, it, expect } from "vitest";
import type { ProcessPlugin, Rule, Violation, AutoRepair, GeometryRef, PartContext } from "../types";

describe("plugin contract types", () => {
  it("can construct a Violation literal", () => {
    const v: Violation = {
      ruleId: "sheet.hole-edge-distance",
      severity: "error",
      message: "Hole H3 is 1.20mm from edge; min 3.20mm",
      agentMessage: "Move hole H3 so its center is ≥3.20mm from any outline edge.",
      location: { kind: "hole", id: "H3" },
    };
    expect(v.ruleId).toBe("sheet.hole-edge-distance");
    expect(v.severity).toBe("error");
  });

  it("Rule.tier is exhaustive", () => {
    const r: Rule<{ x: number }> = {
      id: "demo.rule",
      severity: "warn",
      tier: "auto-fixable",
      check: () => null,
    };
    expect(r.tier).toBe("auto-fixable");
  });

  it("ProcessPlugin shape compiles for a stub", () => {
    const stub: ProcessPlugin<{ x: number }> = {
      kind: "sheet_metal",
      dslSchema: { parse: (v) => v as { x: number } } as never,
      tools: [],
      systemPromptFragment: "",
      rules: [],
      validate: () => [],
      autoRepair: () => null,
      renderPreview: () => ({ meshes: [] }),
      export: () => [],
      estimateCost: () => ({ totalUsd: 0, breakdown: [] }),
      supportedInterfaces: [],
    };
    expect(stub.kind).toBe("sheet_metal");
  });
});
