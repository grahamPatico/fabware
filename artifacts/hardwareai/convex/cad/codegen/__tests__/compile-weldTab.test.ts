// convex/cad/codegen/__tests__/compile-weldTab.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — weld_tab", () => {
  it("emits Locations, BuildSketch, Rectangle and extrude inside parent body context", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        tab_len: { id: "tab_len", value: 20 },
        tab_w: { id: "tab_w", value: 10 },
        tab_t: { id: "tab_t", value: 3 },
      },
      sketches: {
        base_sk: {
          id: "base_sk",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 60, height: 40 },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "base_body",
          profile: "base_sk",
          distance: 5,
          operation: "new_body" as const,
        },
        {
          kind: "weld_tab" as const,
          id: "tab1",
          face: { feature: "base_body", tag: "north" },
          length: "tab_len",
          width: "tab_w",
          thickness: "tab_t",
          position: { x: 0, y: 15 },
        },
      ],
    });

    const py = compileToBuild123d(ir);

    // Tab modifies the parent body in-place
    expect(py).toContain("with base_body:");
    expect(py).toContain("with Locations((0, 15)):");
    expect(py).toContain("with BuildSketch():");
    expect(py).toContain("Rectangle(tab_len, tab_w)");
    expect(py).toContain("extrude(amount=tab_t)");
    expect(py).toContain('report_entities("tab1", base_body)');
  });
});
