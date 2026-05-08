// convex/cad/codegen/__tests__/compile-cut-extrude.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — cut_extrude", () => {
  it("emits a subtract extrude with Mode.SUBTRACT and references parent body", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {
        thickness: { id: "thickness", value: 3 },
        slot_depth: { id: "slot_depth", value: 2 },
      },
      sketches: {
        base_profile: {
          id: "base_profile",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r1", center: { x: 0, y: 0 }, width: 100, height: 50 },
          ],
        },
        slot_profile: {
          id: "slot_profile",
          plane: "XY" as const,
          geometry: [
            { kind: "rect" as const, id: "r2", center: { x: 0, y: 0 }, width: 20, height: 10 },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "extrude_base",
          profile: "base_profile",
          distance: "thickness",
          operation: "new_body" as const,
        },
        {
          kind: "cut_extrude" as const,
          id: "cut_slot",
          profile: "slot_profile",
          distance: "slot_depth",
        },
      ],
    });

    const py = compileToBuild123d(ir);

    expect(py).toContain("with BuildPart() as cut_slot:");
    expect(py).toContain("extrude(amount=slot_depth, mode=Mode.SUBTRACT)");
    expect(py).toContain("report_entities(\"cut_slot\", cut_slot)");
  });
});
