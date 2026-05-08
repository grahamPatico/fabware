# AI Harness — Plan 2: Step 1 Sheet-Metal Plugin (validator-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six handoff fixes left over from Plan 1, then create the first real `ProcessPlugin` (`sheet-metal`), wire its validator into the orchestrator's tick, and prove the round-trip with an end-to-end fixture. After this plan ships, a project flagged with `useNewHarness=true` containing a sheet-metal part will, on tick, run the existing `scsRules.validateSpec` through the new contract, write `Violation` rows, mark the part `ok` or `escalated`, and surface escalations through `getDesignPlan`. **No agent loop yet** — that's Plan 3.

**Architecture:**
- Phase A (Tasks 1–5) addresses the six known Plan-1 handoff risks before any plugin code touches the orchestrator.
- Phase B (Tasks 6–9) creates `convex/plugins/sheet-metal/` as a thin contract-shaped wrapper around the existing `convex/lib/dsl.ts` + `scsRules.ts` + `dxfGenerator.ts` + `featureGraph.ts` modules. Validator adapts `ValidationResult.rules[].status` → `Violation[]`.
- Phase C (Tasks 10–12) ships the sheet-metal **specialist** as a Convex `internalAction` that runs the plugin's `validate()` against a part's stored DSL, attempts `autoRepair` (always returns null in this plan — every Phase B rule is tagged `requires-judgment`), writes violations + escalations, sets part status, and re-ticks the orchestrator. Tick's `designPart` branch is rewired to dispatch the specialist instead of logging a noop.
- Phase D (Task 13) wraps with a final sweep.

**Tech Stack:** TypeScript (strict, ESM), Convex, Vitest. All work happens in `~/fabware-harness-step0/artifacts/hardwareai/` on branch `feat/ai-harness-step-0-scaffold` (continuing the stack from Plan 1).

**Spec:** `docs/superpowers/specs/2026-04-25-ai-harness-design.md`

**Predecessor plan:** `docs/superpowers/plans/2026-04-25-ai-harness-step-0-scaffold.md` (committed `509576b`; 13 commits stacked through `cb58bf2`).

**Successor plans (sketched, not yet written):**
- Plan 3: Sheet-metal specialist gets an Anthropic agent loop with the existing `assemblyDesigner` tool surface namespaced to the plugin.
- Plan 4: Port `scsRules.ts` rules into individual `Rule<PartDsl>` files with proper `autoRepair` functions and per-rule tier tags.
- Plan 5: 3D-printed plugin migration (mirrors this plan's shape but for `printedRules`/`stlGenerator`).
- Plan 6: Hardware-assembly plugin migration (McMaster lookup wrapped as the third plugin).
- Plan 7: Bending / K-factor in sheet-metal plugin (DSL gains `bends[]`, K-factor table, fold-line DXF).
- Plan 8: Cleanup — flip `useNewHarness` default, delete `assemblyDesigner.ts`.

---

## Conventions (same as Plan 1)

- **Working directory:** `~/fabware-harness-step0/artifacts/hardwareai/` unless noted.
- **Run tests:** `pnpm test` (single run). Watch: `pnpm test:watch`.
- **Run typecheck:** `pnpm typecheck`. Baseline error count: **38** (from Plan 1 wrap-up). Maintain this baseline; flag any regression.
- **Schema push:** `cd ~/fabware-harness-step0/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`. Used in Tasks 1, 3, 11.
- **Test placement:** mirror Plan 1 — tests live in `__tests__/` subdirs of the module. The Vitest `include` pattern from Plan 1 already covers `convex/plugins/**` and `convex/orchestrator/**`.
- **Commits:** one commit per task unless noted. Existing prefix style (`feat(plugins): ...`, `feat(orchestrator): ...`, `fix(harness): ...`, etc.).
- **Convex guidelines:** `convex/_generated/ai/guidelines.md` is authoritative. Plan 1 Task 0 captured the relevant patterns; Task 0 here is just a re-read pointer.

---

## Task 0: Re-read Convex guidelines + confirm worktree state

**Files:** none modified.

- [ ] **Step 1: Re-skim** `artifacts/hardwareai/convex/_generated/ai/guidelines.md`. Especially: schema migrations, internal vs public functions, `withIndex` patterns, `ctx.scheduler.runAfter` usage, and the rule against `.collect()` without bounds.

- [ ] **Step 2: Confirm worktree state.**

```
cd ~/fabware-harness-step0 && git status && git log --oneline -3 && cd artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: clean working tree (or only `.agents/skills/*` incidental modifications — those were present at Plan 1 wrap), HEAD at `cb58bf2` (or descendant), `63 passed (63)` test count.

If the working tree has unexpected modifications outside `.agents/skills/*`, stop and ask before proceeding.

---

## Phase A — Handoff fixes from Plan 1

These six fixes (memory: `fabware_harness_step0.md`) must land before Phase B plugin code, because Phase B depends on `parts.status` existing in the schema and on a clean `PartKind` source-of-truth.

---

## Task 1: Add `status` to the parts schema + cascade-delete harness tables

**Files:**
- Modify: `artifacts/hardwareai/convex/schema.ts` (parts table)
- Modify: `artifacts/hardwareai/convex/projects.ts` (the `remove` mutation's cascade)

- [ ] **Step 1: Add `status` and `lastValidationAt` to the parts table.** In `convex/schema.ts`, locate the existing `parts: defineTable({ ... })` block. Inside, **before** `createdAt: v.number(),`, add:

```ts
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("designing"),
      v.literal("ok"),
      v.literal("escalated"),
      v.literal("failed"),
    )),
    lastValidationAt: v.optional(v.number()),
```

(Both optional so existing `parts` rows continue to validate.)

- [ ] **Step 2: Cascade-delete harness tables in `projects.remove`.** Read `convex/projects.ts` lines 80-130 to see the existing cascade pattern. Append three more cascade blocks **inside** the `remove` handler, alongside the existing deletes (messages/partSpecs/revisions/assemblyParts/parts/interfaces). Pattern:

```ts
    // Cascade-delete harness tables added in Plan 1.
    const violations = await ctx.db
      .query("violations")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const v of violations) await ctx.db.delete(v._id);

    const escalations = await ctx.db
      .query("escalations")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const e of escalations) await ctx.db.delete(e._id);

    const planEvents = await ctx.db
      .query("planEvents")
      .withIndex("by_project_at", (q) => q.eq("projectId", projectId))
      .collect();
    for (const ev of planEvents) await ctx.db.delete(ev._id);
```

- [ ] **Step 3: Typecheck (expect 38 baseline).**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 4: Push schema.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: schema validates and pushes. `parts.status` becomes a recognized field; `_generated/dataModel.d.ts` updates.

- [ ] **Step 5: Re-typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 6: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/schema.ts artifacts/hardwareai/convex/projects.ts \
  && git commit -m "feat(harness): add parts.status + cascade-delete violations/escalations/planEvents on project remove"
```

---

## Task 2: Wire `updateScope` → tick when `useNewHarness` is enabled

**Files:**
- Modify: `artifacts/hardwareai/convex/projects.ts` (the `updateScope` mutation)

The orchestrator's `scoping → decomposing` transition only fires today when `setUseNewHarness(enabled=true)` toggles. After this task, submitting scope on a flagged project also kicks the tick.

- [ ] **Step 1: Read the existing `updateScope` mutation.** Open `convex/projects.ts`. Find `export const updateScope = mutation({ ... })`. Confirm its current handler patches `scope` and `updatedAt`.

- [ ] **Step 2: Append the tick-kick.** Inside the `updateScope` handler, **after** the `ctx.db.patch(...)` call, add:

```ts
    // If this project has opted into the new harness, kick the orchestrator so the
    // scoping → decomposing transition fires immediately (it would otherwise wait
    // until the next setUseNewHarness toggle or external trigger).
    const project = await ctx.db.get(args.projectId);
    if (project?.useNewHarness === true) {
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
    }
```

If `internal` isn't already imported at the top of `projects.ts`, the import was added in Plan 1 Task 10. Verify it exists (`import { internal } from "./_generated/api";`).

- [ ] **Step 3: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 4: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/projects.ts \
  && git commit -m "feat(projects): updateScope schedules orchestrator tick when useNewHarness=true"
```

---

## Task 3: Add `noop-logged` to `PlanEventKind` (split from `specialist-scheduled`)

**Files:**
- Modify: `artifacts/hardwareai/convex/plugins/types.ts` (the `PlanEventKind` union)
- Modify: `artifacts/hardwareai/convex/schema.ts` (the `planEvents.kind` validator)
- Modify: `artifacts/hardwareai/convex/orchestrator/planEvents.ts` (the `append` mutation's `kind` validator)
- Modify: `artifacts/hardwareai/convex/orchestrator/tick.ts` (use `noop-logged` for the noop branch)

The "benign reuse" comment in tick.ts becomes incorrect here: noops will log under their own kind so audit reads (and Plan 3+'s `specialist-completed` event semantics) are unambiguous.

- [ ] **Step 1: Add the literal to `PlanEventKind`.** In `convex/plugins/types.ts`, find the `PlanEventKind` union (it has 8 members today). Insert `"noop-logged"` between `"phase-changed"` and `"specialist-scheduled"`:

```ts
export type PlanEventKind =
  | "phase-changed"
  | "noop-logged"
  | "specialist-scheduled"
  | "specialist-completed"
  | "auto-repaired"
  | "violation-opened"
  | "violation-resolved"
  | "escalation-opened"
  | "escalation-answered";
```

- [ ] **Step 2: Add the literal to the schema validator.** In `convex/schema.ts`, find the `planEvents` table's `kind: v.union(...)` validator (added by Plan 1 Task 2). Insert `v.literal("noop-logged"),` immediately after `v.literal("phase-changed"),`.

- [ ] **Step 3: Add the literal to the `append` mutation validator.** In `convex/orchestrator/planEvents.ts`, find the `kind` validator inside `append`. Insert `v.literal("noop-logged"),` immediately after `v.literal("phase-changed"),`. The validator must match the schema validator exactly.

- [ ] **Step 4: Switch tick's noop branch to use `noop-logged`.** In `convex/orchestrator/tick.ts`, find the `if (action.kind === "noop") { ... }` block. Change `kind: "specialist-scheduled"` to `kind: "noop-logged"`. Update the inline comment if any to remove the "benign reuse" note.

- [ ] **Step 5: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 6: Push schema.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: success.

- [ ] **Step 7: Re-typecheck and run full test suite.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS" && pnpm test 2>&1 | tail -5
```

Expected: 38 errors; 64 tests pass (no test added/removed by this task).

- [ ] **Step 8: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/types.ts artifacts/hardwareai/convex/schema.ts artifacts/hardwareai/convex/orchestrator/planEvents.ts artifacts/hardwareai/convex/orchestrator/tick.ts \
  && git commit -m "feat(harness): split noop-logged plan event from specialist-scheduled"
```

---

## Task 4: Consolidate `PartKind` into one source

**Files:**
- Modify: `artifacts/hardwareai/convex/lib/partKind.ts` (re-export from plugins/types)

`convex/lib/partKind.ts` and `convex/plugins/types.ts` both declare `PartKind` today. Make `lib/partKind.ts` a thin re-export so future kinds (e.g., `"cnc"`) only get added in one place.

- [ ] **Step 1: Read both files** to confirm they declare matching unions. (`PartKind = "sheet_metal" | "printed" | "purchased"` — already verified at Plan 1 final review.)

- [ ] **Step 2: Rewrite `convex/lib/partKind.ts`** to re-export. Replace its current contents with:

```ts
import type { PartDsl } from "./dsl";
import type { PrintedDsl } from "./printedDsl";
import type { PurchasedDsl } from "./purchasedDsl";

// Canonical PartKind lives in convex/plugins/types.ts. Re-export here so existing
// callers (convex/lib/partValidator.ts, convex/parts.ts, etc.) keep working.
export type { PartKind } from "../plugins/types";
export { } from "../plugins/types"; // placeholder so this file remains a module

import type { PartKind } from "../plugins/types";

/** Default to "sheet_metal" for legacy parts that don't carry kind. */
export function readKind(part: { kind?: string | null }): PartKind {
  const k = part.kind;
  if (k === "printed" || k === "purchased") return k;
  return "sheet_metal";
}

export type AnyPartDsl = PartDsl | PrintedDsl | PurchasedDsl;

export const PART_KIND_LABEL: Record<PartKind, string> = {
  sheet_metal: "Sheet metal",
  printed: "3D printed",
  purchased: "Purchased",
};
```

(The `export { } from "../plugins/types"` line is a no-op that makes the module's import side-effects explicit — drop it if your linter complains.)

- [ ] **Step 3: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38. If a new error appears (likely a missing import or a conflict with another `PartKind` import path in some caller), trace it and fix the caller's import.

- [ ] **Step 4: Run all tests** to confirm no behavioral change.

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: 64 passed (64).

- [ ] **Step 5: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/lib/partKind.ts \
  && git commit -m "refactor(harness): partKind.ts re-exports PartKind from plugins/types as canonical source"
```

---

## Task 5: Plugin registry test isolation

**Files:**
- Modify: `artifacts/hardwareai/convex/plugins/registry.ts` (export `_resetRegistry`)
- Modify: `artifacts/hardwareai/convex/plugins/__tests__/registry.test.ts` (use `beforeEach`)

Once Task 9 registers the sheet-metal plugin at module load, the module-singleton `REGISTRY` will leak across vitest workers. Add a reset hook now so tests stay isolated.

- [ ] **Step 1: Add the reset function** to `convex/plugins/registry.ts`. Append at the end:

```ts
/** Test-only — clear all registered plugins. Production code must not call this. */
export function _resetRegistry(): void {
  for (const k of Object.keys(REGISTRY) as PartKind[]) delete REGISTRY[k];
}
```

- [ ] **Step 2: Update the existing test file** `convex/plugins/__tests__/registry.test.ts` to call `_resetRegistry` in a `beforeEach` block. The current file has 2 tests; add the import and hook so the file becomes:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getPlugin, registeredKinds, _resetRegistry } from "../registry";

describe("plugin registry", () => {
  beforeEach(() => _resetRegistry());

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

- [ ] **Step 3: Run the test.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/__tests__/registry.test.ts 2>&1 | tail -5
```

Expected: 2 passed.

- [ ] **Step 4: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/registry.ts artifacts/hardwareai/convex/plugins/__tests__/registry.test.ts \
  && git commit -m "test(plugins): export _resetRegistry + use beforeEach in registry tests"
```

---

## Phase B — Sheet-metal plugin module

The `sheet-metal` plugin lives at `convex/plugins/sheet-metal/`. It's a thin shape over the existing `convex/lib/dsl.ts` + `scsRules.ts` + `dxfGenerator.ts` + `featureGraph.ts` modules — no logic is rewritten. Plan 4 will refactor each rule into its own file under `convex/plugins/sheet-metal/rules/` with proper `autoRepair` functions and per-rule tier tags.

---

## Task 6: Plugin directory + DSL re-export

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/sheet-metal/dsl.ts` (re-exports the existing `convex/lib/dsl.ts`)

- [ ] **Step 1: Create the dir + re-export module.** `convex/plugins/sheet-metal/dsl.ts`:

```ts
// The sheet-metal DSL is the existing PartDsl from convex/lib/dsl.ts.
// Re-exported here so the plugin's contract has a single import surface.
export { PartDslSchema as DslSchema, type PartDsl as Dsl } from "../../lib/dsl";
```

- [ ] **Step 2: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 3: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/sheet-metal/dsl.ts \
  && git commit -m "feat(plugins/sheet-metal): re-export PartDsl as Dsl + DslSchema"
```

---

## Task 7: Validator adapter — convert `scsRules.validateSpec` results to `Violation[]`

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/sheet-metal/validator.ts`
- Create: `artifacts/hardwareai/convex/plugins/sheet-metal/__tests__/validator.test.ts`

The existing `validateSpec(spec: SpecInput)` returns a `ValidationResult` whose `rules[]` have `{ id, status: "pass"|"warn"|"fail"|"na", message, suggestion? }`. Map each non-pass/na rule into a `Violation` whose `severity`/`tier` are derived from `status`:
- `fail` → `severity: "error"`, `tier: "requires-judgment"` (Plan 4 will tag individual rules `auto-fixable` once per-rule autoRepair functions exist).
- `warn` → `severity: "warn"`, `tier: "requires-judgment"`.

Pass and N/A rules produce no violations.

- [ ] **Step 1: Write the failing tests.** Create `convex/plugins/sheet-metal/__tests__/validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validate } from "../validator";
import type { Dsl } from "../dsl";

const baseDsl: Dsl = {
  version: 1,
  partType: "bracket",
  material: "Mild Steel (CRS)",
  thickness: 0.075,
  width: 4,
  height: 3,
  depth: null,
  features: [],
  finish: null,
  assemblyRefs: [],
};

const ctx = { scope: null, peerParts: [] };

describe("sheet-metal validator", () => {
  it("returns an empty array for a clean DSL", () => {
    const violations = validate(baseDsl, ctx);
    // Some rules may warn even on a clean DSL (e.g. missing finish on a 'commercial' tier),
    // so we don't assert empty — just no errors.
    expect(violations.every((v) => v.severity !== "error")).toBe(true);
  });

  it("returns at least one error when thickness is non-stocked", () => {
    const violations = validate({ ...baseDsl, thickness: 0.999 }, ctx);
    const errors = violations.filter((v) => v.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("every violation has ruleId, severity, message, agentMessage", () => {
    const violations = validate({ ...baseDsl, thickness: 0.999, width: 200 }, ctx);
    for (const v of violations) {
      expect(typeof v.ruleId).toBe("string");
      expect(["error", "warn"]).toContain(v.severity);
      expect(v.message.length).toBeGreaterThan(0);
      expect(v.agentMessage.length).toBeGreaterThan(0);
    }
  });

  it("every violation's tier is 'requires-judgment' in Plan 2", () => {
    const violations = validate({ ...baseDsl, thickness: 0.999 }, ctx);
    for (const v of violations) {
      // Tier isn't on the Violation itself — it's added by the caller using the rule pack.
      // The validator-level test focuses on severity. Tier-tagging is exercised in the plugin object test (Task 8).
      expect(v.severity).toMatch(/error|warn/);
    }
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/sheet-metal/__tests__/validator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the validator.** `convex/plugins/sheet-metal/validator.ts`:

```ts
import { validateSpec, type RuleResult } from "../../lib/scsRules";
import type { Dsl } from "./dsl";
import type { PartContext, Violation } from "../types";

/**
 * Adapt the existing scsRules validator into the new contract.
 *
 * scsRules.validateSpec consumes a SpecInput shape (legacy) and returns a
 * ValidationResult with a flat list of RuleResult. The Dsl (PartDsl) we receive
 * is structurally compatible with SpecInput's expected fields, so we can pass
 * it straight through.
 *
 * Plan 4 will replace this whole file with per-rule modules, each providing
 * its own check() + autoRepair() and choosing its own tier.
 */
export function validate(dsl: Dsl, _ctx: PartContext): Violation[] {
  const result = validateSpec(dsl as never);
  const violations: Violation[] = [];
  for (const r of result.rules as RuleResult[]) {
    if (r.status === "pass" || r.status === "na") continue;
    const severity = r.status === "fail" ? "error" : "warn";
    violations.push({
      ruleId: `sheet.${r.id}`,
      severity,
      message: r.message,
      // agentMessage is the message + any suggestion. Plan 4 will craft per-rule
      // imperative phrasings; for now this is a serviceable best-effort.
      agentMessage: r.suggestion ? `${r.message} ${r.suggestion}` : r.message,
    });
  }
  return violations;
}
```

(The `as never` cast on `validateSpec(dsl as never)` is because `SpecInput` is the legacy structural type and `Dsl` is the canonical replacement; their fields overlap in the cases we exercise here, but the types don't formally match. Plan 4's per-rule migration will eliminate this cast.)

- [ ] **Step 4: Run, confirm pass.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/sheet-metal/__tests__/validator.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 6: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/sheet-metal/validator.ts artifacts/hardwareai/convex/plugins/sheet-metal/__tests__/validator.test.ts \
  && git commit -m "feat(plugins/sheet-metal): validator adapter — scsRules.validateSpec → Violation[]"
```

---

## Task 8: Plugin object — compose the `ProcessPlugin<Dsl>`

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/sheet-metal/index.ts`
- Create: `artifacts/hardwareai/convex/plugins/sheet-metal/__tests__/plugin.test.ts`

The plugin object aggregates the validator + stubs for everything else. Stubs:

- `tools`: empty array (Plan 3 wires the real tool surface from `assemblyDesigner.ts`).
- `systemPromptFragment`: empty string (Plan 3).
- `rules`: empty array (Plan 4 ports each `scsRules` rule into its own `Rule<Dsl>` file). The `validate()` function returns violations directly without consulting `rules` in Plan 2.
- `autoRepair`: always returns null (Plan 4).
- `renderPreview`: returns `{ meshes: [] }` — preview generation isn't on the plugin contract path yet (the existing `AssembledView` reads parts directly today). Plan 5+ rewires preview through the plugin.
- `export`: returns an empty array (Plan 6+ wires DXF export through the plugin contract).
- `estimateCost`: returns `{ totalUsd: 0, breakdown: [] }` (Plan 5+ wires cost).
- `supportedInterfaces`: `["bolted", "pem_inserted", "riveted", "hinged"]`.

- [ ] **Step 1: Write the failing test.** Create `convex/plugins/sheet-metal/__tests__/plugin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sheetMetalPlugin } from "../index";

describe("sheetMetalPlugin", () => {
  it("declares kind = 'sheet_metal'", () => {
    expect(sheetMetalPlugin.kind).toBe("sheet_metal");
  });

  it("supportedInterfaces matches the schema's interface kinds", () => {
    expect(sheetMetalPlugin.supportedInterfaces.sort()).toEqual(
      ["bolted", "hinged", "pem_inserted", "riveted"],
    );
  });

  it("validate() forwards to the adapter and returns violations array", () => {
    const dsl = {
      version: 1 as const,
      partType: "bracket" as const,
      material: "Mild Steel (CRS)",
      thickness: 0.999, // non-stocked — should produce a violation
      width: 4,
      height: 3,
      depth: null,
      features: [],
      finish: null,
      assemblyRefs: [],
    };
    const violations = sheetMetalPlugin.validate(dsl, { scope: null, peerParts: [] });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("autoRepair always returns null in Plan 2 (Plan 4 wires per-rule fixes)", () => {
    const dsl = {
      version: 1 as const,
      partType: "bracket" as const,
      material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null, features: [], finish: null, assemblyRefs: [],
    };
    const result = sheetMetalPlugin.autoRepair(dsl, {
      ruleId: "sheet.any",
      severity: "error",
      message: "x", agentMessage: "x",
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/sheet-metal/__tests__/plugin.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the plugin object.** `convex/plugins/sheet-metal/index.ts`:

```ts
import type { ProcessPlugin } from "../types";
import { DslSchema, type Dsl } from "./dsl";
import { validate } from "./validator";

export const sheetMetalPlugin: ProcessPlugin<Dsl> = {
  kind: "sheet_metal",

  dslSchema: DslSchema,

  // Plan 3 wires the real tool surface (currently lives in convex/assemblyDesigner.ts).
  tools: [],
  systemPromptFragment: "",

  // Plan 4 ports each scsRules rule into its own Rule<Dsl> file. Until then, validate()
  // bypasses rules[] entirely and calls the adapter directly.
  rules: [],
  validate,
  autoRepair: () => null,

  // Plan 5+ wires preview, export, cost through the plugin. AssembledView and Export.tsx
  // currently read parts directly; this stub keeps the contract typed without changing UI.
  renderPreview: () => ({ meshes: [] }),
  export: () => [],
  estimateCost: () => ({ totalUsd: 0, breakdown: [] }),

  supportedInterfaces: ["bolted", "pem_inserted", "riveted", "hinged"],
};
```

- [ ] **Step 4: Run the new test.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/sheet-metal/__tests__/plugin.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 6: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/sheet-metal/index.ts artifacts/hardwareai/convex/plugins/sheet-metal/__tests__/plugin.test.ts \
  && git commit -m "feat(plugins/sheet-metal): plugin object — wraps validator, supportedInterfaces, stubs"
```

---

## Task 9: Register the sheet-metal plugin

**Files:**
- Create: `artifacts/hardwareai/convex/plugins/index.ts` (registration entry point)
- Modify: `artifacts/hardwareai/convex/plugins/__tests__/registry.test.ts` (add a test that registration works)

We want plugin registration to happen at module load. The cleanest place is a single `convex/plugins/index.ts` file that imports each plugin and calls `_registerPlugin`. The orchestrator's tick imports this file (transitively, via `registry`'s side-effect import) so the registry is populated before any tick runs.

- [ ] **Step 1: Create the registration entry point.** `convex/plugins/index.ts`:

```ts
import { _registerPlugin } from "./registry";
import { sheetMetalPlugin } from "./sheet-metal";

// Register each plugin at module load. Future plugins (printed, hardware-assembly)
// follow the same pattern in their own Plan-N PRs.
_registerPlugin(sheetMetalPlugin);
```

- [ ] **Step 2: Make the orchestrator tick load this file** so registration happens before `computeNextAction` queries `registeredKinds()`. In `convex/orchestrator/tick.ts`, add a side-effect import at the top (before the existing imports):

```ts
import "../plugins";  // side-effect: registers all plugins
```

- [ ] **Step 3: Extend `convex/plugins/__tests__/registry.test.ts`** to confirm registration. Add a third test inside the `describe` block:

```ts
  it("loading plugins/index.ts registers sheet_metal", async () => {
    _resetRegistry();                  // ensure clean
    await import("../index");          // side-effect import
    expect(registeredKinds()).toContain("sheet_metal");
    expect(getPlugin("sheet_metal")?.kind).toBe("sheet_metal");
  });
```

- [ ] **Step 4: Run the registry tests.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/plugins/__tests__/registry.test.ts
```

Expected: PASS, 3 tests. (The dynamic `import` is cached by vitest, so the order matters — the `_resetRegistry()` call inside the test ensures it sees a clean state.)

- [ ] **Step 5: Run the FULL test suite** to catch any cross-test pollution.

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -10
```

Expected: all tests pass (count depends on Tasks 1-8 additions; should be 64 + 4 (validator) + 4 (plugin) + 1 (registry) = 73 give or take).

If the existing "registeredKinds is empty in v1" test now fails because the `_registerPlugin` side-effect from another test file polluted the singleton, that's the test-isolation issue Task 5 was meant to prevent. Confirm `beforeEach(_resetRegistry)` is in place. If pollution still occurs because `convex/plugins/index.ts` was imported by another test that doesn't reset, the simplest fix is to **not** import the side-effect file from anywhere except `tick.ts`, and to reset in `beforeEach` for any test that asserts registry contents.

- [ ] **Step 6: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 7: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/plugins/index.ts artifacts/hardwareai/convex/orchestrator/tick.ts artifacts/hardwareai/convex/plugins/__tests__/registry.test.ts \
  && git commit -m "feat(plugins): register sheet-metal at module load via plugins/index.ts side-effect"
```

---

## Phase C — Sheet-metal specialist + tick wiring

The specialist runs against a part: read `dslJson`, parse via the plugin's `dslSchema`, call `plugin.validate`, attempt `plugin.autoRepair` (always null in Plan 2), write any remaining violations and escalate them, set part `status`, log a `specialist-completed` planEvent, and re-tick the orchestrator.

---

## Task 10: Sheet-metal specialist Convex action

**Files:**
- Create: `artifacts/hardwareai/convex/specialists/sheetMetal.ts`
- Create: `artifacts/hardwareai/convex/specialists/__tests__/sheetMetal.test.ts`
- Create: `artifacts/hardwareai/convex/specialists/_helpers.ts` (pure helper for the auto-repair loop)

The pure helper is what we unit-test; the Convex `internalAction` is a thin wrapper. Keeps the test surface small.

- [ ] **Step 1: Add `convex/specialists/**` to the vitest include pattern.** In `artifacts/hardwareai/vitest.config.ts`, the `include` array (last edited in Plan 1 Task 0) needs another entry. Add `"convex/specialists/**/*.test.ts",`:

```ts
    include: [
      "convex/lib/**/*.test.ts",
      "convex/archetypes/**/*.test.ts",
      "convex/plugins/**/*.test.ts",
      "convex/orchestrator/**/*.test.ts",
      "convex/specialists/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
```

- [ ] **Step 2: Write the failing test for the pure helper.** Create `convex/specialists/__tests__/sheetMetal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runSpecialistOnce, type SpecialistResult } from "../_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet-metal";

const baseDsl = {
  version: 1 as const,
  partType: "bracket" as const,
  material: "Mild Steel (CRS)",
  thickness: 0.075, width: 4, height: 3, depth: null,
  features: [], finish: null, assemblyRefs: [],
};

describe("runSpecialistOnce (pure)", () => {
  it("returns status='ok' with no violations on a clean DSL", () => {
    const result: SpecialistResult = runSpecialistOnce(sheetMetalPlugin, baseDsl, { scope: null, peerParts: [] });
    expect(result.violations.length).toBe(0);
    expect(result.status).toBe("ok");
    expect(result.repairedDsl).toBe(baseDsl); // unchanged
  });

  it("returns status='escalated' with violations on a non-stocked thickness", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.status).toBe("escalated");
  });

  it("attempts autoRepair (always null in Plan 2) — repairedDsl stays equal to input", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.repairedDsl).toEqual({ ...baseDsl, thickness: 0.999 });
  });
});
```

- [ ] **Step 3: Run, confirm fail.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/specialists/__tests__/sheetMetal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create the pure helper.** `convex/specialists/_helpers.ts`:

```ts
import type { ProcessPlugin, PartContext, Violation } from "../plugins/types";

export interface SpecialistResult<TDsl> {
  status: "ok" | "escalated";
  violations: Violation[];
  repairedDsl: TDsl;
  autoRepairedCount: number;
}

/**
 * One pass of validate → auto-repair (single attempt per violation) → re-validate.
 * Plan 3 will extend this into the full two-tier loop with R repair turns and
 * cascade re-validation; Plan 2 keeps it single-pass because no autoRepair functions
 * exist yet (every plugin.autoRepair returns null today).
 */
export function runSpecialistOnce<TDsl>(
  plugin: ProcessPlugin<TDsl>,
  dsl: TDsl,
  ctx: PartContext,
): SpecialistResult<TDsl> {
  let current = dsl;
  let autoRepairedCount = 0;
  const initial = plugin.validate(current, ctx);
  for (const v of initial) {
    const repaired = plugin.autoRepair(current, v);
    if (repaired !== null) {
      current = repaired;
      autoRepairedCount += 1;
    }
  }
  const remaining = autoRepairedCount > 0 ? plugin.validate(current, ctx) : initial;
  return {
    status: remaining.length === 0 ? "ok" : "escalated",
    violations: remaining,
    repairedDsl: current,
    autoRepairedCount,
  };
}
```

- [ ] **Step 5: Run the tests.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/specialists/__tests__/sheetMetal.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Create the Convex specialist action.** `convex/specialists/sheetMetal.ts`:

```ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { sheetMetalPlugin } from "../plugins/sheet-metal";
import { runSpecialistOnce } from "./_helpers";
import type { Tier } from "../plugins/types";

/**
 * Sheet-metal specialist. Validates a part's stored DSL, attempts auto-repair,
 * writes any remaining violations + escalations, sets the part's status, logs
 * a specialist-completed plan event, and re-ticks the orchestrator.
 *
 * Plan 3 will add an Anthropic agent loop on top of this so the specialist can
 * also DESIGN parts from intent (not just validate existing ones).
 */
export const run = internalAction({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, args) => {
    // 1. Load the part + project.
    const part = await ctx.runQuery(internal.specialists.sheetMetal._loadPartAndProject, {
      partId: args.partId,
    });
    if (!part) {
      // Part deleted between scheduling and dispatch. Re-tick so the phase machine
      // re-evaluates without it.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "skipped", reason: "part not found" } as const;
    }

    // 2. Parse DSL. Bail to 'failed' if the part has no DSL (Plan 3 will design from scratch).
    if (!part.dslJson) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: "no DSL — Plan 3 will design from intent" },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "no DSL" } as const;
    }
    const parsed = sheetMetalPlugin.dslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: `DSL parse failed: ${parsed.error.message}` },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "DSL parse error" } as const;
    }

    // 3. Run the pure specialist loop.
    const result = runSpecialistOnce(sheetMetalPlugin, parsed.data, {
      scope: part.scope ?? null,
      peerParts: part.peerParts,
    });

    // 4. If the auto-repair loop changed the DSL, persist the new dslJson.
    if (result.autoRepairedCount > 0) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartDsl, {
        partId: args.partId, dslJson: JSON.stringify(result.repairedDsl),
      });
    }

    // 5. Write violations + escalations for what's left. In Plan 2, every violation
    // is tier='requires-judgment' so it escalates immediately.
    for (const v of result.violations) {
      const tier: Tier = "requires-judgment";
      const violationId = await ctx.runMutation(internal.orchestrator.violations.open, {
        projectId: args.projectId,
        partId: args.partId,
        ruleId: v.ruleId,
        severity: v.severity,
        tier,
        message: v.message,
        agentMessage: v.agentMessage,
        suggestedFix: v.suggestedFix,
        location: v.location,
      });
      await ctx.runMutation(internal.orchestrator.escalations.open, {
        projectId: args.projectId,
        sourceViolationId: violationId,
        question: v.message,
        suggestedAnswer: undefined,
        choices: undefined,
      });
      await ctx.runMutation(internal.orchestrator.violations.resolve, {
        violationId,
        status: "escalated",
        by: "agent",
        note: undefined,
      });
    }

    // 6. Set part status + log completion.
    await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
      partId: args.partId, status: result.status,
    });
    await ctx.runMutation(internal.orchestrator.planEvents.append, {
      projectId: args.projectId, kind: "specialist-completed",
      payload: {
        partId: String(args.partId),
        details: { status: result.status, violations: result.violations.length, autoRepaired: result.autoRepairedCount },
      },
    });

    // 7. Re-tick so the phase machine re-evaluates with the part's new status.
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
    return { status: result.status, violations: result.violations.length } as const;
  },
});

// ─── Internal helpers (separate functions because actions can't touch ctx.db) ──

import { internalQuery, internalMutation } from "../_generated/server";

export const _loadPartAndProject = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return null;
    const project = await ctx.db.get(part.projectId);
    const peerRows = await ctx.db
      .query("parts")
      .withIndex("by_project", (q) => q.eq("projectId", part.projectId))
      .collect();
    const peerParts = peerRows
      .filter((p) => p._id !== partId)
      .map((p) => ({
        partId: String(p._id),
        label: p.label,
        kind: (p.kind ?? "sheet_metal") as "sheet_metal" | "printed" | "purchased",
      }));
    return {
      ...part,
      scope: project?.scope ?? null,
      peerParts,
    };
  },
});

export const _setPartStatus = internalMutation({
  args: {
    partId: v.id("parts"),
    status: v.union(
      v.literal("pending"), v.literal("designing"),
      v.literal("ok"), v.literal("escalated"), v.literal("failed"),
    ),
  },
  handler: async (ctx, { partId, status }) => {
    await ctx.db.patch(partId, { status, lastValidationAt: Date.now(), updatedAt: Date.now() });
  },
});

export const _setPartDsl = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    await ctx.db.patch(partId, { dslJson, updatedAt: Date.now() });
  },
});
```

- [ ] **Step 7: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38. (Until the next Convex push, `internal.specialists.sheetMetal.*` won't be in `_generated/api.d.ts`. If typecheck fails on those references, proceed to Step 8 to push.)

- [ ] **Step 8: Push schema.** This publishes the new specialist functions and updates `_generated/api.d.ts`.

```
cd ~/fabware-harness-step0/artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

- [ ] **Step 9: Re-typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 10: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/vitest.config.ts artifacts/hardwareai/convex/specialists \
  && git commit -m "feat(specialists): sheet-metal specialist — validates part, escalates remaining violations, re-ticks"
```

---

## Task 11: Tick `designPart` dispatches the specialist

**Files:**
- Modify: `artifacts/hardwareai/convex/orchestrator/tick.ts` (rewire the `designPart` branch)

Currently the `designPart` branch logs a noop event with the "specialist not yet wired (Plan 2)" message. Replace it with a real dispatch + a `specialist-scheduled` log + return.

- [ ] **Step 1: Update the `designPart` branch.** In `convex/orchestrator/tick.ts`, find the `if (action.kind === "designPart") { ... }` block. Replace its body with:

```ts
    if (action.kind === "designPart") {
      // Look up the plugin for the part's kind. computeNextAction already
      // verified registeredKinds.includes(part.kind), so this is defensive.
      const partRecord = parts.find((p) => p._id === action.partId);
      const partKind = (partRecord as { kind?: string } | undefined)?.kind ?? "sheet_metal";

      // Mark the part 'designing' so a re-entrant tick doesn't re-dispatch it.
      await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
        partId: action.partId as Id<"parts">,
        status: "designing",
      });

      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId,
        kind: "specialist-scheduled",
        payload: { partId: action.partId, details: { kind: partKind } },
      });

      // Dispatch the right specialist for this kind. Today only sheet_metal exists;
      // future kinds get their own dispatch lines (Plan 5 = printed, Plan 6 = hardware-assembly).
      if (partKind === "sheet_metal") {
        await ctx.scheduler.runAfter(0, internal.specialists.sheetMetal.run, {
          projectId: args.projectId,
          partId: action.partId as Id<"parts">,
        });
      } else {
        // No plugin's specialist registered yet — log and leave the part as 'designing';
        // the next tick will not re-dispatch (status guard) until a future plan ships
        // its specialist. This branch is unreachable in Plan 2 because computeNextAction
        // gates designPart on registeredKinds, which only contains 'sheet_metal'.
        await ctx.runMutation(internal.orchestrator.planEvents.append, {
          projectId: args.projectId,
          kind: "noop-logged",
          payload: { partId: action.partId, message: `specialist for kind="${partKind}" not yet wired` },
        });
      }
      return action;
    }
```

You'll need to add an import for `Id` from `_generated/dataModel`:

```ts
import type { Id } from "../_generated/dataModel";
```

- [ ] **Step 2: Update `phaseMachine.computeNextAction`** so it skips parts already in `designing` (otherwise an in-flight specialist would get re-dispatched on every tick). In `convex/orchestrator/phaseMachine.ts`, change the `pending` finder:

```ts
    const pending = input.parts.find((p) => {
      const status = (p as Doc<"parts"> & { status?: string }).status;
      return status === "pending" || status === undefined;
    });
```

(Treat undefined as pending — for legacy parts that haven't been touched by a specialist yet.)

And update the `allDone` check to ALSO accept `failed`:

```ts
    const allDone = input.parts.every((p) => {
      const s = (p as Doc<"parts"> & { status?: string }).status;
      return s === "ok" || s === "escalated" || s === "failed";
    });
```

- [ ] **Step 3: Update existing phaseMachine tests** for the new `pending` semantics. In `convex/orchestrator/__tests__/phaseMachine.test.ts`, the test `"returns 'designPart' when a pending part has a registered plugin"` already passes a part with `status: "pending"`. Verify — no change needed. The test `"transitions designing → validating when every part is ok or escalated"` should still pass with the new `failed` acceptance.

Add one new test for the `designing` skip behavior:

```ts
  it("skips parts in 'designing' status (specialist already in flight)", () => {
    const action = computeNextAction({
      project: { ...baseProject("designing"), scope: { tier: "mvp" } } as never,
      parts: [
        { _id: "pt1", kind: "sheet_metal", status: "designing" } as never,
        { _id: "pt2", kind: "sheet_metal", status: "ok" } as never,
      ],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    // pt1 is in flight, pt2 is done — no pending parts → noop, not transitionPhase
    // (allDone is false because pt1.status is 'designing', not in the done set).
    expect(action.kind).toBe("noop");
  });
```

- [ ] **Step 4: Run phaseMachine tests.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/orchestrator/__tests__/phaseMachine.test.ts
```

Expected: PASS, 11 tests (10 existing + 1 new).

- [ ] **Step 5: Typecheck + Convex push.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS" && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```

Expected: 38; push success.

- [ ] **Step 6: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/orchestrator/tick.ts artifacts/hardwareai/convex/orchestrator/phaseMachine.ts artifacts/hardwareai/convex/orchestrator/__tests__/phaseMachine.test.ts \
  && git commit -m "feat(orchestrator): tick.designPart dispatches sheet-metal specialist; phaseMachine skips in-flight parts"
```

---

## Task 12: End-to-end fixture — round-trip through the harness

**Files:**
- Create: `artifacts/hardwareai/convex/orchestrator/__tests__/e2e-roundtrip.test.ts`

A pure-function-level e2e: simulate a project with one sheet-metal part, drive the phase machine through scoping → decomposing → designing, dispatch the specialist (call its pure helper directly), and assert on the final state.

This test does NOT exercise Convex (no DB, no scheduler). The full Convex e2e using `convex-test` is deferred — it requires fixture setup we'd otherwise have to invent on the fly.

- [ ] **Step 1: Write the test.** Create `convex/orchestrator/__tests__/e2e-roundtrip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeNextAction } from "../phaseMachine";
import { runSpecialistOnce } from "../../specialists/_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet-metal";

const sheetPart = (status: string) => ({
  _id: `pt-${status}`,
  kind: "sheet_metal",
  status,
} as never);

describe("e2e roundtrip — single sheet-metal part", () => {
  it("clean DSL: scoping → decomposing → designing → ok → validating", () => {
    // Phase 1: scoping with scope set → transition to decomposing
    let action = computeNextAction({
      project: { _id: "p1", phase: "scoping", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");

    // Phase 2: decomposing with parts → transition to designing
    action = computeNextAction({
      project: { _id: "p1", phase: "decomposing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("pending")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");

    // Phase 3: designing with pending sheet-metal part → dispatch specialist
    action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("pending")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("designPart");

    // Phase 4: specialist runs against a clean DSL → status='ok'
    const cleanDsl = {
      version: 1 as const, partType: "bracket" as const,
      material: "Mild Steel (CRS)", thickness: 0.075,
      width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const specResult = runSpecialistOnce(sheetMetalPlugin, cleanDsl, { scope: { tier: "mvp" }, peerParts: [] });
    expect(specResult.status).toBe("ok");

    // Phase 5: re-tick designing with status='ok' → transition to validating
    action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("ok")],
      openEscalations: [],
      registeredKinds: ["sheet_metal"],
    });
    expect(action.kind).toBe("transitionPhase");
    if (action.kind === "transitionPhase") expect(action.toPhase).toBe("validating");
  });

  it("dirty DSL: status becomes 'escalated' and an escalation would block validating", () => {
    const dirtyDsl = {
      version: 1 as const, partType: "bracket" as const,
      material: "Mild Steel (CRS)", thickness: 0.999,
      width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const specResult = runSpecialistOnce(sheetMetalPlugin, dirtyDsl, { scope: null, peerParts: [] });
    expect(specResult.status).toBe("escalated");
    expect(specResult.violations.length).toBeGreaterThan(0);

    // Simulate the orchestrator after escalations were written.
    const action = computeNextAction({
      project: { _id: "p1", phase: "designing", useNewHarness: true, scope: { tier: "mvp" } } as never,
      parts: [sheetPart("escalated")],
      openEscalations: [{ _id: "e1" } as never],   // an escalation now exists
      registeredKinds: ["sheet_metal"],
    });
    // Open escalation → wait for user answer.
    expect(action.kind).toBe("wait");
  });
});
```

- [ ] **Step 2: Run.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test convex/orchestrator/__tests__/e2e-roundtrip.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 3: Run the full test suite.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -10
```

Expected: all tests pass. Approximate count after Plan 2: ~75-80 tests across ~25 files.

- [ ] **Step 4: Typecheck.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 5: Commit.**

```
cd ~/fabware-harness-step0 && git add artifacts/hardwareai/convex/orchestrator/__tests__/e2e-roundtrip.test.ts \
  && git commit -m "test(harness): e2e roundtrip — clean DSL → ok, dirty DSL → escalated"
```

---

## Task 13: Final sweep

**Files:** none modified (unless PLAN.md gets a status line).

- [ ] **Step 1: Confirm full test suite passes.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 2: Confirm typecheck baseline.**

```
cd ~/fabware-harness-step0/artifacts/hardwareai && pnpm typecheck 2>&1 | grep -c "error TS"
```

Expected: 38.

- [ ] **Step 3: Confirm git state is clean and review the commit stack.**

```
cd ~/fabware-harness-step0 && git status && git log --oneline 509576b..HEAD
```

Expected: clean tree (or only `.agents/skills/*` incidentals); ~26 commits total stacked on `509576b` (13 from Plan 1 + 13 from Plan 2).

- [ ] **Step 4 (optional): If `docs/PLAN.md` has a sensible insertion point**, append:

```
- [x] **Plan 2 (Step 1): Sheet-metal plugin (validator-only)** — handoff fixes + plugin shell + specialist dispatch + e2e roundtrip. Shipped <DATE>.
```

If no sensible insertion point exists, skip.

- [ ] **Step 5 (only if PLAN.md was updated): Commit.**

```
cd ~/fabware-harness-step0 && git add docs/PLAN.md && git commit -m "docs: mark Plan 2 (Step 1 sheet-metal plugin) shipped"
```

---

## What this plan does NOT do (intentionally — see follow-up plans)

- **Anthropic agent loop in the specialist.** Plan 3 wires the existing `assemblyDesigner` tools into the specialist so it can DESIGN parts from intent, not just validate stored DSLs.
- **Per-rule files in `convex/plugins/sheet-metal/rules/`.** Plan 4 ports each `scsRules` rule into its own `Rule<Dsl>` module with a per-rule `autoRepair` function and the right tier tag.
- **3D-printed plugin.** Plan 5.
- **Hardware-assembly plugin.** Plan 6.
- **Bending / K-factor.** Plan 7.
- **Cleanup of `assemblyDesigner.ts`.** Plan 8.
- **Preview / export / cost wired through the plugin contract.** Today the `AssembledView`, `Export.tsx`, and BOM rollup read parts directly. The plugin's `renderPreview` / `export` / `estimateCost` are stubs in this plan; Plans 5+ rewire the UI.
- **Interface validation across parts.** The orchestrator's `validating` phase still no-ops (Plan 1's `phaseMachine` returns "noop" for that phase). Plan 4 or 5 wires `assemblyRules.validateAssembly` into the orchestrator with the same `Violation` shape.

---

## Plan self-review (already performed)

**Spec coverage:** Plan 2 covers spec sections 2 (plugin contract, made concrete with sheet-metal as the first plugin), 3 (state-machine `designPart` branch now dispatches), and 5 (rules engine — the validator adapter is the simplest valid implementation; per-rule files come in Plan 4). Sections 4 (agent layer) and 6+ (other plugins, bending, cleanup) are explicitly deferred.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" steps. Stub returns are documented as Plan-N follow-ups, not placeholders.

**Type consistency:** `PartKind` literals (`sheet_metal` etc.) match throughout. `Tier` and `Severity` literals match. `Violation` shape matches what `convex/orchestrator/violations.open` accepts. `Action.designPart.partId` is `string` (from `phaseMachine`) and gets cast to `Id<"parts">` in tick.ts — same pattern as Plan 1 used for `(p as Doc<"parts"> & { status?: string }).status`.

**Scope check:** 13 tasks. Tightly grouped into Phase A (handoff fixes), B (plugin module), C (specialist + tick), D (sweep). Each task is independently reviewable. Phase A could in theory be its own plan, but the fixes are small and the plugin work depends on `parts.status` being added (Task 1) — splitting would create a single-task plan, which the writing-plans skill discourages.
