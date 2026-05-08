// convex/cad/validate/__tests__/assemblyTier.test.ts
// Phase 4 Task 4 — assembly tier validator tests
import { describe, expect, it } from "vitest";
import { validateAssemblyTier } from "../assemblyTier";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("validateAssemblyTier", () => {
  it("returns no violations for an empty IR (no parts)", () => {
    expect(validateAssemblyTier(emptyIr("mm"))).toEqual([]);
  });

  it("returns no violations for a single-part assembly (no joints needed)", () => {
    const result = validateAssemblyTier(ir({
      parts: { base: { id: "base", ir: emptyIr("mm") } },
    }));
    expect(result).toEqual([]);
  });

  it("detects a floating part (part with no joints in a multi-part assembly)", () => {
    const result = validateAssemblyTier(ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        floating: { id: "floating", ir: emptyIr("mm") },
      },
      joints: {
        // Only base is in joints — floating has no connections
        j1: { id: "j1", parent: "base", child: "base", type: "fixed" },
      },
    }));
    expect(result.some(v => v.ruleId === "assembly.floating-part")).toBe(true);
    const floatingViolation = result.find(v => v.ruleId === "assembly.floating-part");
    expect(floatingViolation?.message).toContain("floating");
  });

  it("detects over-constrained rigid group (cycle in fixed joints)", () => {
    const result = validateAssemblyTier(ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        j1: { id: "j1", parent: "base", child: "lid", type: "fixed" },
        j2: { id: "j2", parent: "lid", child: "base", type: "fixed" }, // creates cycle
      },
    }));
    expect(result.some(v => v.ruleId === "assembly.over-constrained-rigid-group")).toBe(true);
  });

  it("accepts a valid two-part assembly with a revolute joint", () => {
    const result = validateAssemblyTier(ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "base",
          child: "lid",
          type: "revolute",
          axis: { kind: "standard", axis: "y" },
          limits: { lower: 0, upper: 90, unit: "deg" },
        },
      },
    }));
    expect(result).toEqual([]);
  });
});
