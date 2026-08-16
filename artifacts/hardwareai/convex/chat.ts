"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";

export const SUPPORTED_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

export const EFFORT_LEVELS = ["low", "medium", "high", "max", "xhigh"] as const;

type Effort = (typeof EFFORT_LEVELS)[number];

function supportsEffort(model: string): boolean {
  return model === "claude-opus-4-7" || model === "claude-sonnet-4-6";
}

function supportsMaxEffort(model: string): boolean {
  return model === "claude-opus-4-7";
}

function supportsXhighEffort(model: string): boolean {
  return model === "claude-opus-4-7";
}

export const send = action({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (ctx, { threadId, content, model, effort }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Run `npx convex env set ANTHROPIC_API_KEY <key>`.",
      );
    }

    if (!(SUPPORTED_MODELS as readonly string[]).includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }
    if (!(EFFORT_LEVELS as readonly string[]).includes(effort)) {
      throw new Error(`Unsupported effort: ${effort}`);
    }

    // Persist the user message immediately so the UI can render it.
    await ctx.runMutation(internal.messages.insert, {
      threadId,
      role: "user",
      content,
    });

    // Build conversation history for the model call.
    const history = await ctx.runQuery(internal.messages.listForThreadInternal, { threadId });
    const conversationMessages = history
      .filter((m: Doc<"messages">) => m.role === "user" || m.role === "assistant")
      .map((m: Doc<"messages">) => ({ role: m.role, content: m.content }));

    const client = new Anthropic({ apiKey });

    const outputConfig: { effort?: Effort } = {};
    if (supportsEffort(model)) {
      let resolvedEffort: Effort = effort as Effort;
      if (resolvedEffort === "max" && !supportsMaxEffort(model)) resolvedEffort = "high";
      if (resolvedEffort === "xhigh" && !supportsXhighEffort(model)) resolvedEffort = "high";
      outputConfig.effort = resolvedEffort;
    }

    const createArgs: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 16000,
      messages: conversationMessages,
    };
    if (supportsEffort(model)) {
      (createArgs as unknown as { thinking: { type: string } }).thinking = { type: "adaptive" };
    }
    if (outputConfig.effort) {
      (createArgs as unknown as { output_config: { effort: Effort } }).output_config = {
        effort: outputConfig.effort,
      };
    }

    const response = await client.messages.create(createArgs);

    let textOut = "";
    let thinkingOut = "";
    for (const block of response.content) {
      if (block.type === "text") textOut += block.text;
      else if (block.type === "thinking") thinkingOut += block.thinking;
    }

    const assistantId = await ctx.runMutation(internal.messages.insert, {
      threadId,
      role: "assistant",
      content: textOut,
      model,
      effort,
      thinking: thinkingOut || undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
      },
    });

    await ctx.runMutation(internal.tokenUsage.record, {
      feature: "chat",
      model,
      effort,
      threadId,
      messageId: assistantId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
    });

    return { messageId: assistantId, stopReason: response.stop_reason };
  },
});
