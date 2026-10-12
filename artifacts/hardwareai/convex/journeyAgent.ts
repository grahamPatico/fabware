"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { getModel, resolveEffort } from "./lib/models";
import { DAILY_BUDGET_MESSAGE, isOverDailyBudget, utcDayStartMs } from "./lib/spendCap";
import {
  isGeneratedStage, isStageId,
  type GeneratedStageId, type SourcingLive, type StageContentMap, type ValidateContent,
} from "./lib/journey";
import {
  parseStageOutput, stageJsonSchema, type SourcingOutput, type StageOutputMap, type ValidateOutput,
} from "./lib/journeySchemas";
import { buildOrderGroups, enrichElectronics, enrichPcb, enrichSourcing } from "./lib/journeyEnrich";
import {
  GUIDE_SYSTEM, buildStageContext, conceptImagePrompt, conceptSvgPrompt,
} from "./lib/journeyPrompts";
import { buildEnclosureRequirements, fetchEnclosure } from "./lib/polycaseClient";
import { sanitizeConceptSvg } from "./lib/svgSanitize";
import type { StageRunContext } from "./journey";

// The guide: one model call per stage of the production journey. The model
// writes the plan as JSON; the server validates it (lib/journeySchemas.ts),
// adds everything the model must not be trusted with (lib/journeyEnrich.ts)
// and saves it. Progress reaches the plan page through `journey.get`.

type ContentBlock = Anthropic.Beta.BetaContentBlock;
type ContentParam = Anthropic.Beta.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.BetaMessageParam;
type TextBlock = Anthropic.Beta.BetaTextBlock;
type ModelRequest = Omit<Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, "messages">;

// Convex kills an action at 10 minutes. Model calls are aborted before that
// so the stage always gets its error written instead of hanging until the
// stale rule clears it.
const RUN_HARD_LIMIT_MS = 8.5 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 32_000;
const MAX_WEB_SEARCHES = 5;
// The server runs the search loop; a long one hands back `pause_turn` and is
// resumed by sending the turn back.
const MAX_PAUSE_RESUMES = 3;
const MAX_SOURCES = 8;
const MAX_LIVE_ENCLOSURES = 2;
const CONCEPT_SVG_MODEL = "claude-sonnet-5-5";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const IMAGE_TIMEOUT_MS = 120_000;

/** An error whose message is written for the person using the plan. */
export class JourneyError extends Error {}
/** The model answered, but not in a shape the stage can use. */
class UnreadableAnswerError extends JourneyError {}

/**
 * One model call. `abortAfterMs` bounds the whole streamed response so the
 * surrounding action always gets to finish its bookkeeping.
 */
export type CallModel = (
  request: ModelRequest,
  messages: MessageParam[],
  abortAfterMs: number,
) => Promise<Anthropic.Beta.BetaMessage>;

/** The network the stage run touches besides the model. Tests pass fakes. */
export interface StageIo {
  fetchEnclosure: (requirementsText: string) => Promise<SourcingLive | null>;
}

const defaultIo: StageIo = { fetchEnclosure: (text) => fetchEnclosure(text) };

export type StageArgs = {
  projectId: Id<"projects">;
  stage: GeneratedStageId;
  runId: string;
  notes?: string;
  model: string;
  effort: string;
};

function anthropicCaller(): CallModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new JourneyError("The guide isn't configured on this deployment (no API key).");
  const client = new Anthropic({ apiKey });
  return async (request, messages, abortAfterMs) => {
    // Streamed so a long response can't hit an HTTP timeout.
    const stream = client.beta.messages.stream({ ...request, messages });
    const timer = setTimeout(() => stream.abort(), abortAfterMs);
    try {
      return await stream.finalMessage();
    } finally {
      clearTimeout(timer);
    }
  };
}

export const runStage = internalAction({
  args: {
    projectId: v.id("projects"),
    stage: v.string(),
    runId: v.string(),
    notes: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    await runStageSafely(ctx, a, anthropicCaller);
  },
});

/**
 * `runStageWith`, with every failure turned into a short message on the
 * stage. The real error goes to the log, never to the user. Exported for
 * tests.
 */
export async function runStageSafely(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  a: Omit<StageArgs, "stage"> & { stage: string },
  makeCaller: () => CallModel,
  io: StageIo = defaultIo,
): Promise<void> {
  try {
    if (!isStageId(a.stage) || !isGeneratedStage(a.stage)) throw new JourneyError(`Unknown step: ${a.stage}`);
    await runStageWith(ctx, { ...a, stage: a.stage }, makeCaller(), io);
  } catch (err) {
    console.error(`[journey ${a.stage} ${a.runId}]`, err);
    await ctx.runMutation(internal.journey.saveError, {
      projectId: a.projectId, stage: a.stage, runId: a.runId, error: describeFailure(err),
    });
  }
}

/**
 * Write one stage: call the model, validate and enrich its answer, save it.
 * Returns "stale" when a newer generation owns the stage (nothing is saved).
 * Exported for tests, which pass a scripted `callModel`.
 */
export async function runStageWith(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  a: StageArgs,
  callModel: CallModel,
  io: StageIo = defaultIo,
): Promise<"saved" | "stale"> {
  const startedAt = Date.now();
  const spec = getModel(a.model);
  if (!spec) throw new JourneyError(`Unsupported model: ${a.model}`);

  const spentToday: number = await ctx.runQuery(internal.tokenUsage.spendSince, { sinceMs: utcDayStartMs() });
  if (isOverDailyBudget(spentToday)) throw new JourneyError(DAILY_BUDGET_MESSAGE);

  const run: StageRunContext | null = await ctx.runQuery(internal.journey.loadContext, {
    projectId: a.projectId, stage: a.stage, runId: a.runId,
  });
  if (!run) throw new JourneyError("This project no longer exists.");
  if (!run.isCurrent) return "stale"; // a newer generation owns the stage

  const effort = resolveEffort(a.model, a.effort);
  const { [a.stage]: current, ...earlier } = run.content;
  const schema = stageJsonSchema(a.stage);

  /** One request for this stage. With web search the JSON travels in the reply text instead of a format. */
  const turn = (withSearch: boolean): { request: ModelRequest; messages: MessageParam[] } => ({
    request: {
      model: a.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: GUIDE_SYSTEM,
      ...(spec.thinking === "adaptive" ? { thinking: { type: "adaptive" as const } } : {}),
      // Structured output and web search can't share a request: search
      // results come back with citations, which the format rejects.
      ...(effort || !withSearch
        ? {
            output_config: {
              ...(effort ? { effort } : {}),
              ...(withSearch ? {} : { format: { type: "json_schema" as const, schema } }),
            },
          }
        : {}),
      ...(withSearch ? { tools: [webSearchTool(a.model)] } : {}),
      // If a safety classifier declines a request, let the API retry it on a
      // fallback model inside the same call instead of failing the stage.
      ...(spec.fallbacks
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    },
    messages: [{
      role: "user",
      content: buildStageContext({
        stage: a.stage,
        project: run.project,
        track: run.track,
        needsElectronics: run.needsElectronics,
        earlier,
        current,
        notes: a.notes,
        webSearch: withSearch,
        jsonSchemaInPrompt: withSearch ? schema : null,
      }),
    }],
  });

  /** Run one turn to its end, resuming a paused search loop, and record what it cost. */
  const complete = async (withSearch: boolean): Promise<ContentBlock[]> => {
    const { request, messages } = turn(withSearch);
    const blocks: ContentBlock[] = [];
    for (let resume = 0; ; resume++) {
      const remainingMs = RUN_HARD_LIMIT_MS - (Date.now() - startedAt);
      if (remainingMs < 15_000) throw new JourneyError("That took longer than one step allows. Try again.");
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await callModel(request, messages, remainingMs - 10_000);
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError) {
          throw new JourneyError("That took longer than one step allows. Try again.");
        }
        throw err;
      }
      await ctx.runMutation(internal.tokenUsage.record, {
        feature: `journey:${a.stage}`,
        // A refusal fallback may have served this; cost it at that model's
        // rates when we know them.
        model: getModel(response.model) ? response.model : a.model,
        effort: a.effort,
        projectId: a.projectId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
      });
      if (response.stop_reason === "refusal") {
        throw new JourneyError("The model declined this request. Try rewording the project description or your notes.");
      }
      blocks.push(...response.content);
      if (response.stop_reason === "pause_turn" && resume < MAX_PAUSE_RESUMES) {
        // Send the paused turn straight back; the server picks up where it stopped.
        messages.push({ role: "assistant", content: response.content as ContentParam[] });
        continue;
      }
      if (response.stop_reason === "max_tokens") {
        throw new JourneyError("The answer for this step was too long to finish. Add a note asking for a shorter plan and try again.");
      }
      return blocks;
    }
  };

  const parse = (blocks: ContentBlock[]) => {
    try {
      return parseStageOutput(a.stage, replyText(blocks));
    } catch (err) {
      console.error(`[journey ${a.stage} ${a.runId}] unusable model output`, err);
      throw new UnreadableAnswerError("The guide's answer for this step came back in a form fabware could not read. Try again.");
    }
  };

  let content: StageContentMap[GeneratedStageId];
  if (a.stage === "validate") {
    content = await researchValidate(complete, parse as (b: ContentBlock[]) => ValidateOutput, a);
  } else {
    const output = parse(await complete(false));
    content = await enrich(a.stage, output, run, io);
  }

  const saved: boolean = await ctx.runMutation(internal.journey.saveResult, {
    projectId: a.projectId, stage: a.stage, runId: a.runId, content, model: a.model,
  });
  return saved ? "saved" : "stale";
}

// ---------------------------------------------------------------------------
// Validate: web research
// ---------------------------------------------------------------------------

/** Dynamic filtering needs a current model; older ones get the basic tool. */
function webSearchTool(model: string): Anthropic.Beta.BetaToolUnion {
  return model === "claude-haiku-4-5"
    ? { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES }
    : { type: "web_search_20260209", name: "web_search", max_uses: MAX_WEB_SEARCHES };
}

/**
 * The validate stage with web search, falling back to the model's memory
 * when search is unavailable, errors, or the researched answer can't be
 * read. Only the first path may claim `researched: true`.
 */
async function researchValidate(
  complete: (withSearch: boolean) => Promise<ContentBlock[]>,
  parse: (blocks: ContentBlock[]) => ValidateOutput,
  a: StageArgs,
): Promise<ValidateContent> {
  try {
    const blocks = await complete(true);
    const pages = searchResultPages(blocks);
    if (pages.length > 0) return finishValidate(parse(blocks), blocks, pages);
    console.warn(`[journey validate ${a.runId}] web search returned no pages; answering without it`);
  } catch (err) {
    // These would fail the same way a second time; let them surface.
    if (
      err instanceof Anthropic.RateLimitError || err instanceof Anthropic.AuthenticationError ||
      (err instanceof JourneyError && !(err instanceof UnreadableAnswerError))
    ) throw err;
    console.error(`[journey validate ${a.runId}] researched attempt failed; retrying without web search`, err);
  }
  return finishValidate(parse(await complete(false)), [], []);
}

interface Page { title: string; url: string }

/** Compare URLs the way a reader would: no fragment, no trailing slash, host in lower case. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/** Every page the search tool returned, in order, without duplicates. Error results carry none. */
export function searchResultPages(blocks: ContentBlock[]): Page[] {
  const seen = new Set<string>();
  const pages: Page[] = [];
  for (const block of blocks) {
    // A failed search comes back as one error object, a good one as a list.
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      const key = normalizeUrl(result.url);
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push({ title: result.title || result.url, url: result.url });
    }
  }
  return pages;
}

/** URLs the model's answer points at through search citations. */
function citedUrls(blocks: ContentBlock[]): string[] {
  const urls: string[] = [];
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const citation of block.citations ?? []) {
      if (citation.type === "web_search_result_location") urls.push(citation.url);
    }
  }
  return urls;
}

/**
 * The server-owned parts of the validate stage. `pages` is what the search
 * really returned: sources are the returned pages the answer cites or lists,
 * and an alternative's link survives only when it is one of them.
 */
export function finishValidate(output: ValidateOutput, blocks: ContentBlock[], pages: Page[]): ValidateContent {
  const returned = new Map(pages.map((p) => [normalizeUrl(p.url), p]));
  const alternatives = output.alternatives.map((alt) => ({
    ...alt,
    url: alt.url && returned.has(normalizeUrl(alt.url)) ? returned.get(normalizeUrl(alt.url))!.url : null,
  }));
  const used = new Set<string>([
    ...citedUrls(blocks),
    ...output.sources.map((s) => s.url),
    ...alternatives.flatMap((alt) => (alt.url ? [alt.url] : [])),
  ].map(normalizeUrl));
  return {
    ...output,
    alternatives,
    sources: pages.filter((p) => used.has(normalizeUrl(p.url))).slice(0, MAX_SOURCES),
    researched: pages.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Other stages
// ---------------------------------------------------------------------------

function replyText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function enrich(
  stage: Exclude<GeneratedStageId, "validate">,
  output: StageOutputMap[GeneratedStageId],
  run: StageRunContext,
  io: StageIo,
): Promise<StageContentMap[GeneratedStageId]> {
  switch (stage) {
    case "idea": return output as StageOutputMap["idea"];
    case "requirements": return output as StageOutputMap["requirements"];
    case "sourcing": {
      const sourcing = output as SourcingOutput;
      return enrichSourcing(sourcing, await liveEnclosures(sourcing, run, io));
    }
    case "electronics": return enrichElectronics(output as StageOutputMap["electronics"]);
    case "pcb": return enrichPcb(output as StageOutputMap["pcb"]);
    case "build": return {
      ...(output as StageOutputMap["build"]),
      ...buildOrderGroups(run.content.sourcing ?? null),
    };
  }
}

/** Live catalog data for the first Polycase enclosure lines, keyed by item index. */
async function liveEnclosures(
  sourcing: SourcingOutput,
  run: StageRunContext,
  io: StageIo,
): Promise<Record<number, SourcingLive | null>> {
  const wanted = sourcing.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.approach === "enclosure" && item.supplierId === "polycase")
    .slice(0, MAX_LIVE_ENCLOSURES);
  const found = await Promise.all(wanted.map(async ({ item, index }) => {
    try {
      const text = buildEnclosureRequirements(run.content.requirements ?? null, item);
      return [index, await io.fetchEnclosure(text)] as const;
    } catch (err) {
      // A catalog hiccup leaves the line unverified; it never fails the stage.
      console.error("[journey sourcing] enclosure lookup failed", err);
      return [index, null] as const;
    }
  }));
  return Object.fromEntries(found);
}

function describeFailure(err: unknown): string {
  if (err instanceof JourneyError) return err.message;
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI service is rate-limiting requests right now. Give it a minute and try again.";
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The guide's API credentials were rejected. This needs fixing on the deployment.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return "The AI service rejected the request for this step. Try again, or shorten your notes.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Check back in a moment and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return "The AI service had a problem with this step. Try again.";
  }
  return "Something went wrong while writing this step. Try again.";
}

// ---------------------------------------------------------------------------
// Concept picture
// ---------------------------------------------------------------------------

/**
 * Draw the concept picture: a PNG from the image model when one is
 * configured, otherwise (or if that fails) an SVG sketch from Claude.
 */
export const runConcept = internalAction({
  args: { projectId: v.id("projects"), startedAt: v.number() },
  handler: async (ctx, { projectId, startedAt }): Promise<void> => {
    const fail = async (error: string) => {
      await ctx.runMutation(internal.journey.saveConcept, { projectId, startedAt, error });
    };
    try {
      const run: { prompt: string; isCurrent: boolean } | null = await ctx.runQuery(
        internal.journey.loadConceptContext, { projectId, startedAt },
      );
      if (!run) return await fail("Shape the idea first. The picture is drawn from it.");
      if (!run.isCurrent) return;

      const spentToday: number = await ctx.runQuery(internal.tokenUsage.spendSince, { sinceMs: utcDayStartMs() });
      if (isOverDailyBudget(spentToday)) return await fail(DAILY_BUDGET_MESSAGE);

      const prompt = conceptImagePrompt(run.prompt);
      if (process.env.OPENAI_API_KEY) {
        try {
          const png = await generatePng(prompt, process.env.OPENAI_API_KEY);
          const storageId = await ctx.storage.store(new Blob([png], { type: "image/png" }));
          await ctx.runMutation(internal.journey.saveConcept, {
            projectId, startedAt, prompt, image: { kind: "image", storageId },
          });
          return;
        } catch (err) {
          console.error(`[journey concept ${projectId}] image model failed; drawing an SVG instead`, err);
        }
      }

      const svg = await drawSvg(ctx, projectId, run.prompt);
      if (!svg) return await fail("The sketch came back in a form fabware could not show. Try again.");
      await ctx.runMutation(internal.journey.saveConcept, {
        projectId, startedAt, prompt, image: { kind: "svg", svg },
      });
    } catch (err) {
      console.error(`[journey concept ${projectId}]`, err);
      await fail(err instanceof JourneyError ? err.message : "The picture could not be made. Try again.");
    }
  },
});

/** One 1024 x 1024 PNG from the OpenAI Images API. Throws on any failure. */
async function generatePng(prompt: string, apiKey: string): Promise<Uint8Array<ArrayBuffer>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.FABWARE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL,
        prompt,
        size: "1024x1024",
        n: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`image API answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error("image API returned no base64 image");
    const bytes = Buffer.from(b64, "base64");
    const png = new Uint8Array(new ArrayBuffer(bytes.length));
    png.set(bytes);
    return png;
  } finally {
    clearTimeout(timer);
  }
}

/** A sanitized SVG sketch from Claude, or null when the reply held nothing safe to show. */
async function drawSvg(ctx: ActionCtx, projectId: Id<"projects">, ideaPrompt: string): Promise<string | null> {
  const callModel = anthropicCaller();
  const spec = getModel(CONCEPT_SVG_MODEL);
  const effort = resolveEffort(CONCEPT_SVG_MODEL, "low");
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await callModel(
      {
        model: CONCEPT_SVG_MODEL,
        max_tokens: 16_000,
        ...(effort ? { output_config: { effort } } : {}),
        ...(spec?.fallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      [{ role: "user", content: conceptSvgPrompt(ideaPrompt) }],
      2 * 60 * 1000,
    );
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw new JourneyError("The picture took too long. Try again.");
    throw err;
  }
  await ctx.runMutation(internal.tokenUsage.record, {
    feature: "journey:concept",
    model: getModel(response.model) ? response.model : CONCEPT_SVG_MODEL,
    effort: "low",
    projectId,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
  });
  if (response.stop_reason === "refusal") throw new JourneyError("The model declined to draw this. Try rewording the idea.");
  return sanitizeConceptSvg(replyText(response.content));
}
