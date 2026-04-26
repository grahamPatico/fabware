import { describe, it, expect } from "vitest";
import { computeNextAction } from "../phaseMachine";
import type { ProjectPhase } from "../../plugins/types";

const baseProject = (phase: ProjectPhase) => ({
  _id: "p1" as never,
  phase,
  useNewHarness: true,
  scope: undefined,
} as never);

describe("computeNextAction", () => {
  it("returns 'wait' when an open escalation exists, regardless of phase", () => {
    const action = computeNextAction({
      project: baseProject("designing"),
      parts: [],
      openEscalations: [{ _id: "e1" } as never],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("wait");
  });

  it("returns 'wait' in 'scoping' when scope is missing (the wizard advances it)", () => {
    const action = computeNextAction({
      project: baseProject("scoping"),
      parts: [],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("wait");
  });

  it("returns 'noop' when phase is 'designing' but no plugins registered yet", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [{ _id: "pt1", kind: "sheet_metal", status: "pending" } as never],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("noop");
    expect(action.reason).toMatch(/no plugin registered/i);
  });

  it("returns 'designPart' when a pending part has a registered plugin", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [{ _id: "pt1", kind: "sheet_metal", status: "pending" } as never],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("designPart");
    if (action.kind === "designPart") {
      expect(action.partId).toBe("pt1");
    }
  });

  it("transitions designing → validating when every part is ok or escalated", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [
        { _id: "pt1", kind: "sheet_metal", status: "ok" } as never,
        { _id: "pt2", kind: "sheet_metal", status: "escalated" } as never,
      ],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");
    if (action.kind === "transitionPhase") {
      expect(action.toPhase).toBe("validating");
    }
  });

  it("transitions decomposing → designing when parts exist", () => {
    const action = computeNextAction({
      project: { ...baseProject("decomposing"), scope: { tier: "mvp" } } as never,
      parts: [{ _id: "pt1", kind: "sheet_metal" } as never],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("transitionPhase");
    if (action.kind === "transitionPhase") {
      expect(action.toPhase).toBe("designing");
    }
  });

  it("returns 'noop' in validating phase (assembly validator not yet wired)", () => {
    const action = computeNextAction({
      project: baseProject("validating"),
      parts: [],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("noop");
  });

  it("returns 'noop' in exporting phase (exporter not yet wired)", () => {
    const action = computeNextAction({
      project: baseProject("exporting"),
      parts: [],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("noop");
  });

  it("returns 'wait' when project is done", () => {
    const action = computeNextAction({
      project: baseProject("done"),
      parts: [],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("wait");
  });
});
