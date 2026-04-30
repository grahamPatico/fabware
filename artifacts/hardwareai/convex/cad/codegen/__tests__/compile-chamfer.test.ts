// convex/cad/codegen/__tests__/compile-chamfer.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — chamfer", () => {
  it("emits chamfer call with length and edge query", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 3 },
        chamfer_d: { id: "chamfer_d", value: 0.5 },
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
          kind: "chamfer" as const,
          id: "chamfer_edge",
          edges: [{ feature: "extrude_base", query: "top_loop" as const }],
          distance: "chamfer_d",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("chamfer(extrude_base.edges().filter_by(Axis.Z), chamfer_d)");
    expect(py).toContain("report_entities(\"chamfer_edge\", extrude_base)");
  });
});
