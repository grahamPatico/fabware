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

  // ── Task 2: suppress / unsuppress ────────────────────────────────────────

  it("suppress sets the suppressed flag on a feature", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
    };
    const r = applyPatch(parent, { kind: "suppress", featureId: "e" });
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.features[0].suppressed).toBe(true);
  });

  it("unsuppress clears the suppressed flag", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body", suppressed: true }],
    };
    const r = applyPatch(parent, { kind: "unsuppress", featureId: "e" });
    expect(r.ir.features[0].suppressed).toBe(false);
  });

  it("suppress on a missing feature returns a violation", () => {
    const r = applyPatch(emptyIr("mm"), { kind: "suppress", featureId: "missing" });
    expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
  });

  // ── Task 3: reorder_feature ───────────────────────────────────────────────

  it("reorder_feature with beforeFeatureId moves a feature earlier", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "a", profile: "s", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "b", profile: "s", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "c", profile: "s", distance: 3, operation: "new_body" },
      ],
    };
    const r = applyPatch(parent, { kind: "reorder_feature", featureId: "c", beforeFeatureId: "b" });
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.features.map(f => f.id)).toEqual(["a", "c", "b"]);
  });

  it("reorder_feature with afterFeatureId moves a feature later", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "a", profile: "s", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "b", profile: "s", distance: 3, operation: "new_body" },
      ],
    };
    const r = applyPatch(parent, { kind: "reorder_feature", featureId: "a", afterFeatureId: "b" });
    expect(r.ir.features.map(f => f.id)).toEqual(["b", "a"]);
  });

  it("reorder_feature that creates forward references is rejected", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "base", profile: "s", distance: 3, operation: "new_body" },
        { kind: "fillet", id: "f", edges: [{ feature: "base", query: "all" }], radius: 1 },
      ],
    };
    // Move base after fillet — fillet now references a later feature
    const r = applyPatch(parent, { kind: "reorder_feature", featureId: "base", afterFeatureId: "f" });
    expect(r.schemaViolations.some(v => v.ruleId === "schema.forward-feature-ref")).toBe(true);
    // ir reverts to parent
    expect(r.ir.features.map(f => f.id)).toEqual(["base", "f"]);
  });

  // ── Task 4: remove ────────────────────────────────────────────────────────

  it("remove deletes a parameter", () => {
    const parent: CadIr = { ...emptyIr("mm"), parameters: { x: { id: "x", value: 1 } } };
    const r = applyPatch(parent, { kind: "remove", entityType: "parameter", id: "x" });
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.parameters).toEqual({});
  });

  it("remove deletes a sketch", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    };
    const r = applyPatch(parent, { kind: "remove", entityType: "sketch", id: "s" });
    expect(r.ir.sketches).toEqual({});
  });

  it("remove deletes a feature", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "e1", profile: "s", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "e2", profile: "s", distance: 3, operation: "new_body" },
      ],
    };
    const r = applyPatch(parent, { kind: "remove", entityType: "feature", id: "e1" });
    expect(r.ir.features.map(f => f.id)).toEqual(["e2"]);
  });

  it("remove that orphans a reference is rejected", () => {
    const parent: CadIr = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "base", profile: "s", distance: 3, operation: "new_body" },
        { kind: "fillet", id: "f", edges: [{ feature: "base", query: "all" }], radius: 1 },
      ],
    };
    const r = applyPatch(parent, { kind: "remove", entityType: "feature", id: "base" });
    expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
  });
});
