import { describe, it, expect } from "vitest";
import { dividedTray } from "../dividedTray";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("dividedTray", () => {
  it("has id=divided_tray", () => expect(dividedTray.id).toBe("divided_tray"));
  it("generates 5 parts and 4 bolted interfaces with 0 dividers", () => {
    const params = { ...dividedTray.paramDefaults(baseScope), dividerCount: 0 };
    const out = dividedTray.generate(params, baseScope);
    expect(out.parts).toHaveLength(5);
    expect(out.interfaces).toHaveLength(4);
    expect(out.interfaces.every(i => i.kind === "bolted")).toBe(true);
  });
  it("generates 8 parts and 10 bolted interfaces with 3 dividers", () => {
    const params = { ...dividedTray.paramDefaults(baseScope), dividerCount: 3 };
    const out = dividedTray.generate(params, baseScope);
    expect(out.parts).toHaveLength(8);      // 5 shell + 3 dividers
    expect(out.interfaces).toHaveLength(10); // 4 wall-to-base + 3×2 divider-to-wall
    expect(out.interfaces.every(i => i.kind === "bolted")).toBe(true);
  });
});
