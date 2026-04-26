import { describe, it, expect } from "vitest";
import { TOOLS, refinePartTool, addFeatureToPartTool } from "../tools";
import { systemPromptFragment } from "../prompts";

describe("sheet-metal tool surface", () => {
  it("exports refine_part and add_feature_to_part tool definitions", () => {
    expect(refinePartTool.name).toBe("refine_part");
    expect(addFeatureToPartTool.name).toBe("add_feature_to_part");
  });

  it("TOOLS array contains both tools, no orchestration tools", () => {
    expect(TOOLS.length).toBe(2);
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("refine_part");
    expect(names).toContain("add_feature_to_part");
    // Orchestration tools must NOT live here.
    expect(names).not.toContain("capture_scope");
    expect(names).not.toContain("select_archetype");
    expect(names).not.toContain("decide_make_or_buy");
  });

  it("each tool has a JSON-schema input_schema", () => {
    for (const t of TOOLS) {
      expect(t.input_schema).toBeDefined();
      expect((t.input_schema as { type: string }).type).toBe("object");
    }
  });
});

describe("systemPromptFragment", () => {
  it("is non-empty and mentions sheet metal", () => {
    expect(systemPromptFragment.length).toBeGreaterThan(50);
    expect(systemPromptFragment.toLowerCase()).toContain("sheet metal");
  });

  it("does not contain assembly-level guidance (interfaces, archetypes)", () => {
    // The specialist only sees its own plugin's prompt fragment.
    // Assembly-level guidance lives in the orchestrator's prompt.
    expect(systemPromptFragment.toLowerCase()).not.toContain("archetype");
  });
});
