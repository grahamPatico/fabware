// artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
import { describe, expect, it } from "vitest";
import { CAD_IR_TOOLS } from "../tools";

describe("CAD_IR_TOOLS", () => {
  it("exports set_parameter and add_feature as Anthropic tools", () => {
    const names = CAD_IR_TOOLS.map(t => t.name).sort();
    expect(names).toEqual(["add_feature", "set_parameter"]);
  });

  it("set_parameter requires id and value", () => {
    const t = CAD_IR_TOOLS.find(t => t.name === "set_parameter")!;
    const props = (t.input_schema as { properties: Record<string, unknown>; required: string[] });
    expect(props.required).toEqual(expect.arrayContaining(["id", "value"]));
  });

  it("add_feature schema covers all six feature kinds", () => {
    const t = CAD_IR_TOOLS.find(t => t.name === "add_feature")!;
    const text = JSON.stringify(t.input_schema);
    for (const kind of ["extrude", "cut_extrude", "fillet", "chamfer", "hole", "pattern"]) {
      expect(text).toContain(kind);
    }
  });
});
