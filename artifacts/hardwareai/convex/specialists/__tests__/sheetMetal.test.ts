import { describe, it, expect } from "vitest";
import { runSpecialistOnce, type SpecialistResult, buildRepairPrompt, applyToolCallToDsl } from "../_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet_metal";
import type { Dsl } from "../../plugins/sheet_metal/dsl";

const baseDsl = {
  version: 1 as const,
  partType: "bracket" as const,
  material: "Mild Steel (CRS)",
  thickness: 0.075, width: 4, height: 3, depth: null,
  features: [], finish: null, assemblyRefs: [],
};

describe("runSpecialistOnce (pure)", () => {
  it("returns status='ok' with no violations on a clean DSL", () => {
    const result: SpecialistResult<Dsl> = runSpecialistOnce(sheetMetalPlugin, baseDsl, { scope: null, peerParts: [] });
    expect(result.violations.length).toBe(0);
    expect(result.status).toBe("ok");
    expect(result.repairedDsl).toBe(baseDsl); // unchanged
  });

  it("returns status='escalated' with violations on a non-stocked thickness", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.status).toBe("escalated");
  });

  it("attempts autoRepair (always null in Plan 2) — repairedDsl stays equal to input", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.repairedDsl).toEqual({ ...baseDsl, thickness: 0.999 });
  });
});

describe("buildRepairPrompt", () => {
  it("includes scope, part label, DSL, and violations in the prompt", () => {
    const prompt = buildRepairPrompt({
      scope: { tier: "mvp" },
      partLabel: "back_panel",
      partDsl: { thickness: 0.999, material: "Mild Steel (CRS)" },
      violations: [{
        ruleId: "sheet.thickness",
        severity: "error",
        message: "thickness 0.999 not stocked",
        agentMessage: "Pick a stocked thickness.",
        suggestedFix: { thickness: 0.075 },
      }],
      pluginSystemPromptFragment: "You are sheet-metal.",
      pluginTools: [{ name: "refine_part", description: "x", input_schema: { type: "object", properties: {} } }],
    });
    expect(prompt.system).toContain("mvp");
    expect(prompt.userMessage).toContain("back_panel");
    expect(prompt.userMessage).toContain("0.999");
    expect(prompt.userMessage).toContain("sheet.thickness");
    expect(prompt.tools.length).toBe(1);
  });
});

describe("applyToolCallToDsl", () => {
  const fakeSchema = {
    safeParse: (v: unknown) => {
      const o = v as { thickness?: number };
      if (o && typeof o.thickness === "number" && o.thickness > 0 && o.thickness < 1) {
        return { success: true as const, data: o };
      }
      return { success: false as const };
    },
  };

  it("refine_part replaces the DSL when the new shape parses", () => {
    const result = applyToolCallToDsl({ thickness: 0.999 }, {
      name: "refine_part",
      input: { role: "panel", dsl: { thickness: 0.075 }, rationale: "stocked" },
    }, fakeSchema);
    expect(result.applied).toBe(true);
    expect(result.dsl.thickness).toBe(0.075);
  });

  it("refine_part rejects an invalid DSL", () => {
    const result = applyToolCallToDsl({ thickness: 0.075 }, {
      name: "refine_part",
      input: { role: "panel", dsl: { thickness: 99 }, rationale: "broken" },
    }, fakeSchema);
    expect(result.applied).toBe(false);
    expect(result.dsl.thickness).toBe(0.075);
  });

  it("returns applied=false for an unknown tool name", () => {
    const result = applyToolCallToDsl({ thickness: 0.075 }, {
      name: "nuke_everything",
      input: {},
    }, fakeSchema);
    expect(result.applied).toBe(false);
  });
});
