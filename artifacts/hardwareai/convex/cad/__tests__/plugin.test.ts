// convex/cad/__tests__/plugin.test.ts
import { describe, expect, it } from "vitest";
import { cadIrPlugin } from "../plugin";
import type { CadIr } from "../ir/types";

// Minimal valid CadIr with no features (all validators should pass)
const CLEAN_IR: CadIr = {
  schemaVersion: 1,
  units: "mm",
  parameters: {},
  sketches: {},
  features: [],
};

// CadIr with a schema violation: duplicate feature ids
const SCHEMA_VIOLATION_IR: CadIr = {
  schemaVersion: 1,
  units: "mm",
  parameters: {},
  sketches: {},
  features: [
    { kind: "extrude", id: "ex1", profile: "sk1", distance: 10, operation: "new_body" },
    { kind: "extrude", id: "ex1", profile: "sk1", distance: 5, operation: "add" },
  ],
};

// CadIr with a manufacturing violation: hole too close to edge
// rect 100×100 centered at origin; hole at (48, 0), diameter=5
// minAllowed = 1.5*5 + 5/2 = 10; edge dist = 50 - 48 = 2 → violation
const MFG_VIOLATION_IR: CadIr = {
  schemaVersion: 1,
  units: "mm",
  parameters: {},
  sketches: {
    sk1: {
      id: "sk1",
      plane: "XY",
      geometry: [
        { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 100, height: 100 },
      ],
    },
  },
  features: [
    { kind: "extrude", id: "ex1", profile: "sk1", distance: 10, operation: "new_body" },
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

describe("cadIrPlugin", () => {
  it("kind is sheet_metal", () => {
    expect(cadIrPlugin.kind).toBe("sheet_metal");
  });

  it("exposes all 12 patch tools", () => {
    expect(cadIrPlugin.tools.map(t => t.name).sort()).toEqual([
      "add_connection", "add_feature", "add_joint", "add_part",
      "add_sketch", "modify_feature", "modify_sketch",
      "remove", "reorder_feature", "set_parameter", "suppress", "unsuppress",
    ]);
  });

  it("validate returns no violations for a clean IR", () => {
    const violations = cadIrPlugin.validate(CLEAN_IR, { scope: null, peerParts: [] });
    expect(violations).toEqual([]);
  });

  it("validate returns schema violation for duplicate feature ids (tier-1)", () => {
    const violations = cadIrPlugin.validate(SCHEMA_VIOLATION_IR, { scope: null, peerParts: [] });
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.some((v) => v.ruleId === "schema.duplicate-feature-id")).toBe(true);
  });

  it("validate returns manufacturing violation for hole-edge-distance (tier-4)", () => {
    const violations = cadIrPlugin.validate(MFG_VIOLATION_IR, { scope: null, peerParts: [] });
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.some((v) => v.ruleId === "mfg.hole-edge-distance")).toBe(true);
  });
});
