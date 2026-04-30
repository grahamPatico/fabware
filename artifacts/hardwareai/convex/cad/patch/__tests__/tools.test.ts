// artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
import { describe, expect, it } from "vitest";
import { CAD_IR_TOOLS } from "../tools";

const ALL_TOOL_NAMES = [
  "set_parameter",
  "add_feature",
  "modify_feature",
  "suppress",
  "unsuppress",
  "reorder_feature",
  "remove",
  "add_sketch",
  "modify_sketch",
  // Phase 4 assembly tools
  "add_part",
  "add_joint",
  "add_connection",
];

describe("CAD_IR_TOOLS", () => {
  it("exports exactly 12 tools covering all CAD IR operations", () => {
    const names = CAD_IR_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("set_parameter requires id and value", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "set_parameter")!;
    const props = t.input_schema as { properties: Record<string, unknown>; required: string[] };
    expect(props.required).toEqual(expect.arrayContaining(["id", "value"]));
  });

  it("add_feature schema covers all six feature kinds", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "add_feature")!;
    const text = JSON.stringify(t.input_schema);
    for (const kind of ["extrude", "cut_extrude", "fillet", "chamfer", "hole", "pattern"]) {
      expect(text).toContain(kind);
    }
  });

  it("add_feature hole schema includes all 4 hole sub-types and sub-object schemas", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "add_feature")!;
    const text = JSON.stringify(t.input_schema);
    for (const subtype of ["simple", "countersink", "counterbore", "threaded"]) {
      expect(text).toContain(subtype);
    }
    // Verify the three sub-object keys are present
    expect(text).toContain('"countersink"');
    expect(text).toContain('"counterbore"');
    expect(text).toContain('"thread"');
    // Verify sub-object property descriptions for countersink angle and counterbore depth
    expect(text).toContain("included angle in degrees");
    expect(text).toContain("counterbore depth");
    expect(text).toContain("thread specification");
  });

  it("modify_feature requires featureId and changes", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "modify_feature")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toEqual(expect.arrayContaining(["featureId", "changes"]));
  });

  it("suppress requires featureId", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "suppress")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toContain("featureId");
  });

  it("unsuppress requires featureId", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "unsuppress")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toContain("featureId");
  });

  it("reorder_feature requires featureId", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "reorder_feature")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toContain("featureId");
  });

  it("remove requires entityType and id", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "remove")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toEqual(expect.arrayContaining(["entityType", "id"]));
  });

  it("add_sketch requires sketch", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "add_sketch")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toContain("sketch");
  });

  it("modify_sketch requires sketchId and op", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "modify_sketch")!;
    const props = t.input_schema as { required: string[] };
    expect(props.required).toEqual(expect.arrayContaining(["sketchId", "op"]));
  });

  it("modify_sketch op covers all four op kinds", () => {
    const t = CAD_IR_TOOLS.find((t) => t.name === "modify_sketch")!;
    const text = JSON.stringify(t.input_schema);
    for (const kind of ["set_plane", "add_entity", "remove_entity", "modify_entity"]) {
      expect(text).toContain(kind);
    }
  });
});
