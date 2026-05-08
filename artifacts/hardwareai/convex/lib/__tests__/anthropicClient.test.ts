import { describe, it, expect } from "vitest";
import {
  buildClientParams,
  parseClientResponse,
  type AgentTurnInput,
  type AgentTurnResult,
} from "../anthropicClient";

describe("anthropicClient pure helpers", () => {
  it("buildClientParams composes a Claude request with system + tools + messages", () => {
    const input: AgentTurnInput = {
      model: "claude-sonnet-4-6",
      effort: "med",
      system: "You are a sheet-metal repair specialist.",
      tools: [
        { name: "refine_part", description: "x", input_schema: { type: "object", properties: {} } },
      ],
      messages: [{ role: "user", content: "hi" }],
    };
    const params = buildClientParams(input);
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(params.system).toBe("You are a sheet-metal repair specialist.");
    expect(params.tools.length).toBe(1);
    expect((params as { output_config?: unknown }).output_config).toBeDefined();
  });

  it("parseClientResponse extracts tool_use + text blocks", () => {
    const fake = {
      content: [
        { type: "text", text: "Here's my fix:" },
        { type: "tool_use", name: "refine_part", input: { role: "panel", dsl: { thickness: 0.075 } } },
      ],
    };
    const result: AgentTurnResult = parseClientResponse(fake as never);
    expect(result.responseText).toBe("Here's my fix:");
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].name).toBe("refine_part");
  });

  it("parseClientResponse handles empty content array", () => {
    const result = parseClientResponse({ content: [] } as never);
    expect(result.responseText).toBe("");
    expect(result.toolCalls).toEqual([]);
  });
});
