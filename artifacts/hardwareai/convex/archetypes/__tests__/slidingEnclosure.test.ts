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
  it("has 4 weld_seam corner joints (drawer slides freely)", () => {
    // Sheet-metal shell is corner-welded; drawer slides with no fasteners.
    // The drawer-stop pop rivet was dropped because the wall_back↔drawer
    // "riveted" interface had no defined feature on either part — see
    // comment in slidingEnclosure.ts. A tab/slot weld_joint is a follow-up.
    const params = slidingEnclosure.paramDefaults(baseScope);
    const out = slidingEnclosure.generate(params, baseScope);
    expect(out.interfaces).toHaveLength(4);
    expect(out.interfaces.every(i => i.kind === "weld_seam")).toBe(true);
  });
});
