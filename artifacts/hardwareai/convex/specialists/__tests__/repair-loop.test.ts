import { describe, it, expect } from "vitest";
import { runAgentRepairLoop, type RunAgentTurnFn } from "../_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet_metal";
import type { AgentTurnResult } from "../../lib/anthropicClient";

const cleanDsl = {
  version: 1 as const,
  partType: "bracket" as const,
  material: "Mild Steel (CRS)",
  thickness: 0.075,
  width: 4, height: 3, depth: null,
  features: [], finish: null, assemblyRefs: [],
};

const dirtyDsl = { ...cleanDsl, thickness: 0.999 };

describe("runAgentRepairLoop", () => {
  it("returns immediately when there are no initial violations", async () => {
    const fakeRunner: RunAgentTurnFn = async () => {
      throw new Error("should not be called");
    };
    const result = await runAgentRepairLoop({
      plugin: sheetMetalPlugin,
      initialDsl: cleanDsl,
      initialViolations: [],
      ctx: { scope: null, peerParts: [] },
      partLabel: "panel",
      budget: 3,
      runAgentTurn: fakeRunner,
    });
    expect(result.turnsUsed).toBe(0);
    expect(result.agentApplyCount).toBe(0);
    expect(result.finalViolations).toEqual([]);
  });

  it("applies a refine_part fix and clears violations in one turn", async () => {
    const initialViolations = sheetMetalPlugin.validate(dirtyDsl, { scope: null, peerParts: [] });
    expect(initialViolations.length).toBeGreaterThan(0);

    let calls = 0;
    const fakeRunner: RunAgentTurnFn = async () => {
      calls += 1;
      const fix: AgentTurnResult = {
        responseText: "Fixed.",
        toolCalls: [{
          name: "refine_part",
          input: { role: "panel", dsl: { ...dirtyDsl, thickness: 0.075 }, rationale: "stocked" },
        }],
      };
      return fix;
    };

    const result = await runAgentRepairLoop({
      plugin: sheetMetalPlugin,
      initialDsl: dirtyDsl,
      initialViolations,
      ctx: { scope: null, peerParts: [] },
      partLabel: "panel",
      budget: 3,
      runAgentTurn: fakeRunner,
    });

    expect(calls).toBe(1);
    expect(result.agentApplyCount).toBe(1);
    expect(result.finalViolations.length).toBe(0);
    expect((result.finalDsl as { thickness: number }).thickness).toBe(0.075);
  });

  it("breaks early when the agent returns no applicable tool calls", async () => {
    const initialViolations = sheetMetalPlugin.validate(dirtyDsl, { scope: null, peerParts: [] });

    const fakeRunner: RunAgentTurnFn = async () => ({
      responseText: "I give up.",
      toolCalls: [],
    });

    const result = await runAgentRepairLoop({
      plugin: sheetMetalPlugin,
      initialDsl: dirtyDsl,
      initialViolations,
      ctx: { scope: null, peerParts: [] },
      partLabel: "panel",
      budget: 3,
      runAgentTurn: fakeRunner,
    });

    expect(result.turnsUsed).toBe(1);
    expect(result.agentApplyCount).toBe(0);
    expect(result.finalViolations.length).toBeGreaterThan(0);
  });

  it("exhausts the budget when the agent keeps trying invalid fixes", async () => {
    const initialViolations = sheetMetalPlugin.validate(dirtyDsl, { scope: null, peerParts: [] });

    const fakeRunner: RunAgentTurnFn = async () => ({
      responseText: "Trying...",
      toolCalls: [{
        name: "refine_part",
        input: { role: "panel", dsl: { ...dirtyDsl, thickness: 0.123 }, rationale: "still bad" },
        // 0.123 is also non-stocked, so the violation persists.
      }],
    });

    const result = await runAgentRepairLoop({
      plugin: sheetMetalPlugin,
      initialDsl: dirtyDsl,
      initialViolations,
      ctx: { scope: null, peerParts: [] },
      partLabel: "panel",
      budget: 3,
      runAgentTurn: fakeRunner,
    });

    expect(result.turnsUsed).toBe(3);
    expect(result.agentApplyCount).toBe(3);
    expect(result.finalViolations.length).toBeGreaterThan(0);
  });
});
