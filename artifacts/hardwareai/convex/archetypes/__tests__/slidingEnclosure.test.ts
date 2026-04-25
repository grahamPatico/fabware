import { describe, it, expect } from "vitest";
import { slidingEnclosure } from "../slidingEnclosure";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("slidingEnclosure", () => {
  it("has id=sliding_enclosure", () => expect(slidingEnclosure.id).toBe("sliding_enclosure"));
  it("generates 6 parts including a drawer", () => {
    const params = slidingEnclosure.paramDefaults(baseScope);
    const out = slidingEnclosure.generate(params, baseScope);
    expect(out.parts).toHaveLength(6);
    const drawer = out.parts.find(p => p.role === "drawer");
    expect(drawer).toBeDefined();
  });
  it("has >= 5 interfaces including 4 bolted and 1 riveted", () => {
    const params = slidingEnclosure.paramDefaults(baseScope);
    const out = slidingEnclosure.generate(params, baseScope);
    expect(out.interfaces.length).toBeGreaterThanOrEqual(5);
    expect(out.interfaces.filter(i => i.kind === "bolted")).toHaveLength(4);
    expect(out.interfaces.filter(i => i.kind === "riveted")).toHaveLength(1);
  });
});
