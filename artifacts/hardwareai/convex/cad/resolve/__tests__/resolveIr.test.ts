import { describe, expect, it } from "vitest";
import { resolveIr } from "../resolveIr";
import { emptyIr } from "../../ir/empty";

describe("resolveIr", () => {
  it("resolves a parameter referenced in an extrude distance", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [] } },
      features: [{
        kind: "extrude" as const, id: "e",
        profile: "s", distance: "thickness",
        operation: "new_body" as const,
      }],
    };
    const out = resolveIr(ir);
    expect((out.features[0] as { distance: number }).distance).toBe(3);
  });

  it("resolves expressions inside positions", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { spacing: { id: "spacing", value: 90 } },
      sketches: {},
      features: [{
        kind: "hole" as const, id: "h", type: "simple" as const,
        face: { feature: "any", tag: "top" },
        positions: [{ x: "spacing / 2", y: 0 }],
        diameter: 6,
      }],
    };
    const out = resolveIr(ir);
    expect((out.features[0] as { positions: Array<{ x: number; y: number }> }).positions[0].x).toBe(45);
  });
});
