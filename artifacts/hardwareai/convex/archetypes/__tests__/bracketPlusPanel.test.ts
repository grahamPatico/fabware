import { describe, it, expect } from "vitest";
import { bracketPlusPanel } from "../bracketPlusPanel";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("bracketPlusPanel", () => {
  it("has id=bracket_plus_panel", () => expect(bracketPlusPanel.id).toBe("bracket_plus_panel"));
  it("generates 2 parts, 1 bolted interface", () => {
    const params = bracketPlusPanel.paramDefaults(baseScope);
    const out = bracketPlusPanel.generate(params, baseScope);
    expect(out.parts).toHaveLength(2);
    expect(out.interfaces).toHaveLength(1);
    expect(out.interfaces[0].kind).toBe("bolted");
  });
  it("bracket has a bend feature", () => {
    const params = bracketPlusPanel.paramDefaults(baseScope);
    const out = bracketPlusPanel.generate(params, baseScope);
    const bracket = out.parts.find(p => p.role === "bracket");
    expect(bracket).toBeDefined();
    expect(bracket!.dsl.features.some(f => f.kind === "bend")).toBe(true);
  });
});
