// convex/cad/codegen/__tests__/compileAssembly.test.ts
import { describe, expect, it } from "vitest";
import { compileAssembly } from "../compileAssembly";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

describe("compileAssembly", () => {
  it("returns empty object when ir.parts is undefined (single-part IR)", () => {
    const ir: CadIr = emptyIr("mm");
    expect(compileAssembly(ir)).toEqual({});
  });

  it("returns per-part script for each part in ir.parts", () => {
    const partIr: CadIr = {
      ...emptyIr("mm"),
      parameters: { height: { id: "height", value: 10 } },
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "rect" as const,
              id: "r1",
              center: { x: 0, y: 0 },
              width: 20,
              height: 20,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "box1",
          profile: "sk",
          distance: "height",
          operation: "new_body" as const,
        },
      ],
    };

    const assemblyIr: CadIr = {
      ...emptyIr("mm"),
      parts: {
        part_a: { id: "part_a", ir: partIr },
        part_b: { id: "part_b", ir: { ...partIr, parameters: { height: { id: "height", value: 20 } } } },
      },
    };

    const scripts = compileAssembly(assemblyIr);

    expect(Object.keys(scripts)).toHaveLength(2);
    expect(scripts["part_a"]).toBeDefined();
    expect(scripts["part_b"]).toBeDefined();

    // Each part should have its own extrude + parameter
    expect(scripts["part_a"]).toContain("height = 10");
    expect(scripts["part_a"]).toContain("with BuildPart() as box1:");
    expect(scripts["part_a"]).toContain("extrude(amount=height)");

    expect(scripts["part_b"]).toContain("height = 20");
    expect(scripts["part_b"]).toContain("with BuildPart() as box1:");
  });

  it("returns empty object when ir.parts is an empty object", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {},
    };
    expect(compileAssembly(ir)).toEqual({});
  });

  it("compileToBuild123d API is unchanged — single-part callers still work", () => {
    // Verifies that the existing API is not broken
    const ir: CadIr = {
      ...emptyIr("mm"),
      parameters: { t: { id: "t", value: 5 } },
      sketches: {
        s: {
          id: "s",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 30, height: 30 },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "base",
          profile: "s",
          distance: "t",
          operation: "new_body" as const,
        },
      ],
    };

    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("t = 5");
    expect(py).toContain("with BuildPart() as base:");
  });
});
