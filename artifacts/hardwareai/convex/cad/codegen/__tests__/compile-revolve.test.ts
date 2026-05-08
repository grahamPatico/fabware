// convex/cad/codegen/__tests__/compile-revolve.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — revolve", () => {
  it("emits a BuildPart block with revolve call using named angle param", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        sweep_angle: { id: "sweep_angle", value: 270 },
      },
      sketches: {
        profile_sk: {
          id: "profile_sk",
          plane: "XZ" as const,
          geometry: [
            {
              kind: "rect" as const,
              id: "r1",
              center: { x: 10, y: 5 },
              width: 5,
              height: 10,
            },
          ],
        },
      },
      features: [
        {
          kind: "revolve" as const,
          id: "rev_body",
          profile: "profile_sk",
          axis: "z" as const,
          angle: "sweep_angle",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("sweep_angle = 270");
    expect(py).toContain("with BuildPart() as rev_body:");
    expect(py).toContain("revolve(revolution_arc=sweep_angle)");
    expect(py).toContain('report_entities("rev_body", rev_body)');
  });

  it("emits revolve with literal angle when no param matches", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "circle" as const,
              id: "c1",
              center: { x: 20, y: 0 },
              radius: 5,
            },
          ],
        },
      },
      features: [
        {
          kind: "revolve" as const,
          id: "rev1",
          profile: "sk",
          axis: "y" as const,
          angle: 180,
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("with BuildPart() as rev1:");
    expect(py).toContain("revolve(revolution_arc=180)");
    expect(py).toContain('report_entities("rev1", rev1)');
  });
});
