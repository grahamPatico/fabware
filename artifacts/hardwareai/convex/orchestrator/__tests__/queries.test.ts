import { describe, it, expect } from "vitest";
import { assembleDesignPlan } from "../queries";

describe("assembleDesignPlan", () => {
  it("returns a plan with all sections empty when nothing exists", () => {
    const plan = assembleDesignPlan({
      project: { _id: "p1" as never, name: "demo", phase: "scoping", useNewHarness: true } as never,
      parts: [],
      interfaces: [],
      openViolations: [],
      openEscalations: [],
    });
    expect(plan.phase).toBe("scoping");
    expect(plan.parts).toEqual([]);
    expect(plan.openViolations).toEqual([]);
  });

  it("propagates the lists into the plan", () => {
    const plan = assembleDesignPlan({
      project: { _id: "p1" as never, name: "demo", phase: "designing", useNewHarness: true } as never,
      parts: [{ _id: "pt1" } as never],
      interfaces: [{ _id: "if1" } as never],
      openViolations: [{ _id: "v1" } as never],
      openEscalations: [{ _id: "e1" } as never],
    });
    expect(plan.parts.length).toBe(1);
    expect(plan.interfaces.length).toBe(1);
    expect(plan.openViolations.length).toBe(1);
    expect(plan.openEscalations.length).toBe(1);
  });
});
