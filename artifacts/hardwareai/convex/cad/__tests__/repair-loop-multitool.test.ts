// convex/cad/__tests__/repair-loop-multitool.test.ts
//
// Integration test: mock agent repair loop converges on TWO simultaneous
// violations using two different patch kinds in ≤ 2 turns.
//
// Scenario:
//   - A 100×100 extrude with distance=1mm (below 2mm minimum wall thickness)
//     AND a hole at x=48 (diameter=5, edge dist=2 < 10 → hole-edge-distance).
//   - Turn 1: agent sees mfg.min-wall-thickness → set_parameter { id: "thickness", value: 5 }
//             That fixes the wall violation; hole violation still present.
//   - Turn 2: agent sees mfg.hole-edge-distance → modify_feature { featureId: "h1",
//             changes: { positions: [{ x: 0, y: 0 }] } }
//             Moves hole to centre → no violations.
//   - Loop converges in exactly 2 turns (≤ 2 budget).

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
// Initial IR: rect 100×100, extrude thickness=1mm (violation), hole at (48,0)
// diameter=5 (violation). Two simultaneous manufacturing violations.
// ---------------------------------------------------------------------------
function makeInitialIr(): CadIr {
  return {
    ...emptyIr("mm"),
    parameters: {
      thickness: { id: "thickness", value: 1 }, // below 2mm minimum
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
            width: 100,
            height: 100,
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "ex1",
        profile: "sk1",
        distance: "thickness", // resolves to 1 → below 2mm
        operation: "new_body",
      },
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: [{ x: 48, y: 0 }], // edge dist=2, minAllowed=10 → violation
        diameter: 5,
        type: "simple",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fake agent: dispatches different patch kinds per violation type.
//   mfg.min-wall-thickness  → set_parameter (bump thickness to 5)
//   mfg.hole-edge-distance  → modify_feature (move hole to centre)
// Returns null when no violations remain.
// ---------------------------------------------------------------------------
function fakeAgent(violations: Violation[]): Patch | null {
  const hasWall = violations.some((v) => v.ruleId === "mfg.min-wall-thickness");
  if (hasWall) {
    return {
      kind: "set_parameter",
      param: { id: "thickness", value: 5 },
    };
  }

  const hasHoleEdge = violations.some((v) => v.ruleId === "mfg.hole-edge-distance");
  if (hasHoleEdge) {
    return {
      kind: "modify_feature",
      featureId: "h1",
      changes: { positions: [{ x: 0, y: 0 }] } as never,
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
describe("multitool repair loop", () => {
  it("converges on two violations using set_parameter + modify_feature in ≤ 2 turns", () => {
    let ir = makeInitialIr();

    // Verify initial state has both violations
    const initialViolations = collectViolations(ir);
    expect(initialViolations.some((v) => v.ruleId === "mfg.min-wall-thickness")).toBe(true);
    expect(initialViolations.some((v) => v.ruleId === "mfg.hole-edge-distance")).toBe(true);

    let turns = 0;
    const MAX_TURNS = 2;

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

    // Must have converged within the 2-turn budget
    expect(turns).toBeLessThanOrEqual(MAX_TURNS);
  });
});
