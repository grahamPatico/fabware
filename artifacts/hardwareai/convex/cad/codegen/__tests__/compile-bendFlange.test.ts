// convex/cad/codegen/__tests__/compile-bendFlange.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — bend_flange (placeholder)", () => {
  it("emits a descriptive comment and pass placeholder", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 2 },
        bend_r: { id: "bend_r", value: 3 },
        flange_len: { id: "flange_len", value: 25 },
      },
      sketches: {
        s: {
          id: "s",
          plane: "XY" as const,
          geometry: [
            {
              kind: "rect" as const,
              id: "r1",
              center: { x: 0, y: 0 },
              width: 60,
              height: 40,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "plate1",
          profile: "s",
          distance: "thickness",
          operation: "new_body" as const,
        },
        {
          kind: "bend_flange" as const,
          id: "east_flange",
          face: { feature: "plate1", tag: "east" },
          angle: 90,
          radius: "bend_r",
          length: "flange_len",
          thickness: "thickness",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    // Must have the descriptive comment with all param names
    expect(py).toContain("# bend_flange east_flange:");
    expect(py).toContain("face=plate1.east");
    expect(py).toContain("angle=90deg");
    expect(py).toContain("radius=bend_r");
    expect(py).toContain("length=flange_len");
    expect(py).toContain("thickness=thickness");
    // Must have placeholder pass
    expect(py).toContain("pass  # placeholder");
    // Must have report_entities so the entity registry gets populated
    expect(py).toContain('report_entities("east_flange"');
  });
});
