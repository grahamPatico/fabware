// artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../apply";
import { emptyIr } from "../../ir/empty";

describe("applyPatch", () => {
  it("set_parameter adds a new parameter", () => {
    const r = applyPatch(emptyIr("mm"), { kind: "set_parameter", param: { id: "length", value: 120 } });
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.parameters.length.value).toBe(120);
  });

  it("set_parameter updates an existing parameter", () => {
    const r = applyPatch(
      { ...emptyIr("mm"), parameters: { length: { id: "length", value: 100 } } },
      { kind: "set_parameter", param: { id: "length", value: 120 } },
    );
    expect(r.ir.parameters.length.value).toBe(120);
  });

  it("add_feature appends a feature", () => {
    const r = applyPatch(
      { ...emptyIr("mm"), sketches: { s: { id: "s", plane: "XY", geometry: [] } } },
      { kind: "add_feature", feature: { kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" } },
    );
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.features).toHaveLength(1);
  });

  it("rejects an add_feature whose schema-tier validation fails", () => {
    const r = applyPatch(
      emptyIr("mm"),
      { kind: "add_feature", feature: { kind: "extrude", id: "e", profile: "missing_sketch", distance: 3, operation: "new_body" } },
    );
    expect(r.schemaViolations.length).toBeGreaterThan(0);
    expect(r.ir.features).toHaveLength(0);
  });
});
