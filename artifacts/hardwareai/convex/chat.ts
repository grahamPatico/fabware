"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import type { Id } from "./_generated/dataModel";
import { getModel, isEffort, resolveEffort } from "./lib/models";


export const send = action({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (
    ctx,
    { threadId, content, model, effort },
  ): Promise<{ messageId: Id<"messages">; stopReason: string | null }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Run `npx convex env set ANTHROPIC_API_KEY <key>`.",
      );
    }

    const spec = getModel(model);
    if (!spec) throw new Error(`Unsupported model: ${model}`);
    if (!isEffort(effort)) throw new Error(`Unsupported effort: ${effort}`);

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

    const resolvedEffort = resolveEffort(model, effort);
    // Streamed so a long answer can't outlive the HTTP timeout; `summarized`
    // because the thread view shows the model's reasoning.
    const response = await client.messages
      .stream({
        model,
        max_tokens: 16000,
        messages: conversationMessages,
        ...(spec.thinking === "none" ? {} : { thinking: { type: "adaptive" as const, display: "summarized" as const } }),
        ...(resolvedEffort ? { output_config: { effort: resolvedEffort } } : {}),
      })
      .finalMessage();

    let textOut = "";
    let thinkingOut = "";
    for (const block of response.content) {
      if (block.type === "text") textOut += block.text;
      else if (block.type === "thinking") thinkingOut += block.thinking;
    }

    const assistantId: Id<"messages"> = await ctx.runMutation(internal.messages.insert, {
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
