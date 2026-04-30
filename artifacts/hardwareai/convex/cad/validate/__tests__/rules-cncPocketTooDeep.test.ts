// convex/cad/validate/__tests__/rules-cncPocketTooDeep.test.ts
//
// Unit tests for the mfg.cnc-pocket-too-deep rule.
//
// Rule: cut_extrude distance > 5 × toolDiameter → warn
//       when process === "cnc"
//       DEFAULT_TOOL_D = 6.35 mm → maxDepth = 31.75 mm

import { describe, expect, it } from "vitest";
import { cncPocketTooDeep, DEFAULT_TOOL_D } from "../rules/cncPocketTooDeep";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolved(depth: number): ResolvedIr {
  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      sk_pocket: {
        id: "sk_pocket",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 20, height: 20 },
        ],
      },
    },
    features: [
      {
        kind: "cut_extrude",
        id: "pocket1",
        profile: "sk_pocket",
        distance: depth,
      },
    ],
  } as ResolvedIr;
}

function makeOriginal(
  process: CadIr["process"],
  cncToolDiameter?: number,
): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {},
    sketches: {},
    features: [],
    process,
    ...(cncToolDiameter !== undefined ? { cncToolDiameter } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cncPocketTooDeep rule", () => {
  it("emits mfg.cnc-pocket-too-deep when depth > 5× default tool diameter", () => {
    // Default tool: Ø6.35mm → maxDepth=31.75mm
    // depth=40 > 31.75 → violation (warn)
    const resolved = makeResolved(40);
    const original = makeOriginal("cnc");
    const violations = cncPocketTooDeep(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.cnc-pocket-too-deep");
    expect(violations[0].severity).toBe("warn");
    expect(violations[0].location?.kind).toBe("feature");
    expect(violations[0].location?.id).toBe("pocket1");
  });

  it("returns no violations when depth equals 5× tool diameter (boundary)", () => {
    // Boundary: depth = 5 × DEFAULT_TOOL_D = 31.75mm → no violation (not strictly >)
    const maxDepth = 5 * DEFAULT_TOOL_D;
    const resolved = makeResolved(maxDepth);
    const original = makeOriginal("cnc");
    const violations = cncPocketTooDeep(resolved, original);
    expect(violations).toEqual([]);
  });

  it("respects custom cncToolDiameter — fires when depth > 5× custom diameter", () => {
    // Custom tool: Ø12mm → maxDepth=60mm
    // depth=70 > 60 → violation
    const resolved = makeResolved(70);
    const original = makeOriginal("cnc", 12);
    const violations = cncPocketTooDeep(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.cnc-pocket-too-deep");
  });

  it("returns no violations when process is print_3d (rule inactive)", () => {
    // Rule only fires for CNC
    const resolved = makeResolved(100);
    const original = makeOriginal("print_3d");
    const violations = cncPocketTooDeep(resolved, original);
    expect(violations).toEqual([]);
  });
});
