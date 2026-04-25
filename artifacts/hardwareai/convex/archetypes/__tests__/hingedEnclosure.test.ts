import { describe, it, expect } from "vitest";
import { hingedEnclosure } from "../hingedEnclosure";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = {
  tier: "mvp",
  environment: { location: "indoor" },
  useCase: "test",
};

describe("hingedEnclosure", () => {
  it("exports id=hinged_enclosure", () => {
    expect(hingedEnclosure.id).toBe("hinged_enclosure");
  });

  it("generates exactly 6 parts (base + 4 walls + lid)", () => {
    const params = hingedEnclosure.paramDefaults(baseScope);
    const { parts } = hingedEnclosure.generate(params, baseScope);
    expect(parts).toHaveLength(6);
    const roles = parts.map(p => p.role).sort();
    expect(roles).toEqual(["base", "lid", "wall_back", "wall_front", "wall_left", "wall_right"]);
  });

  it("generates 5 interfaces (4 wall-to-base bolted + 1 lid hinged)", () => {
    const params = hingedEnclosure.paramDefaults(baseScope);
    const { interfaces } = hingedEnclosure.generate(params, baseScope);
    expect(interfaces).toHaveLength(5);
    expect(interfaces.filter(i => i.kind === "bolted")).toHaveLength(4);
    expect(interfaces.filter(i => i.kind === "hinged")).toHaveLength(1);
  });

  it("defaults to stainless + powder coat for outdoor commercial", () => {
    const scope: ProjectScope = {
      tier: "commercial",
      environment: { location: "outdoor", waterproof: true },
      useCase: "test",
    };
    const params = hingedEnclosure.paramDefaults(scope);
    expect(params.material).toMatch(/Stainless/);
  });
});
