# Fabware — Project State

## Project Reference

- **Core value:** Multi-part assembly platform driven by user intent. Users describe what they want; Fabware produces a buildable, multi-part, multi-process assembly via a constraint-based parametric CAD IR.
- **Headline success metric:** Tennis-ball-locker end-to-end passes (a) on the live Slice 1 schema today, and (b) behind `useCadIr` once Phase 19 ships.
- **Current milestone:** v1 — CAD IR Rebuild (verified 2026-05-07; ready to merge)
- **Current focus:** Branch reconciliation — merge `feat/cad-ir-phase-19` (or its scaffold-based stack) into `main` behind the `useCadIr` flag.
- **Branches in play:** `feat/cad-ir-phase-1` … `feat/cad-ir-phase-19` form a clean linear stack on `feat/ai-harness-step-0-scaffold` (38 commits ahead of `main`, 75 behind). `feat/cad-ir-rebuild` was never cut; the implementation shipped on the per-phase branches instead.

## Current Position

- **Phase:** 19 of 19 — Final Consolidation + Cutover (implementation present on branch tip, retroactively documented).
- **Plan:** All 19 authoritative plan files in `docs/superpowers/plans/2026-04-29..2026-04-30-cad-ir-phase-N.md` were executed pre-milestone. `.planning/phases/NN-*/NN-SUMMARY.md` and `NN-VALIDATION.md` document each retroactively.
- **Status:** Verified docs-only on 2026-05-07. Typecheck PASS on every phase tip (0 new errors introduced; 15 pre-existing baseline errors live in non-CAD code on `main`).
- **Progress:** [████████████████████] 19/19 phases complete

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Phases complete | 19/19 | 19/19 ✅ |
| Typecheck — new errors per phase | 0 | 0 across all 19 phases ✅ |
| Tennis-ball-locker — Slice 1 | Passing | Passing (on `main`) |
| Tennis-ball-locker — CAD IR (`useCadIr=true`) | Passing | Implementation on `feat/cad-ir-phase-19`; runtime gating still owed by branch reconciliation |
| Validation tiers wired | 5 | 5 (Tier 1 schema, 2 sketch DOF, 3 geometry, 4 manufacturing, 5 assembly) |
| Compile targets wired (build123d, URDF, MJCF, BOM, cost) | 5 | 5 |
| Patch tools wired | 9+ | 9+ |

## Accumulated Context

### Locked Decisions

- **ADR-0001 (LOCKED, 2026-05-06):** CAD IR Backbone is the canonical architecture. AI Harness Design and Sheet-metal Assembly Design are superseded except for explicit carve-outs (Slice 1 stays live until parity; ProcessPlugin / runAgentRepairLoop / two-tier validation / orchestrator state machine / `violations`+`escalations`+`planEvents`+`parts` Convex tables retained; `AssembledView` / `Workspace` components reused). `PartDsl` as agent source of truth, the six-archetype direct-emission pattern, and `partRevisions` are deprecated.

### Branch Strategy

- `main`: Slice 1 + AI Harness Plans 1+2+3 — live customer surface, do not regress.
- `feat/cad-ir-rebuild`: 19 CAD IR phase plans, off `main` after Phase-0 infra completes.
- Cutover: Phase 19, behind `useCadIr` flag, gated on canonical end-to-end tests passing on both schemas.

### Foundations / Already Shipped

Sealed v0 milestone (PROJECT.md). Not re-executed in v1:
- AI Harness Plan 1 (`step-0-scaffold`) — shipped.
- AI Harness Plan 2 (`step-1-sheet-metal-plugin`) — shipped.
- AI Harness Plan 3 (`step-1b-specialist-agent-repair-loop`) — shipped.
- Sheet-metal Assembly Slice 1 — shipped, tennis-ball-locker passing.
- Multi-process-parts groundwork — partial; long-term satisfaction migrates onto CAD IR per ADR-0001.
- Iteration-plan utilities — Tier 1–5 complete, Tier 6 partial per `docs/roadmap/2026-04-27-iteration-plan.md`.

### Active Todos

- Reconcile the `feat/cad-ir-phase-1..19` stack with `main` (75 commits of divergence). Per ADR-0001, the cutover lands behind `useCadIr`. Open question: rebase the stack onto current `main` vs. cut a fresh `feat/cad-ir-rebuild` and replay merges.
- Address the 15 pre-existing typecheck errors on `main` (non-CAD: `convex/chat.ts`, `convex/projectChat.ts`, `convex/partSpecs.ts`, `convex/lib/partValidator.ts`, and several `artifacts/hardwareai/src/` components) — orthogonal to CAD IR but currently blocking a globally-green build.
- Run integration smoke (tennis-ball-locker behind `useCadIr=true`) end-to-end on the merged branch before promoting to main.

### Blockers

None blocking the milestone artifact set. Branch reconciliation with main is the open work item, not a blocker on the milestone deliverable.

### Key References

- ADR: `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`
- Canonical SPEC: `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`
- Vision: `docs/roadmap/2026-04-24-platform-vision.md`
- Working tracker: `docs/roadmap/2026-04-27-iteration-plan.md`
- Phase plans: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` through `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`
- Repo conventions: `CONTEXT.md`, `artifacts/hardwareai/AGENTS.md`

## Session Continuity

- **Last session (2026-05-07):** Verify-and-merge mode. Discovered all 19 phases shipped on `feat/cad-ir-phase-N` branches before `.planning/` existed. Typecheck-verified every phase tip (0 new errors per phase). Generated retroactive `NN-SUMMARY.md` + `NN-VALIDATION.md` for all 19 phases. STATE.md and ROADMAP.md updated to reflect actual status. `01-RESEARCH.md` produced as part of the initial Phase 1 dispatch and retained as reference.
- **Next session:** Branch reconciliation — decide rebase-vs-merge strategy for the `feat/cad-ir-phase-19` stack against current `main`, then ship behind `useCadIr`.
- **Open questions:** Branch reconciliation strategy. ADR-0001 is locked; phase-by-phase scope is authoritatively documented in `docs/superpowers/plans/` and now in `.planning/phases/`.
