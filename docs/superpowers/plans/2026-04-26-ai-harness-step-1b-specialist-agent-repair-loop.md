# AI Harness — Plan 3: Specialist Agent Repair Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three Plan-3 prereq fixes the final review identified, then add an Anthropic-driven repair loop inside the sheet-metal specialist. After this plan ships, when `runSpecialistOnce` produces violations whose `autoRepair` returns null, the specialist runs up to N=3 repair turns through an Anthropic agent that has access to a sheet-metal-only tool surface (`refine_part`, `add_feature_to_part`). Violations that survive the repair budget escalate to the user. **Design-from-intent is still NOT in this plan** (Plan 4) — the specialist still requires an existing DSL on the part.

**Architecture:**
- Phase A (Tasks 1–3) addresses the three priority handoff risks from Plan 2's final review: a public `answerEscalation` mutation that re-ticks; a batched `processViolations` internal mutation replacing the per-violation triple-mutation loop; cascade-delete violations on individual `removePart`.
- Phase B (Tasks 4–5) extracts the Anthropic SDK call from `assemblyDesigner.ts` into a reusable `convex/lib/anthropicClient.ts` helper. Adds a fake/swap point for tests. The helper is `"use node"`-only (Anthropic SDK requirement).
- Phase C (Tasks 6–7) ports the sheet-metal-specific tools from `assemblyDesigner.ts` (`refine_part`, `add_feature_to_part`) into `convex/plugins/sheet_metal/tools.ts`, populates `sheetMetalPlugin.tools` and `sheetMetalPlugin.systemPromptFragment`.
- Phase D (Tasks 8–10) wires the agent repair loop into `convex/specialists/sheetMetal.ts`. Pure helper `runRepairTurn` selects the next prompt; the action makes the Anthropic call; results are applied back to the DSL; loop until `R=3` turns exhausted or violations clear. Includes a vitest test that uses a fake Anthropic implementation.
- Phase E (Task 11) wraps with the standard sweep.

**Tech Stack:** TypeScript (strict, ESM), Convex (with `"use node"` directive on the new helper + the specialist), `@anthropic-ai/sdk` (already a dep transitively via assemblyDesigner), Vitest. Branch: continuing on `feat/ai-harness-step-0-scaffold` in `~/fabware-harness-step0/`.

**Spec:** `docs/superpowers/specs/2026-04-25-ai-harness-design.md` (sections 4 "Agent layer" and 5 "Rules engine + two-tier loop").

**Predecessor plans:**
- Plan 1 (Step 0 scaffold): `docs/superpowers/plans/2026-04-25-ai-harness-step-0-scaffold.md`, commit `509576b`.
- Plan 2 (Step 1 sheet-metal plugin, validator-only): `docs/superpowers/plans/2026-04-26-ai-harness-step-1-sheet-metal-plugin.md`, commit `caa3472`.

**Successor plans (sketched):**
- Plan 4: Design-from-intent — specialist creates a DSL from project scope when `part.dslJson` is missing. Reuses Plan 3's agent infrastructure.
- Plan 5: Per-rule files — port `scsRules.ts` rules into individual `Rule<Dsl>` modules under `convex/plugins/sheet_metal/rules/` with proper `autoRepair` functions and per-rule tier tags.
- Plan 6: 3D-printed plugin (mirrors sheet-metal).
- Plan 7: Hardware-assembly plugin.
- Plan 8: Bending / K-factor.
- Plan 9: Cleanup — flip `useNewHarness` default, delete `assemblyDesigner.ts`.

---

## Conventions (continuing from Plans 1+2)

- **Working directory:** `~/fabware-harness-step0/artifacts/hardwareai/` unless noted.
- **Run tests:** `pnpm test` (single run). Watch: `pnpm test:watch`.
- **Run typecheck:** `pnpm typecheck`. Baseline error count: **38** (maintained across Plans 1+2).
- **Schema push:** `cd ~/fabware-harness-step0/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`. Used in Tasks 1, 2, 3, 9.
- **Test placement:** `__tests__/` subdirs of the module (Plan 1's vitest config now covers `convex/plugins/**`, `convex/orchestrator/**`, `convex/specialists/**`).
- **Commits:** one commit per task unless noted; existing prefix style.
- **Convex `"use node"` directive:** required for files that import the Anthropic SDK. Already used at the top of `convex/assemblyDesigner.ts`. The new helper and the specialist (which now invokes Anthropic) both need it.

---

## Task 0: Verify worktree state

**Files:** none modified.

- [ ] **Step 1:** `cd ~/fabware-harness-step0 && git status && git log --oneline -3 && cd artifacts/hardwareai && pnpm test 2>&1 | tail -3`. Expect: clean tree (or only `.agents/skills/*` incidentals), HEAD at `925caca` (Plan 2 final commit) or descendant, 80 tests pass.
- [ ] **Step 2:** Re-skim `convex/_generated/ai/guidelines.md` Convex-specific rules — especially around `"use node"`, scheduling actions, and never accessing `ctx.db` from an action.

---

## Phase A — Plan-3 prereq fixes from Plan 2's final review

These three fixes (memory: `fabware_harness_step0.md` items I1, I2, Risk 2) must land before any agent-loop code, because the agent loop depends on the public answer-escalation API (so a project can recover from `wait`) and on the batched `processViolations` mutation (so multi-turn repair doesn't risk partial writes).

---

## Task 1: Public `answerEscalation` mutation + re-tick

**Files:**
- Modify: `artifacts/hardwareai/convex/orchestrator/escalations.ts` (add a public `answer` mutation alongside the existing `internalMutation`)

The existing `answer` is `internalMutation` only. Add a public mutation `answerEscalation` that wraps it and schedules a tick so the orchestrator can re-evaluate.

- [ ] **Step 1: Append the public mutation to `convex/orchestrator/escalations.ts`.** First, the file already imports `internalMutation` and `internalQuery`. Update the import to also bring in `mutation`:

```ts
import { internalMutation, internalQuery, mutation } from "../_generated/server";
```

Then, also add the `internal` import from `_generated/api` if not already present. Append at the end of the file:

```ts
import { internal } from "../_generated/api";

/**
 * Public — called by the UI when a user answers an escalation. Patches the
 * escalation row and re-ticks the orchestrator so the phase machine can advance
 * (the escalation that was blocking the wait state is now resolved).
 *
 * Plan 4+ may add an authorization check; for Step-0/1 this is open-by-id like
 * setUseNewHarness and updateScope.
 */
export const answerEscalation = mutation({
  args: { escalationId: v.id("escalations"), answer: v.string() },
  handler: async (ctx, args) => {
    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) throw new Error("escalation not found");
    await ctx.db.patch(args.escalationId, {
      status: "answered",
      answer: args.answer,
      answeredAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, {
      projectId: escalation.projectId,
    });
  },
});
```

- [ ] **Step 2: Typecheck.** `cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 3: Push schema** to publish the new public mutation: `CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`.

- [ ] **Step 4: Re-typecheck and run all tests.** `pnpm typecheck 2>&1 | grep -c "error TS"` → 38; `pnpm test 2>&1 | tail -3` → 80 passed.

- [ ] **Step 5: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/orchestrator/escalations.ts \
  && git commit -m "feat(orchestrator): public answerEscalation mutation — patches + re-ticks orchestrator"
```

---

## Task 2: Batched `processViolations` internal mutation

**Files:**
- Modify: `artifacts/hardwareai/convex/orchestrator/violations.ts` (add `processViolations` mutation that does the open + escalate + resolve in one transaction)
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/violations-batch.test.ts` (test the pure builder for the batch)

Today the specialist runs three sequential mutations per violation. Replace with one mutation that opens the violation, optionally creates an escalation linked to it, and sets the resolution status — atomically. The specialist then calls this once per `runSpecialistOnce` result.

- [ ] **Step 1: Add a pure builder for batch entries.** Open `convex/orchestrator/violations.ts`. Append (above the existing `open` mutation, near `buildViolationDoc`):

```ts
import type { Tier as _Tier, Violation as _Violation } from "../plugins/types";

export interface BatchEntry {
  violation: _Violation;
  tier: _Tier;
  /** If true, also create an escalation linked to this violation and resolve as 'escalated'. */
  escalate: boolean;
  /** Optional override for the escalation question (defaults to violation.message). */
  escalationQuestion?: string;
}
```

(If the file already imports `Tier` and `Violation`, drop the underscore-prefixed re-import; just reuse the existing import.)

- [ ] **Step 2: Add the batched mutation.** Append at the end of the file:

```ts
export const processViolations = internalMutation({
  args: {
    projectId: v.id("projects"),
    partId: v.optional(v.id("parts")),
    entries: v.array(v.object({
      violation: v.object({
        ruleId: v.string(),
        severity: v.union(v.literal("error"), v.literal("warn")),
        message: v.string(),
        agentMessage: v.string(),
        suggestedFix: v.optional(v.any()),
        location: v.optional(v.object({
          kind: v.union(
            v.literal("hole"), v.literal("slot"), v.literal("edge"),
            v.literal("bend"), v.literal("face"), v.literal("feature"),
            v.literal("interface"), v.literal("part"),
          ),
          id: v.string(),
        })),
      }),
      tier: v.union(v.literal("auto-fixable"), v.literal("requires-judgment")),
      escalate: v.boolean(),
      escalationQuestion: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      const violationDoc = buildViolationDoc({
        projectId: args.projectId,
        partId: args.partId,
        violation: entry.violation,
        tier: entry.tier,
      });
      const violationId = await ctx.db.insert("violations", violationDoc);

      if (entry.escalate) {
        await ctx.db.insert("escalations", {
          projectId: args.projectId,
          sourceViolationId: violationId,
          question: entry.escalationQuestion ?? entry.violation.message,
          suggestedAnswer: undefined,
          choices: undefined,
          status: "open" as const,
          answer: undefined as string | undefined,
          createdAt: Date.now(),
          answeredAt: undefined as number | undefined,
        });
        const now = Date.now();
        await ctx.db.patch(violationId, {
          status: "escalated" as const,
          updatedAt: now,
          resolution: { kind: "escalated", by: "agent" as const, at: now, note: undefined },
        });
      }
    }
  },
});
```

This single mutation runs as one Convex transaction. If the action that calls it dies mid-way through the entries array, the entire batch rolls back — no partial state.

- [ ] **Step 3: Write the test.** Create `convex/orchestrator/__tests__/violations-batch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { BatchEntry } from "../violations";

describe("BatchEntry shape", () => {
  it("constructs a sensible escalating entry", () => {
    const entry: BatchEntry = {
      violation: {
        ruleId: "sheet.demo",
        severity: "error",
        message: "demo violation",
        agentMessage: "fix demo",
      },
      tier: "requires-judgment",
      escalate: true,
    };
    expect(entry.escalate).toBe(true);
    expect(entry.violation.severity).toBe("error");
  });

  it("supports a non-escalating entry (tier auto-fixable, agent will retry)", () => {
    const entry: BatchEntry = {
      violation: {
        ruleId: "sheet.demo2",
        severity: "warn",
        message: "demo warn",
        agentMessage: "ack",
      },
      tier: "auto-fixable",
      escalate: false,
    };
    expect(entry.escalate).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test.** `pnpm test convex/orchestrator/__tests__/violations-batch.test.ts`. Expected: 2 pass.

- [ ] **Step 5: Typecheck + Convex push** (the new internal mutation needs to register).

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS" \
  && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: 38 errors, push succeeds.

- [ ] **Step 6: Refactor specialist to use `processViolations`.** Open `convex/specialists/sheetMetal.ts`. Find the violations loop (the for-of over `result.violations` that calls `internal.orchestrator.violations.open`, then `internal.orchestrator.escalations.open`, then `internal.orchestrator.violations.resolve`). Replace the entire loop with a single batch call:

```ts
    // Write all violations + escalations in one atomic batch.
    if (result.violations.length > 0) {
      await ctx.runMutation(internal.orchestrator.violations.processViolations, {
        projectId: args.projectId,
        partId: args.partId,
        entries: result.violations.map((v) => ({
          violation: v,
          tier: "requires-judgment" as const,
          escalate: true,
        })),
      });
    }
```

Make sure to remove the now-unused `Tier` import line if it was only used by the old loop.

- [ ] **Step 7: Run the specialist tests + full suite.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: 82 passed (80 prior + 2 new from violations-batch.test.ts). The pure `runSpecialistOnce` tests still pass. The e2e roundtrip test still passes (it tests the pure helper, not the action).

- [ ] **Step 8: Re-typecheck.**

```
pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 9: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/orchestrator/violations.ts artifacts/hardwareai/convex/orchestrator/__tests__/violations-batch.test.ts artifacts/hardwareai/convex/specialists/sheetMetal.ts \
  && git commit -m "feat(orchestrator): processViolations batched mutation; specialist uses it instead of per-violation triple-mutation"
```

---

## Task 3: Cascade-delete violations on individual `removePart`

**Files:**
- Modify: `artifacts/hardwareai/convex/parts.ts` (the `removePart` mutation handler)

Today `projects.remove` cascades violations/escalations/planEvents at the project level (Plan 2 Task 1), but `parts.removePart` only deletes interfaces touching the part — orphaning any violations linked via `partId`. The `violations.by_part` index already exists.

- [ ] **Step 1: Read `convex/parts.ts:removePart`** to find the existing interface-cascade. The handler loops over interfaces touching the part and deletes them. Add a violations cascade right before the part itself is deleted.

- [ ] **Step 2: Add the cascade.** Inside the `removePart` handler, just before the final `await ctx.db.delete(args.partId)`, add:

```ts
    // Cascade-delete any violations that pointed at this specific part.
    // (Project-level remove handles these too; this is for individual part removal.)
    const partViolations = await ctx.db
      .query("violations")
      .withIndex("by_part", (q) => q.eq("partId", args.partId))
      .collect();
    for (const vio of partViolations) await ctx.db.delete(vio._id);
```

(If the handler's argument name is different — e.g., `{ partId }` destructured rather than `args.partId` — adjust the property access accordingly.)

- [ ] **Step 3: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 4: Commit.** No tests added — the cascade is exercised in the production smoke test (delete a part with violations and confirm they're gone) which is a manual verification.

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/parts.ts \
  && git commit -m "feat(parts): removePart cascade-deletes violations linked via partId"
```

---

## Phase B — Reusable Anthropic helper

The existing `convex/assemblyDesigner.ts` does the Anthropic call inline. Extract it into a reusable helper that the new specialist can call. Keep the helper thin so swapping it for a fake in tests is trivial.

---

## Task 4: Anthropic client helper

**Files:**
- Create: `artifacts/hardwareai/convex/lib/anthropicClient.ts` (the helper, "use node")
- Create: `artifacts/hardwareai/convex/lib/__tests__/anthropicClient.test.ts`

- [ ] **Step 1: Write the failing test.** Create `convex/lib/__tests__/anthropicClient.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, confirm fail.** `pnpm test convex/lib/__tests__/anthropicClient.test.ts`. Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper.** Create `convex/lib/anthropicClient.ts`:

```ts
"use node";

import Anthropic from "@anthropic-ai/sdk";

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
```

- [ ] **Step 4: Run the test.** `pnpm test convex/lib/__tests__/anthropicClient.test.ts`. Expected: 3 pass.

- [ ] **Step 5: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 6: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/lib/anthropicClient.ts artifacts/hardwareai/convex/lib/__tests__/anthropicClient.test.ts \
  && git commit -m "feat(lib): anthropicClient — buildClientParams + parseClientResponse + runAgentTurn"
```

---

## Task 5: Mark `assemblyDesigner.ts` deprecated (no removal yet)

**Files:**
- Modify: `artifacts/hardwareai/convex/assemblyDesigner.ts` (add a deprecation banner; do NOT remove or refactor — Plan 9 deletes it).

This is documentation only — gives Plan 4+ readers a clear pointer that the code is on the chopping block.

- [ ] **Step 1: Add a banner.** At the top of `convex/assemblyDesigner.ts`, immediately AFTER the `"use node";` directive, insert:

```ts
/**
 * @deprecated Legacy agent loop. Used only for projects where useNewHarness !== true.
 * Plan 9 removes this file once the new harness reaches feature parity.
 *
 * The Anthropic call has been extracted to convex/lib/anthropicClient.ts.
 * The sheet-metal-specific tools are being ported to convex/plugins/sheet_metal/tools.ts (Plan 3).
 * Decomposition / archetype tools (capture_scope, select_archetype) will move to the
 * orchestrator's decomposition agent (Plan 4+).
 */
```

- [ ] **Step 2: Typecheck (sanity).** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 3: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/assemblyDesigner.ts \
  && git commit -m "docs(assemblyDesigner): mark deprecated; point at new helper + plugin tools"
```

---

## Phase C — Sheet-metal tools + system prompt

Port the two sheet-metal-specific tools from `assemblyDesigner.ts` (`refine_part`, `add_feature_to_part`) into the plugin. These become `sheetMetalPlugin.tools`. Also write the plugin's system prompt fragment.

---

## Task 6: Sheet-metal tool definitions + system prompt fragment

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/sheet_metal/tools.ts`
- Create: `artifacts/hardwareai/convex/plugins/sheet_metal/prompts.ts`
- Create: `artifacts/hardwareai/convex/plugins/sheet_metal/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test.** Create `convex/plugins/sheet_metal/__tests__/tools.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, confirm fail.** `pnpm test convex/plugins/sheet_metal/__tests__/tools.test.ts`. Expected: FAIL — modules not found.

- [ ] **Step 3: Create the tools module.** `convex/plugins/sheet_metal/tools.ts`:

```ts
import type { AgentTool } from "../types";

export const refinePartTool: AgentTool = {
  name: "refine_part",
  description:
    "Apply a patch to one part's DSL (change dimensions, add a feature, remove a feature). " +
    "Use this for mechanical fixes — moving a hole, bumping a thickness, changing material. " +
    "The dsl input must be a complete updated PartDsl shape.",
  input_schema: {
    type: "object",
    properties: {
      role: { type: "string", description: "The part's role (e.g., 'panel', 'bracket')." },
      dsl: { type: "object", description: "The full updated PartDsl. All fields required." },
      rationale: { type: "string", description: "One sentence — why this change resolves the violation." },
    },
    required: ["role", "dsl", "rationale"],
  },
};

export const addFeatureToPartTool: AgentTool = {
  name: "add_feature_to_part",
  description:
    "Add a single feature (hole/bend/slot/fillet) to the named part without replacing its DSL wholesale. " +
    "Use this for additive fixes — e.g., adding a relief slot near a bend, adding a hole for a fastener.",
  input_schema: {
    type: "object",
    properties: {
      role: { type: "string" },
      feature: {
        type: "object",
        description:
          "The feature object. Must conform to FeatureSchema in convex/lib/dsl.ts: " +
          "{ kind: 'hole'|'bend'|'slot'|'fillet', name, ...kind-specific fields }.",
      },
      rationale: { type: "string" },
    },
    required: ["role", "feature", "rationale"],
  },
};

export const TOOLS: AgentTool[] = [refinePartTool, addFeatureToPartTool];
```

- [ ] **Step 4: Create the prompt fragment.** `convex/plugins/sheet_metal/prompts.ts`:

```ts
/**
 * System-prompt fragment for the sheet-metal specialist. Concatenated with the
 * global Fabware preamble + the project's scope summary + the current part DSL +
 * the violations list (when in repair mode). See specialists/sheetMetal.ts for the
 * full prompt assembly.
 */
export const systemPromptFragment = `
You are the sheet-metal specialist in Fabware's harness. You design and refine
sheet-metal parts that will be flat-pattern laser-cut by SendCutSend (SCS).

Constraints you must respect:
- Materials, thicknesses, and finishes are limited to what SCS stocks. The validator
  will reject non-stocked values; if a violation says "thickness X not stocked",
  pick the nearest stocked value from the violation's suggestedFix.
- Hole edge-distance rule: hole center must be ≥1.5× hole-diameter from any outline edge.
- Bend constraints (when the DSL has bends): bend radius must be ≥ material thickness;
  features within bend zones are forbidden.
- Powder coat is optional; if absent the part ships unfinished.

When fixing violations, prefer the smallest mechanical change that resolves the
issue. Don't redesign — patch. Use refine_part for full-DSL updates and
add_feature_to_part for purely-additive single-feature additions.

If a violation needs a judgment call (material change, scope change, tier change),
do NOT try to fix it — leave it open and the orchestrator will escalate to the user.
`.trim();
```

- [ ] **Step 5: Run the test.** `pnpm test convex/plugins/sheet_metal/__tests__/tools.test.ts`. Expected: 5 pass.

- [ ] **Step 6: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 7: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/sheet_metal/tools.ts artifacts/hardwareai/convex/plugins/sheet_metal/prompts.ts artifacts/hardwareai/convex/plugins/sheet_metal/__tests__/tools.test.ts \
  && git commit -m "feat(plugins/sheet_metal): tool definitions + system prompt fragment"
```

---

## Task 7: Wire tools and prompt into `sheetMetalPlugin`

**Files:**
- Modify: `artifacts/hardwareai/convex/plugins/sheet_metal/index.ts`
- Modify: `artifacts/hardwareai/convex/plugins/sheet_metal/__tests__/plugin.test.ts`

- [ ] **Step 1: Update the plugin object.** In `convex/plugins/sheet_metal/index.ts`, change:

```ts
import type { ProcessPlugin } from "../types";
import { DslSchema, type Dsl } from "./dsl";
import { validate } from "./validator";
```

to:

```ts
import type { ProcessPlugin } from "../types";
import { DslSchema, type Dsl } from "./dsl";
import { validate } from "./validator";
import { TOOLS } from "./tools";
import { systemPromptFragment } from "./prompts";
```

Then change the plugin's `tools: []` and `systemPromptFragment: ""` lines to:

```ts
  tools: TOOLS,
  systemPromptFragment,
```

Update the comment near tools to remove the "Plan 3 wires the real tool surface" note (since this IS Plan 3).

- [ ] **Step 2: Update the existing plugin test** to assert tools/prompt are populated. In `convex/plugins/sheet_metal/__tests__/plugin.test.ts`, add two new tests inside the existing `describe("sheetMetalPlugin", ...)` block:

```ts
  it("exposes the sheet-metal tool surface (refine_part + add_feature_to_part)", () => {
    const names = sheetMetalPlugin.tools.map((t) => t.name);
    expect(names).toContain("refine_part");
    expect(names).toContain("add_feature_to_part");
    expect(sheetMetalPlugin.tools.length).toBe(2);
  });

  it("has a non-empty systemPromptFragment", () => {
    expect(sheetMetalPlugin.systemPromptFragment.length).toBeGreaterThan(50);
  });
```

- [ ] **Step 3: Run the plugin tests.** `pnpm test convex/plugins/sheet_metal/__tests__/plugin.test.ts`. Expected: 6 pass.

- [ ] **Step 4: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 5: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/sheet_metal/index.ts artifacts/hardwareai/convex/plugins/sheet_metal/__tests__/plugin.test.ts \
  && git commit -m "feat(plugins/sheet_metal): wire tools + systemPromptFragment into plugin object"
```

---

## Phase D — Specialist agent repair loop

Now the agent integration. The specialist's existing pure validate-and-escalate path stays as the **first pass**. When `runSpecialistOnce` produces violations whose `autoRepair` returns null (which is always today), the action enters a repair loop: assemble a focused repair prompt, call Anthropic with the plugin's tools, apply the tool calls to the DSL, re-validate. Up to N=3 turns. Whatever's left after the budget escalates.

---

## Task 8: Pure helper for repair-turn prompt assembly + tool-call application

**Files:**
- Modify: `artifacts/hardwareai/convex/specialists/_helpers.ts` (add new pure functions)
- Modify: `artifacts/hardwareai/convex/specialists/__tests__/sheetMetal.test.ts` (add tests for the new helpers)

The actual Anthropic call happens in the action (Task 9). The pure helpers do everything else: prompt assembly, tool-call application to DSL, decide whether to keep looping.

- [ ] **Step 1: Add three helpers + types** to `convex/specialists/_helpers.ts`. Append at the end of the file:

```ts
import type { Violation, AgentTool } from "../plugins/types";

export interface RepairTurnPrompt {
  system: string;
  tools: AgentTool[];
  /**
   * Single user message containing the part DSL JSON + the open violations to fix.
   * The model is expected to respond with one or more tool_use blocks (refine_part
   * or add_feature_to_part) targeting the violations.
   */
  userMessage: string;
}

interface BuildPromptInput {
  scope: unknown | null;
  partLabel: string;
  partDsl: unknown;
  violations: Violation[];
  pluginSystemPromptFragment: string;
  pluginTools: AgentTool[];
}

/**
 * Assemble the prompt for one repair turn. The orchestrator/specialist constructs
 * this from layered fragments — see spec section 4 ("Agent layer").
 *
 * Layered shape: [global preamble] + [role preamble] + [scope summary] +
 * [plugin systemPromptFragment] + [local context (DSL + violations)] +
 * [turn intent (repair)].
 */
export function buildRepairPrompt(input: BuildPromptInput): RepairTurnPrompt {
  const scopeLine = input.scope
    ? `Project scope: ${JSON.stringify(input.scope)}`
    : "Project scope: not yet set.";

  const violationLines = input.violations
    .map((v, i) => `${i + 1}. [${v.ruleId}] ${v.agentMessage}${v.suggestedFix ? ` (suggestedFix: ${JSON.stringify(v.suggestedFix)})` : ""}`)
    .join("\n");

  const system =
    "You are Fabware's harness specialist running a focused repair turn.\n\n" +
    "Role: specialist:sheet-metal\n\n" +
    scopeLine + "\n\n" +
    input.pluginSystemPromptFragment + "\n\n" +
    "Repair-turn instructions:\n" +
    "- Apply minimal mechanical fixes via your tools (refine_part or add_feature_to_part).\n" +
    "- Do NOT redesign the part. Patch only.\n" +
    "- If a violation cannot be fixed mechanically (e.g. requires a material change\n" +
    "  the user must approve), leave it for the orchestrator to escalate.\n";

  const userMessage =
    `Part: ${input.partLabel}\n\n` +
    `Current DSL:\n\`\`\`json\n${JSON.stringify(input.partDsl, null, 2)}\n\`\`\`\n\n` +
    `Open violations to fix this turn (${input.violations.length}):\n${violationLines}\n\n` +
    "Respond with one or more tool calls that resolve the violations.";

  return { system, tools: input.pluginTools, userMessage };
}

/**
 * Apply a single tool call to a DSL. Returns { dsl, applied } where `applied` is
 * true iff the tool name was recognized AND the call's input was structurally valid.
 *
 * `refine_part` replaces the entire DSL. `add_feature_to_part` appends one feature.
 * Any other tool name returns the input DSL unchanged with applied=false.
 *
 * The DSL is validated by the plugin's dslSchema after applying — if parsing fails,
 * the change is rejected (returns input DSL unchanged, applied=false).
 */
export function applyToolCallToDsl<TDsl>(
  dsl: TDsl,
  toolCall: { name: string; input: unknown },
  dslSchema: { safeParse: (v: unknown) => { success: boolean; data?: TDsl } },
): { dsl: TDsl; applied: boolean } {
  const input = toolCall.input as Record<string, unknown>;

  if (toolCall.name === "refine_part") {
    if (!input || typeof input !== "object" || !("dsl" in input)) return { dsl, applied: false };
    const candidate = input.dsl;
    const parsed = dslSchema.safeParse(candidate);
    if (parsed.success && parsed.data !== undefined) {
      return { dsl: parsed.data, applied: true };
    }
    return { dsl, applied: false };
  }

  if (toolCall.name === "add_feature_to_part") {
    if (!input || typeof input !== "object" || !("feature" in input)) return { dsl, applied: false };
    const dslAsRecord = dsl as unknown as { features?: unknown[] };
    if (!Array.isArray(dslAsRecord.features)) return { dsl, applied: false };
    const candidate = { ...dslAsRecord, features: [...dslAsRecord.features, input.feature] };
    const parsed = dslSchema.safeParse(candidate);
    if (parsed.success && parsed.data !== undefined) {
      return { dsl: parsed.data, applied: true };
    }
    return { dsl, applied: false };
  }

  return { dsl, applied: false };
}
```

- [ ] **Step 2: Add tests for the new helpers.** Append at the end of `convex/specialists/__tests__/sheetMetal.test.ts`:

```ts
import { buildRepairPrompt, applyToolCallToDsl } from "../_helpers";

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
```

- [ ] **Step 3: Run the specialist tests.** `pnpm test convex/specialists/__tests__/sheetMetal.test.ts`. Expected: 7 pass (3 prior + 4 new).

- [ ] **Step 4: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 5: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/specialists/_helpers.ts artifacts/hardwareai/convex/specialists/__tests__/sheetMetal.test.ts \
  && git commit -m "feat(specialists): pure helpers — buildRepairPrompt + applyToolCallToDsl"
```

---

## Task 9: Wire the agent repair loop into the specialist action

**Files:**
- Modify: `artifacts/hardwareai/convex/specialists/sheetMetal.ts` (add the agent loop between `runSpecialistOnce` and the violations write)

The new flow inside `run`:

1. Validate (existing `runSpecialistOnce`).
2. If violations exist, **enter the agent repair loop** — up to `R=3` turns:
   - Build the repair prompt from current DSL + open violations.
   - Call Anthropic via `runAgentTurn` (or the injected fake in tests).
   - For each tool call in the response, apply to DSL via `applyToolCallToDsl`. If any tool was applied, persist the new DSL.
   - Re-validate. If clean, exit the loop.
3. Whatever violations are left after `R` turns → batch-write via `processViolations` (Task 2) with `escalate: true`.
4. Set part status (`ok` if no violations after loop; `escalated` if any remain).
5. Log + re-tick (existing).

- [ ] **Step 1: Add a configurable repair-budget constant.** At the top of `convex/specialists/sheetMetal.ts`, after imports but before `export const run`, add:

```ts
const REPAIR_TURN_BUDGET = 3;
```

- [ ] **Step 2: Add the repair loop**. In the `run` action's handler, between the existing `runSpecialistOnce` call (which produces `result`) and the violations-write block, insert:

```ts
    // 3.5: Agent repair loop. If pure-function validation produced violations whose
    // autoRepair was null (always in Plans 2 & 3), give the Anthropic agent up to
    // REPAIR_TURN_BUDGET turns to apply mechanical fixes via plugin tools.
    let currentDsl = result.repairedDsl;
    let currentViolations = result.violations;
    let agentApplyCount = 0;

    if (currentViolations.length > 0) {
      for (let turn = 0; turn < REPAIR_TURN_BUDGET; turn += 1) {
        const prompt = buildRepairPrompt({
          scope: part.scope,
          partLabel: part.label,
          partDsl: currentDsl,
          violations: currentViolations,
          pluginSystemPromptFragment: sheetMetalPlugin.systemPromptFragment,
          pluginTools: sheetMetalPlugin.tools,
        });

        const turnResult = await runAgentTurn({
          model: "claude-sonnet-4-6",
          effort: "low",
          system: prompt.system,
          tools: prompt.tools,
          messages: [{ role: "user", content: prompt.userMessage }],
        });

        let anyApplied = false;
        for (const toolCall of turnResult.toolCalls) {
          const applied = applyToolCallToDsl(currentDsl, toolCall, sheetMetalPlugin.dslSchema);
          if (applied.applied) {
            currentDsl = applied.dsl;
            anyApplied = true;
            agentApplyCount += 1;
          }
        }

        if (!anyApplied) break;  // agent gave up — nothing further to try

        // Re-validate after applying tool calls.
        currentViolations = sheetMetalPlugin.validate(currentDsl, {
          scope: part.scope ?? null,
          peerParts: part.peerParts,
        });
        if (currentViolations.length === 0) break;
      }

      // If the loop changed the DSL (any agent-apply succeeded), persist it.
      if (agentApplyCount > 0) {
        await ctx.runMutation(internal.specialists.sheetMetal._setPartDsl, {
          partId: args.partId,
          dslJson: JSON.stringify(currentDsl),
        });
      }
    }
```

You'll need to add imports at the top of the file:

```ts
import { buildRepairPrompt, applyToolCallToDsl } from "./_helpers";
import { runAgentTurn } from "../lib/anthropicClient";
```

- [ ] **Step 3: Update the violations-write block** to use `currentViolations` (the post-repair-loop list) instead of `result.violations`. The existing block (added in Task 2 of this plan) writes `result.violations.map(...)`; change to:

```ts
    // Write whatever violations survived the repair loop.
    if (currentViolations.length > 0) {
      await ctx.runMutation(internal.orchestrator.violations.processViolations, {
        projectId: args.projectId,
        partId: args.partId,
        entries: currentViolations.map((v) => ({
          violation: v,
          tier: "requires-judgment" as const,
          escalate: true,
        })),
      });
    }
```

- [ ] **Step 4: Update the part-status setter** to use `currentViolations.length === 0 ? "ok" : "escalated"` instead of `result.status`. The existing `_setPartStatus` call should now read:

```ts
    await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
      partId: args.partId,
      status: currentViolations.length === 0 ? "ok" : "escalated",
    });
```

- [ ] **Step 5: Update the planEvent details** to include `agentApplyCount`:

```ts
    await ctx.runMutation(internal.orchestrator.planEvents.append, {
      projectId: args.projectId, kind: "specialist-completed",
      payload: {
        partId: String(args.partId),
        details: {
          status: currentViolations.length === 0 ? "ok" : "escalated",
          violations: currentViolations.length,
          autoRepaired: result.autoRepairedCount,
          agentApplied: agentApplyCount,
        },
      },
    });
```

- [ ] **Step 6: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38. (If new errors appear from `process.env` or Anthropic types, that's because the file also needs the `"use node"` directive if it doesn't already have it.)

- [ ] **Step 7: Confirm `"use node"`.** The file `convex/specialists/sheetMetal.ts` must start with `"use node";` since it now transitively imports the Anthropic SDK (via `runAgentTurn`). If the directive isn't already at the top, add it as the very first line.

- [ ] **Step 8: Push schema.** `cd artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`. Expected: success.

- [ ] **Step 9: Re-typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 10: Run the full test suite.** `pnpm test 2>&1 | tail -3`. Expected: all pass (the existing tests are pure-function or schema tests; none invoke the live Anthropic API). Approximate count: 84+ tests.

- [ ] **Step 11: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/specialists/sheetMetal.ts \
  && git commit -m "feat(specialists): agent repair loop — up to REPAIR_TURN_BUDGET=3 Anthropic turns before escalation"
```

---

## Task 10: End-to-end test with a fake Anthropic runner

**Files:**
- Modify: `artifacts/hardwareai/convex/specialists/_helpers.ts` (export an injectable `runAgentTurnFn` type so tests can swap)
- Modify: `artifacts/hardwareai/convex/specialists/sheetMetal.ts` (allow injection at test time — see below)
- Create: `artifacts/hardwareai/convex/specialists/__tests__/repair-loop.test.ts`

The Convex `run` action can't be unit-tested without mocking `ctx`, but we CAN unit-test a pure function that orchestrates the repair loop with an injected runner. Refactor: extract the loop body into a pure function `runAgentRepairLoop` that takes a runner function as input. The action then calls it with `runAgentTurn`; tests call it with a fake.

- [ ] **Step 1: Extract the loop** into a pure helper. Open `convex/specialists/_helpers.ts` and append:

```ts
import type { ProcessPlugin, PartContext } from "../plugins/types";
import type { AgentTurnInput, AgentTurnResult } from "../lib/anthropicClient";

export type RunAgentTurnFn = (input: AgentTurnInput) => Promise<AgentTurnResult>;

export interface AgentRepairResult<TDsl> {
  finalDsl: TDsl;
  finalViolations: Violation[];
  agentApplyCount: number;
  turnsUsed: number;
}

interface RunRepairLoopInput<TDsl> {
  plugin: ProcessPlugin<TDsl>;
  initialDsl: TDsl;
  initialViolations: Violation[];
  ctx: PartContext;
  partLabel: string;
  budget: number;
  runAgentTurn: RunAgentTurnFn;
}

export async function runAgentRepairLoop<TDsl>(input: RunRepairLoopInput<TDsl>): Promise<AgentRepairResult<TDsl>> {
  let currentDsl = input.initialDsl;
  let currentViolations = input.initialViolations;
  let agentApplyCount = 0;
  let turnsUsed = 0;

  if (currentViolations.length === 0) {
    return { finalDsl: currentDsl, finalViolations: currentViolations, agentApplyCount, turnsUsed };
  }

  for (let turn = 0; turn < input.budget; turn += 1) {
    turnsUsed += 1;
    const prompt = buildRepairPrompt({
      scope: input.ctx.scope,
      partLabel: input.partLabel,
      partDsl: currentDsl,
      violations: currentViolations,
      pluginSystemPromptFragment: input.plugin.systemPromptFragment,
      pluginTools: input.plugin.tools,
    });

    const turnResult = await input.runAgentTurn({
      model: "claude-sonnet-4-6",
      effort: "low",
      system: prompt.system,
      tools: prompt.tools,
      messages: [{ role: "user", content: prompt.userMessage }],
    });

    let anyApplied = false;
    for (const toolCall of turnResult.toolCalls) {
      const applied = applyToolCallToDsl(currentDsl, toolCall, input.plugin.dslSchema);
      if (applied.applied) {
        currentDsl = applied.dsl;
        anyApplied = true;
        agentApplyCount += 1;
      }
    }

    if (!anyApplied) break;

    currentViolations = input.plugin.validate(currentDsl, input.ctx);
    if (currentViolations.length === 0) break;
  }

  return { finalDsl: currentDsl, finalViolations: currentViolations, agentApplyCount, turnsUsed };
}
```

- [ ] **Step 2: Refactor the action** in `convex/specialists/sheetMetal.ts` to call `runAgentRepairLoop` with the live `runAgentTurn`. Replace the inline repair loop (added in Task 9) with:

```ts
    const repaired = await runAgentRepairLoop({
      plugin: sheetMetalPlugin,
      initialDsl: result.repairedDsl,
      initialViolations: result.violations,
      ctx: { scope: part.scope ?? null, peerParts: part.peerParts },
      partLabel: part.label,
      budget: REPAIR_TURN_BUDGET,
      runAgentTurn,
    });

    const currentDsl = repaired.finalDsl;
    const currentViolations = repaired.finalViolations;
    const agentApplyCount = repaired.agentApplyCount;

    if (agentApplyCount > 0) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartDsl, {
        partId: args.partId,
        dslJson: JSON.stringify(currentDsl),
      });
    }
```

Update the import line at the top of the file from:

```ts
import { buildRepairPrompt, applyToolCallToDsl } from "./_helpers";
```

to:

```ts
import { runAgentRepairLoop } from "./_helpers";
```

(`buildRepairPrompt` and `applyToolCallToDsl` are now used internally by `runAgentRepairLoop`; the action doesn't import them directly.)

- [ ] **Step 3: Write the e2e test.** Create `convex/specialists/__tests__/repair-loop.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the new test.** `pnpm test convex/specialists/__tests__/repair-loop.test.ts`. Expected: 4 pass.

- [ ] **Step 5: Run the full suite.** `pnpm test 2>&1 | tail -3`. Expected: all pass; total around 88+.

- [ ] **Step 6: Typecheck.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 7: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/specialists/_helpers.ts artifacts/hardwareai/convex/specialists/sheetMetal.ts artifacts/hardwareai/convex/specialists/__tests__/repair-loop.test.ts \
  && git commit -m "feat(specialists): runAgentRepairLoop pure function + 4 fake-runner tests"
```

---

## Phase E — Sweep

---

## Task 11: Final sweep

**Files:** none modified.

- [ ] **Step 1: Confirm full test suite passes.** `cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -5`. Expected: all pass.

- [ ] **Step 2: Confirm typecheck baseline.** `pnpm typecheck 2>&1 | grep -c "error TS"`. Expected: 38.

- [ ] **Step 3: Confirm git state and review the new commits.** `cd ~/fabware-harness-step0 && git status && git log --oneline 925caca..HEAD`. Expected: clean (or only `.agents/skills/*` incidentals); ~10–11 new commits stacked on Plan 2's `925caca`.

- [ ] **Step 4: No PLAN.md update** — Plan 2's final review found there's no clean insertion point; defer to merge time.

---

## What this plan does NOT do (intentionally)

- **Design parts from intent (no DSL → new DSL).** Plan 4. The specialist still requires `part.dslJson` to be present.
- **Per-rule files in `convex/plugins/sheet_metal/rules/`.** Plan 5.
- **3D-printed plugin.** Plan 6.
- **Hardware-assembly plugin.** Plan 7.
- **Bending / K-factor.** Plan 8.
- **Cleanup of `assemblyDesigner.ts`.** Plan 9.
- **Anthropic-cassette tests for the live `runAgentTurn`.** The repair loop is tested with a fake runner (Task 10); the live path isn't exercised in unit tests. End-to-end verification happens via the dashboard smoke test.
- **Authorization on `answerEscalation`.** Open-by-id like the other Step-0/1 mutations. Add when the UI surfaces it.
- **Multi-message agent conversations.** Each repair turn is a single user message + single assistant response. Plan 4+ may add multi-turn within one specialist invocation if needed.
- **Adjusting `REPAIR_TURN_BUDGET` per project tier.** Hard-coded at 3 for now; tune from real runs (per spec section 5 "open questions to resolve").

---

## Plan self-review (already performed)

**Spec coverage:** Covers spec section 4 (agent layer — system prompt assembly, tool routing, repair-turn prompt) and section 5 (rules engine — agent-driven repair leg of the two-tier loop, with the auto-repair leg still null). Section 4's "escalation phrasing" pass via low-effort agent isn't done here — escalations still use the violation's raw `message` as the question; that's a Plan 4 enrichment.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" steps. Stub returns are documented as Plan-N follow-ups.

**Type consistency:** `AgentTool` from `convex/plugins/types.ts` is reused (not redeclared). The new helper types (`RunAgentTurnFn`, `AgentRepairResult`, `RepairTurnPrompt`) are exported from `_helpers.ts`. The `Tier`/`Severity` literals match throughout.

**Scope check:** 11 tasks. Phase A (3 tasks) is the prereq cleanup, Phase B (2 tasks) extracts the Anthropic helper, Phase C (2 tasks) is the plugin's tool surface, Phase D (3 tasks) is the agent loop itself, Phase E (1 task) is the sweep. Each task is independently reviewable. The Anthropic SDK is already in the dep tree via `assemblyDesigner.ts`; no new package adds.
