// convex/cad/codegen/__tests__/compile-hole.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — hole", () => {
  it("emits Hole calls at each position with diameter / 2 as radius", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 3 },
        hole_d: { id: "hole_d", value: 6 },
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
          id: "mounting_holes",
          type: "simple" as const,
          face: { feature: "extrude_base", tag: "top" },
          positions: [
            { x: 10, y: 10 },
            { x: -10, y: 10 },
          ],
          diameter: "hole_d",
          depth: "thickness",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toMatch(/Hole\(radius=hole_d \/ 2/);
    expect(py).toContain("with Locations(");
    expect(py).toContain("report_entities(\"mounting_holes\", extrude_base)");
  });

  it("emits CounterSinkHole for type=countersink", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 5 },
        hole_d: { id: "hole_d", value: 5 },
      },
      sketches: {
        s: {
          id: "s",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 80, height: 80 },
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
          id: "cs_hole",
          type: "countersink" as const,
          face: { feature: "extrude_base", tag: "top" },
          positions: [{ x: 0, y: 0 }],
          diameter: "hole_d",
          depth: "thickness",
          countersink: { angle: 90, diameter: 10 },
        },
      ],
    });

    const py = compileToBuild123d(ir);
    expect(py).toContain("CounterSinkHole(");
    expect(py).toContain("counter_sink_radius=");
    expect(py).toContain("counter_sink_angle=90");
  });
});
