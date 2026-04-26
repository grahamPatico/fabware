import { describe, it, expect } from "vitest";
import { sheetMetalPlugin } from "../index";

describe("sheetMetalPlugin", () => {
  it("declares kind = 'sheet_metal'", () => {
    expect(sheetMetalPlugin.kind).toBe("sheet_metal");
  });

  it("supportedInterfaces matches the schema's interface kinds", () => {
    expect(sheetMetalPlugin.supportedInterfaces.sort()).toEqual(
      ["bolted", "hinged", "pem_inserted", "riveted"],
    );
  });

  it("validate() forwards to the adapter and returns violations array", () => {
    const dsl = {
      version: 1 as const,
      partType: "bracket" as const,
      material: "Mild Steel (CRS)",
      thickness: 0.999, // non-stocked — should produce a violation
      width: 4,
      height: 3,
      depth: null,
      features: [],
      finish: null,
      assemblyRefs: [],
    };
    const violations = sheetMetalPlugin.validate(dsl, { scope: null, peerParts: [] });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("autoRepair always returns null in Plan 2 (Plan 4 wires per-rule fixes)", () => {
    const dsl = {
      version: 1 as const,
      partType: "bracket" as const,
      material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null, features: [], finish: null, assemblyRefs: [],
    };
    const result = sheetMetalPlugin.autoRepair(dsl, {
      ruleId: "sheet.any",
      severity: "error",
      message: "x", agentMessage: "x",
    });
    expect(result).toBeNull();
  });

  it("exposes the sheet-metal tool surface (refine_part + add_feature_to_part)", () => {
    const names = sheetMetalPlugin.tools.map((t) => t.name);
    expect(names).toContain("refine_part");
    expect(names).toContain("add_feature_to_part");
    expect(sheetMetalPlugin.tools.length).toBe(2);
  });

  it("has a non-empty systemPromptFragment", () => {
    expect(sheetMetalPlugin.systemPromptFragment.length).toBeGreaterThan(50);
  });
});
