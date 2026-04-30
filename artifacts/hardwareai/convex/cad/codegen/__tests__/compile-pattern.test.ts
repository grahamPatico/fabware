// convex/cad/codegen/__tests__/compile-pattern.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — pattern", () => {
  it("emits a linear pattern using Location offsets", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 3 },
        hole_d: { id: "hole_d", value: 6 },
        spacing: { id: "spacing", value: 25 },
      },
      sketches: {
        s: {
          id: "s",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 100, height: 50 },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "extrude_base",
          profile: "s",
          distance: "thickness",
          operation: "new_body" as const,
        },
        {
          kind: "hole" as const,
          id: "hole_a",
          type: "simple" as const,
          face: { feature: "extrude_base", tag: "top" },
          positions: [{ x: 0, y: 0 }],
          diameter: "hole_d",
        },
        {
          kind: "pattern" as const,
          id: "hole_row",
          source: "hole_a",
          axis: "x" as const,
          count: 4,
          spacing: "spacing",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("hole_row_locations = [");
    expect(py).toContain("Location((");
    expect(py).toContain("report_entities(\"hole_row\", extrude_base)");
  });
});
