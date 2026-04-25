import { describe, it, expect } from "vitest";
import { shelfWithBrackets } from "../shelfWithBrackets";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("shelfWithBrackets", () => {
  it("has id=shelf_with_brackets", () => expect(shelfWithBrackets.id).toBe("shelf_with_brackets"));
  it("generates 3 parts, 2 bolted interfaces", () => {
    const params = shelfWithBrackets.paramDefaults(baseScope);
    const out = shelfWithBrackets.generate(params, baseScope);
    expect(out.parts).toHaveLength(3);
    expect(out.interfaces).toHaveLength(2);
    expect(out.interfaces.every(i => i.kind === "bolted")).toBe(true);
  });
  it("both brackets have bend features", () => {
    const params = shelfWithBrackets.paramDefaults(baseScope);
    const out = shelfWithBrackets.generate(params, baseScope);
    const bracketLeft  = out.parts.find(p => p.role === "bracket_left");
    const bracketRight = out.parts.find(p => p.role === "bracket_right");
    expect(bracketLeft!.dsl.features.some(f => f.kind === "bend")).toBe(true);
    expect(bracketRight!.dsl.features.some(f => f.kind === "bend")).toBe(true);
  });
});
