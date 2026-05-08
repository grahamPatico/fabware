import { describe, expect, it } from "vitest";
import { parseEntities } from "../entitiesParser";

describe("parseEntities", () => {
  it("builds an EntityRegistry from a raw sandbox entities array", () => {
    const raw = [
      { kind: "face", id: "ex1.top", feature: "ex1", tag: "top", topologyHash: "abc123" },
      { kind: "edge", id: "ex1.top_e0", feature: "ex1", tag: "top_e0", topologyHash: "def456" },
      { kind: "vertex", id: "ex1.v0", feature: "ex1", tag: "v0" },
    ];
    const reg = parseEntities(raw);
    expect(reg.faces["ex1.top"]).toEqual({ feature: "ex1", tag: "top", topologyHash: "abc123" });
    expect(reg.edges["ex1.top_e0"]).toEqual({ feature: "ex1", tag: "top_e0", topologyHash: "def456" });
    expect(reg.vertices["ex1.v0"]).toEqual({ feature: "ex1", tag: "v0" });
  });
});
