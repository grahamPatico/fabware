// convex/cad/__tests__/assembly-mock.test.ts
//
// Phase 4 Task 11: Multi-part hinged-box integration test.
// Scenario: build a hinged box assembly from scratch using the patch applier,
// validate with the assembly tier, and compile to URDF.
//
// The "assembly" has:
//   - base: an empty sub-IR (blank box body)
//   - lid:  an empty sub-IR (blank lid body)
//   - hinge: revolute joint, axis Y, 0–90°
//
// We deliberately start with a floating-part violation (add parts before joints),
// then apply the joint patch to fix it, then compile to URDF.

import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch/apply";
import { validateAssemblyTier } from "../validate/assemblyTier";
import { compileToUrdf } from "../codegen/compileToUrdf";
import { emptyIr } from "../ir/empty";
import type { CadIr } from "../ir/types";

describe("hinged-box assembly mock", () => {
  it("builds a two-part assembly, detects floating-part violation, repairs with add_joint, compiles to URDF", () => {
    // ── Step 1: Start with empty IR ─────────────────────────────────────────
    let ir: CadIr = emptyIr("mm");

    // ── Step 2: Add base part ────────────────────────────────────────────────
    const r1 = applyPatch(ir, {
      kind: "add_part",
      part: { id: "base", ir: emptyIr("mm"), origin: { x: 0, y: 0, z: 0 } },
    });
    expect(r1.schemaViolations).toEqual([]);
    ir = r1.ir;

    // ── Step 3: Add lid part ─────────────────────────────────────────────────
    const r2 = applyPatch(ir, {
      kind: "add_part",
      part: { id: "lid", ir: emptyIr("mm"), origin: { x: 0, y: 0, z: 50 } },
    });
    expect(r2.schemaViolations).toEqual([]);
    ir = r2.ir;

    // ── Step 4: Validate — both parts are floating (no joints yet) ───────────
    const violations = validateAssemblyTier(ir);
    expect(violations.some(v => v.ruleId === "assembly.floating-part")).toBe(true);
    // Both base AND lid should be floating
    const floatingIds = violations
      .filter(v => v.ruleId === "assembly.floating-part")
      .map(v => v.message);
    expect(floatingIds.some(m => m.includes("base"))).toBe(true);
    expect(floatingIds.some(m => m.includes("lid"))).toBe(true);

    // ── Step 5: Add hinge joint to fix the floating-part violation ───────────
    const r3 = applyPatch(ir, {
      kind: "add_joint",
      joint: {
        id: "hinge",
        parent: "base",
        child: "lid",
        type: "revolute",
        axis: { kind: "standard", axis: "y" },
        limits: { lower: 0, upper: 90, unit: "deg" },
        origin: { x: 0, y: 0, z: 50 },
      },
    });
    expect(r3.schemaViolations).toEqual([]);
    ir = r3.ir;

    // ── Step 6: Re-validate — no violations ─────────────────────────────────
    const violations2 = validateAssemblyTier(ir);
    expect(violations2).toEqual([]);

    // ── Step 7: Compile to URDF ──────────────────────────────────────────────
    const urdf = compileToUrdf(ir, "hinged_box");

    // Basic structure checks
    expect(urdf).toContain('<robot name="hinged_box">');
    expect(urdf).toContain('<link name="base"/>');
    expect(urdf).toContain('<link name="lid"/>');
    expect(urdf).toContain('<joint name="hinge" type="revolute">');
    expect(urdf).toContain('<parent link="base"/>');
    expect(urdf).toContain('<child link="lid"/>');
    expect(urdf).toContain('<axis xyz="0 1 0"/>');
    // 0 deg → 0 rad, 90 deg → π/2
    expect(urdf).toContain('lower="0"');
    expect(urdf).toMatch(/upper="1\.570/);
    // origin z: 50mm → 0.05m
    expect(urdf).toContain('xyz="0 0 0.05"');
    expect(urdf).toContain("</robot>");
  });
});
