// convex/cad/validate/__tests__/rules-minBendRadius.test.ts
import { describe, expect, it } from "vitest";
import { minBendRadius } from "../rules/minBendRadius";
import type { ResolvedIr } from "../../resolve/resolveIr";

function makeIrWithBend(overrides: {
  radius?: number;
  thickness?: number;
}): ResolvedIr {
  const { radius = 2, thickness = 1 } = overrides;
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {},
    features: [
      {
        kind: "bend_flange",
        id: "flange1",
        face: { feature: "plate1", tag: "east" },
        angle: 90,
        radius,
        length: 20,
        thickness,
      },
    ],
  };
}

describe("minBendRadius rule", () => {
  it("returns no violations when radius >= thickness", () => {
    // r = 2, t = 1 → valid (r >= t)
    const violations = minBendRadius(makeIrWithBend({ radius: 2, thickness: 1 }));
    expect(violations).toEqual([]);
  });

  it("returns no violations when radius equals thickness exactly", () => {
    // r = 2, t = 2 → valid (r === t is OK)
    const violations = minBendRadius(makeIrWithBend({ radius: 2, thickness: 2 }));
    expect(violations).toEqual([]);
  });

  it("emits mfg.min-bend-radius when radius < thickness", () => {
    // r = 0.5, t = 1.5 → violation
    const violations = minBendRadius(makeIrWithBend({ radius: 0.5, thickness: 1.5 }));
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.min-bend-radius");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("feature");
    expect(violations[0].location?.id).toBe("flange1");
  });

  it("emits violation message referencing the feature id", () => {
    const violations = minBendRadius(makeIrWithBend({ radius: 0.8, thickness: 2 }));
    expect(violations[0].message).toContain("flange1");
    expect(violations[0].message).toContain("0.8mm");
  });

  it("does not flag non-bend_flange features", () => {
    const ir: ResolvedIr = {
      schemaVersion: 1,
      units: "mm",
      resolvedParameters: {},
      sketches: {},
      features: [
        {
          kind: "extrude",
          id: "ex1",
          profile: "sk1",
          distance: 5,
          operation: "new_body",
        },
      ],
    };
    expect(minBendRadius(ir)).toEqual([]);
  });
});
