// convex/cad/codegen/__tests__/compile-shell.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — shell", () => {
  it("emits shell() call with top-face selector and report_entities", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 10 },
        wall_t: { id: "wall_t", value: 2 },
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
              width: 50,
              height: 50,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "box1",
          profile: "s",
          distance: "thickness",
          operation: "new_body" as const,
        },
        {
          kind: "shell" as const,
          id: "shell1",
          thickness: "wall_t",
          removedFaces: [{ feature: "box1", tag: "top" }],
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("wall_t = 2");
    // Should use parentBodyId (box1) as the body to shell
    expect(py).toContain("shell(box1.part, amount=-wall_t,");
    // Top face → sort_by(Axis.Z)[-1]
    expect(py).toContain("box1.faces().sort_by(Axis.Z)[-1]");
    expect(py).toContain('report_entities("shell1", box1)');
  });

  it("emits shell() with bottom-face selector", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thick: { id: "thick", value: 20 },
        wall: { id: "wall", value: 3 },
      },
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "rect" as const,
              id: "r1",
              center: { x: 0, y: 0 },
              width: 40,
              height: 40,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "block",
          profile: "sk",
          distance: "thick",
          operation: "new_body" as const,
        },
        {
          kind: "shell" as const,
          id: "shell_bottom",
          thickness: "wall",
          removedFaces: [{ feature: "block", tag: "bottom" }],
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("shell(block.part, amount=-wall,");
    // Bottom face → sort_by(Axis.Z)[0]
    expect(py).toContain("block.faces().sort_by(Axis.Z)[0]");
    expect(py).toContain('report_entities("shell_bottom", block)');
  });
});
