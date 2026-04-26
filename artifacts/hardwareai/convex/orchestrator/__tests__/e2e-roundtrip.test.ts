import { describe, it, expect } from "vitest";
import { computeNextAction } from "../phaseMachine";
import { runSpecialistOnce } from "../../specialists/_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet_metal";

const sheetPart = (status: string) => ({
  _id: `pt-${status}`,
  kind: "sheet_metal",
  status,
} as never);

describe("e2e roundtrip — single sheet-metal part", () => {
  it("clean DSL: scoping → decomposing → designing → ok → validating", () => {
    // Phase 1: scoping with scope set → transition to decomposing
    let action = computeNextAction({
      project: { _id: "p1", phase: "scoping", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");

    // Phase 2: decomposing with parts → transition to designing
    action = computeNextAction({
      project: { _id: "p1", phase: "decomposing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("pending")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");

    // Phase 3: designing with pending sheet-metal part → dispatch specialist
    action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("pending")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("designPart");

    // Phase 4: specialist runs against a clean DSL → status='ok'
    const cleanDsl = {
      version: 1 as const, partType: "bracket" as const,
      material: "Mild Steel (CRS)", thickness: 0.075,
      width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const specResult = runSpecialistOnce(sheetMetalPlugin, cleanDsl, { scope: { tier: "mvp" }, peerParts: [] });
    expect(specResult.status).toBe("ok");

    // Phase 5: re-tick designing with status='ok' → transition to validating
    action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("ok")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");
    if (action.kind === "transitionPhase") expect(action.toPhase).toBe("validating");
  });

  it("dirty DSL: status becomes 'escalated' and an escalation would block validating", () => {
    const dirtyDsl = {
      version: 1 as const, partType: "bracket" as const,
      material: "Mild Steel (CRS)", thickness: 0.999,
      width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const specResult = runSpecialistOnce(sheetMetalPlugin, dirtyDsl, { scope: null, peerParts: [] });
    expect(specResult.status).toBe("escalated");
    expect(specResult.violations.length).toBeGreaterThan(0);

    // Simulate the orchestrator after escalations were written.
    const action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("escalated")],
      openEscalations: [{ _id: "e1" } as never],   // an escalation now exists
      registeredKinds: ["sheet_metal"],
    });
    // Open escalation → wait for user answer.
    expect(action.kind).toBe("wait");
  });
});
