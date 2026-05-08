// convex/cad/codegen/__tests__/compile-sweep.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — sweep", () => {
  it("emits BuildPart with BuildSketch (profile), BuildLine (path) and sweep call", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        profile_sk: {
          id: "profile_sk",
          plane: "XY" as const,
          geometry: [
            { kind: "circle" as const, id: "c1", center: { x: 0, y: 0 }, radius: 5 },
          ],
        },
        path_sk: {
          id: "path_sk",
          plane: "XZ" as const,
          geometry: [
            { kind: "line" as const, id: "l1", p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 } },
          ],
        },
      },
      features: [
        {
          kind: "sweep" as const,
          id: "sweep_body",
          profile: "profile_sk",
          path: "path_sk",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("with BuildPart() as sweep_body:");
    expect(py).toContain("with BuildSketch() as _profile:");
    expect(py).toContain("Circle(5)");
    expect(py).toContain("with BuildLine() as _path:");
    expect(py).toContain("Line((0, 0), (0, 100))");
    expect(py).toContain("sweep(sections=_profile, path=_path)");
    expect(py).toContain('report_entities("sweep_body", sweep_body)');
  });
});
