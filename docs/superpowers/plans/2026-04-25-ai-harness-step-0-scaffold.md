# AI Harness — Plan 1: Step 0 Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the plugin contract types, three new Convex tables (`violations`, `escalations`, `planEvents`), two new project fields (`phase`, `useNewHarness`), and a no-op orchestrator action — without changing how any existing project behaves. After this plan ships, `assemblyDesigner.ts` still drives every project; the new code is opt-in via the `useNewHarness` flag.

**Architecture:** Three additions, all opt-in.
1. `convex/plugins/types.ts` — shared types every future plugin (sheet-metal, printed, hardware-assembly, etc.) implements.
2. Schema additions: three new tables + two project fields. Purely additive, no existing fields touched.
3. `convex/orchestrator/` — tick `internalAction`, design-plan queries, mutation helpers for violations/escalations/planEvents, and a placeholder plugin registry. Tick is a no-op for now (returns immediately because no plugins are registered yet); Plan 2 fills it in.

**Tech Stack:** TypeScript (strict, ESM), Convex (server + schema), Vitest (in `convex/**/__tests__/**.test.ts`). All work happens in `artifacts/hardwareai/` (the `@workspace/hardwareai` pnpm package).

**Spec:** `docs/superpowers/specs/2026-04-25-ai-harness-design.md`

**Companion plans (to be written sequentially):**
- Plan 2: Sheet-metal plugin migration (Step 1)
- Plan 3: 3D-printed plugin migration (Step 2)
- Plan 4: Hardware-assembly plugin migration (Step 3)
- Plan 5: Bending / K-factor in sheet-metal plugin (Step 4)
- Plan 6: Cleanup — flip flag default, delete `assemblyDesigner.ts` (Step 5)

---

## Conventions for every task in this plan

- **Working directory:** `~/fabware/artifacts/hardwareai/` unless noted.
- **Run tests:** `pnpm test` (vitest, single run). Watch mode: `pnpm test:watch`.
- **Run typecheck:** `pnpm typecheck`.
- **Schema push (Convex dev):** `cd ~/fabware/artifacts/hardwareai && npx convex dev --once` (uses dev deployment `amiable-emu-84` per memory; user authenticates the first time).
- **Test placement:** mirror existing convention — tests live in `__tests__/` subdirs of the module (e.g., `convex/plugins/__tests__/types.test.ts`). The Vitest `include` pattern in `vitest.config.ts` covers `convex/lib/**` and `convex/archetypes/**`; **Task 1 extends it** to also cover `convex/plugins/**` and `convex/orchestrator/**`.
- **Commits:** one commit per task unless a task explicitly says otherwise. Use the existing prefix style (`feat(...)`, `feat(convex): ...`, etc., per `git log`).
- **Convex guidelines:** every task that touches `convex/` must respect `artifacts/hardwareai/convex/_generated/ai/guidelines.md`. The plan calls out the relevant rules at each task; Task 0 has you read it once end-to-end.

---

## Task 0: Read Convex guidelines + extend Vitest include pattern

**Files:**
- Read: `artifacts/hardwareai/convex/_generated/ai/guidelines.md`
- Modify: `artifacts/hardwareai/vitest.config.ts`

- [ ] **Step 1: Read the guidelines file.** Skim end-to-end; pay special attention to schema/query/mutation/action patterns and how to import from `_generated/`. Implementation throughout the plan must follow these.

- [ ] **Step 2: Extend the vitest include pattern.** Open `artifacts/hardwareai/vitest.config.ts`. The current `include` line is:

```ts
    include: ["convex/lib/**/*.test.ts", "convex/archetypes/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
```

Change to:

```ts
    include: [
      "convex/lib/**/*.test.ts",
      "convex/archetypes/**/*.test.ts",
      "convex/plugins/**/*.test.ts",
      "convex/orchestrator/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
```

- [ ] **Step 3: Run tests to confirm nothing broke.**

```
cd ~/fabware/artifacts/hardwareai && pnpm test
```

Expected: same suite passes as before; no new tests yet.

- [ ] **Step 4: Commit.**

```
cd ~/fabware/artifacts/hardwareai && git add vitest.config.ts \
  && git commit -m "test(harness): broaden vitest include to cover plugins/ and orchestrator/"
```

---

## Task 1: Plugin contract types

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/types.ts`
- Create: `artifacts/hardwareai/convex/plugins/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test.** Create `artifacts/hardwareai/convex/plugins/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ProcessPlugin, Rule, Violation, AutoRepair, GeometryRef, PartContext } from "../types";

describe("plugin contract types", () => {
  it("can construct a Violation literal", () => {
    const v: Violation = {
      ruleId: "sheet.hole-edge-distance",
      severity: "error",
      message: "Hole H3 is 1.20mm from edge; min 3.20mm",
      agentMessage: "Move hole H3 so its center is ≥3.20mm from any outline edge.",
      location: { kind: "hole", id: "H3" },
    };
    expect(v.ruleId).toBe("sheet.hole-edge-distance");
    expect(v.severity).toBe("error");
  });

  it("Rule.tier is exhaustive", () => {
    const r: Rule<{ x: number }> = {
      id: "demo.rule",
      severity: "warn",
      tier: "auto-fixable",
      check: () => null,
    };
    // Type-level assertion: assigning an unknown tier should break TS at compile time.
    // Runtime assertion just checks the literal we used.
    expect(r.tier).toBe("auto-fixable");
  });

  it("ProcessPlugin shape compiles for a stub", () => {
    const stub: ProcessPlugin<{ x: number }> = {
      kind: "sheet_metal",
      dslSchema: { parse: (v) => v as { x: number } } as never,
      tools: [],
      systemPromptFragment: "",
      rules: [],
      validate: () => [],
      autoRepair: () => null,
      renderPreview: () => ({ meshes: [] }),
      export: () => [],
      estimateCost: () => ({ totalUsd: 0, breakdown: [] }),
      supportedInterfaces: [],
    };
    expect(stub.kind).toBe("sheet_metal");
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.**

```
cd ~/fabware/artifacts/hardwareai && pnpm test convex/plugins/__tests__/types.test.ts
```

Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Create the types file.** Create `artifacts/hardwareai/convex/plugins/types.ts`:

```ts
/**
 * Process plugin contract — every manufacturing process (sheet_metal, printed,
 * hardware-assembly, …) implements this shape. Pure TS; no Convex, no Anthropic.
 */

import type { ZodType } from "zod";

// ─── Identity ────────────────────────────────────────────────────────────────

export type PartKind = "sheet_metal" | "printed" | "purchased";

export type InterfaceKind = "bolted" | "pem_inserted" | "riveted" | "hinged";

// ─── Validation ──────────────────────────────────────────────────────────────

export type Severity = "error" | "warn";
export type Tier = "auto-fixable" | "requires-judgment";

export interface GeometryRef {
  /** What kind of geometric element this violation points at (used by UI to highlight). */
  kind: "hole" | "slot" | "edge" | "bend" | "face" | "feature" | "interface" | "part";
  /** Stable id within the part DSL (e.g., hole id, bend id). */
  id: string;
}

export interface Violation {
  ruleId: string;
  severity: Severity;
  /** Human-readable for chip UI. */
  message: string;
  /** Imperative for the agent: "Move hole H3 to ≥3.2mm from bend B1". */
  agentMessage: string;
  /** Optional structured proposed change. Schema is rule-specific. */
  suggestedFix?: unknown;
  /** Optional pointer for UI highlighting. */
  location?: GeometryRef;
}

export interface PartContext {
  /** The project's scope answers, if set. */
  scope: unknown | null;
  /** Summaries of peer parts in the same project (label + kind). */
  peerParts: Array<{ partId: string; label: string; kind: PartKind }>;
}

export interface Rule<TDsl> {
  /** Globally unique, dot-namespaced: e.g. "sheet.hole-edge-distance". */
  id: string;
  severity: Severity;
  tier: Tier;
  /** Pure function; returns null if the rule is satisfied. */
  check(dsl: TDsl, ctx: PartContext): Violation | null;
  /** For requires-judgment rules: how to phrase the question to the user. */
  judgmentPrompt?: (v: Violation) => string;
}

/** Pure mechanical fix; returns null if the violation isn't auto-repairable for this DSL. */
export type AutoRepair<TDsl> = (dsl: TDsl, v: Violation) => TDsl | null;

// ─── Outputs ─────────────────────────────────────────────────────────────────

export interface ThreePreview {
  /** Plugin-specific preview data the AssembledView knows how to render. Keep loose for v1. */
  meshes: unknown[];
}

export interface ExportArtifact {
  filename: string;
  contentType: string;
  /** Base64 for binary, plain string for text. */
  payload: string;
  encoding: "base64" | "utf8";
}

export interface CostBreakdown {
  totalUsd: number;
  breakdown: Array<{ label: string; usd: number }>;
}

// ─── Agent surface ───────────────────────────────────────────────────────────

export interface AgentTool {
  /** Anthropic tool name; must be unique across the orchestrator's tool registry. */
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: Record<string, unknown>;
}

export interface ModelDefault {
  model: string;
  effort: "low" | "med" | "high";
}

// ─── The contract ────────────────────────────────────────────────────────────

export interface ProcessPlugin<TDsl> {
  kind: PartKind;

  dslSchema: ZodType<TDsl>;

  tools: AgentTool[];
  systemPromptFragment: string;
  defaultModel?: ModelDefault;

  rules: Rule<TDsl>[];
  validate(dsl: TDsl, ctx: PartContext): Violation[];
  autoRepair: AutoRepair<TDsl>;

  renderPreview(dsl: TDsl): ThreePreview;
  export(dsl: TDsl): ExportArtifact[];
  estimateCost(dsl: TDsl, ctx: PartContext): CostBreakdown;

  supportedInterfaces: InterfaceKind[];
}

// ─── Phase + plan event types (used by orchestrator) ─────────────────────────

export type ProjectPhase =
  | "scoping"
  | "decomposing"
  | "designing"
  | "validating"
  | "exporting"
  | "done";

export type PlanEventKind =
  | "phase-changed"
  | "specialist-scheduled"
  | "specialist-completed"
  | "auto-repaired"
  | "violation-opened"
  | "violation-resolved"
  | "escalation-opened"
  | "escalation-answered";

export interface PlanEventPayload {
  message?: string;
  partId?: string;
  ruleId?: string;
  fromPhase?: ProjectPhase;
  toPhase?: ProjectPhase;
  details?: Record<string, unknown>;
}
```

- [ ] **Step 4: Run the test, confirm it passes.**

```
cd ~/fabware/artifacts/hardwareai && pnpm test convex/plugins/__tests__/types.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run typecheck for the whole package.**

```
cd ~/fabware/artifacts/hardwareai && pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 6: Commit.**

```
cd ~/fabware/artifacts/hardwareai && git add convex/plugins/types.ts convex/plugins/__tests__/types.test.ts \
  && git commit -m "feat(plugins): contract types — ProcessPlugin, Rule, Violation"
```

---

## Task 2: Extend Convex schema with new tables + project fields

**Files:**
- Modify: `artifacts/hardwareai/convex/schema.ts`

This is purely additive. Existing tables and fields are untouched. Two project fields are optional so existing rows continue to validate.

- [ ] **Step 1: Add the two new project fields.** In `convex/schema.ts`, locate the `projects: defineTable({ ... })` block (starts at line 14). Inside the object, **before** `createdAt: v.number(),`, add:

```ts
    phase: v.optional(v.union(
      v.literal("scoping"),
      v.literal("decomposing"),
      v.literal("designing"),
      v.literal("validating"),
      v.literal("exporting"),
      v.literal("done"),
    )),
    useNewHarness: v.optional(v.boolean()),
```

- [ ] **Step 2: Add the three new tables.** After the existing `waitlist: defineTable({ ... })` block (the last table) and **before** the closing `});` of `defineSchema`, add:

```ts
  // --- AI harness: violations (per-part + assembly-level) ---
  violations: defineTable({
    projectId: v.id("projects"),
    partId: v.optional(v.id("parts")),         // null = assembly-level violation
    ruleId: v.string(),
    severity: v.union(v.literal("error"), v.literal("warn")),
    tier: v.union(v.literal("auto-fixable"), v.literal("requires-judgment")),
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
    status: v.union(
      v.literal("open"),
      v.literal("auto-repaired"),
      v.literal("escalated"),
      v.literal("dismissed"),
      v.literal("resolved"),
    ),
    resolution: v.optional(v.object({
      kind: v.string(),
      by: v.union(v.literal("agent"), v.literal("user")),
      at: v.number(),
      note: v.optional(v.string()),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_part", ["partId"]),

  // --- AI harness: escalations (open questions for the user) ---
  escalations: defineTable({
    projectId: v.id("projects"),
    sourceViolationId: v.optional(v.id("violations")),
    question: v.string(),
    suggestedAnswer: v.optional(v.string()),
    choices: v.optional(v.array(v.string())),
    status: v.union(v.literal("open"), v.literal("answered")),
    answer: v.optional(v.string()),
    createdAt: v.number(),
    answeredAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  // --- AI harness: append-only audit log of plan transitions ---
  planEvents: defineTable({
    projectId: v.id("projects"),
    at: v.number(),
    kind: v.union(
      v.literal("phase-changed"),
      v.literal("specialist-scheduled"),
      v.literal("specialist-completed"),
      v.literal("auto-repaired"),
      v.literal("violation-opened"),
      v.literal("violation-resolved"),
      v.literal("escalation-opened"),
      v.literal("escalation-answered"),
    ),
    payload: v.any(),
  }).index("by_project_at", ["projectId", "at"]),
```

- [ ] **Step 3: Typecheck.**

```
cd ~/fabware/artifacts/hardwareai && pnpm typecheck
```

Expected: no errors. (`_generated/dataModel.d.ts` will still be stale until Convex regenerates; that happens in Step 4.)

- [ ] **Step 4: Push schema to dev deployment to regenerate types.**

```
cd ~/fabware/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: schema validates, deploys, regenerates `convex/_generated/`. If validation fails because existing rows lack a new required field, the additive `v.optional(...)` wrappers above should prevent it; if not, narrow the field that errored to `v.optional(...)`.

- [ ] **Step 5: Re-run typecheck after regen.**

```
cd ~/fabware/artifacts/hardwareai && pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
cd ~/fabware/artifacts/hardwareai && git add convex/schema.ts convex/_generated \
  && git commit -m "feat(convex): schema — phase + useNewHarness on projects; violations, escalations, planEvents tables"
```

---

## Task 3: Plugin registry (placeholder)

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/registry.ts`
- Create: `artifacts/hardwareai/convex/plugins/__tests__/registry.test.ts`

Placeholder so the orchestrator (Task 7) can compile against it. Plan 2 will register the sheet-metal plugin.

- [ ] **Step 1: Write the failing test.** Create `convex/plugins/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getPlugin, registeredKinds } from "../registry";

describe("plugin registry", () => {
  it("returns null for any kind in v1 (no plugins registered yet)", () => {
    expect(getPlugin("sheet_metal")).toBeNull();
    expect(getPlugin("printed")).toBeNull();
    expect(getPlugin("purchased")).toBeNull();
  });

  it("registeredKinds is empty in v1", () => {
    expect(registeredKinds()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/plugins/__tests__/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the registry.** `convex/plugins/registry.ts`:

```ts
import type { PartKind, ProcessPlugin } from "./types";

/**
 * Plugin registry. Plan 2+ will populate this. Today it returns null for
 * every kind — the orchestrator no-ops when a part's plugin is missing.
 */
const REGISTRY: Partial<Record<PartKind, ProcessPlugin<unknown>>> = {};

export function getPlugin(kind: PartKind): ProcessPlugin<unknown> | null {
  return REGISTRY[kind] ?? null;
}

export function registeredKinds(): PartKind[] {
  return Object.keys(REGISTRY) as PartKind[];
}

/** Internal — used by future plugin index files to register themselves. */
export function _registerPlugin<TDsl>(plugin: ProcessPlugin<TDsl>): void {
  REGISTRY[plugin.kind] = plugin as ProcessPlugin<unknown>;
}
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/plugins/__tests__/registry.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit.**

```
git add convex/plugins/registry.ts convex/plugins/__tests__/registry.test.ts \
  && git commit -m "feat(plugins): empty registry placeholder + getPlugin/registeredKinds"
```

---

## Task 4: Plan event log mutation

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/planEvents.ts`
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/planEvents.test.ts`

The event log is append-only. Used everywhere in the orchestrator and in specialists. We expose it as an `internalMutation` (only orchestrator/specialist code calls it; not exposed to the client).

- [ ] **Step 1: Write the failing test.** Pure-function test of the payload shape (the actual DB write is exercised in the e2e test in Plan 2). Create `convex/orchestrator/__tests__/planEvents.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlanEvent } from "../planEvents";

describe("buildPlanEvent", () => {
  it("stamps createdAt and copies kind + payload", () => {
    const before = Date.now();
    const ev = buildPlanEvent({
      projectId: "p1" as never,
      kind: "phase-changed",
      payload: { fromPhase: "scoping", toPhase: "decomposing" },
    });
    expect(ev.kind).toBe("phase-changed");
    expect(ev.payload.fromPhase).toBe("scoping");
    expect(ev.at).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/orchestrator/__tests__/planEvents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the module.** `convex/orchestrator/planEvents.ts`:

```ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { PlanEventKind, PlanEventPayload } from "../plugins/types";

interface BuildArgs {
  projectId: Id<"projects">;
  kind: PlanEventKind;
  payload: PlanEventPayload;
}

/** Pure builder — used by the mutation below and exercised by unit tests. */
export function buildPlanEvent(args: BuildArgs) {
  return {
    projectId: args.projectId,
    at: Date.now(),
    kind: args.kind,
    payload: args.payload,
  };
}

export const append = internalMutation({
  args: {
    projectId: v.id("projects"),
    kind: v.union(
      v.literal("phase-changed"),
      v.literal("specialist-scheduled"),
      v.literal("specialist-completed"),
      v.literal("auto-repaired"),
      v.literal("violation-opened"),
      v.literal("violation-resolved"),
      v.literal("escalation-opened"),
      v.literal("escalation-answered"),
    ),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const ev = buildPlanEvent({
      projectId: args.projectId,
      kind: args.kind as PlanEventKind,
      payload: args.payload as PlanEventPayload,
    });
    await ctx.db.insert("planEvents", ev);
  },
});
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/orchestrator/__tests__/planEvents.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
git add convex/orchestrator/planEvents.ts convex/orchestrator/__tests__/planEvents.test.ts \
  && git commit -m "feat(orchestrator): planEvents append + buildPlanEvent helper"
```

---

## Task 5: Violation mutations + queries

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/violations.ts`
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/violations.test.ts`

- [ ] **Step 1: Write the failing test.** Tests the pure-shape helper. Create `convex/orchestrator/__tests__/violations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildViolationDoc } from "../violations";

describe("buildViolationDoc", () => {
  it("creates an open violation doc with timestamps", () => {
    const before = Date.now();
    const doc = buildViolationDoc({
      projectId: "p1" as never,
      partId: "pt1" as never,
      violation: {
        ruleId: "sheet.hole-edge-distance",
        severity: "error",
        message: "Hole H3 too close to edge",
        agentMessage: "Move hole H3 ≥3.2mm from edge.",
        location: { kind: "hole", id: "H3" },
      },
      tier: "auto-fixable",
    });
    expect(doc.status).toBe("open");
    expect(doc.tier).toBe("auto-fixable");
    expect(doc.createdAt).toBeGreaterThanOrEqual(before);
    expect(doc.updatedAt).toBe(doc.createdAt);
  });

  it("supports assembly-level violations (partId omitted)", () => {
    const doc = buildViolationDoc({
      projectId: "p1" as never,
      partId: undefined,
      violation: {
        ruleId: "asm.bom-consistency",
        severity: "warn",
        message: "BOM has duplicate fastener references",
        agentMessage: "Deduplicate fasteners F1/F2.",
      },
      tier: "auto-fixable",
    });
    expect(doc.partId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/orchestrator/__tests__/violations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the module.** `convex/orchestrator/violations.ts`:

```ts
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { Tier, Violation } from "../plugins/types";

interface BuildArgs {
  projectId: Id<"projects">;
  partId: Id<"parts"> | undefined;
  violation: Violation;
  tier: Tier;
}

/** Pure builder — used by the open mutation and exercised by unit tests. */
export function buildViolationDoc(args: BuildArgs) {
  const now = Date.now();
  return {
    projectId: args.projectId,
    partId: args.partId,
    ruleId: args.violation.ruleId,
    severity: args.violation.severity,
    tier: args.tier,
    message: args.violation.message,
    agentMessage: args.violation.agentMessage,
    suggestedFix: args.violation.suggestedFix,
    location: args.violation.location,
    status: "open" as const,
    resolution: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export const open = internalMutation({
  args: {
    projectId: v.id("projects"),
    partId: v.optional(v.id("parts")),
    ruleId: v.string(),
    severity: v.union(v.literal("error"), v.literal("warn")),
    tier: v.union(v.literal("auto-fixable"), v.literal("requires-judgment")),
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
  },
  handler: async (ctx, args) => {
    const doc = buildViolationDoc({
      projectId: args.projectId,
      partId: args.partId,
      violation: {
        ruleId: args.ruleId,
        severity: args.severity,
        message: args.message,
        agentMessage: args.agentMessage,
        suggestedFix: args.suggestedFix,
        location: args.location,
      },
      tier: args.tier,
    });
    return await ctx.db.insert("violations", doc);
  },
});

export const resolve = internalMutation({
  args: {
    violationId: v.id("violations"),
    status: v.union(
      v.literal("auto-repaired"),
      v.literal("escalated"),
      v.literal("dismissed"),
      v.literal("resolved"),
    ),
    by: v.union(v.literal("agent"), v.literal("user")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.violationId, {
      status: args.status,
      updatedAt: now,
      resolution: { kind: args.status, by: args.by, at: now, note: args.note },
    });
  },
});

export const listOpenForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("violations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
  },
});
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/orchestrator/__tests__/violations.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
git add convex/orchestrator/violations.ts convex/orchestrator/__tests__/violations.test.ts \
  && git commit -m "feat(orchestrator): violations open/resolve/listOpen + buildViolationDoc"
```

---

## Task 6: Escalation mutations + queries

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/escalations.ts`
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/escalations.test.ts`

- [ ] **Step 1: Write the failing test.** Create `convex/orchestrator/__tests__/escalations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildEscalationDoc } from "../escalations";

describe("buildEscalationDoc", () => {
  it("creates an open escalation with the suggested answer", () => {
    const before = Date.now();
    const doc = buildEscalationDoc({
      projectId: "p1" as never,
      sourceViolationId: undefined,
      question: "Is 14ga steel enough for the back panel?",
      suggestedAnswer: "Yes",
      choices: ["Yes", "Use 12ga", "Switch to aluminum"],
    });
    expect(doc.status).toBe("open");
    expect(doc.suggestedAnswer).toBe("Yes");
    expect(doc.choices?.length).toBe(3);
    expect(doc.createdAt).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/orchestrator/__tests__/escalations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the module.** `convex/orchestrator/escalations.ts`:

```ts
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

interface BuildArgs {
  projectId: Id<"projects">;
  sourceViolationId: Id<"violations"> | undefined;
  question: string;
  suggestedAnswer?: string;
  choices?: string[];
}

export function buildEscalationDoc(args: BuildArgs) {
  return {
    projectId: args.projectId,
    sourceViolationId: args.sourceViolationId,
    question: args.question,
    suggestedAnswer: args.suggestedAnswer,
    choices: args.choices,
    status: "open" as const,
    answer: undefined as string | undefined,
    createdAt: Date.now(),
    answeredAt: undefined as number | undefined,
  };
}

export const open = internalMutation({
  args: {
    projectId: v.id("projects"),
    sourceViolationId: v.optional(v.id("violations")),
    question: v.string(),
    suggestedAnswer: v.optional(v.string()),
    choices: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const doc = buildEscalationDoc({
      projectId: args.projectId,
      sourceViolationId: args.sourceViolationId,
      question: args.question,
      suggestedAnswer: args.suggestedAnswer,
      choices: args.choices,
    });
    return await ctx.db.insert("escalations", doc);
  },
});

export const answer = internalMutation({
  args: { escalationId: v.id("escalations"), answer: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.escalationId, {
      status: "answered",
      answer: args.answer,
      answeredAt: Date.now(),
    });
  },
});

export const listOpenForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
  },
});
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/orchestrator/__tests__/escalations.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
git add convex/orchestrator/escalations.ts convex/orchestrator/__tests__/escalations.test.ts \
  && git commit -m "feat(orchestrator): escalations open/answer/listOpen + buildEscalationDoc"
```

---

## Task 7: Design plan reads (public query)

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/queries.ts`
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/queries.test.ts`

The UI reads the design plan via this query. For Step 0 it returns the project + lists of parts, interfaces, open violations, open escalations. (Plan 2 will use it.)

- [ ] **Step 1: Write the failing test.** Test the pure assembler helper. Create `convex/orchestrator/__tests__/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleDesignPlan } from "../queries";

describe("assembleDesignPlan", () => {
  it("returns a plan with all sections empty when nothing exists", () => {
    const plan = assembleDesignPlan({
      project: { _id: "p1" as never, name: "demo", phase: "scoping", useNewHarness: true } as never,
      parts: [],
      interfaces: [],
      openViolations: [],
      openEscalations: [],
    });
    expect(plan.phase).toBe("scoping");
    expect(plan.parts).toEqual([]);
    expect(plan.openViolations).toEqual([]);
  });

  it("propagates the lists into the plan", () => {
    const plan = assembleDesignPlan({
      project: { _id: "p1" as never, name: "demo", phase: "designing", useNewHarness: true } as never,
      parts: [{ _id: "pt1" } as never],
      interfaces: [{ _id: "if1" } as never],
      openViolations: [{ _id: "v1" } as never],
      openEscalations: [{ _id: "e1" } as never],
    });
    expect(plan.parts.length).toBe(1);
    expect(plan.interfaces.length).toBe(1);
    expect(plan.openViolations.length).toBe(1);
    expect(plan.openEscalations.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/orchestrator/__tests__/queries.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the queries module.** `convex/orchestrator/queries.ts`:

```ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

interface AssembleInput {
  project: Doc<"projects">;
  parts: Doc<"parts">[];
  interfaces: Doc<"interfaces">[];
  openViolations: Doc<"violations">[];
  openEscalations: Doc<"escalations">[];
}

export interface DesignPlan {
  project: Doc<"projects">;
  phase: NonNullable<Doc<"projects">["phase"]> | "scoping";
  parts: Doc<"parts">[];
  interfaces: Doc<"interfaces">[];
  openViolations: Doc<"violations">[];
  openEscalations: Doc<"escalations">[];
}

export function assembleDesignPlan(input: AssembleInput): DesignPlan {
  return {
    project: input.project,
    phase: input.project.phase ?? "scoping",
    parts: input.parts,
    interfaces: input.interfaces,
    openViolations: input.openViolations,
    openEscalations: input.openEscalations,
  };
}

export const getDesignPlan = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const parts = await ctx.db.query("parts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const interfaces = await ctx.db.query("interfaces").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const openViolations = await ctx.db
      .query("violations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    const openEscalations = await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    return assembleDesignPlan({ project, parts, interfaces, openViolations, openEscalations });
  },
});
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/orchestrator/__tests__/queries.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
git add convex/orchestrator/queries.ts convex/orchestrator/__tests__/queries.test.ts \
  && git commit -m "feat(orchestrator): getDesignPlan query + assembleDesignPlan helper"
```

---

## Task 8: Phase machine (pure function)

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/phaseMachine.ts`
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/phaseMachine.test.ts`

Pure-function phase computation. `tick` (Task 9) calls this to decide what to do; testing it as pure code avoids needing Convex mocks.

- [ ] **Step 1: Write the failing test.** Create `convex/orchestrator/__tests__/phaseMachine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeNextAction } from "../phaseMachine";
import type { ProjectPhase } from "../../plugins/types";

const baseProject = (phase: ProjectPhase) => ({
  _id: "p1" as never,
  phase,
  useNewHarness: true,
  scope: undefined,
} as never);

describe("computeNextAction", () => {
  it("returns 'wait' when an open escalation exists, regardless of phase", () => {
    const action = computeNextAction({
      project: baseProject("designing"),
      parts: [],
      openEscalations: [{ _id: "e1" } as never],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("wait");
  });

  it("returns 'wait' in 'scoping' when scope is missing (the wizard advances it)", () => {
    const action = computeNextAction({
      project: baseProject("scoping"),
      parts: [],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("wait");
  });

  it("returns 'noop' when phase is 'designing' but no plugins registered yet", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [{ _id: "pt1", kind: "sheet_metal", status: "pending" } as never],
      openEscalations: [],
      registeredKinds: [],
    });
    expect(action.kind).toBe("noop");
    expect(action.reason).toMatch(/no plugin registered/i);
  });

  it("returns 'designPart' when a pending part has a registered plugin", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [{ _id: "pt1", kind: "sheet_metal", status: "pending" } as never],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("designPart");
    if (action.kind === "designPart") {
      expect(action.partId).toBe("pt1");
    }
  });

  it("transitions designing → validating when every part is ok or escalated", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [
        { _id: "pt1", kind: "sheet_metal", status: "ok" } as never,
        { _id: "pt2", kind: "sheet_metal", status: "escalated" } as never,
      ],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");
    if (action.kind === "transitionPhase") {
      expect(action.toPhase).toBe("validating");
    }
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
pnpm test convex/orchestrator/__tests__/phaseMachine.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the phase machine.** `convex/orchestrator/phaseMachine.ts`:

```ts
import type { Doc } from "../_generated/dataModel";
import type { PartKind, ProjectPhase } from "../plugins/types";

export type Action =
  | { kind: "wait"; reason: string }
  | { kind: "noop"; reason: string }
  | { kind: "designPart"; partId: string }
  | { kind: "transitionPhase"; fromPhase: ProjectPhase; toPhase: ProjectPhase };

interface Input {
  project: Doc<"projects">;
  parts: Doc<"parts">[];
  openEscalations: Doc<"escalations">[];
  registeredKinds: PartKind[];
}

/**
 * Pure decision function — given the current state, what should the orchestrator do next?
 * The tick action interprets the returned Action.
 */
export function computeNextAction(input: Input): Action {
  if (input.openEscalations.length > 0) {
    return { kind: "wait", reason: "open escalation pending user answer" };
  }

  const phase: ProjectPhase = input.project.phase ?? "scoping";

  if (phase === "scoping") {
    if (!input.project.scope) {
      return { kind: "wait", reason: "scope not yet submitted" };
    }
    return { kind: "transitionPhase", fromPhase: "scoping", toPhase: "decomposing" };
  }

  if (phase === "decomposing") {
    if (input.parts.length === 0) {
      return { kind: "noop", reason: "decomposition tool not yet wired (Plan 2)" };
    }
    return { kind: "transitionPhase", fromPhase: "decomposing", toPhase: "designing" };
  }

  if (phase === "designing") {
    const pending = input.parts.find((p) => (p as Doc<"parts"> & { status?: string }).status === "pending");
    if (pending) {
      const kind = (pending as Doc<"parts"> & { kind?: string }).kind as PartKind | undefined;
      if (!kind || !input.registeredKinds.includes(kind)) {
        return { kind: "noop", reason: `no plugin registered for kind="${kind ?? "unknown"}"` };
      }
      return { kind: "designPart", partId: pending._id };
    }
    const allDone = input.parts.every((p) => {
      const s = (p as Doc<"parts"> & { status?: string }).status;
      return s === "ok" || s === "escalated";
    });
    if (allDone && input.parts.length > 0) {
      return { kind: "transitionPhase", fromPhase: "designing", toPhase: "validating" };
    }
    return { kind: "noop", reason: "designing in flight" };
  }

  if (phase === "validating") {
    return { kind: "noop", reason: "assembly validator not yet wired (Plan 2)" };
  }

  if (phase === "exporting") {
    return { kind: "noop", reason: "exporter not yet wired (later plan)" };
  }

  // phase === "done"
  return { kind: "wait", reason: "project complete" };
}
```

- [ ] **Step 4: Run, confirm pass.**

```
pnpm test convex/orchestrator/__tests__/phaseMachine.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit.**

```
git add convex/orchestrator/phaseMachine.ts convex/orchestrator/__tests__/phaseMachine.test.ts \
  && git commit -m "feat(orchestrator): pure phaseMachine.computeNextAction"
```

---

## Task 9: Orchestrator tick `internalAction`

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/tick.ts`
- Modify: `artifacts/hardwareai/convex/orchestrator/queries.ts` (add an internal helper query for tick)

Tick is the orchestrator's heartbeat. For Step 0 it can:

- Bail immediately if `useNewHarness !== true` (defensive — Plan 2+ flips this).
- Read the project + open escalations + parts.
- Call `computeNextAction` (Task 8).
- Interpret the action: `wait` → return; `noop` → log a planEvent + return; `transitionPhase` → patch the project's phase + log a planEvent; `designPart` → log a planEvent ("specialist-scheduled") and return (Plan 2 wires the actual specialist call).

This means a Step-0 project flagged into the new harness can be ticked, and you can watch its phase advance through the machine — but no part design work happens until Plan 2.

- [ ] **Step 1: Add the internal helper query.** Edit `convex/orchestrator/queries.ts`. First **augment the existing import** from `../_generated/server` so it also brings in `internalQuery`:

```ts
import { query, internalQuery } from "../_generated/server";
```

Then **append** at the end of the file:

```ts
export const _internalTickContext = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    const parts = await ctx.db.query("parts").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const openEscalations = await ctx.db
      .query("escalations")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "open"))
      .collect();
    return { project, parts, openEscalations };
  },
});
```

- [ ] **Step 2: Add an internal patch mutation for project phase.** Create `artifacts/hardwareai/convex/orchestrator/projectMutations.ts`:

```ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const _setPhase = internalMutation({
  args: {
    projectId: v.id("projects"),
    phase: v.union(
      v.literal("scoping"),
      v.literal("decomposing"),
      v.literal("designing"),
      v.literal("validating"),
      v.literal("exporting"),
      v.literal("done"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { phase: args.phase, updatedAt: Date.now() });
  },
});
```

- [ ] **Step 3: Create the tick action.** `convex/orchestrator/tick.ts`:

```ts
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { computeNextAction } from "./phaseMachine";
import { registeredKinds } from "../plugins/registry";

/**
 * Orchestrator heartbeat. Call after any state change that might advance the plan
 * (specialist completion, user answer to an escalation, scope submitted, etc.).
 *
 * In Step 0 this is mostly a no-op: with no plugins registered, every "designPart"
 * action becomes a logged "noop" planEvent. Plan 2 wires sheet-metal so designPart
 * dispatches the specialist.
 */
export const tick = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const ctxData = await ctx.runQuery(internal.orchestrator.queries._internalTickContext, {
      projectId: args.projectId,
    });
    if (!ctxData) return { kind: "wait", reason: "project not found" } as const;
    const { project, parts, openEscalations } = ctxData;

    if (project.useNewHarness !== true) {
      return { kind: "wait", reason: "useNewHarness not enabled" } as const;
    }

    const action = computeNextAction({
      project,
      parts,
      openEscalations,
      registeredKinds: registeredKinds(),
    });

    if (action.kind === "wait") {
      return action;
    }

    if (action.kind === "noop") {
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "specialist-scheduled",      // benign reuse — Plan 2 splits this out
        payload: { message: action.reason },
      });
      return action;
    }

    if (action.kind === "transitionPhase") {
      await ctx.runMutation(internal.orchestrator.projectMutations._setPhase, {
        projectId: args.projectId,
        phase: action.toPhase,
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "phase-changed",
        payload: { fromPhase: action.fromPhase, toPhase: action.toPhase },
      });
      // Re-tick so the next phase gets a chance to advance.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return action;
    }

    if (action.kind === "designPart") {
      // Plan 2 wires the actual specialist dispatch here.
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "specialist-scheduled",
        payload: { partId: action.partId, message: "specialist not yet wired (Plan 2)" },
      });
      return action;
    }

    return action;
  },
});
```

- [ ] **Step 4: Typecheck.**

```
pnpm typecheck
```

Expected: clean. (May require Convex regen — see Step 5.)

- [ ] **Step 5: Convex dev push to regen `_generated/api`.**

```
cd ~/fabware/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: `internal.orchestrator.tick.tick`, `internal.orchestrator.queries._internalTickContext`, `internal.orchestrator.projectMutations._setPhase`, `internal.orchestrator.planEvents.append` etc. exist in `_generated/api.d.ts`.

- [ ] **Step 6: Re-run typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 7: Commit.**

```
git add convex/orchestrator/tick.ts convex/orchestrator/projectMutations.ts convex/orchestrator/queries.ts convex/_generated \
  && git commit -m "feat(orchestrator): tick action — phase machine + planEvent dispatch (no-op without plugins)"
```

---

## Task 10: `setUseNewHarness` mutation + manual smoke test

**Files:**
- Modify: `artifacts/hardwareai/convex/projects.ts` (add a public mutation)

This is the toggle that opts a project into the new orchestrator path. UI work to surface a button is deferred (Plan 2 adds it once there's something to show).

- [ ] **Step 1: Read the top of `convex/projects.ts`.** Confirm the import style and pick up the existing `mutation` import.

```
cd ~/fabware/artifacts/hardwareai && head -20 convex/projects.ts
```

- [ ] **Step 2: Append the mutation.** Add at the end of `convex/projects.ts`:

```ts
import { internal } from "./_generated/api";

export const setUseNewHarness = mutation({
  args: { projectId: v.id("projects"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { useNewHarness: args.enabled, updatedAt: Date.now() });
    if (args.enabled) {
      // Kick the orchestrator so a freshly-flagged project starts ticking.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
    }
  },
});
```

(If `mutation`, `v`, and the existing imports are already present at the top of the file, only add the `internal` import and the new export.)

- [ ] **Step 3: Typecheck.**

```
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Push to dev.**

```
CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

- [ ] **Step 5: Manual smoke test (do this before committing).** Pick any project ID from `projects` (or create one in the UI). In a separate shell, with `npx convex dev` running, open the Convex dashboard's Function Runner and:

  1. Run `projects:setUseNewHarness` with `{ projectId: "<id>", enabled: true }`. Expect: success.
  2. Wait ~2 seconds. Run `orchestrator/queries:getDesignPlan` with `{ projectId: "<id>" }`. Expect: returns `{ project: {... useNewHarness: true, phase: "scoping"}, parts: [], … }` (phase may have advanced if the project already had a `scope` set).
  3. Open `planEvents` table. Expect: at least one event row for that `projectId` (could be `phase-changed` or `specialist-scheduled` with a noop reason, depending on project state).
  4. Run `projects:setUseNewHarness` again with `enabled: false`. Run `orchestrator/queries:getDesignPlan`. Confirm `useNewHarness: false`.

If any step fails, fix the cause before committing.

- [ ] **Step 6: Commit.**

```
git add convex/projects.ts \
  && git commit -m "feat(projects): setUseNewHarness mutation — opt project into new orchestrator path"
```

---

## Task 11: Final sanity sweep + plan-completion commit

**Files:**
- Modify: `docs/PLAN.md` (append a status line — *only* if the file already has a "harness" or roadmap section to slot it under; otherwise skip Step 1).

- [ ] **Step 1: Append a status line to `docs/PLAN.md`** if appropriate (read the file first; if it doesn't have a sensible section, skip).

```
cd ~/fabware && head -40 docs/PLAN.md
```

If a status section exists, append:

```
- [x] **Plan 1 (Step 0): Scaffold** — plugin contract types, schema additions, orchestrator tick (no-op until plugins registered). Shipped <DATE>.
```

- [ ] **Step 2: Run the full test suite.**

```
cd ~/fabware/artifacts/hardwareai && pnpm test
```

Expected: all tests pass (including the original suite that existed before this plan).

- [ ] **Step 3: Run the full typecheck.**

```
cd ~/fabware && pnpm typecheck
```

Expected: clean across all workspaces.

- [ ] **Step 4: Final sanity check on git state.**

```
cd ~/fabware && git status && git log --oneline -15
```

Expected: clean working tree; ~10 commits from this plan stacked on top of `7845132` (the spec commit).

- [ ] **Step 5: Optional final commit if PLAN.md was updated.**

```
cd ~/fabware && git add docs/PLAN.md \
  && git commit -m "docs: mark Plan 1 (Step 0 scaffold) shipped"
```

---

## What this plan does NOT do (intentionally — see follow-up plans)

- **Register the sheet-metal plugin.** `getPlugin("sheet_metal")` returns `null` after this plan. Plan 2 fills it in.
- **Wire the specialist dispatch.** Tick's `designPart` action logs a noop planEvent. Plan 2 replaces that with `ctx.scheduler.runAfter(0, internal.specialists.sheetMetal.run, ...)`.
- **Touch the existing `assemblyDesigner` action.** Existing projects (where `useNewHarness !== true`) are unaffected.
- **Surface anything in the UI.** No new components; the only "user-visible" change is two new tables and two new project fields, plus a mutation that can be invoked from the Convex dashboard.

---

## Plan self-review (already performed)

**Spec coverage:** This plan covers spec sections 1 (architecture overview — orchestrator + plugin scaffolding), 2 (plugin contract types — typed, no behavior yet), 3 (orchestrator state machine — pure phaseMachine + tick wrapper), and the data-model portion of section 3 (new tables + project fields). Sections 4 (agent layer), 5 (rules engine), 6+ (migration steps for actual plugins), and 7 (testing strategy beyond unit tests) are intentionally deferred to Plans 2–6.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" steps. Every code block is complete and runnable.

**Type consistency:** `PartKind` ("sheet_metal" / "printed" / "purchased") matches the existing `convex/lib/partKind.ts`. `InterfaceKind` matches the existing schema literals in `interfaces.kind`. `Violation`, `Rule`, `ProcessPlugin` shapes match the spec's contract section. Tick references `internal.orchestrator.tick.tick`, `internal.orchestrator.queries._internalTickContext`, `internal.orchestrator.projectMutations._setPhase`, `internal.orchestrator.planEvents.append` — every one of these is defined in tasks above.

**Scope check:** This is one focused step: scaffold the contract + new tables + a no-op orchestrator. Each task is independently reviewable. The plan ends with a working dev environment where `useNewHarness` can be flipped on a project, the orchestrator ticks, and the phase machine advances — but no design work happens until Plan 2 registers a real plugin.
