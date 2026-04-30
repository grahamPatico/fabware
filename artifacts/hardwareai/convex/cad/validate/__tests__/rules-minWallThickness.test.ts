import { describe, expect, it } from "vitest";
import { minWallThickness } from "../rules/minWallThickness";
import type { ResolvedIr } from "../../resolve/resolveIr";

function makeIr(extrudeDistance: number): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {},
    features: [
      {
        kind: "extrude",
        id: "ex1",
        profile: "sk1",
        distance: extrudeDistance,
        operation: "new_body",
      },
    ],
  };
}

describe("minWallThickness rule", () => {
  it("emits mfg.min-wall-thickness when extrude distance is below 2mm", () => {
    const violations = minWallThickness(makeIr(1));
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.min-wall-thickness");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("feature");
    expect(violations[0].location?.id).toBe("ex1");
  });

  it("returns no violations when extrude distance is at or above 2mm", () => {
    expect(minWallThickness(makeIr(3))).toEqual([]);
    expect(minWallThickness(makeIr(2))).toEqual([]);
  });
});
