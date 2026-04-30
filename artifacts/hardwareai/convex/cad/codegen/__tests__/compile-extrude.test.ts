// convex/cad/codegen/__tests__/compile-extrude.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — extrude", () => {
  it("emits a BuildPart block and extrude call with named param", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 } },
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
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("thickness = 3");
    expect(py).toContain("with BuildPart() as extrude_base:");
    expect(py).toContain("extrude(amount=thickness)");
  });
});
