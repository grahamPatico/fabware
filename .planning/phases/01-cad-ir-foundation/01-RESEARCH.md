# Phase 1: CAD IR Foundation - Research

**Researched:** 2026-05-06
**Domain:** Parametric CAD IR (TS/Zod) + build123d (Python) + Vercel Sandbox executor + Anthropic tool-driven repair loop
**Confidence:** HIGH — the authoritative 3375-line phase plan is canonical and a fully-implemented branch (`feat/cad-ir-phase-1`) already mirrors it task-for-task

## Summary

Phase 1 stands up the CAD IR (Intermediate Representation) end-to-end on a single feature surface (parametric brackets/plates with `extrude`, `cut_extrude`, `fillet`, `chamfer`, `hole(simple)`, `pattern`). Six modules ship under a new `convex/cad/` namespace: IR types + Zod schema, expression parser/evaluator, Tier-1 schema validator, Tier-3 geometry validator, Tier-4 manufacturing validator (one rule), build123d Python codegen, Vercel-Sandbox executor, content-addressed revisions, patch grammar (`set_parameter` + `add_feature`), and a `ProcessPlugin<CadIr>` that plugs into the existing repair loop. A specialist action wires the loop end-to-end, gated by `parts.useCadIr`.

Two prerequisites must be true before Phase 1 begins, and one of them is currently NOT met on `main`: the AI Harness Plans 1+2+3 (which provide `ProcessPlugin<TDsl>`, `Violation`, `runAgentRepairLoop`, `anthropicClient`, the orchestrator/tick state machine, and the `violations`/`escalations`/`planEvents` Convex tables) live on `feat/ai-harness-step-0-scaffold` and have not been merged to `main`. The phase-1 work itself is already complete on `feat/cad-ir-phase-1` (32 commits matching the 30 tasks). The planner must decide whether to (a) treat this phase as a merge-and-verify exercise, (b) replay the plan onto a fresh branch, or (c) cherry-pick + reconcile.

**Primary recommendation:** Treat the existing `feat/cad-ir-phase-1` branch as the source of truth for Phase 1 implementation. The plan should sequence: (1) confirm `feat/ai-harness-step-0-scaffold` is mergeable to `main` and merge it, (2) rebase `feat/cad-ir-phase-1` onto refreshed main, (3) run the full verification suite (Tasks 30 final-verification steps 1–4), (4) only re-implement task-by-task if the rebased branch fails verification. Pin `build123d==0.7.0` exactly as the plan says — newer versions (0.10.0 is current per PyPI) are out of scope and would invalidate the codegen contract.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CAD IR schema + types | API / Backend (Convex `convex/cad/ir/`) | — | IR is the agent's source of truth; lives next to mutations |
| Expression parser/evaluator | API / Backend (`convex/cad/expression/`) | — | Pure TS; no kernel access needed |
| Tier-1 schema validation | API / Backend (`convex/cad/validate/schemaTier.ts`) | — | Pure structural checks |
| Tier-4 manufacturing validation (1 rule) | API / Backend (`convex/cad/validate/manufacturingTier.ts`) | — | Reads ResolvedIR — pure |
| Tier-3 geometry validation | API / Backend (`convex/cad/validate/geometryTier.ts`) | Sandbox (consumes `exec.log` + `entities.json`) | Reads sandbox output, fires from TS |
| build123d Python codegen | API / Backend (`convex/cad/codegen/`) | — | Pure string emission, deterministic |
| Sandbox executor | API / Backend Node-runtime action (`convex/cad/executor/runSandbox.ts`) | Vercel Sandbox (Python runtime) | Convex action invokes external service |
| Patch grammar + applier | API / Backend (`convex/cad/patch/`) | — | Pure mutations of CadIr |
| `ProcessPlugin<CadIr>` registration | API / Backend (`convex/cad/plugin.ts`) | — | Bound by existing plugin contract |
| Specialist action / repair loop | API / Backend Node-runtime action (`convex/specialists/cadIr.ts`) | Anthropic API + Sandbox | Runs the agent repair loop |
| Revision storage | API / Backend (Convex tables `cad_revisions`, `cad_revision_artifacts`) | Convex `_storage` (binary artifacts) | Content-addressed by SHA-256 |
| `useCadIr` toggle | API / Backend (`convex/projects/projectMutations.ts`) | Frontend (calls mutation) | Per-part gating |
| `CadPreview` glb viewer | Frontend (Vite/React `src/components/CadPreview.tsx`) | — | three.js GLTFLoader |
| Per-feature dispatch in `tick.ts` | API / Backend (`convex/orchestrator/tick.ts`) | — | Routes `useCadIr=true` parts to `cadIr` specialist; falls through to `sheetMetal` otherwise |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
**From ADR-0001 (CAD IR Backbone is canonical):**
- `CadIr` is the agent's source of truth (replaces `PartDsl` for the rebuild surface).
- Geometry kernel: build123d (Python) running in Vercel Sandbox.
- Branch strategy: rebuild work goes on `feat/cad-ir-rebuild` off main; Slice 1 schema on main remains the live customer surface until cutover behind `useCadIr`.
- Retained from prior architecture: `ProcessPlugin<TDsl>` contract (here `TDsl = CadIr`), `runAgentRepairLoop`, two-tier validation loop, orchestrator state machine, Convex tables (`violations`, `escalations`, `planEvents`, `parts`).

### Claude's Discretion
All implementation choices not explicitly locked above are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use the detailed plan at `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped. Items the **plan itself** declares out of scope for Phase 1 (these belong to later phases, do NOT include in plan):
- More patch tools (`modify_feature`, `suppress`, `reorder`, sketch edits) → Phase 2
- Sketch constraint solver → Phase 2 / Phase 7
- Other manufacturing rules (full port of `lib/scsRules.ts`) → Phase 2
- Hole subtypes (countersink, counterbore, threaded), bend-flange, weld-tab → Phase 3
- Assembly graph + URDF/MJCF compilers → Phase 4
- FEA / cost / BOM compilers → Phases 5+ / 9–13
- Frontend revision/timeline UI → Phase 5
- Multi-revision branching → Phase 5
- DXF export (sheet-metal flat patterns; needs bend-flange) → Phase 3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CADIR-01 | The system has a `convex/cad` namespace with the CAD IR schema (parts, sketches, features, parameters), an evaluator, a validator, build123d codegen, a Vercel Sandbox executor, and a first repair loop. Patch tools `set_parameter` and `add_feature` are available. `ProcessPlugin` is specialized as `ProcessPlugin<CadIr>`. | The 30-task plan in `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` covers every clause: Tasks 1–7 (IR + expression + resolve), Task 6 (Tier-1 validator), Tasks 8–13 (codegen for 6 feature kinds), Tasks 14–15 (sandbox runner + executor), Task 16 (Tier-3 geometry validator), Task 17 (revision hashing), Task 18 (Convex tables), Tasks 19–21 (patch types/applier/Anthropic tools), Task 22 (system prompt), Task 23 (Tier-4 mfg rule), Task 24 (`cadIrPlugin: ProcessPlugin<CadIr>`), Task 25 (specialist action driving repair loop), Task 26 (`setUseCadIr` mutation), Task 27 (mock repair-loop convergence test), Task 28 (golden snapshot), Task 29 (`CadPreview` component), Task 30 (README). |
</phase_requirements>

## Existing-Asset Inventory (codebase reconnaissance)

The Phase-1 plan presumes that the AI Harness Plans 1+2+3 are merged to main. **They are not** at the time of this research. They live on `feat/ai-harness-step-0-scaffold` (40 commits ahead of main). The phase-1 plan itself has already been executed on `feat/cad-ir-phase-1` (32 commits ahead of `feat/ai-harness-step-0-scaffold`). The planner must decide its strategy based on this reality.

### Where the prerequisites currently live (branch: `feat/ai-harness-step-0-scaffold`)

| Asset | Path on the harness branch | Status on `main` |
|---|---|---|
| `ProcessPlugin<TDsl>` contract + `Violation` + `Rule` + `AgentTool` types | `artifacts/hardwareai/convex/plugins/types.ts` | **Missing** — directory `convex/plugins/` does not exist on main [VERIFIED: ls main] |
| Plugin registry (empty registry placeholder + `getPlugin`/`registeredKinds`) | `artifacts/hardwareai/convex/plugins/index.ts` | **Missing** |
| Sheet-metal plugin (`PartDsl` → `Dsl`/`DslSchema` re-export) | `artifacts/hardwareai/convex/plugins/sheet_metal/` | **Missing** |
| `runAgentRepairLoop` pure function | `artifacts/hardwareai/convex/specialists/runAgentRepairLoop.ts` (commit `8190c37`) | **Missing** — directory `convex/specialists/` does not exist on main |
| Anthropic client (`buildClientParams`, `parseClientResponse`, `runAgentTurn`) | `artifacts/hardwareai/convex/lib/anthropicClient.ts` (commit `1916118`) | **Missing** |
| `convex/orchestrator/tick.ts` (phase machine + planEvent dispatch) | `artifacts/hardwareai/convex/orchestrator/` (commits `f31b033`, `7135992`, `1382127`) | **Missing** |
| Convex tables `violations`, `escalations`, `planEvents`, `parts.useNewHarness` | `artifacts/hardwareai/convex/schema.ts` (commit `c94d68e`) | **Missing** these specific tables |
| `setUseNewHarness` mutation (template for `setUseCadIr`) | `artifacts/hardwareai/convex/projects/projectMutations.ts` (commit `7e47158`) | `convex/projects.ts` exists on main, but no `projects/` subdir |

### Where the Phase-1 work currently lives (branch: `feat/cad-ir-phase-1`)

The branch contains 32 commits implementing every task of the authoritative plan, including:
- All six feature emitters (`extrude`, `cut_extrude`, `fillet`, `chamfer`, `hole`, `pattern`)
- `cadIrPlugin: ProcessPlugin<CadIr>` (`commit a9432f3`)
- Specialist action `convex/specialists/cadIr.ts` + `cadIrInternals.ts` (commit `9c903d1`)
- `setUseCadIr` mutation (commit `367e876`)
- Mock repair-loop convergence test (commit `9af46d1`)
- Bracket golden snapshot (commit `8a1c662`)
- `CadPreview.tsx` (commit `ef89b8d`)
- Module README (commit `d46ca95`)

[VERIFIED: 31 cad-ir commits on top of the 38-commit harness base = 69 ahead of main]

### Implication for the planner

The plan should NOT replay tasks blindly when the implementation already exists on `feat/cad-ir-phase-1`. Three viable paths:

1. **Verify-then-merge (recommended).** Confirm `feat/ai-harness-step-0-scaffold` is green, merge it to main, rebase `feat/cad-ir-phase-1` onto refreshed main, run final verification (Task 30 steps 1–4), then merge to main as `feat/cad-ir-rebuild` (the umbrella rebuild branch per ADR-0001).
2. **Replay onto fresh branch.** Cut a new `feat/cad-ir-phase-1-replay` off main, replay tasks 1–30 to validate the plan still produces a green tree. Slow, redundant, but offers an independent verification.
3. **Cherry-pick + reconcile.** If `feat/ai-harness-step-0-scaffold` has drifted from current main, cherry-pick selectively. Highest risk; not recommended unless 1+2 fail.

The planner should pick (1) and only fall back to (2) or (3) if pre-merge verification fails.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^4.x` (zod/v4) | CAD IR schema + Anthropic tool input_schema runtime validation | Already canonical in this codebase per `convex/lib/dsl.ts` and `convex/plugins/types.ts` (`import type { ZodType } from "zod/v4"`) [VERIFIED: grep on harness branch] |
| `@vercel/sandbox` | latest at install time | Ephemeral Linux VM that runs the generated build123d Python | Plan locks this — Phase 1 has no fallback. Sandboxes start in milliseconds; default runtime `node24`; `python3.13` is also a first-class image [VERIFIED: vercel.com/docs/vercel-sandbox] |
| `build123d` (Python) | `==0.7.0` (pinned) | BREP CAD kernel for parametric geometry | Plan locks this exact version. Latest on PyPI is 0.10.0 but is OUT OF SCOPE for Phase 1 — newer API surface would invalidate the deterministic codegen contract and the golden snapshot [CITED: pypi.org/project/build123d] |
| `numpy` | `>=1.26` | build123d transitive dep + sandbox helper math | Plan-pinned alongside build123d |
| `@anthropic-ai/sdk` | already installed | Tool-call agent for the repair loop | Already integrated per plan §"Tech Stack" [CITED: plan line 14] |
| `vitest` | `^2.1.0` | All unit + integration tests | Already configured in `artifacts/hardwareai/vitest.config.ts` [VERIFIED: read vitest.config.ts] |
| `convex` | catalog version | Backend / mutations / actions / state | Existing infrastructure |
| `three` + `GLTFLoader` | already installed | `CadPreview.tsx` glb viewer | `@types/three` is in package.json devDependencies [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | builtin | SHA-256 for revision hashing | `convex/cad/revisions/hash.ts` (Task 17) |
| `node:fs/promises` + `node:path` + `node:url` | builtin | Read sandbox helpers from disk in `runSandbox.ts` | Node-runtime action only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `build123d` 0.7.0 | `build123d` 0.10.0 (current) | OUT OF SCOPE for this phase. The pinned version is locked by the plan + golden snapshot. Bumping should happen in a dedicated post-Phase-1 task with snapshot regeneration |
| `@vercel/sandbox` | local subprocess / Modal / Replicate | The plan locks Vercel Sandbox per ADR-0001. No alternative considered |
| Custom expression DSL | mathjs / expr-eval | The plan's tiny precedence-climbing parser (50 lines) has zero deps and matches the constrained grammar exactly (idents, +, -, *, /, parens, unary minus). External libs add deps for no functional gain |
| `Sandbox.create({ image: "python:3.11-slim" })` (per plan Task 15) | `Sandbox.create({ runtime: "python3.13" })` | The plan pins `python:3.11-slim` and a pip-install step. Vercel's first-class `python3.13` image would skip the install step but changes the test surface. Stay with the plan unless Task 15 verification fails |

**Installation commands the plan calls for:**

- Already done on `feat/cad-ir-phase-1` (commit `b407c60`): `pnpm add @vercel/sandbox` from `artifacts/hardwareai/`
- Python deps are pinned in `artifacts/hardwareai/scripts/sandbox/requirements.txt`:
  - `build123d==0.7.0`
  - `numpy>=1.26`
  - (Installed inside the sandbox VM, not on the host)

**Version verification (researcher-checked):**

| Package | Plan-pinned | Latest as of 2026-05-06 | Decision |
|---------|------------|-------------------------|----------|
| `build123d` (PyPI) | `0.7.0` | `0.10.0` [CITED: pypi.org/project/build123d] | Stay pinned at 0.7.0 — locked by the plan's deterministic golden snapshot |
| `@vercel/sandbox` (npm) | "latest at install" | n/a (plan does not pin) | Accept whatever version `pnpm add` resolved on `feat/cad-ir-phase-1`; planner should record the resolved version in Task 15 verification |
| `numpy` (PyPI) | `>=1.26` | n/a | Accept any 1.26+ |

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Frontend (Vite/React)                                                       │
│   Workspace UI → setUseCadIr(partId, true) → Convex mutation                 │
│   CadPreview ─── reads cad_revision_artifacts.glbStorageId ─→ <three.js>     │
└────────────────────────┬─────────────────────────────────────────────────────┘
                         │ Convex
                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  orchestrator/tick.ts (existing)                                             │
│   designPart action ── if (part.useCadIr) ──┐                                │
│                          else ──→ specialists.sheetMetal.run                 │
│                                              │                               │
│                                              ▼                               │
│  specialists/cadIr.ts (Node-runtime action)                                  │
│   ┌─ load head revision ──→ {ir, hash}                                       │
│   │                                                                          │
│   │  ┌─────────────── repair loop (≤ TURN_BUDGET=3 turns) ────────────────┐  │
│   │  │                                                                   │  │
│   │  │  cadIrPlugin.validate(ir)  ──→ Tier-1 schema + Tier-4 mfg         │  │
│   │  │       │                                                           │  │
│   │  │       │ violations.length === 0?                                  │  │
│   │  │       ▼                                                           │  │
│   │  │  resolveIr(ir) ──→ ResolvedIr   (params evaluated, refs concrete) │  │
│   │  │       │                                                           │  │
│   │  │       ▼                                                           │  │
│   │  │  compileToBuild123d(resolvedIr) ──→ Python script (string)        │  │
│   │  │       │                                                           │  │
│   │  │       ▼                                                           │  │
│   │  │  runSandbox(python) ─── @vercel/sandbox ─→ {step, stl, glb,       │  │
│   │  │       │                                    entities.json,         │  │
│   │  │       │                                    exec.log}              │  │
│   │  │       ▼                                                           │  │
│   │  │  validateGeometryTier(log + entities) ──→ Tier-3 violations       │  │
│   │  │       │                                                           │  │
│   │  │       │ if violations.length === 0  → write succeeded, return     │  │
│   │  │       │ else → continue loop                                      │  │
│   │  │       │                                                           │  │
│   │  │  runAgentTurn(prompt + tools[set_parameter, add_feature])         │  │
│   │  │       │                                                           │  │
│   │  │       ▼                                                           │  │
│   │  │  toolCallToPatch(toolCall) ──→ Patch                              │  │
│   │  │       │                                                           │  │
│   │  │       ▼                                                           │  │
│   │  │  applyPatch(ir, patch) ── Tier-1 schema gate ──→ ir' (or reject)  │  │
│   │  │       │                                                           │  │
│   │  │       ▼                                                           │  │
│   │  │  hashIr(ir') + write cad_revisions row (executionStatus=pending)  │  │
│   │  │       │                                                           │  │
│   │  │       └──── loop top ────                                         │  │
│   │  │                                                                   │  │
│   │  └─ TURN_BUDGET exhausted ──→ open escalation row (existing pattern) │  │
│   │                                                                      │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Vercel Sandbox (python:3.11-slim)                                           │
│   /in/script.py    ← writeFile from runSandbox                               │
│   /sandbox/build123d-runner.py + report_helpers.py                           │
│   pip install build123d==0.7.0 numpy                                         │
│   python /sandbox/build123d-runner.py                                        │
│   /out/{part.step, part.stl, preview.glb, entities.json, exec.log}           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (per plan §"File Structure")

```
artifacts/hardwareai/convex/cad/
├── ir/                         # Types, Zod schema, empty factory
│   ├── types.ts
│   ├── schema.ts
│   ├── empty.ts
│   └── __tests__/schema.test.ts
├── expression/                 # Pure parser + evaluator (DAG, cycles, bounds)
│   ├── parser.ts
│   ├── evaluator.ts
│   └── __tests__/{parser,evaluator}.test.ts
├── resolve/                    # CadIr → ResolvedIr (params concretized)
│   ├── resolveIr.ts
│   └── __tests__/resolveIr.test.ts
├── validate/                   # Tier 1 / 3 / 4 in Phase 1
│   ├── schemaTier.ts           # Tier 1 — refs, dups, forward refs
│   ├── manufacturingTier.ts    # Tier 4 — one rule (hole edge distance)
│   ├── geometryTier.ts         # Tier 3 — reads exec.log + entities.json
│   └── __tests__/...
├── codegen/                    # ResolvedIr → build123d Python (deterministic)
│   ├── compileToBuild123d.ts
│   ├── emitParameters.ts
│   ├── emitFeature.ts          # dispatch by feature kind
│   ├── features/{extrude,cutExtrude,fillet,chamfer,hole,pattern}.ts
│   └── __tests__/...
├── patch/                      # Patch types + applier + Anthropic tool defs
│   ├── types.ts
│   ├── apply.ts                # pure; Tier-1 gate
│   ├── tools.ts                # set_parameter, add_feature
│   └── __tests__/...
├── executor/                   # Node-runtime sandbox driver
│   ├── runSandbox.ts
│   ├── entitiesParser.ts
│   └── __tests__/entitiesParser.test.ts
├── revisions/
│   ├── hash.ts                 # canonicalize + sha256
│   └── __tests__/hash.test.ts
├── plugin.ts                   # cadIrPlugin: ProcessPlugin<CadIr>
├── prompts.ts                  # systemPromptFragment
├── plugin.test.ts
└── README.md

artifacts/hardwareai/convex/specialists/
├── cadIr.ts                    # Node-runtime action — drives repair loop
└── cadIrInternals.ts           # internalQuery / internalMutation split

artifacts/hardwareai/convex/projects/
└── projectMutations.ts         # MODIFY — add setUseCadIr alongside setUseNewHarness

artifacts/hardwareai/convex/orchestrator/
└── tick.ts                     # MODIFY — dispatch cadIr when part.useCadIr=true

artifacts/hardwareai/convex/schema.ts  # MODIFY — cad_revisions, cad_revision_artifacts;
                                       # parts.useCadIr, parts.headRevisionHash

artifacts/hardwareai/scripts/sandbox/
├── build123d-runner.py
├── report_helpers.py
└── requirements.txt

artifacts/hardwareai/src/components/
└── CadPreview.tsx
```

### Pattern 1: TDD per task (write failing test, then implement, then commit)

**What:** Every plan task follows a Step 1 (failing test) → Step 2 (impl) → Step 3 (commit) shape.
**When to use:** Every task except scaffold-only tasks (Tasks 18, 22, 26, 29, 30).
**Example (from plan Task 2 — schema):**
```ts
// Source: docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md lines 264–303
import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

describe("CadIrSchema", () => {
  it("accepts a minimal valid IR", () => { /* ... */ });
  it("rejects camelCase parameter ids", () => { /* expect snake_case error */ });
  it("rejects unknown feature kinds", () => { /* ... */ });
});
```

### Pattern 2: Pure-function core, side-effects at the edges

**What:** Validators, the resolver, codegen, the patch applier, and `hashIr` are all pure TS. Side-effecting code lives only in `runSandbox.ts` (Node-runtime) and the specialist action (Node-runtime).
**When to use:** All `convex/cad/` modules except `executor/runSandbox.ts` and `specialists/cadIr.ts`.
**Why it matters:** Pure cores are unit-testable without Convex test harness, without sandbox provisioning, and without Anthropic credentials. The plan's Task 27 mock repair loop relies on this purity to test convergence offline.

### Pattern 3: Two-tier validation gate on patch apply

**What:** `applyPatch` produces a candidate IR, then runs `validateSchemaTier` (Tier 1) on the candidate. If Tier 1 violations exist, the candidate is rejected and the original IR is returned with the violations attached. Geometry-tier (Tier 3) and manufacturing-tier (Tier 4) violations are surfaced AFTER apply, not during.
**When to use:** Every patch application — Tier-1 is the hard gate, Tiers 3/4 drive the agent repair loop.
**Code:** plan Task 20 (lines 2342–2364).

### Pattern 4: ProcessPlugin contract (carved over from sheet-metal)

**What:** `ProcessPlugin<TDsl>` defines `kind`, `dslSchema`, `tools`, `systemPromptFragment`, `defaultModel`, `rules`, `validate`, `autoRepair`, `renderPreview`, `export`, `estimateCost`, `supportedInterfaces`. The CAD IR plugin specializes `TDsl = CadIr`.
**When to use:** Single instance — `convex/cad/plugin.ts` exports `cadIrPlugin: ProcessPlugin<CadIr>`.
**Quirk to preserve:** Per plan Task 24, `cadIrPlugin.kind = "sheet_metal"` (not a new kind) so existing dispatch in `tick.ts` reaches the plugin. Phase-1 toggling between sheet-metal and CAD IR happens at the **specialist** level (`if (part.useCadIr)`), NOT the plugin level. This is intentional: it lets `useCadIr` flip part-by-part without inventing a new `PartKind`.

### Anti-Patterns to Avoid

- **Don't add new `PartKind` literals.** `PartKind` is the load-bearing union (`"sheet_metal" | "printed" | "purchased"`) — adding `"cad_ir"` would cascade through every existing validator. Phase 1 dispatches on `parts.useCadIr` (a boolean field), not a new kind.
- **Don't bump `build123d` past 0.7.0 in Phase 1.** The golden snapshot test in Task 28 locks the emitted Python; bumping versions invalidates the snapshot and cascades into geometry-tier failures.
- **Don't merge `feat/cad-ir-phase-1` to `main` directly.** Per ADR-0001 + STATE.md, the rebuild lives on `feat/cad-ir-rebuild` until Phase 19 cutover. `main` is the live customer surface.
- **Don't expand patch grammar.** Phase 1 ships exactly two tools: `set_parameter` and `add_feature`. Phase 2 (PATCH-01) brings the count to 9. Mixing scope here breaks the requirement traceability.
- **Don't rewrite `runAgentRepairLoop`.** The plan locks "the existing `runAgentRepairLoop` works unchanged — tier-aware violations flow through it transparently." Modifying it expands scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boolean operations + filleting + STEP/STL/glTF export | Custom geometry kernel | `build123d` (Open Cascade under the hood) | Boolean robustness, edge selection, mesh export are decade-long engineering problems |
| Ephemeral Python sandboxing | Spawning local Python from a Convex action | `@vercel/sandbox` | Convex actions can't safely run arbitrary Python; sandbox isolation is non-trivial; Vercel offers ms-startup VMs |
| Anthropic tool-call orchestration | Hand-craft message loops | Existing `runAgentTurn` from `convex/lib/anthropicClient.ts` | Already shipped, tested, supports tool_choice + tool_results |
| Repair-loop state machine | New control flow | Existing `runAgentRepairLoop` (specialist commit `8190c37`) | Carve-out from ADR-0001; budget enforcement, escalation surfacing, plan-event logging already there |
| Convex `Violation` / `Rule` types | Re-define | Existing `convex/plugins/types.ts` (commit `19ec526`) | Plugin contract is locked; `ProcessPlugin<CadIr>` must conform |
| Content-addressed revision storage | New collection structure | Plan's `cad_revisions` (`hash` + `parent`) — git-like DAG with patch as the edge | Pure structural reuse; allows replay/branching in later phases |
| glTF viewer in React | Custom WebGL | `three` + `GLTFLoader` (already in package.json) | Plan Task 29 |
| Expression parsing for parameters | mathjs / dynamic evaluation | The plan's 50-line precedence-climbing parser | Constrained grammar (no functions, no booleans), zero deps, deterministic, fits the IR's snake_case-ident requirement |

**Key insight:** Phase 1's job is composing five mature pieces (build123d, Vercel Sandbox, Anthropic SDK, the existing harness, three.js) into a coherent loop. It is not the job to invent any of them. Every "deceptively complex" component (BREP geometry, sandbox isolation, agent loops) has a battle-tested vendor.

## Runtime State Inventory

> Phase 1 is greenfield — adds new tables, no migration of existing rows. Recorded for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no existing CAD IR data on main. New tables `cad_revisions` and `cad_revision_artifacts` are net-new (Task 18). | None |
| Live service config | Convex deployment `dev:amiable-emu-84` is the dev target [CITED: plan Task 18 Step 3]. No external services configured for sandbox yet — `VERCEL_API_TOKEN` is required at task-15 runtime but is provisioned per-environment, not in repo. | Provision `VERCEL_API_TOKEN` in the Fabware Vercel project before Task 15 runs end-to-end (per plan Phase-0 prerequisite #5) |
| OS-registered state | None — Convex actions run inside Convex; sandbox VMs are provisioned per-call. | None |
| Secrets/env vars | `VERCEL_API_TOKEN` (sandbox), `ANTHROPIC_API_KEY` (already configured for Plans 1+2+3) | None — both are deployment-level config, no code rename impact |
| Build artifacts | None on main today. After Phase 1, `convex/_generated/` will gain entries for new tables; `pnpm-lock.yaml` will gain `@vercel/sandbox`. | Run the Convex dev push to regenerate `_generated/` (Task 18 Step 3) |

## Common Pitfalls

### Pitfall 1: Forgetting that `vitest.config.ts` excludes `convex/cad/**`

**What goes wrong:** Tests under `convex/cad/__tests__/` never run; the suite reports green but coverage is fictional.
**Why it happens:** Current `vitest.config.ts` `include` is `["convex/lib/**/*.test.ts", "convex/archetypes/**/*.test.ts", "src/**/*.test.{ts,tsx}"]` [VERIFIED: read vitest.config.ts]. The plan does not call out updating this glob.
**How to avoid:** Add `"convex/cad/**/*.test.ts"`, `"convex/specialists/**/*.test.ts"`, `"convex/plugins/**/*.test.ts"`, and `"convex/orchestrator/**/*.test.ts"` to the `include` array in Task 1 (or as a pre-flight task before Task 2). The harness branch already broadened this (commit `2df8afe`) — verify the broadened version lands when the harness branch merges.
**Warning signs:** The full-suite test run reports "0 tests in convex/cad/" or simply omits the directory.

### Pitfall 2: `@vercel/sandbox` API drift

**What goes wrong:** Plan Task 15 uses `Sandbox.create({ image: "python:3.11-slim", timeout: 60_000 })`, `sb.exec({ cmd: [...] })`, `sb.writeFile(path, content)`, `sb.readFile(path)`. The plan itself notes "Exact `@vercel/sandbox` API names may vary — check the SDK's current methods and adjust."
**Why it happens:** SDK methods evolved between training cutoff and execution; `image` may now be `runtime: "python3.13"`; method shapes may have changed.
**How to avoid:** During plan execution, fetch current `@vercel/sandbox` docs via Context7 (or the CLI fallback `npx --yes ctx7@latest docs @vercel/sandbox "writeFile readFile exec runtime"`) BEFORE writing `runSandbox.ts`. Adjust to current API. Cross-reference with the implementation already on `feat/cad-ir-phase-1` commit `4431c5b` — if it works there, replicate exactly.
**Warning signs:** TypeScript errors on `Sandbox.create`, `sb.writeFile`, `sb.readFile`, or argument shapes.

### Pitfall 3: `report_entities` writes implicit globals across feature emits

**What goes wrong:** Multiple feature emits all call `report_entities(feature_id, body)`, but `_ENTITIES` is module-global in `report_helpers.py`. If two features have the same id (caught by Tier-1) or if a feature reads `_ENTITIES` mid-execution, results are non-deterministic.
**Why it happens:** Plan Task 14's `report_helpers.py` keeps `_ENTITIES` at module scope intentionally (it survives across all emit calls), but it relies on Tier-1 enforcing unique feature ids.
**How to avoid:** Make sure Task 6 (Tier-1 schema validator) runs BEFORE codegen ever fires — the plan does this via `cadIrPlugin.validate` calling `validateSchemaTier` first and only running codegen when `t1.length === 0`. Don't move that gate.
**Warning signs:** entities.json has stale or missing entries; geometry-tier `entity-tag-missing` violations fire intermittently.

### Pitfall 4: `apply_pattern` cubically grows the part

**What goes wrong:** Plan Task 14's `apply_pattern` does `source_part.part = source_part.part + copy` in a loop. For a count of N, that's N union operations, and build123d unions are O(face_count^2). A pattern of 10+ on a complex base part is multi-second.
**Why it happens:** Phase-1 simplification — the plan accepts this cost ceiling for `count: 2..64`.
**How to avoid:** Phase 1 caps `count` at 64 in the Zod schema (plan Task 2). Don't lift the cap until Phase 2+ rewrites pattern with `LocationList` / build123d's native pattern primitives.
**Warning signs:** Sandbox timeout (60s) on patterns with high count.

### Pitfall 5: Convex Node-runtime actions can't import non-Node modules transitively

**What goes wrong:** `runSandbox.ts` declares the Node runtime; if it imports anything that imports a Convex query/mutation, the action fails to deploy.
**Why it happens:** Convex's two execution environments (V8 isolate vs. Node) cannot share modules transitively.
**How to avoid:** Keep `runSandbox.ts` and `convex/specialists/cadIr.ts` as pure Node — they import from `convex/cad/codegen/`, `convex/cad/resolve/`, `convex/cad/validate/`, `convex/cad/patch/`, all of which must remain pure TS (no Convex `query`/`mutation` imports). Plan Task 25 splits internals into `cadIrInternals.ts` (V8 queries/mutations) explicitly to dodge this.
**Warning signs:** Convex dev push reports "use node action references non-node module".

### Pitfall 6: Patch grammar accepts `oneOf` with no discriminator

**What goes wrong:** `add_feature.input_schema.feature` uses JSON Schema `oneOf` (plan Task 21 lines 2451+) without an explicit discriminator. Anthropic's tool-call validator MAY reject the `feature` field as ambiguous on some feature kinds.
**Why it happens:** JSON Schema `oneOf` works with the Anthropic SDK in practice (the `kind: { const: "extrude" }` etc. provide implicit discrimination), but pre-flight validation is sometimes strict.
**How to avoid:** If Anthropic rejects the tool definition, restructure to `anyOf` with the same `kind`-`const` discriminators, or hoist `kind` to a sibling property. The plan's existing tests (Task 21 Step 1) only check that all six kind strings appear in `JSON.stringify(input_schema)` — they don't test live API acceptance. Add a smoke test that round-trips through Anthropic if needed.
**Warning signs:** Anthropic SDK throws `invalid_input_schema` on `runAgentTurn`.

### Pitfall 7: `refOrLit` reverse-lookup is order-sensitive

**What goes wrong:** `refOrLit(value, ir)` (plan Task 8/9/10/12) does `for (const [name, val] of Object.entries(ir.resolvedParameters)) if (val === v) return name`. If two parameters resolve to the same number (e.g., `length=120` and `total=120`), it returns whichever appears first in `Object.entries` order.
**Why it happens:** The reverse-lookup is a heuristic to keep the emitted Python readable (using parameter names instead of literals). Tier-1 doesn't prohibit two parameters with the same value.
**How to avoid:** Acceptable for Phase 1 — the bracket golden snapshot (Task 28) catches regressions. If false matches show up in production, replace with explicit per-feature symbol-tracking during resolve (out of scope here).
**Warning signs:** Golden snapshot diff shows `length` where you expected a literal `120`, or vice versa, after refactoring.

## Code Examples

### Patch application (verified in plan Task 20)

```ts
// Source: docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md Task 20
import type { CadIr } from "../ir/types";
import type { Patch } from "./types";
import { validateSchemaTier } from "../validate/schemaTier";
import type { Violation } from "../../plugins/types";

export interface ApplyResult {
  ir: CadIr;
  schemaViolations: Violation[];
}

export function applyPatch(parent: CadIr, patch: Patch): ApplyResult {
  const candidate = applyToCandidate(parent, patch);
  const violations = validateSchemaTier(candidate);
  if (violations.length > 0) return { ir: parent, schemaViolations: violations };
  return { ir: candidate, schemaViolations: [] };
}

function applyToCandidate(parent: CadIr, patch: Patch): CadIr {
  switch (patch.kind) {
    case "set_parameter":
      return { ...parent, parameters: { ...parent.parameters, [patch.param.id]: patch.param } };
    case "add_feature":
      return { ...parent, features: [...parent.features, patch.feature] };
    default:
      throw new Error(`patch kind "${patch.kind}" not implemented in Phase 1`);
  }
}
```

### Tool-call → Patch mapping (plan Task 25)

```ts
// Source: docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md Task 25
function toolCallToPatch(tool: { name: string; input: Record<string, unknown> }): Patch | null {
  if (tool.name === "set_parameter") {
    return { kind: "set_parameter", param: tool.input as ParameterDef };
  }
  if (tool.name === "add_feature") {
    return { kind: "add_feature", feature: (tool.input as { feature: Feature }).feature };
  }
  return null;
}
```

### Repair-loop end-to-end (plan Task 25)

```ts
// Source: docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md Task 25
const TURN_BUDGET = 3;

for (let turn = 0; turn < TURN_BUDGET; turn++) {
  if (violations.length === 0) {
    const resolved = resolveIr(ir);
    const py = compileToBuild123d(resolved);
    const sandbox = await runSandbox(py);
    const geomViolations = validateGeometryTier({
      log: sandbox.artifacts.log,
      requestedFaceTags: extractRequestedFaceTags(ir),
      entities: sandbox.artifacts.entities,
    });
    if (geomViolations.length === 0) {
      // success — write succeeded revision, return
      return;
    }
    violations = geomViolations;
  }

  const response = await runAgentTurn({
    model: cadIrPlugin.defaultModel?.model ?? "claude-sonnet-4-6",
    effort: cadIrPlugin.defaultModel?.effort ?? "med",
    systemPrompt: cadIrPlugin.systemPromptFragment,
    tools: cadIrPlugin.tools,
    userMessage: buildRepairPrompt(ir, violations),
  });

  // apply each tool call as a patch, gated by Tier-1
  for (const tool of response.toolCalls ?? []) {
    const patch = toolCallToPatch(tool);
    if (!patch) continue;
    const result = applyPatch(ir, patch);
    if (result.schemaViolations.length === 0) ir = result.ir;
  }

  // re-validate at the loop top
  violations = cadIrPlugin.validate(ir, { scope: project?.scope ?? null, peerParts: [] });
}
```

### Sandbox executor wrapper (plan Task 15 — verify SDK shape at execution time)

```ts
// Source: docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md Task 15
"use node";
import { Sandbox } from "@vercel/sandbox";

export async function runSandbox(scriptPython: string): Promise<SandboxRunResult> {
  const sb = await Sandbox.create({ image: "python:3.11-slim", timeout: 60_000 });
  try {
    await sb.exec({ cmd: ["pip", "install", "build123d==0.7.0", "numpy"] });
    await sb.writeFile("/in/script.py", scriptPython);
    await sb.writeFile("/sandbox/build123d-runner.py", runnerPy);
    await sb.writeFile("/sandbox/report_helpers.py", helpersPy);
    const result = await sb.exec({ cmd: ["python", "/sandbox/build123d-runner.py"] });
    // ... readFile /out/* artifacts ...
  } finally {
    await sb.terminate();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PartDsl` as agent source of truth (sheet-metal direct emission) | `CadIr` (parametric, multi-feature, kernel-backed) | ADR-0001 LOCKED 2026-05-06 | Slice-1 / `PartDsl` stays live on `main` until Phase 19 cutover; `useCadIr` flag gates per-part |
| Six-archetype direct emission | Single CAD IR with feature timeline | ADR-0001 LOCKED 2026-05-06 | Archetypes will eventually emit IR rather than DSL, but Phase 1 only has to coexist |
| `partRevisions` table | `cad_revisions` (content-addressed by hash) | Plan Task 18 | git-like DAG enables replay, branching, audit; `partRevisions` is deprecated under ADR-0001 |
| In-process geometry (no real kernel) | build123d in Vercel Sandbox | ADR-0001 + plan §"Tech Stack" | Real BREP geometry, real STEP/STL/glTF export; first time the project has a real kernel |

**Deprecated/outdated (per ADR-0001 deprecations):**
- `PartDsl` as agent source of truth → replaced by `CadIr`
- Six-archetype direct emission pattern → replaced by IR + agent patches
- `partRevisions` table → replaced by `cad_revisions`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The current `feat/cad-ir-phase-1` branch matches the authoritative plan's intent (32 commits, one per task family). [ASSUMED based on commit-message inspection only — diff content not byte-verified against plan] | Existing-Asset Inventory | If branch drift exists, replay-on-fresh-branch path becomes mandatory; planner adds verification tasks |
| A2 | `feat/ai-harness-step-0-scaffold` is mergeable to current `main` without conflicts. [ASSUMED — not confirmed; STATE.md says "fix main's 7 failing tests" as a Phase-0 prerequisite] | Existing-Asset Inventory | Merge conflicts force a Phase-0-style triage task before Phase 1 can begin |
| A3 | The `@vercel/sandbox` SDK used in plan Task 15 still accepts `Sandbox.create({ image, timeout })`, `sb.writeFile`, `sb.readFile`, `sb.exec`. [CITED: vercel.com/docs/vercel-sandbox confirms SDK exists with `node24/node22/python3.13` runtimes, but the precise method shape was not byte-verified against the current SDK in this research session] | Pitfall 2 | Plan Task 15 needs a live Context7 / docs check at execution time; pitfall already flagged |
| A4 | `build123d==0.7.0` from PyPI installs successfully on `python:3.11-slim` with the listed numpy floor. [ASSUMED — common combination, not test-installed] | Standard Stack | If install fails, Task 15 has to switch base image or pin `numpy` exactly |
| A5 | Anthropic's tool-call validator accepts the `oneOf` discriminated `feature` schema in `add_feature.input_schema`. [ASSUMED — plan's tests are static, not live] | Pitfall 6 | Tool def has to be restructured if Anthropic rejects; fix is mechanical |
| A6 | The TS error baseline target ≤ 38 is current. [CITED: plan Task 30 Step 2] | Validation Architecture | If main's baseline shifted, threshold may need updating; trivially detectable |

## Open Questions

1. **Should Phase 1 land directly on `feat/cad-ir-rebuild` or stay on `feat/cad-ir-phase-1`?**
   - What we know: ADR-0001 says rebuild lives on `feat/cad-ir-rebuild`; STATE.md says "Cut `feat/cad-ir-rebuild` off `main` after confirming Phase-0 infra is stable"; the existing `feat/cad-ir-phase-1` was cut off `feat/ai-harness-step-0-scaffold`, not off main.
   - What's unclear: Whether the planner should rename/rebase `feat/cad-ir-phase-1` to land on `feat/cad-ir-rebuild`, or leave Phase-1 on its own branch and merge each phase branch into the rebuild branch in turn.
   - Recommendation: Cut `feat/cad-ir-rebuild` off main once `feat/ai-harness-step-0-scaffold` lands; rebase `feat/cad-ir-phase-1` onto it; merge into `feat/cad-ir-rebuild` only.

2. **What does "ProcessPlugin is registered" (CADIR-01 acceptance clause) mean operationally?**
   - What we know: Plan Task 24 says "Inspect the existing `convex/plugins/index.ts` and decide whether to add a registry entry or rely on specialist-level dispatch. This plan recommends specialist-level dispatch via `parts.useCadIr`".
   - What's unclear: Whether registration must add an entry to `convex/plugins/index.ts`'s `_register` map (so `getPlugin("sheet_metal")` returns the CAD IR plugin when feature-flagged), or just have `cadIrPlugin` exist and be dispatched directly from the specialist.
   - Recommendation: Follow the plan's recommendation — keep dispatch at the specialist level. Add a unit-test-only registry entry under a fenced kind like `"sheet_metal_cad_ir"` if registry presence is required by REQ-CADIR-01.

3. **Does the orchestrator's existing `runAgentRepairLoop` understand Tier-3 (geometry) violations?**
   - What we know: ADR-0001 carves "two-tier validation loop" out from the previous architecture; the existing repair loop fires on `Violation[]` from a plugin's `validate(dsl, ctx)`.
   - What's unclear: Whether geometry-tier violations from `validateGeometryTier` (which depend on sandbox output, not pure validation) flow through the existing loop, OR whether the CAD IR specialist (Task 25) runs its own micro-loop that calls the agent and bypasses `runAgentRepairLoop`.
   - Recommendation: Read plan Task 25 carefully — it explicitly implements its own loop (`for (let turn = 0; turn < TURN_BUDGET; turn++)`) calling `runAgentTurn` directly. The existing `runAgentRepairLoop` is NOT used inside the CAD IR specialist; the carve-out's text "the repair loop converges end-to-end" refers to this micro-loop, not the harness one. Plan-checker should NOT flag this as a deviation — it's intentional.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (host) | All TS/Convex code | ✓ | per `pnpm-workspace.yaml` catalog | — |
| pnpm | Monorepo install | ✓ (`pnpm-lock.yaml` present) | — | — |
| Convex CLI | Schema push (Task 18 Step 3) | Assumed via `@workspace/hardwareai/node_modules/.bin` | — | — |
| Convex dev deployment `dev:amiable-emu-84` | Schema push verification | ✗ Not verifiable from research environment | — | Plan Phase-0 prereq #4 — must be reachable |
| `VERCEL_API_TOKEN` env var | Sandbox executor (Task 15) | ✗ Not provisioned in this research session | — | Plan Phase-0 prereq #5 — provision in Fabware Vercel project before Task 15 e2e |
| `ANTHROPIC_API_KEY` env var | Specialist action live runs | Assumed (already in use by Plans 1+2+3) | — | — |
| Python 3.11 (sandbox-side) | build123d runtime | ✓ via `python:3.11-slim` Vercel Sandbox image | 3.11 | Could fall back to Vercel's `python3.13` runtime if 3.11-slim becomes unavailable; plan would need a `requirements.txt` recheck |
| `@vercel/sandbox` (npm) | Sandbox executor | ✓ already added to lockfile on `feat/cad-ir-phase-1` (commit `b407c60`) | resolved at install | — |
| `build123d==0.7.0` (PyPI) | Inside sandbox only | ✓ install via pip step inside `runSandbox.ts` | 0.7.0 | None — required exact pin |
| `three` + GLTFLoader | `CadPreview.tsx` | ✓ in package.json devDependencies (`@types/three: ^0.184.0`) | — | — |

**Missing dependencies with no fallback:**
- `VERCEL_API_TOKEN` provisioning — blocks the live e2e step (Task 30 Step 4) but does NOT block Tasks 1–29 or unit tests. Tasks 27 (mock repair loop) and 28 (golden snapshot) intentionally run without sandbox access.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

> Phase 1 is the first phase of the CAD IR rebuild. Validation depth here sets the precedent for all later phases.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest ^2.1.0` [VERIFIED: package.json] |
| Config file | `artifacts/hardwareai/vitest.config.ts` [VERIFIED: read] |
| Quick run command | From `artifacts/hardwareai/`: `npx vitest run <path>` |
| Full suite command | From `artifacts/hardwareai/`: `pnpm test --run` |
| Convex schema check | From `artifacts/hardwareai/`: `CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once` |
| TypeScript baseline | From `artifacts/hardwareai/`: `pnpm tsc --noEmit` then count `error TS` lines (target ≤ 38) |

**Pre-flight:** `vitest.config.ts` `include` glob currently excludes `convex/cad/**`. Wave 0 must broaden it to include `convex/cad/**`, `convex/specialists/**`, `convex/plugins/**`, `convex/orchestrator/**`. The harness branch already does this (commit `2df8afe` of `feat/ai-harness-step-0-scaffold`); confirm that change lands when the harness branch merges.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command (from `artifacts/hardwareai/`) | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CADIR-01 | A scoped CAD IR document validates and compiles to build123d | unit | `npx vitest run convex/cad/codegen/__tests__/compile-bracket-golden.test.ts` | ✅ Task 28 |
| CADIR-01 | Tier-1 schema rejects unresolved/duplicate/forward refs | unit | `npx vitest run convex/cad/validate/__tests__/schemaTier.test.ts` | ✅ Task 6 |
| CADIR-01 | Expression evaluator handles refs / cycles / bounds / division-by-zero | unit | `npx vitest run convex/cad/expression/__tests__/evaluator.test.ts` | ✅ Task 5 |
| CADIR-01 | resolveIr concretizes ParamRefs end-to-end | unit | `npx vitest run convex/cad/resolve/__tests__/resolveIr.test.ts` | ✅ Task 7 |
| CADIR-01 | Each of the six feature emitters produces expected build123d Python | unit | `npx vitest run convex/cad/codegen/__tests__/` (suite) | ✅ Tasks 8–13 |
| CADIR-01 | Tier-3 geometry validator surfaces fatal/feature/missing-tag errors | unit | `npx vitest run convex/cad/validate/__tests__/geometryTier.test.ts` | ✅ Task 16 |
| CADIR-01 | Revision hashing is deterministic and order-insensitive | unit | `npx vitest run convex/cad/revisions/__tests__/hash.test.ts` | ✅ Task 17 |
| CADIR-01 | applyPatch enforces Tier-1 gate; set_parameter and add_feature work | unit | `npx vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ Task 20 |
| CADIR-01 | Anthropic tools `set_parameter` and `add_feature` are exported with correct shape | unit | `npx vitest run convex/cad/patch/__tests__/tools.test.ts` | ✅ Task 21 |
| CADIR-01 | Tier-4 hole-edge-distance rule fires on near-edge holes; passes inside | unit | `npx vitest run convex/cad/validate/__tests__/manufacturingTier.test.ts` | ✅ Task 23 |
| CADIR-01 | `cadIrPlugin: ProcessPlugin<CadIr>` exposes the right tools and validate composition | unit | `npx vitest run convex/cad/__tests__/plugin.test.ts` | ✅ Task 24 |
| CADIR-01 | A synthetic violation drives the repair loop to convergence in ≤ 3 turns | integration (offline) | `npx vitest run convex/cad/__tests__/repair-loop-mock.test.ts` | ✅ Task 27 |
| CADIR-01 | Bracket golden snapshot is stable | snapshot | `npx vitest run convex/cad/codegen/__tests__/compile-bracket-golden.test.ts` | ✅ Task 28 |
| CADIR-01 | Vercel Sandbox executor produces STEP/STL/glb artifacts (live) | manual / env-gated | Plan Task 30 Step 4 — requires `VERCEL_API_TOKEN` | ⚠️ manual-only |
| CADIR-01 | Schema pushes cleanly to Convex with new tables | smoke | `CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once` | ✅ Task 18 Step 3 |

### Sampling Rate

- **Per task commit:** `npx vitest run <task-specific-test-path>` (per the plan's TDD pattern — each task has Step 1 = failing test, Step 3 = commit, so the command is implicit)
- **Per wave merge:** Full vitest suite green AND TS baseline ≤ 38 errors
- **Phase gate:** Full suite green (≥ 130 tests; ≥ 30 new), TS baseline ≤ 38, Convex dev push clean, optional live e2e if `VERCEL_API_TOKEN` set

### Wave 0 Gaps

- [ ] Confirm `feat/ai-harness-step-0-scaffold` is mergeable to main (or document the conflicts the planner needs to resolve before Phase 1 begins).
- [ ] If pre-existing `feat/cad-ir-phase-1` branch is the chosen execution path, add a verification task: rebase onto refreshed main, run full suite, and only re-implement tasks where the rebased tree fails. This is NOT in the original plan.
- [ ] Confirm `vitest.config.ts` `include` glob covers `convex/cad/**` (the harness branch broadens it; verify the broadened version lands).
- [ ] Provision `VERCEL_API_TOKEN` in the deployment environment before Task 15 live e2e (NOT before unit tests — those are sandbox-free).

## Project Constraints (from CLAUDE.md / AGENTS.md)

`/Users/grahampatterson/fabware/CLAUDE.md` does not exist [VERIFIED: Read returned ENOENT].

`/Users/grahampatterson/fabware/CONTEXT.md` exists and defines domain language [VERIFIED: read]. Relevant constraints for Phase 1:

- **Naming discipline:** "Part" is a single manufactured piece; "Feature" is a modification of a Part's DSL that doesn't change overall shape (hole, bend, slot, tab, fillet). The CAD IR's `Feature` union (`extrude`, `cut_extrude`, `fillet`, `chamfer`, `hole`, `pattern`) extends this — `extrude` is shape-changing, which differs from the sheet-metal-domain definition. Plan acknowledges this as the intentional widening of "feature" for the parametric IR.
- **Avoid term "interface" in fabware-domain code without context disambiguation.** Plan uses `supportedInterfaces: []` on `cadIrPlugin` — this is the fabware-Interface (part-to-part connection), not the architectural interface. Phase 1 supports zero of these (assemblies arrive in Phase 4).
- **`Pose`** is 6-DOF placement `{ x, y, z, rotX, rotY, rotZ }` with intrinsic Euler XYZ in radians; renderer permutes y↔z for three.js Y-up. Phase 1 does not yet emit Poses — single-part scope.

`/Users/grahampatterson/fabware/artifacts/hardwareai/AGENTS.md` exists. The planner should read it during Wave 0 if it surfaces additional constraints.

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` — 3375-line authoritative plan, all 30 tasks read [VERIFIED: full read]
- `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md` — canonical SPEC referenced by plan §"Spec" [VERIFIED: directory listing]
- `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md` — LOCKED ADR establishing CAD IR canonical [CITED via STATE.md]
- `.planning/phases/01-cad-ir-foundation/01-CONTEXT.md` — phase boundary + locked decisions [VERIFIED: read]
- `.planning/REQUIREMENTS.md` — CADIR-01 traceability [VERIFIED: read]
- `.planning/STATE.md` — branch strategy + Phase-0 active todos [VERIFIED: read]
- Branch `feat/ai-harness-step-0-scaffold` commit log + `convex/plugins/types.ts` content [VERIFIED: `git show` and `git log`]
- Branch `feat/cad-ir-phase-1` commit log + `convex/specialists/` tree [VERIFIED: `git ls-tree` and `git log`]

### Secondary (MEDIUM confidence)
- [Vercel Sandbox docs](https://vercel.com/docs/vercel-sandbox) — confirms `node24/node22/python3.13` runtimes, ms startup, max 5h Pro / 45m Hobby [WebSearch verified]
- [@vercel/sandbox npm](https://www.npmjs.com/package/@vercel/sandbox) — package exists [WebSearch]
- [build123d PyPI](https://pypi.org/project/build123d/) — current latest is 0.10.0 (plan pins 0.7.0) [WebSearch]
- [build123d GitHub releases](https://github.com/gumyr/build123d/releases) — release history [WebSearch]
- [build123d docs](https://build123d.readthedocs.io/) — API documentation root [WebSearch]

### Tertiary (LOW confidence)
- Exact `@vercel/sandbox` SDK method signatures (`Sandbox.create({ image })` vs `({ runtime })`, `sb.writeFile` arity, `sb.readFile` return shape) — plan acknowledges drift; pitfall 2 flags for runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is plan-pinned or already in package.json
- Architecture: HIGH — plan is canonical and 32 commits exist on `feat/cad-ir-phase-1` matching it
- Pitfalls: HIGH — surfaced via plan reading + branch reconnaissance
- Existing-asset inventory: HIGH for branches and commit hashes; MEDIUM for byte-level conformance to plan
- Vercel Sandbox SDK API: MEDIUM — surface exists, exact method shape needs runtime check

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable plan + LOCKED ADR; only `@vercel/sandbox` SDK drift could invalidate sooner)

## RESEARCH COMPLETE

**Phase:** 1 - CAD IR Foundation
**Confidence:** HIGH

### Key Findings
- The 30-task plan in `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` is the canonical, byte-detailed scope — every clause of CADIR-01 maps to specific tasks.
- Phase 1 has effectively been pre-implemented on `feat/cad-ir-phase-1` (32 commits matching tasks 1–30) and depends on `feat/ai-harness-step-0-scaffold` (40 commits) being merged to main first. Neither branch is on main today.
- The phase mixes pure-TS modules (codegen, validators, patch applier, hashing) with two Node-runtime Convex actions (sandbox executor + specialist) — strict separation must be preserved or the Convex dev push fails.
- `build123d` is plan-pinned to 0.7.0 (PyPI latest is 0.10.0); bumping is OUT OF SCOPE for Phase 1 because the bracket golden snapshot locks emitted Python.
- The CAD IR specialist runs its OWN micro-repair-loop and does NOT use the existing `runAgentRepairLoop` helper — the carve-out's "repair loop converges end-to-end" refers to the new specialist loop, not the harness function. Plan-checker must not flag this as a deviation.

### File Created
`/Users/grahampatterson/fabware/.planning/phases/01-cad-ir-foundation/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Plan-pinned versions; every dep already in package.json or sandbox requirements.txt |
| Architecture | HIGH | 30-task plan + already-executed branch corroborates structure |
| Pitfalls | HIGH | Surfaced from plan caveats + branch reconnaissance + vitest config inspection |
| `@vercel/sandbox` API | MEDIUM | SDK exists; exact method shape requires Context7/runtime verification before Task 15 |

### Open Questions
1. Should Phase 1 land on `feat/cad-ir-rebuild` (per ADR-0001) or stay on `feat/cad-ir-phase-1`? Recommend cutting `feat/cad-ir-rebuild` off main once harness branch lands and rebasing phase-1 onto it.
2. Plan Task 24 leaves "register in `convex/plugins/index.ts`" deliberately optional. Recommend specialist-level dispatch only, per the plan's recommendation.
3. Whether the `runAgentRepairLoop` function from the harness or the specialist's own micro-loop satisfies CADIR-01's "first repair loop" clause — both interpretations are consistent with the plan; follow Task 25 verbatim.

### Ready for Planning
Research complete. Planner should consume the 30 tasks of `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` directly as the basis for PLAN.md (mirror the file structure, the test-first cadence, and the commit-per-task discipline). The planner's first executable task is the Wave 0 verification: confirm `feat/ai-harness-step-0-scaffold` lands cleanly, then evaluate whether `feat/cad-ir-phase-1` rebases cleanly OR replay the 30 tasks on a fresh branch.
