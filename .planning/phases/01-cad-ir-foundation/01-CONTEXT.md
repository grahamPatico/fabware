# Phase 1: CAD IR Foundation - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A scoped CAD IR document round-trips through schema, validator, build123d codegen, and Vercel Sandbox executor; the agent can apply the first two patch tools (`set_parameter`, `add_feature`) and the repair loop converges end-to-end.

**Success criteria (from ROADMAP):**

1. A CAD IR document with parts, sketches, features, and parameters validates and compiles to build123d Python.
2. The Vercel Sandbox executor runs the generated build123d and returns geometry artifacts.
3. The agent can apply `set_parameter` and `add_feature` patches via tool calls; `ProcessPlugin<CadIr>` is registered.
4. A synthetic violation drives `runAgentRepairLoop` to convergence end-to-end.

**Authoritative scope source:** `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` (referenced by ROADMAP). The planner should consume that file as the detailed scope-per-phase document.

</domain>

<decisions>
## Implementation Decisions

### Locked from ADR-0001 (CAD IR Backbone is canonical)
- `CadIr` is the agent's source of truth (replaces `PartDsl` for the rebuild surface).
- Geometry kernel: build123d (Python) running in Vercel Sandbox.
- Branch strategy: rebuild work goes on `feat/cad-ir-rebuild` off main; Slice 1 schema on main remains the live customer surface until cutover behind `useCadIr`.
- Retained from prior architecture: `ProcessPlugin<TDsl>` contract (here `TDsl = CadIr`), `runAgentRepairLoop`, two-tier validation loop, orchestrator state machine, Convex tables (`violations`, `escalations`, `planEvents`, `parts`).

### Claude's Discretion
All implementation choices not explicitly locked above are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use the detailed plan at `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context to be gathered during plan-phase research. Key existing assets the planner should expect to find and reuse per ADR-0001 carve-outs:

- AI Harness Plans 1+2+3 already shipped on main (per `docs/roadmap/2026-04-27-iteration-plan.md` Tier 1–5).
- `ProcessPlugin<TDsl>` contract exists (currently with `TDsl = PartDsl`).
- `runAgentRepairLoop` exists in the AI harness.
- Convex tables `violations` / `escalations` / `planEvents` / `parts` exist.
- TS monorepo (pnpm), Convex backend, Express + Vite + React + shadcn/ui frontend.
- Repo layout per `CONTEXT.md` and `artifacts/hardwareai/AGENTS.md`.

</code_context>

<specifics>
## Specific Ideas

The detailed plan file `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` is the primary scope reference. Planner should ingest it whole and mirror its structure as the basis for the executable PLAN.md.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
