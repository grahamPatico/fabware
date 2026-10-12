import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFunctionName } from "convex/server";
import {
  JourneyError, finishValidate, normalizeUrl, runStageSafely, runStageWith, searchResultPages,
  type CallModel, type StageArgs, type StageIo,
} from "../../journeyAgent";
import { PCB_CHECKLIST, SAFE_PCB_RULES, type SourcingLive } from "../journey";
import { enrichSourcing } from "../journeyEnrich";

// The stage run only talks to Convex through ctx.runQuery / runMutation, so a
// table of handlers keyed by function name stands in for the backend.
type Handlers = Record<string, (args: any) => unknown>;

function makeWorld(overrides: Handlers = {}) {
  const world = {
    spend: 0,
    context: {
      project: { name: "Gate opener", description: "Opens a farm gate from the truck" },
      track: "product",
      needsElectronics: true,
      content: {} as Record<string, unknown>,
      isCurrent: true,
    } as any,
    saved: [] as any[],
    errors: [] as any[],
    usage: [] as any[],
    modelCalls: [] as Array<{ request: any; messages: any[] }>,
    enclosureRequests: [] as string[],
  };
  const handlers: Handlers = {
    "tokenUsage:spendSince": () => world.spend,
    "tokenUsage:record": (a) => { world.usage.push(a); },
    "journey:loadContext": () => world.context,
    "journey:saveResult": (a) => { world.saved.push(a); return true; },
    "journey:saveError": (a) => { world.errors.push(a); return true; },
    ...overrides,
  };
  const dispatch = async (ref: any, args: any) => {
    const name = getFunctionName(ref);
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected Convex call: ${name}`);
    return handler(args);
  };
  const ctx = { runQuery: dispatch, runMutation: dispatch } as any;
  return { world, ctx };
}

type World = ReturnType<typeof makeWorld>["world"];

const args = (stage: StageArgs["stage"], over: Partial<StageArgs> = {}): StageArgs => ({
  projectId: "p1" as any, stage, runId: "run1", model: "claude-opus-5-5", effort: "medium", ...over,
});

const usage = { input_tokens: 1000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const reply = (content: any[], stop_reason = "end_turn") =>
  ({ model: "claude-opus-5-5", stop_reason, content, usage }) as any;
const json = (value: unknown) => reply([
  { type: "thinking", thinking: "", signature: "sig" },
  { type: "text", text: JSON.stringify(value) },
]);

/** A model that plays back `responses` in order and records what it was sent. */
function scripted(world: World, responses: Array<any | Error>): CallModel {
  let i = 0;
  return async (request, messages) => {
    world.modelCalls.push({ request, messages: structuredClone(messages) });
    if (i >= responses.length) throw new Error("model called more times than scripted");
    const next = responses[i++];
    if (next instanceof Error) throw next;
    return next;
  };
}

const LIVE: SourcingLive = {
  productName: "WC-33 Outdoor Enclosure", partNumber: "WC-33", productUrl: "https://www.polycase.com/wc-33",
  priceUsd: 30, fitSummary: "Internal space 150 × 100 × 60 mm meets the requested minimum.",
  purchaseNote: "Double-check before purchasing.",
  modelGlbUrl: "https://polycase-mcp.vercel.app/api/models/WC-33/model.glb", asOf: "2026-08-22",
};

function io(world: World, result: SourcingLive | null | Error = LIVE): StageIo {
  return {
    fetchEnclosure: async (text) => {
      world.enclosureRequests.push(text);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const NO_NETWORK: StageIo = {
  fetchEnclosure: async () => { throw new Error("this stage must not call the catalog"); },
};

const IDEA = {
  oneLiner: "A solar gate opener for farm gates.", problem: "p", whoItsFor: "ranchers",
  howItWorks: ["Press the remote"], keyFeatures: ["Solar"], needsElectronics: true,
  electronicsReason: "Motor and battery", openQuestions: [], conceptImagePrompt: "A grey box on a gate post",
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("runStageWith", () => {
  it("parses the idea, saves it, and records what it cost", async () => {
    const { world, ctx } = makeWorld();
    const outcome = await runStageWith(ctx, args("idea", { notes: "Keep it cheap" }), scripted(world, [json(IDEA)]), NO_NETWORK);

    expect(outcome).toBe("saved");
    expect(world.saved).toEqual([{ projectId: "p1", stage: "idea", runId: "run1", content: IDEA, model: "claude-opus-5-5" }]);
    expect(world.usage).toEqual([expect.objectContaining({
      feature: "journey:idea", model: "claude-opus-5-5", effort: "medium", projectId: "p1",
      inputTokens: 1000, outputTokens: 400,
    })]);
  });

  it("asks for structured output with the stage's schema, effort and refusal fallback, and no forced tool", async () => {
    const { world, ctx } = makeWorld();
    await runStageWith(ctx, args("idea", { notes: "Keep it cheap" }), scripted(world, [json(IDEA)]), NO_NETWORK);

    const { request, messages } = world.modelCalls[0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.output_config.effort).toBe("medium");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.output_config.format.schema.required).toContain("needsElectronics");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
    // These models always think: no thinking param, no tools, no tool_choice.
    expect(request).not.toHaveProperty("thinking");
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("tool_choice");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("- Name: Gate opener");
    expect(messages[0].content).toContain("Keep it cheap");
  });

  it("sends no effort to a model that takes none", async () => {
    const { world, ctx } = makeWorld();
    await runStageWith(ctx, args("idea", { model: "claude-haiku-4-5" }), scripted(world, [json(IDEA)]), NO_NETWORK);
    const { request } = world.modelCalls[0];
    expect(request.output_config).not.toHaveProperty("effort");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request).not.toHaveProperty("fallbacks");
  });

  it("feeds earlier stages to the model and offers the current answer for a rewrite", async () => {
    const { world, ctx } = makeWorld();
    world.context.content = { idea: IDEA, requirements: { summary: "Old requirements" } };
    await runStageWith(ctx, args("requirements"), scripted(world, [json({ summary: "New requirements" })]), NO_NETWORK);
    const prompt = world.modelCalls[0].messages[0].content as string;
    expect(prompt).toContain('idea: {"oneLiner":"A solar gate opener for farm gates."');
    expect(prompt).toContain("Your previous answer for this stage");
    expect(prompt).toContain("Old requirements");
    expect(world.saved[0].content.summary).toBe("New requirements");
  });

  it("enriches sourcing with links and live enclosure data, for at most two enclosures", async () => {
    const { world, ctx } = makeWorld();
    world.context.content = {
      requirements: {
        envelope: { widthIn: 6, depthIn: 4, heightIn: 3, note: "" },
        environment: { location: "outdoor", waterproof: true, notes: "" },
      },
    };
    const enclosure = (need: string) => ({ need, approach: "enclosure", supplierId: "polycase", searchQuery: "NEMA 4X box" });
    const output = {
      items: [
        { need: "Screws", approach: "buy", supplierId: "mcmaster", partNumber: "91251A536", qty: 8, estUnitCostUsd: 0.2 },
        enclosure("Main box"),
        enclosure("Battery box"),
        enclosure("Third box"),
        { need: "Custom box", approach: "enclosure", supplierId: "sendcutsend" },
      ],
      notes: [],
    };
    await runStageWith(ctx, args("sourcing"), scripted(world, [json(output)]), io(world));

    expect(world.enclosureRequests).toEqual([
      "Enclosure for: Main box. NEMA 4X box. Minimum internal size 152 x 102 x 76 mm. Outdoor use. Must be waterproof.",
      "Enclosure for: Battery box. NEMA 4X box. Minimum internal size 152 x 102 x 76 mm. Outdoor use. Must be waterproof.",
    ]);
    const items = world.saved[0].content.items;
    expect(items[0]).toMatchObject({ url: "https://www.mcmaster.com/91251A536/", verified: false, live: null });
    expect(items[1]).toMatchObject({ verified: true, live: LIVE });
    expect(items[2]).toMatchObject({ verified: true, live: LIVE });
    expect(items[3]).toMatchObject({ verified: false, live: null }); // past the limit of two
    expect(items[4]).toMatchObject({ verified: false, live: null }); // not a Polycase line
  });

  it("saves sourcing unverified when the catalog fails", async () => {
    const { world, ctx } = makeWorld();
    const output = { items: [{ need: "Box", approach: "enclosure", supplierId: "polycase" }] };
    for (const failure of [null, new Error("catalog down")]) {
      world.saved.length = 0;
      await runStageWith(ctx, args("sourcing"), scripted(world, [json(output)]), io(world, failure));
      expect(world.saved[0].content.items[0]).toMatchObject({
        verified: false, live: null, url: "https://www.polycase.com/catalogsearch/result/?q=Box",
      });
    }
  });

  it("sets the PCB rules and checklist itself and clamps the board", async () => {
    const { world, ctx } = makeWorld();
    const output = {
      board: { widthMm: 9000, heightMm: 50, cornerRadiusMm: 2, layers: 3, mountingHoles: [{ xMm: 1, yMm: 1, diameterMm: 3.2 }] },
      fab: { supplierId: "oshpark", why: "small board" },
      rules: { minTraceMm: 0.01 },
      checklist: [],
    };
    await runStageWith(ctx, args("pcb"), scripted(world, [json(output)]), NO_NETWORK);
    const content = world.saved[0].content;
    expect(content.rules).toEqual(SAFE_PCB_RULES);
    expect(content.checklist).toEqual(PCB_CHECKLIST);
    expect(content.board).toMatchObject({ widthMm: 500, layers: 4, mountingHoles: [] });
    expect(content.fab.supplierId).toBe("oshpark");
  });

  it("builds the order list for the build stage from the saved sourcing stage", async () => {
    const { world, ctx } = makeWorld();
    world.context.content = {
      sourcing: enrichSourcing({
        items: [
          { need: "Screws", approach: "buy", supplierId: "mcmaster", searchQuery: "M4", partNumber: null, qty: 8, estUnitCostUsd: 0.25, why: "" },
          { need: "Box", approach: "enclosure", supplierId: "polycase", searchQuery: "box", partNumber: null, qty: 1, estUnitCostUsd: 99, why: "" },
        ],
        notes: [],
      }, { 1: LIVE }),
    };
    const output = { steps: [{ title: "Mount the box", detail: "Four screws" }], tests: ["Power on"], orderGroups: [], estTotalUsd: 1 };
    await runStageWith(ctx, args("build"), scripted(world, [json(output)]), NO_NETWORK);
    const content = world.saved[0].content;
    expect(content.steps).toEqual([{ title: "Mount the box", detail: "Four screws" }]);
    expect(content.orderGroups.map((g: any) => [g.supplierId, g.subtotalUsd])).toEqual([["mcmaster", 2], ["polycase", 30]]);
    expect(content.estTotalUsd).toBe(32);
  });

  it("fills electronics candidate links", async () => {
    const { world, ctx } = makeWorld();
    const output = { summary: "s", blocks: [{ name: "MCU", candidates: [{ part: "ESP32-C3", supplierId: "digikey" }] }] };
    await runStageWith(ctx, args("electronics"), scripted(world, [json(output)]), NO_NETWORK);
    expect(world.saved[0].content.blocks[0].candidates[0].url)
      .toBe("https://www.digikey.com/en/products/result?keywords=ESP32-C3");
  });

  it("accepts JSON wrapped in prose when structured output was not honoured", async () => {
    const { world, ctx } = makeWorld();
    const text = "Here is the plan.\n```json\n" + JSON.stringify(IDEA) + "\n```";
    await runStageWith(ctx, args("idea"), scripted(world, [reply([{ type: "text", text }])]), NO_NETWORK);
    expect(world.saved[0].content.oneLiner).toBe(IDEA.oneLiner);
  });

  it("turns an unusable answer into a user-facing error and saves nothing", async () => {
    const { world, ctx } = makeWorld();
    for (const bad of [reply([{ type: "text", text: "I would rather chat." }]), json({ problem: "no one-liner" }), reply([])]) {
      await expect(runStageWith(ctx, args("idea"), scripted(world, [bad]), NO_NETWORK))
        .rejects.toThrow(/could not read/);
    }
    expect(world.saved).toEqual([]);
    expect(world.usage).toHaveLength(3); // the calls were still paid for
  });

  it("does not call the model, or save, for a stale run", async () => {
    const { world, ctx } = makeWorld();
    world.context.isCurrent = false;
    expect(await runStageWith(ctx, args("idea"), scripted(world, []), NO_NETWORK)).toBe("stale");
    expect(world.modelCalls).toHaveLength(0);
    expect(world.saved).toEqual([]);
  });

  it("reports stale when a newer run took over during the model call", async () => {
    const { world, ctx } = makeWorld({ "journey:saveResult": () => false });
    expect(await runStageWith(ctx, args("idea"), scripted(world, [json(IDEA)]), NO_NETWORK)).toBe("stale");
  });

  it("refuses once the daily budget is spent", async () => {
    const { world, ctx } = makeWorld();
    world.spend = 1_000;
    await expect(runStageWith(ctx, args("idea"), scripted(world, []), NO_NETWORK)).rejects.toThrow(/budget/);
    expect(world.modelCalls).toHaveLength(0);
  });

  it("fails clearly for a missing project, a refusal and a cut-off answer", async () => {
    const gone = makeWorld({ "journey:loadContext": () => null });
    await expect(runStageWith(gone.ctx, args("idea"), scripted(gone.world, []), NO_NETWORK))
      .rejects.toThrow(/no longer exists/);

    const { world, ctx } = makeWorld();
    await expect(runStageWith(ctx, args("idea"), scripted(world, [reply([], "refusal")]), NO_NETWORK))
      .rejects.toThrow(/declined/);
    await expect(runStageWith(ctx, args("idea"), scripted(world, [reply([{ type: "text", text: '{"oneLiner":"A' }], "max_tokens")]), NO_NETWORK))
      .rejects.toThrow(/too long/);
    await expect(runStageWith(ctx, args("idea", { model: "gpt-9" }), scripted(world, []), NO_NETWORK))
      .rejects.toBeInstanceOf(JourneyError);
    expect(world.saved).toEqual([]);
  });
});

describe("runStageSafely", () => {
  it("saves a short readable error for a bad model output and logs the real one", async () => {
    const { world, ctx } = makeWorld();
    await runStageSafely(ctx, args("idea"), () => scripted(world, [json({ nothing: "useful" })]), NO_NETWORK);
    expect(world.saved).toEqual([]);
    expect(world.errors).toEqual([{
      projectId: "p1", stage: "idea", runId: "run1",
      error: "The guide's answer for this step came back in a form fabware could not read. Try again.",
    }]);
    expect(world.errors[0].error).not.toMatch(/zod|stack|at \w+ \(|oneLiner/i);
    expect(logged).toHaveBeenCalled();
  });

  it("never shows an internal error message to the user", async () => {
    const { world, ctx } = makeWorld();
    await runStageSafely(ctx, args("idea"), () => scripted(world, [new Error("ECONNRESET 10.0.0.4:443 sk-secret")]), NO_NETWORK);
    expect(world.errors[0].error).toBe("Something went wrong while writing this step. Try again.");
  });

  it("reports a missing API key, an unknown stage and a spent budget the same way", async () => {
    const { world, ctx } = makeWorld();
    await runStageSafely(ctx, args("idea"), () => { throw new JourneyError("The guide isn't configured on this deployment (no API key)."); });
    await runStageSafely(ctx, { ...args("idea"), stage: "mechanical" }, () => scripted(world, []));
    world.spend = 1_000;
    await runStageSafely(ctx, args("idea"), () => scripted(world, []));
    expect(world.errors.map((e) => e.error)).toEqual([
      "The guide isn't configured on this deployment (no API key).",
      "Unknown step: mechanical",
      "Fabware has reached its AI budget for today. It resets at midnight UTC.",
    ]);
    expect(world.modelCalls).toHaveLength(0);
  });

  it("saves nothing extra when the run succeeds", async () => {
    const { world, ctx } = makeWorld();
    await runStageSafely(ctx, args("idea"), () => scripted(world, [json(IDEA)]), NO_NETWORK);
    expect(world.saved).toHaveLength(1);
    expect(world.errors).toEqual([]);
  });
});

describe("validate stage", () => {
  const VALIDATE = {
    customer: "Small ranches with one or two gates",
    problemStatement: "Getting out of the truck twice per trip",
    alternatives: [
      { name: "Mighty Mule MM371", kind: "direct", note: "Sold at farm stores", url: "https://www.mightymule.com/mm371/" },
      { name: "Ghost Controls", kind: "direct", note: "", url: "https://made-up.example/ghost" },
      { name: "A chain and a walk", kind: "diy", note: "", url: null },
    ],
    differentiators: ["Installs in an hour"],
    pricing: { targetPriceUsd: 349, targetCostUsd: 120, reasoning: "Below the leader" },
    experiments: [{ name: "Landing page", how: "Run ads", successSignal: "5% sign up", costUsd: 100, days: 7 }],
    risks: ["Wind load"],
    goSignals: ["20 preorders"],
    sources: [
      { title: "Forum thread", url: "https://forum.example/gates#post-3" },
      { title: "Invented", url: "https://never-searched.example/" },
    ],
  };
  const result = (url: string, title: string) => ({ type: "web_search_result", url, title, encrypted_content: "x", page_age: null });
  const searched = (text: string, citations: any[] | null = null) => reply([
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "automatic gate opener" } },
    {
      type: "web_search_tool_result", tool_use_id: "srv_1",
      content: [
        result("https://www.mightymule.com/mm371", "Mighty Mule MM371"),
        result("https://forum.example/gates", "Gate opener thread"),
        result("https://unused.example/page", "Unused page"),
        result("https://www.mightymule.com/mm371", "Duplicate"),
        result("https://store.example/cited", "Cited store page"),
      ],
    },
    { type: "text", text: "Solar openers start near 300 USD.", citations },
    { type: "text", text, citations: null },
  ]);
  const fenced = "```json\n" + JSON.stringify(VALIDATE) + "\n```";
  const CITATION = { type: "web_search_result_location", url: "https://store.example/cited", title: "Cited store page", cited_text: "x", encrypted_index: "y" };

  it("searches the web, cites only pages the search returned, and drops links it did not find", async () => {
    const { world, ctx } = makeWorld();
    await runStageWith(ctx, args("validate"), scripted(world, [searched(fenced, [CITATION])]), NO_NETWORK);

    const { request, messages } = world.modelCalls[0];
    expect(request.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
    // Search results carry citations, which a structured-output format rejects.
    expect(request.output_config).toEqual({ effort: "medium" });
    expect(messages[0].content).toContain("You have a web search tool.");
    expect(messages[0].content).toContain("```json code block");

    const content = world.saved[0].content;
    expect(content.researched).toBe(true);
    expect(content.alternatives.map((a: any) => a.url)).toEqual(["https://www.mightymule.com/mm371", null, null]);
    expect(content.sources).toEqual([
      { title: "Mighty Mule MM371", url: "https://www.mightymule.com/mm371" },  // an alternative's page
      { title: "Gate opener thread", url: "https://forum.example/gates" },      // listed by the model
      { title: "Cited store page", url: "https://store.example/cited" },         // cited in the answer
    ]);
    expect(content.pricing.targetPriceUsd).toBe(349);
    expect(world.usage).toHaveLength(1);
  });

  it("retries once without search when every search fails, and says it was not researched", async () => {
    const { world, ctx } = makeWorld();
    const failed = reply([
      { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "x" } },
      { type: "web_search_tool_result", tool_use_id: "srv_1", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
      { type: "text", text: fenced, citations: null },
    ]);
    await runStageWith(ctx, args("validate"), scripted(world, [failed, json(VALIDATE)]), NO_NETWORK);

    expect(world.modelCalls).toHaveLength(2);
    const second = world.modelCalls[1];
    expect(second.request).not.toHaveProperty("tools");
    expect(second.request.output_config.format.type).toBe("json_schema");
    expect(second.messages[0].content).not.toContain("web search tool");
    const content = world.saved[0].content;
    expect(content.researched).toBe(false);
    expect(content.sources).toEqual([]);
    expect(content.alternatives.every((a: any) => a.url === null)).toBe(true);
    expect(world.usage).toHaveLength(2);
  });

  it("retries without search when the tool is rejected or the researched answer is unreadable", async () => {
    for (const first of [new Error("400 web search is not enabled for this organization"), searched("I found a lot. Ask me anything.")]) {
      const { world, ctx } = makeWorld();
      await runStageWith(ctx, args("validate"), scripted(world, [first, json(VALIDATE)]), NO_NETWORK);
      expect(world.modelCalls).toHaveLength(2);
      expect(world.saved[0].content.researched).toBe(false);
    }
  });

  it("gives up after the one retry", async () => {
    const { world, ctx } = makeWorld();
    await expect(runStageWith(ctx, args("validate"), scripted(world, [new Error("search down"), new Error("still down")]), NO_NETWORK))
      .rejects.toThrow("still down");
    expect(world.modelCalls).toHaveLength(2);
    expect(world.saved).toEqual([]);
  });

  it("does not retry a refusal", async () => {
    const { world, ctx } = makeWorld();
    await expect(runStageWith(ctx, args("validate"), scripted(world, [reply([], "refusal")]), NO_NETWORK))
      .rejects.toThrow(/declined/);
    expect(world.modelCalls).toHaveLength(1);
  });

  it("resumes a paused search turn by sending the turn back", async () => {
    const { world, ctx } = makeWorld();
    const paused = reply([{ type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "x" } }], "pause_turn");
    await runStageWith(ctx, args("validate"), scripted(world, [paused, searched(fenced)]), NO_NETWORK);

    expect(world.modelCalls).toHaveLength(2);
    const resumed = world.modelCalls[1].messages;
    expect(resumed.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(resumed[1].content[0]).toMatchObject({ type: "server_tool_use", id: "srv_1" });
    expect(world.modelCalls[1].request.tools).toEqual(world.modelCalls[0].request.tools);
    expect(world.saved[0].content.researched).toBe(true);
    expect(world.usage).toHaveLength(2);
  });

  it("uses the basic search tool on a model without dynamic filtering", async () => {
    const { world, ctx } = makeWorld();
    await runStageWith(ctx, args("validate", { model: "claude-haiku-4-5" }), scripted(world, [searched(fenced)]), NO_NETWORK);
    expect(world.modelCalls[0].request.tools[0].type).toBe("web_search_20250305");
    expect(world.modelCalls[0].request).not.toHaveProperty("output_config");
  });
});

describe("validate helpers", () => {
  it("compares URLs without fragments, trailing slashes or host case", () => {
    expect(normalizeUrl("https://Example.com/a/b/#top")).toBe("https://example.com/a/b");
    expect(normalizeUrl("https://example.com/")).toBe(normalizeUrl("https://example.com"));
    expect(normalizeUrl("https://example.com/a?x=1")).not.toBe(normalizeUrl("https://example.com/a?x=2"));
    expect(normalizeUrl("not a url/")).toBe("not a url");
  });

  it("ignores error results and other blocks when collecting pages", () => {
    expect(searchResultPages([
      { type: "text", text: "hi", citations: null },
      { type: "web_search_tool_result", tool_use_id: "a", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
      { type: "web_search_tool_result", tool_use_id: "b", content: [{ type: "web_search_result", url: "https://a.example/x", title: "", encrypted_content: "", page_age: null }] },
    ] as any)).toEqual([{ title: "https://a.example/x", url: "https://a.example/x" }]);
  });

  it("caps sources at eight", () => {
    const pages = Array.from({ length: 12 }, (_, i) => ({ title: `Page ${i}`, url: `https://a.example/${i}` }));
    const output = {
      customer: "c", problemStatement: "", alternatives: [], differentiators: [],
      pricing: { targetPriceUsd: null, targetCostUsd: null, reasoning: "" },
      experiments: [], risks: [], goSignals: [], sources: pages,
    };
    const content = finishValidate(output, [], pages);
    expect(content.sources).toHaveLength(8);
    expect(content.researched).toBe(true);
    expect(finishValidate(output, [], [])).toMatchObject({ sources: [], researched: false });
  });
});
