// convex/cad/codegen/__tests__/compile-loft.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";
import { CadIrSchema } from "../../ir/schema";

describe("compileToBuild123d — loft", () => {
  it("accepts ≥ 2 profiles and emits multiple BuildSketch contexts and loft call", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        sk_bot: {
          id: "sk_bot",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 40, height: 40 },
          ],
        },
        sk_top: {
          id: "sk_top",
          plane: "XY" as const,
          geometry: [
            { kind: "circle" as const, id: "c1", center: { x: 0, y: 0 }, radius: 10 },
          ],
        },
      },
      features: [
        {
          kind: "loft" as const,
          id: "loft_body",
          profiles: ["sk_bot", "sk_top"],
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("with BuildPart() as loft_body:");
    expect(py).toContain("with BuildSketch() as _s0:");
    expect(py).toContain("Rectangle(40, 40)");
    expect(py).toContain("with BuildSketch() as _s1:");
    expect(py).toContain("Circle(10)");
    expect(py).toContain("loft(sections=[_s0, _s1])");
    expect(py).toContain('report_entities("loft_body", loft_body)');
  });

  it("rejects a loft feature with only 1 profile (schema validation)", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "loft", id: "loft1", profiles: ["sk_only"] },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
