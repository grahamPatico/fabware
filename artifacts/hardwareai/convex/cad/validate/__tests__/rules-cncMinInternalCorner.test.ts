// convex/cad/validate/__tests__/rules-cncMinInternalCorner.test.ts
//
// Unit tests for the mfg.cnc-min-internal-corner rule.
//
// Rule: cut_extrude rect cornerRadius < toolRadius → error
//       when process === "cnc"
//       DEFAULT_TOOL_D = 6.35 mm (toolRadius = 3.175 mm)

import { describe, expect, it } from "vitest";
import { cncMinInternalCorner, DEFAULT_TOOL_D } from "../rules/cncMinInternalCorner";
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResolved(opts: {
  cornerRadius?: number;  // undefined = no cornerRadius on rect
  profileSketchId?: string;
}): ResolvedIr {
  const { cornerRadius, profileSketchId = "sk_pocket" } = opts;

  const rectEntity: Record<string, unknown> = {
    kind: "rect",
    id: "r1",
    center: { x: 0, y: 0 },
    width: 30,
    height: 20,
  };
  if (cornerRadius !== undefined) {
    rectEntity.cornerRadius = cornerRadius;
  }

  return {
    schemaVersion: 1,
    units: "mm",
    resolvedParameters: {},
    sketches: {
      [profileSketchId]: {
        id: profileSketchId,
        plane: "XY",
        geometry: [rectEntity as Parameters<typeof cncMinInternalCorner>[0]["sketches"][string]["geometry"][number]],
      },
    },
    features: [
      {
        kind: "cut_extrude",
        id: "pocket1",
        profile: profileSketchId,
        distance: 10,
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

describe("cncMinInternalCorner rule", () => {
  it("emits mfg.cnc-min-internal-corner when cornerRadius is missing (sharp corner)", () => {
    // No cornerRadius on the rect → cornerR=0 < toolRadius=3.175 → violation
    const resolved = makeResolved({ cornerRadius: undefined });
    const original = makeOriginal("cnc");
    const violations = cncMinInternalCorner(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.cnc-min-internal-corner");
    expect(violations[0].severity).toBe("error");
    expect(violations[0].location?.kind).toBe("feature");
    expect(violations[0].location?.id).toBe("pocket1");
  });

  it("emits mfg.cnc-min-internal-corner when cornerRadius < toolRadius", () => {
    // Default tool: Ø6.35mm → toolRadius=3.175mm
    // cornerRadius=2 < 3.175 → violation
    const resolved = makeResolved({ cornerRadius: 2 });
    const original = makeOriginal("cnc");
    const violations = cncMinInternalCorner(resolved, original);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("mfg.cnc-min-internal-corner");
  });

  it("returns no violations when cornerRadius >= toolRadius (boundary: exact match)", () => {
    // Default tool: Ø6.35mm → toolRadius=3.175mm
    // cornerRadius=3.175 >= 3.175 → no violation
    const toolRadius = DEFAULT_TOOL_D / 2;
    const resolved = makeResolved({ cornerRadius: toolRadius });
    const original = makeOriginal("cnc");
    const violations = cncMinInternalCorner(resolved, original);
    expect(violations).toEqual([]);
  });

  it("returns no violations when process is laser_cut (rule inactive)", () => {
    // Rule only fires for CNC
    const resolved = makeResolved({ cornerRadius: undefined });
    const original = makeOriginal("laser_cut");
    const violations = cncMinInternalCorner(resolved, original);
    expect(violations).toEqual([]);
  });
});
