// convex/cad/codegen/__tests__/compileToUrdf.test.ts
// Phase 4 Task 5 — URDF compiler tests
import { describe, expect, it } from "vitest";
import { compileToUrdf } from "../compileToUrdf";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("compileToUrdf", () => {
  it("emits a fixed joint between base and lid", () => {
    const cadIr = ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        j1: { id: "j1", parent: "base", child: "lid", type: "fixed" },
      },
    });
    const urdf = compileToUrdf(cadIr, "test_robot");
    expect(urdf).toContain('type="fixed"');
    expect(urdf).toContain('<parent link="base"/>');
    expect(urdf).toContain('<child link="lid"/>');
  });

  it("emits a revolute joint with correct axis and limits in radians", () => {
    const cadIr = ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        arm: { id: "arm", ir: emptyIr("mm") },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "base",
          child: "arm",
          type: "revolute",
          axis: { kind: "standard", axis: "y" },
          limits: { lower: 0, upper: 90, unit: "deg" },
        },
      },
    });
    const urdf = compileToUrdf(cadIr, "test_robot");
    expect(urdf).toContain('type="revolute"');
    expect(urdf).toContain('<axis xyz="0 1 0"/>');
    // 0 deg → 0 rad, 90 deg → π/2 ≈ 1.5707963...
    expect(urdf).toContain('lower="0"');
    expect(urdf).toMatch(/upper="1\.570/); // π/2
  });

  it("emits a prismatic (linear) joint with limits converted from mm to meters", () => {
    const cadIr = ir({
      units: "mm",
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        slider: { id: "slider", ir: emptyIr("mm") },
      },
      joints: {
        slide: {
          id: "slide",
          parent: "base",
          child: "slider",
          type: "linear",
          axis: { kind: "standard", axis: "z" },
          limits: { lower: 0, upper: 100, unit: "mm" }, // 100mm → 0.1m
        },
      },
    });
    const urdf = compileToUrdf(cadIr, "test_robot");
    expect(urdf).toContain('type="prismatic"');
    // 100 mm → 0.1 m
    expect(urdf).toContain('upper="0.1"');
  });

  it("converts origin from mm to meters in joint origin tag", () => {
    const cadIr = ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        j1: {
          id: "j1",
          parent: "base",
          child: "lid",
          type: "fixed",
          origin: { x: 0, y: 0, z: 50 }, // 50 mm → 0.05 m
        },
      },
    });
    const urdf = compileToUrdf(cadIr, "test_robot");
    // 50 mm → 0.05 m
    expect(urdf).toContain('xyz="0 0 0.05"');
  });
});
