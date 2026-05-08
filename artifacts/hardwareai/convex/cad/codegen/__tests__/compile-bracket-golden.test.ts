// convex/cad/codegen/__tests__/compile-bracket-golden.test.ts
//
// Golden snapshot test for the canonical bracket IR.
// Asserts that compileToBuild123d output is stable across refactors.

import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

// ---------------------------------------------------------------------------
// Canonical bracket IR
// A simple L-bracket: 120×80 base extrusion with mounting holes and a fillet.
// ---------------------------------------------------------------------------
const canonical_bracket_ir: CadIr = {
  ...emptyIr("mm"),
  parameters: {
    length:     { id: "length",     value: 120,  unit: "mm", description: "Overall bracket length" },
    width:      { id: "width",      value: 80,   unit: "mm", description: "Overall bracket width" },
    thickness:  { id: "thickness",  value: 5,    unit: "mm", description: "Wall thickness" },
    hole_d:     { id: "hole_d",     value: 6,    unit: "mm", description: "Mounting hole diameter" },
    fillet_r:   { id: "fillet_r",   value: 3,    unit: "mm", description: "Edge fillet radius" },
  },
  sketches: {
    base_profile: {
      id: "base_profile",
      plane: "XY",
      geometry: [
        {
          kind: "rect",
          id: "base_rect",
          center: { x: 0, y: 0 },
          width: "length",
          height: "width",
        },
      ],
    },
  },
  features: [
    {
      kind: "extrude",
      id: "base_extrude",
      profile: "base_profile",
      distance: "thickness",
      operation: "new_body",
    },
    {
      kind: "hole",
      id: "mounting_holes",
      type: "simple",
      face: { feature: "base_extrude", tag: "top" },
      positions: [
        { x: 45, y: 30 },
        { x: -45, y: 30 },
        { x: 45, y: -30 },
        { x: -45, y: -30 },
      ],
      diameter: "hole_d",
      depth: "thickness",
    },
    {
      kind: "fillet",
      id: "edge_fillet",
      edges: [{ feature: "base_extrude", query: "top_loop" }],
      radius: "fillet_r",
    },
  ],
};

describe("compileToBuild123d — bracket golden snapshot", () => {
  it("produces stable output for the canonical bracket IR", () => {
    const py = compileToBuild123d(resolveIr(canonical_bracket_ir));
    expect(py).toMatchSnapshot();
  });
});
