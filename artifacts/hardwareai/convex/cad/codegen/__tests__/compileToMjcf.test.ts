// convex/cad/codegen/__tests__/compileToMjcf.test.ts
// Phase 6 Task 5 — MJCF compiler tests
import { describe, expect, it } from "vitest";
import { compileToMjcf } from "../compileToMjcf";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("compileToMjcf", () => {
  it("emits a revolute joint as hinge with converted radian limits", () => {
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
    const mjcf = compileToMjcf(cadIr, "test_model");

    expect(mjcf).toContain('type="hinge"');
    expect(mjcf).toContain('axis="0 1 0"');
    // 0 deg → 0 rad, 90 deg → π/2 ≈ 1.5707963
    expect(mjcf).toContain('range="0');
    expect(mjcf).toMatch(/range="0 1\.570/);
  });

  it("emits a linear joint as slide with limits converted from mm to meters", () => {
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
          limits: { lower: 0, upper: 100, unit: "mm" }, // 100 mm → 0.1 m
        },
      },
    });
    const mjcf = compileToMjcf(cadIr, "test_model");

    expect(mjcf).toContain('type="slide"');
    expect(mjcf).toContain('axis="0 0 1"');
    // 100 mm → 0.1 m
    expect(mjcf).toContain('range="0 0.1"');
  });

  it("emits model name in root element", () => {
    const cadIr = ir({});
    const mjcf = compileToMjcf(cadIr, "my_robot");
    expect(mjcf).toContain('model="my_robot"');
    expect(mjcf).toContain("<mujoco");
    expect(mjcf).toContain("<worldbody>");
  });

  it("joint type=fixed emits no joint element inside child body", () => {
    const cadIr = ir({
      parts: {
        base: { id: "base", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: {
        j1: { id: "j1", parent: "base", child: "lid", type: "fixed" },
      },
    });
    const mjcf = compileToMjcf(cadIr, "box_test");
    // Lid body should exist but contain no <joint> element
    expect(mjcf).toContain('name="lid"');
    expect(mjcf).not.toContain('<joint type="hinge"');
    expect(mjcf).not.toContain('<joint type="slide"');
  });
});
