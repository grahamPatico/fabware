// convex/cad/__tests__/repair-loop-mock.test.ts
//
// Integration test: mock agent repair loop converges on a hole-edge-distance
// violation in ≤ 3 turns.
//
// Scenario:
//   - A 100×100 extrude with a hole at x=48 (diameter=5).
//   - edge dist = 50 - 48 = 2 mm; minAllowed = 1.5*5 + 5/2 = 10 → violation.
//   - The fake agent responds to "mfg.hole-edge-distance" by calling
//     set_parameter { id: "length", value: 130 } which widens the part so the
//     hole is safely inside.

import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch/apply";
import { resolveIr } from "../resolve/resolveIr";
import { validateSchemaTier } from "../validate/schemaTier";
import { validateManufacturingTier } from "../validate/manufacturingTier";
import { emptyIr } from "../ir/empty";
import type { CadIr } from "../ir/types";
import type { Violation } from "../../plugins/types";
import type { Patch } from "../patch/types";

// ---------------------------------------------------------------------------
// Initial IR: rect 100×100 (via 'length' parameter), hole at (48, 0), d=5
// edge dist = 50 - 48 = 2 → mfg.hole-edge-distance violation
// ---------------------------------------------------------------------------
function makeInitialIr(): CadIr {
  return {
    ...emptyIr("mm"),
    parameters: {
      length: { id: "length", value: 100 },
    },
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "r1",
            center: { x: 0, y: 0 },
            width: "length",
            height: "length",
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "ex1",
        profile: "sk1",
        distance: 10,
        operation: "new_body",
      },
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: [{ x: 48, y: 0 }],
        diameter: 5,
        type: "simple",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fake agent: responds to mfg.hole-edge-distance by widening 'length' to 130
// With length=130: half = 65, edge dist = 65 - 48 = 17 ≥ 10 → no violation.
// ---------------------------------------------------------------------------
function fakeAgent(violations: Violation[]): Patch | null {
  const hasHoleEdge = violations.some((v) => v.ruleId === "mfg.hole-edge-distance");
  if (hasHoleEdge) {
    return {
      kind: "set_parameter",
      param: { id: "length", value: 130 },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Collect all violations (schema + manufacturing) for a given IR
// ---------------------------------------------------------------------------
function collectViolations(ir: CadIr): Violation[] {
  const schemaViols = validateSchemaTier(ir);
  if (schemaViols.length > 0) return schemaViols;
  const resolved = resolveIr(ir);
  return validateManufacturingTier(resolved, ir);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
describe("mock repair loop", () => {
  it("converges on hole-edge-distance violation in ≤ 3 turns", () => {
    let ir = makeInitialIr();
    let turns = 0;
    const MAX_TURNS = 3;

    while (turns < MAX_TURNS) {
      const violations = collectViolations(ir);
      if (violations.length === 0) break;

      const patch = fakeAgent(violations);
      expect(patch).not.toBeNull(); // agent must always propose a fix

      const { ir: next, schemaViolations } = applyPatch(ir, patch!);
      expect(schemaViolations).toHaveLength(0); // patch must be schema-valid

      ir = next;
      turns++;
    }

    // After the loop, the IR must be clean
    const finalViolations = collectViolations(ir);
    expect(finalViolations).toHaveLength(0);

    // Must have converged within the budget
    expect(turns).toBeLessThanOrEqual(MAX_TURNS);
  });
});
