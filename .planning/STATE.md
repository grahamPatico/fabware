# Fabware — Project State

## Project Reference

- **Core value:** Multi-part assembly platform driven by user intent. Users describe what they want; Fabware produces a buildable, multi-part, multi-process assembly via a constraint-based parametric CAD IR.
- **Headline success metric:** Tennis-ball-locker end-to-end passes (a) on the live Slice 1 schema today, and (b) behind `useCadIr` once Phase 19 ships.
- **Current milestone:** v1 — CAD IR Rebuild (active)
- **Current focus:** Phase 1 — CAD IR Foundation, Executor, First Repair Loop
- **Branch:** `feat/cad-ir-rebuild` (cut off `main` after Phase-0 infra completion)

## Current Position

- **Phase:** 1 of 19 — CAD IR Foundation
- **Plan:** Not yet started (authoritative scope: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`)
- **Status:** Not started
- **Progress:** [░░░░░░░░░░░░░░░░░░░] 0/19 phases complete

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Phases complete | 19/19 | 0/19 |
| Tennis-ball-locker — Slice 1 | Passing | Passing (on `main`) |
| Tennis-ball-locker — CAD IR (`useCadIr=true`) | Passing | Not started |
| Validation tiers wired | 5 | 0 |
| Compile targets wired (build123d, URDF, MJCF, BOM, cost) | 5 | 0 |
| Patch tools wired | 9+ | 0 |

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

- Cut `feat/cad-ir-rebuild` off `main` after confirming Phase-0 infra is stable.
- Run `/gsd-plan-phase 1` to decompose Phase 1 into executable steps using `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` as the authoritative scope.

### Blockers

None.

### Key References

- ADR: `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`
- Canonical SPEC: `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`
- Vision: `docs/roadmap/2026-04-24-platform-vision.md`
- Working tracker: `docs/roadmap/2026-04-27-iteration-plan.md`
- Phase plans: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` through `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`
- Repo conventions: `CONTEXT.md`, `artifacts/hardwareai/AGENTS.md`

## Session Continuity

- **Last session:** Net-new project bootstrap. Ingest synthesis read; `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and this `.planning/STATE.md` were written. ADR-0001 carve-outs honored throughout.
- **Next session:** `/gsd-plan-phase 1` — produce the Phase 1 execution plan referencing `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`.
- **Open questions:** None. ADR-0001 is locked; Phase-by-phase scope is already authoritatively documented in `docs/superpowers/plans/`.
