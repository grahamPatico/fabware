// convex/cad/validate/__tests__/rules-boltClearance.test.ts
import { describe, expect, it } from "vitest";
import { boltClearance } from "../rules/boltClearance";
import type { ResolvedIr } from "../../resolve/resolveIr";

function makeIr(pilotDiameter: number, cboreDiameter: number): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {},
    features: [
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: pilotDiameter,
        type: "counterbore",
        counterbore: {
          diameter: cboreDiameter,
          depth: 4,
        },
      },
    ],
  };
}

describe("boltClearance rule", () => {
  it("emits mfg.bolt-clearance when counterbore diameter is too small", () => {
    // pilot=5, cbore=5.5 → need 1.2*5=6, 5.5 < 6 → violation
    const violations = boltClearance(makeIr(5, 5.5));
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.bolt-clearance");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("hole");
    expect(violations[0].location?.id).toBe("h1");
  });

  it("returns no violations when counterbore diameter meets the 1.2x threshold exactly", () => {
    // pilot=5, cbore=6 → 1.2*5=6, 6 >= 6 → no violation
    const violations = boltClearance(makeIr(5, 6));
    expect(violations).toEqual([]);
  });

  it("returns no violations when counterbore diameter exceeds threshold", () => {
    // pilot=5, cbore=9 → well above 6 → no violation
    const violations = boltClearance(makeIr(5, 9));
    expect(violations).toEqual([]);
  });

  it("ignores simple holes (not counterbore)", () => {
    const ir: ResolvedIr = {
      schemaVersion: 1,
      units: "mm",
      resolvedParameters: {},
      sketches: {},
      features: [
        {
          kind: "hole",
          id: "h2",
          face: { feature: "ex1", tag: "top" },
          positions: [{ x: 0, y: 0 }],
          diameter: 5,
          type: "simple",
        },
      ],
    };
    expect(boltClearance(ir)).toEqual([]);
  });
});
