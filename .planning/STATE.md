# Fabware — Project State

## Project Reference

- **Core value:** Multi-part assembly platform driven by user intent. Users describe what they want; Fabware produces a buildable, multi-part, multi-process assembly via a constraint-based parametric CAD IR.
- **Headline success metric:** Tennis-ball-locker end-to-end passes (a) on the live Slice 1 schema today, and (b) behind `useCadIr` once Phase 19 ships.
- **Current milestone:** v1 — CAD IR Rebuild
- **Branch:** `feat/cad-ir-phase-19` (canonical consolidated branch — contains all 19 phases of implementation, ADR-0001, and `.planning/` bootstrap)

## Current Position

- **Phase:** All 19 phases shipped on this branch (174 commits ahead of `main`); GSD validation pending.
- **Progress:** [████████████████████] 19/19 phases implemented; 0/19 retroactively validated via `/gsd-validate-phase`.
- **Status:** Implementation complete, GSD ceremony incomplete. The phase branches `feat/cad-ir-phase-{1..18}` are the development history; this branch (phase-19) is the integrated tip and the merge candidate for `main`.

## Important: GSD State vs Codebase Reality

The CAD IR rebuild was implemented **before** `.planning/` was bootstrapped onto this project (ADR-0001 + ingest landed 2026-05-06; the implementation commits go back to 2026-04-29). The GSD framework was retrofitted onto already-shipped work. As a result:

- `.planning/phases/01-cad-ir-foundation/01-CONTEXT.md` exists, but no PLAN.md / VERIFICATION.md exists for any of the 19 phases.
- `.planning/ROADMAP.md` was generated from the original docs and reflects intended scope, not the as-shipped reality.
- The 76 phase-tagged commits on this branch (`feat(cad-ir): Phase N Task M ...` style) are the actual deliverables.

**To reconcile:** run `/gsd-validate-phase N` for each phase 1-19 in fresh sessions. That skill audits implemented code against ROADMAP success criteria and writes a VERIFICATION.md per phase. After all 19 are validated, the milestone can be audited (`/gsd-audit-milestone`) and completed (`/gsd-complete-milestone`).

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Phases implemented | 19/19 | 19/19 (this branch) |
| Phases GSD-validated | 19/19 | 0/19 (pending `/gsd-validate-phase`) |
| Tennis-ball-locker — Slice 1 | Passing | Passing on `main` |
| Tennis-ball-locker — CAD IR (`useCadIr=true`) | Passing | Pending Phase 19 cutover validation |
| Validation tiers wired | 5 | Implemented (verify via test run) |
| Compile targets wired (build123d, URDF, MJCF, BOM, cost) | 5 | Implemented (`compileToBuild123d.ts`, `compileToUrdf.ts`, `compileToMjcf.ts`, `compileBom`, `compileCost`) |
| Patch tools wired | 9+ | Implemented (verify count via `/gsd-validate-phase 2`) |

## Accumulated Context

### Locked Decisions

- **ADR-0001 (LOCKED, 2026-05-06):** CAD IR Backbone is the canonical architecture. AI Harness Design and Sheet-metal Assembly Design are superseded except for explicit carve-outs (Slice 1 stays live until parity; ProcessPlugin / runAgentRepairLoop / two-tier validation / orchestrator state machine / `violations`+`escalations`+`planEvents`+`parts` Convex tables retained; `AssembledView` / `Workspace` components reused). `PartDsl` as agent source of truth, the six-archetype direct-emission pattern, and `partRevisions` are deprecated.

### Branch Strategy

- `main`: Slice 1 + AI Harness Plans 1+2+3 — live customer surface, do not regress.
- `feat/cad-ir-phase-19`: this branch — consolidated CAD IR rebuild + ADR + `.planning/` bootstrap. Merge target for `main` once validation is done and Phase 19 cutover gate passes.
- `feat/cad-ir-phase-{1..18}`: development history; preserved as-is for traceability.
- Cutover: Phase 19, behind `useCadIr` flag, gated on canonical end-to-end tests passing on both schemas.

### Foundations / Already Shipped (predates this branch)

Sealed v0 milestone (PROJECT.md). Not re-executed in v1:
- AI Harness Plan 1 (`step-0-scaffold`) — shipped on `main`.
- AI Harness Plan 2 (`step-1-sheet-metal-plugin`) — shipped on `main`.
- AI Harness Plan 3 (`step-1b-specialist-agent-repair-loop`) — shipped on `main`.
- Sheet-metal Assembly Slice 1 — shipped on `main`, tennis-ball-locker passing.
- Multi-process-parts groundwork — partial; long-term satisfaction migrates onto CAD IR per ADR-0001.
- Iteration-plan utilities — Tier 1–5 complete, Tier 6 partial per `docs/roadmap/2026-04-27-iteration-plan.md`.

### Active Todos

1. **Per-phase validation (high priority):** run `/gsd-validate-phase N` for N in 1..19 in fresh sessions. Each session audits one phase's implementation against ROADMAP success criteria and writes VERIFICATION.md.
2. **Test run:** `pnpm install && pnpm test` (or workspace-specific) on this branch to confirm the integrated state is green before merging to `main`.
3. **Rebase prep:** when ready to merge, `git rebase main` from this branch to drop the duplicate cherry-picks (ADR/bootstrap originals are on `main` with their original hashes; cherry-picks have new hashes here).
4. **Milestone audit + complete:** after step 1 finishes, run `/gsd-audit-milestone` and `/gsd-complete-milestone v1.0`.

### Blockers

- **Validation gap:** GSD state model claims phases are "not started" but code shows otherwise. Resolved by step 1 above.

### Key References

- ADR: `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`
- Canonical SPEC: `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`
- Vision: `docs/roadmap/2026-04-24-platform-vision.md`
- Working tracker: `docs/roadmap/2026-04-27-iteration-plan.md`
- Phase plans: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` through `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`
- Implementation history: 76 commits tagged `feat(cad-ir): Phase N Task M ...` between branch root and `bcf9b21`.
- Repo conventions: `CONTEXT.md`, `artifacts/hardwareai/AGENTS.md`

## Session Continuity

- **Last session (2026-05-06):** Discovered that CAD IR rebuild Phases 1-19 were already implemented on stacked phase branches before `.planning/` was bootstrapped. Cherry-picked ADR-0001 + `.planning/` bootstrap + Phase 1 CONTEXT + config + checkpoint onto `feat/cad-ir-phase-19` (commits `7d064d8`, `9b40cb3`, `e0c2676`, `9357252`, `35cd090`). Deleted redundant `feat/cad-ir-rebuild`. STATE.md (this file) corrected to reflect codebase reality.
- **Next session:** Per-phase retroactive validation via `/gsd-validate-phase N` (start with Phase 1, work up to 19). Use `~/fabware-cad-ir-phase-19/` as the working tree.
- **Open questions:** None blocking. Phase 19 cutover criteria (behind `useCadIr`) require human validation of the canonical tennis-ball-locker test on both schemas.
