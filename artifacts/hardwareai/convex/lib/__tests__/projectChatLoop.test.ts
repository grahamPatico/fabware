import { describe, it, expect } from "vitest";
import { getFunctionName } from "convex/server";
import {
  MAX_ITERATIONS, UserFacingError, runAgentLoop, type CallModel, type TurnArgs,
} from "../../projectChat";

// The loop only talks to Convex through ctx.runQuery / runMutation / runAction,
// so a table of handlers keyed by function name stands in for the backend.
type Handlers = Record<string, (args: any) => unknown>;

function makeWorld(overrides: Handlers = {}) {
  const world = {
    parts: [] as any[],
    inserted: [] as any[],
    snapshots: [] as string[],
    progress: [] as string[],
    usage: [] as any[],
    run: { runId: "run1", status: "running", startedAt: Date.now(), cancelRequested: false } as any,
    rules: [] as any[],
    spend: 0,
    modelCalls: [] as Array<{ request: any; messages: any[] }>,
  };
  const handlers: Handlers = {
    "tokenUsage:spendSince": () => world.spend,
    "projects:get": () => ({ _id: "p1", name: "Test", scope: null, currentSnapshotId: "s0" }),
    "parts:listForProject": () => world.parts,
    "interfaces:listForProject": () => [],
    "messages:listForProjectInternal": () => [{ role: "user", content: "make a plate" }],
    "validation:getAssemblyValidation": () => ({ rules: world.rules }),
    "agentRuns:getRun": () => world.run,
    "agentRuns:setProgress": (a) => { world.progress.push(a.step); },
    "messages:insertProjectMessage": (a) => { world.inserted.push(a); },
    "tokenUsage:record": (a) => { world.usage.push(a); },
    "assemblySnapshots:captureInternal": (a) => { world.snapshots.push(a.label); },
    "parts:addPartInternal": (a) => { world.parts.push({ _id: `part${world.parts.length}`, ...a }); },
    ...overrides,
  };
  const dispatch = async (ref: any, args: any) => {
    const name = getFunctionName(ref);
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected Convex call: ${name}`);
    return handler(args);
  };
  const ctx = { runQuery: dispatch, runMutation: dispatch, runAction: dispatch } as any;
  return { world, ctx };
}

const ARGS: TurnArgs = {
  projectId: "p1" as any, runId: "run1", content: "make a plate",
  model: "claude-opus-5-5", effort: "medium",
};

const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const reply = (content: any[], stop_reason = "end_turn") =>
  ({ model: "claude-opus-5-5", stop_reason, content, usage }) as any;
const addPlate = (id: string) => ({
  type: "tool_use", id, name: "add_sheet_metal_part",
  input: {
    role: "plate", label: "Plate", material: "Aluminum 5052", thickness: 0.09, width: 4, height: 3,
    position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, features: [],
  },
});

/** A model that plays back `responses` in order and records what it was sent. */
function scripted(world: ReturnType<typeof makeWorld>["world"], responses: any[]): CallModel {
  let i = 0;
  return async (request, messages) => {
    world.modelCalls.push({ request, messages: structuredClone(messages) });
    if (i >= responses.length) throw new Error("model called more times than scripted");
    return responses[i++];
  };
}

describe("runAgentLoop", () => {
  it("applies a tool call, feeds the result and validator note back, then finishes", async () => {
    const { world, ctx } = makeWorld();
    const outcome = await runAgentLoop(ctx, ARGS, scripted(world, [
      reply([{ type: "thinking", thinking: "", signature: "sig" }, addPlate("tu_1")], "tool_use"),
      reply([{ type: "text", text: "Built a 4 x 3 in plate." }]),
    ]));

    expect(outcome).toBe("done");
    expect(world.parts).toHaveLength(1);
    expect(world.modelCalls).toHaveLength(2);

    // Second request: assistant turn echoed verbatim (thinking block kept),
    // then one user message carrying the tool result and the validator note.
    const second = world.modelCalls[1].messages;
    const assistantTurn = second[second.length - 2];
    expect(assistantTurn.role).toBe("assistant");
    expect(assistantTurn.content.map((b: any) => b.type)).toEqual(["thinking", "tool_use"]);
    const toolTurn = second[second.length - 1];
    expect(toolTurn.role).toBe("user");
    expect(toolTurn.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1", is_error: false });
    expect(toolTurn.content[1].text).toBe("Validator: all assembly checks pass.");

    const kinds = world.inserted.map((m) => m.kind);
    expect(kinds).toEqual(["tool", "text"]);
    expect(world.inserted[0]).toMatchObject({ toolName: "add_sheet_metal_part", isError: false, runId: "run1" });
    expect(world.inserted[1].content).toBe("Built a 4 x 3 in plate.");
    expect(world.snapshots).toEqual(["make a plate"]);
    expect(world.usage).toHaveLength(2);
    expect(world.progress).toContain("Adding Plate");
  });

  it("keeps the system prompt and tools identical across iterations", async () => {
    const { world, ctx } = makeWorld();
    await runAgentLoop(ctx, ARGS, scripted(world, [
      reply([addPlate("tu_1")], "tool_use"),
      reply([{ type: "text", text: "Done." }]),
    ]));
    const [first, second] = world.modelCalls;
    expect(JSON.stringify(second.request.system)).toBe(JSON.stringify(first.request.system));
    expect(second.request.tools).toBe(first.request.tools);
    expect(first.request.fallbacks).toBe("default");
    expect(first.request.output_config).toEqual({ effort: "medium" });
    expect(first.request).not.toHaveProperty("thinking");
  });

  it("reports a failed tool to the model as an error and takes no snapshot", async () => {
    const { world, ctx } = makeWorld({
      "parts:addPartInternal": () => { throw new Error("thickness 0.09 is not stocked"); },
    });
    await runAgentLoop(ctx, ARGS, scripted(world, [
      reply([addPlate("tu_1")], "tool_use"),
      reply([{ type: "text", text: "That thickness isn't available." }]),
    ]));
    const toolTurn = world.modelCalls[1].messages.at(-1);
    expect(toolTurn.content).toHaveLength(1); // no validator note: nothing changed
    expect(toolTurn.content[0]).toMatchObject({ type: "tool_result", is_error: true });
    expect(toolTurn.content[0].content).toContain("Couldn't add plate");
    expect(world.inserted[0]).toMatchObject({ kind: "tool", isError: true });
    expect(world.snapshots).toEqual([]);
  });

  it("surfaces validator failures to the model after a change", async () => {
    const { world, ctx } = makeWorld();
    world.rules = [{ id: "parts_dont_intersect", label: "Part intersection", status: "fail", message: "A and B overlap." }];
    await runAgentLoop(ctx, ARGS, scripted(world, [
      reply([addPlate("tu_1")], "tool_use"),
      reply([{ type: "text", text: "Fixed." }]),
    ]));
    const note = world.modelCalls[1].messages.at(-1).content[1].text;
    expect(note).toContain("1 fail, 0 warn");
    expect(note).toContain("A and B overlap.");
  });

  it("stops before calling the model when the user pressed Stop", async () => {
    const { world, ctx } = makeWorld();
    world.run.cancelRequested = true;
    const outcome = await runAgentLoop(ctx, ARGS, scripted(world, []));
    expect(outcome).toBe("cancelled");
    expect(world.modelCalls).toHaveLength(0);
    expect(world.inserted.map((m) => m.content)).toEqual(["Stopped."]);
  });

  it("honours a Stop pressed during the model call without applying its tools", async () => {
    const { world, ctx } = makeWorld();
    const callModel: CallModel = async () => {
      world.run.cancelRequested = true;
      return reply([addPlate("tu_1")], "tool_use");
    };
    const outcome = await runAgentLoop(ctx, ARGS, callModel);
    expect(outcome).toBe("cancelled");
    expect(world.parts).toHaveLength(0);
  });

  it("bows out silently when a newer run has taken over the project", async () => {
    const { world, ctx } = makeWorld();
    world.run.runId = "run2";
    const outcome = await runAgentLoop(ctx, ARGS, scripted(world, []));
    expect(outcome).toBe("cancelled");
    expect(world.inserted).toEqual([]);
  });

  it("caps a model that never stops calling tools", async () => {
    const { world, ctx } = makeWorld({
      "manufacturing:summarizeForProject": () => ({ totals: { failures: 0, warnings: 0 }, perPart: [] }),
    });
    let n = 0;
    const callModel: CallModel = async (request, messages) => {
      world.modelCalls.push({ request, messages: structuredClone(messages) });
      return reply([{ type: "tool_use", id: `tu_${n++}`, name: "check_manufacturing", input: { intent: "x" } }], "tool_use");
    };
    const outcome = await runAgentLoop(ctx, ARGS, callModel);
    expect(outcome).toBe("done");
    expect(world.modelCalls).toHaveLength(MAX_ITERATIONS);
    // The wrap-up instruction rides along with the second-to-last tool results.
    const lastSent = world.modelCalls.at(-1)!.messages.at(-1);
    expect(lastSent.content.at(-1).text).toContain("out of steps");
    expect(world.inserted.at(-1).content).toContain("used all the steps");
    // The final response's tool call is not applied: 13 tool rows, not 14.
    expect(world.inserted.filter((m) => m.kind === "tool")).toHaveLength(MAX_ITERATIONS - 1);
  });

  it("refuses to run a tool call that was cut off at max_tokens", async () => {
    const { world, ctx } = makeWorld();
    await expect(runAgentLoop(ctx, ARGS, scripted(world, [
      reply([addPlate("tu_1")], "max_tokens"),
    ]))).rejects.toBeInstanceOf(UserFacingError);
    expect(world.parts).toHaveLength(0);
  });

  it("turns a refusal into a user-facing error", async () => {
    const { world, ctx } = makeWorld();
    await expect(runAgentLoop(ctx, ARGS, scripted(world, [reply([], "refusal")])))
      .rejects.toThrow(/declined/);
  });

  it("still snapshots applied changes when a later step fails", async () => {
    const { world, ctx } = makeWorld();
    const callModel: CallModel = async (_r, messages) => {
      if (messages.at(-1)!.role === "user" && world.parts.length === 0) return reply([addPlate("tu_1")], "tool_use");
      throw new Error("network down");
    };
    await expect(runAgentLoop(ctx, ARGS, callModel)).rejects.toThrow("network down");
    expect(world.parts).toHaveLength(1);
    expect(world.snapshots).toEqual(["make a plate"]);
  });

  it("refuses new turns once the daily budget is spent", async () => {
    const { world, ctx } = makeWorld();
    world.spend = 1_000;
    await expect(runAgentLoop(ctx, ARGS, scripted(world, []))).rejects.toThrow(/budget/);
    expect(world.modelCalls).toHaveLength(0);
  });

  it("never leaves the chat silent when the model ends without text", async () => {
    const { world, ctx } = makeWorld();
    await runAgentLoop(ctx, ARGS, scripted(world, [
      reply([addPlate("tu_1")], "tool_use"),
      reply([]),
    ]));
    expect(world.inserted.at(-1)).toMatchObject({ kind: "text", content: "Done. The assembly is updated." });
  });

  it("sends an attached image ahead of the text", async () => {
    const { world, ctx } = makeWorld();
    await runAgentLoop(
      ctx,
      { ...ARGS, imageData: "QUJD", imageMediaType: "image/jpeg" },
      scripted(world, [reply([{ type: "text", text: "Nice sketch." }])]),
    );
    const sent = world.modelCalls[0].messages.at(-1);
    expect(sent.content.map((b: any) => b.type)).toEqual(["image", "text"]);
    expect(sent.content[0].source).toEqual({ type: "base64", media_type: "image/jpeg", data: "QUJD" });
  });
});
