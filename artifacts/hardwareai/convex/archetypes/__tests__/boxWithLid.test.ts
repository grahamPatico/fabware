import { describe, it, expect } from "vitest";
import { boxWithLid } from "../boxWithLid";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("boxWithLid", () => {
  it("has id=box_with_lid", () => expect(boxWithLid.id).toBe("box_with_lid"));
  it("generates 6 parts, 8 weld_seam interfaces", () => {
    // Body corners switched from "bolted" to "weld_seam" — see comment in
    // boxWithLid.ts. Bolted joints required PEM flanges that the current DSL
    // doesn't model.
    const params = boxWithLid.paramDefaults(baseScope);
    const out = boxWithLid.generate(params, baseScope);
    expect(out.parts).toHaveLength(6);
    expect(out.interfaces).toHaveLength(8);
    expect(out.interfaces.every(i => i.kind === "weld_seam")).toBe(true);
  });
});
