"use node";

import Anthropic from "@anthropic-ai/sdk";

// NOTE: structurally identical to AgentTool in convex/plugins/types.ts. Plan 4 should
// consolidate to a single canonical source — likely by re-exporting from plugins/types
// here, since plugins/types is the contract source-of-truth.
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTurnInput {
  model: string;
  effort: "low" | "med" | "high";
  system: string;
  tools: AgentTool[];
  messages: AgentMessage[];
  maxTokens?: number;
}

export interface AgentToolCall {
  name: string;
  input: unknown;
}

export interface AgentTurnResult {
  toolCalls: AgentToolCall[];
  responseText: string;
}

/** Pure builder — assembles the Claude request params from typed input. */
export function buildClientParams(input: AgentTurnInput): Anthropic.Messages.MessageCreateParamsNonStreaming & {
  output_config?: { effort: "low" | "med" | "high" };
} {
  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: input.model,
    max_tokens: input.maxTokens ?? 8192,
    system: input.system,
    tools: input.tools as unknown as Anthropic.Messages.Tool[],
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if ((input.model === "claude-opus-4-7" || input.model === "claude-sonnet-4-6") && input.effort) {
    return { ...params, output_config: { effort: input.effort } };
  }
  return params;
}

/** Pure parser — extracts tool_use + text blocks from a Claude response. */
export function parseClientResponse(response: { content: Array<unknown> }): AgentTurnResult {
  const toolCalls: AgentToolCall[] = [];
  let responseText = "";
  for (const block of response.content) {
    const b = block as { type: string; text?: string; name?: string; input?: unknown };
    if (b.type === "tool_use" && b.name) {
      toolCalls.push({ name: b.name, input: b.input });
    } else if (b.type === "text" && b.text) {
      responseText += b.text;
    }
  }
  return { toolCalls, responseText };
}

/**
 * Live Anthropic call. The specialist (and any future caller) goes through this.
 * Tests must NOT call this — substitute a fake by injecting a different runner
 * function at the call site (see runRepairTurn in convex/specialists/_helpers.ts).
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  const params = buildClientParams(input);
  const response = await client.messages.create(params);
  return parseClientResponse(response);
}
