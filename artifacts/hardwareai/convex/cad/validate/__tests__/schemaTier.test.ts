import { describe, expect, it } from "vitest";
import { validateSchemaTier } from "../schemaTier";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("validateSchemaTier", () => {
  it("returns no violations for an empty IR", () => {
    expect(validateSchemaTier(emptyIr("mm"))).toEqual([]);
  });

  it("detects unresolved profile reference", () => {
    const v = validateSchemaTier(ir({
      features: [{ kind: "extrude", id: "ex", profile: "missing", distance: 3, operation: "new_body" }],
    }));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("schema.unresolved-sketch-ref");
  });

  it("detects duplicate feature ids", () => {
    const v = validateSchemaTier(ir({
      sketches: { s1: { id: "s1", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "dup", profile: "s1", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "dup", profile: "s1", distance: 3, operation: "new_body" },
      ],
    }));
    expect(v.some(x => x.ruleId === "schema.duplicate-feature-id")).toBe(true);
  });

  it("detects unresolved face reference in hole", () => {
    const v = validateSchemaTier(ir({
      features: [{
        kind: "hole", id: "h", type: "simple",
        face: { feature: "missing_feat", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
      }],
    }));
    expect(v.some(x => x.ruleId === "schema.unresolved-feature-ref")).toBe(true);
  });

  it("detects feature referring to a later feature", () => {
    const v = validateSchemaTier(ir({
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "fillet", id: "f", edges: [{ feature: "later", query: "all" }], radius: 1 },
        { kind: "extrude", id: "later", profile: "s", distance: 3, operation: "new_body" },
      ],
    }));
    expect(v.some(x => x.ruleId === "schema.forward-feature-ref")).toBe(true);
  });

  // ── Phase 4: Joint / Connection schema checks ─────────────────────────────

  it("detects joint referencing a missing parent part", () => {
    const v = validateSchemaTier(ir({
      parts: { lid: { id: "lid", ir: emptyIr("mm") } },
      joints: {
        hinge: {
          id: "hinge",
          parent: "base", // "base" not in parts
          child: "lid",
          type: "revolute",
        },
      },
    }));
    expect(v.some(x => x.ruleId === "schema.joint-missing-part")).toBe(true);
  });

  it("detects joint referencing a missing child part", () => {
    const v = validateSchemaTier(ir({
      parts: { base: { id: "base", ir: emptyIr("mm") } },
      joints: {
        hinge: {
          id: "hinge",
          parent: "base",
          child: "lid", // "lid" not in parts
          type: "fixed",
        },
      },
    }));
    expect(v.some(x => x.ruleId === "schema.joint-missing-part")).toBe(true);
  });

  it("detects duplicate joint ids", () => {
    const v = validateSchemaTier(ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        // Both joints have the same id "hinge"
        hinge: { id: "hinge", parent: "base", child: "lid", type: "fixed" },
        hinge2: { id: "hinge", parent: "base", child: "lid", type: "revolute" },
      },
    }));
    expect(v.some(x => x.ruleId === "schema.duplicate-joint-id")).toBe(true);
  });
});
