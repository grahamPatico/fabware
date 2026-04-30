// artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../apply";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

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

  // ── Task 1: modify_feature ────────────────────────────────────────────────

  it("modify_feature updates fields on an existing feature", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
    };
    const r = applyPatch(parent, {
      kind: "modify_feature",
      featureId: "e",
      changes: { distance: 5 },
    });
    expect(r.schemaViolations).toEqual([]);
    expect((r.ir.features[0] as { distance: number }).distance).toBe(5);
  });

  it("modify_feature rejects changing the feature kind", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
    };
    const r = applyPatch(parent, {
      kind: "modify_feature",
      featureId: "e",
      changes: { kind: "fillet" } as never,
    });
    expect(r.schemaViolations.length).toBeGreaterThan(0);
  });

  it("modify_feature targeting a missing id is a no-op that records a violation", () => {
    const r = applyPatch(emptyIr("mm"), {
      kind: "modify_feature", featureId: "missing", changes: { distance: 5 } as never,
    });
    expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
    expect(r.ir.features).toHaveLength(0);
  });
});
