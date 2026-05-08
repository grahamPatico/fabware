// convex/cad/codegen/__tests__/compile-fillet.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — fillet", () => {
  it("emits fillet call with radius and edge query", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 3 },
        fillet_r: { id: "fillet_r", value: 1 },
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
          kind: "fillet" as const,
          id: "fillet_top",
          edges: [{ feature: "extrude_base", query: "top_loop" as const }],
          radius: "fillet_r",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("fillet(extrude_base.edges().filter_by(Axis.Z), fillet_r)");
    expect(py).toContain("report_entities(\"fillet_top\", extrude_base)");
  });
});
