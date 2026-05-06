# ADR-0001: CAD IR Backbone is the canonical architecture; supersedes AI Harness Design and Sheet-metal Assembly Design

**Date:** 2026-05-06
**Status:** Accepted
**Supersedes:** `docs/superpowers/specs/2026-04-25-ai-harness-design.md`, `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md` (in part — see Decision below)

## Context

Three SPEC documents in `docs/superpowers/specs/` describe overlapping architectural directions for Fabware's AI-driven design system:

1. `2026-04-24-sheet-metal-assembly-design.md` — "Slice 1" multi-part sheet-metal assembly with `PartDsl` as part data, six archetypes generating `{ parts, interfaces }` directly into the parts table.
2. `2026-04-25-ai-harness-design.md` — `ProcessPlugin<TDsl>` with `PartDsl` as the per-part data shape, two-tier validation loop, orchestrator state machine.
3. `2026-04-29-cad-ir-backbone-design.md` — Constraint-based parametric CAD Intermediate Representation as the single source of truth for every part and assembly. Agent emits typed patches against the IR; everything else is a compiler. `cad_revisions` / `cad_revision_artifacts` replace the parts-based snapshot model.

The CAD IR Backbone spec was authored 4 days after the AI Harness Design and 5 days after the Sheet-metal Assembly Design. It explicitly states it supersedes `PartDsl` as the AI harness's source of truth and §11 lays out the migration: AI Harness Plans 1+2+3 land first as reusable infra (Phase 0), then the CAD IR rebuild proceeds on `feat/cad-ir-rebuild` off main behind a `useCadIr` flag.

The synthesizer cannot auto-confirm this supersession because the CAD IR Backbone spec is `Status: Draft for review`, the older specs do not have `Superseded` markers, and there is no LOCKED ADR formalizing the architectural direction. This ADR fixes that.

## Decision

**The CAD IR Backbone (`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`) is the canonical architectural direction for Fabware going forward.**

The AI Harness Design and Sheet-metal Assembly Design are superseded **at the architectural-direction level**, with the following carve-outs preserved per CAD IR Backbone §11:

1. **Retained from AI Harness Design:**
   - The `ProcessPlugin<TDsl>` contract (with `TDsl` migrating from `PartDsl`-shaped to `CadIr`-shaped over time).
   - `runAgentRepairLoop` and the two-tier validation loop.
   - The orchestrator state machine and tool-call surface.
   - The Convex tables `violations`, `escalations`, `planEvents`, `parts`.

2. **Retained from Sheet-metal Assembly Design (Slice 1):**
   - The currently shipped `parts` + `interfaces` + archetype tables on `main` remain the live customer surface until the CAD IR rebuild reaches feature parity behind the `useCadIr` flag.
   - The tennis-ball-locker canonical end-to-end test continues to pass against the Slice 1 schema.
   - Frontend `AssembledView` / `Workspace` components are re-rendered against glTF preview when `useCadIr` is on; the underlying components are not rewritten.

3. **Deprecated and being phased out:**
   - `PartDsl` (sheet-metal-only flat schema) as the agent's source of truth.
   - The six-archetype direct-emission-into-parts-table pattern; `archetypes/` is repurposed as a template library that emits CAD IR seeds.
   - `partRevisions` as the project-level snapshot mechanism; replaced by `cad_revisions` / `cad_revision_artifacts`.

4. **Branch strategy** (per CAD IR Backbone §11):
   - `main` keeps Slice 1 / AI Harness Plans 1+2+3 as the live reality.
   - `feat/cad-ir-rebuild` (off main after Phase 0 completes) holds the 19 CAD IR phase plans.
   - Cutover to CAD IR happens behind `useCadIr` once Phase 19 ships and the canonical end-to-end tests pass against both schemas.

## Consequences

- Future ingests of planning docs will treat the CAD IR Backbone as the LOCKED architectural source; older specs contribute retained constraints (per §11) but lose decision authority on overlapping scope.
- The 19 CAD IR phase plans (`docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` through `2026-04-30-cad-ir-phase-19.md`) are the canonical execution plan stack for the rebuild.
- The earlier plan stack (`2026-04-25-ai-harness-step-0-scaffold.md`, `2026-04-26-ai-harness-step-1-sheet-metal-plugin.md`, `2026-04-26-ai-harness-step-1b-specialist-agent-repair-loop.md`, `2026-04-24-sheet-metal-assembly.md`) is treated as Phase-0 infrastructure that lands on main before the CAD IR rebuild branch is cut. They are not deleted; they remain executable until merged.
- `2026-04-25-multi-process-parts.md` is retained as a forward-looking SPEC that the CAD IR Backbone is designed to satisfy — no conflict, no carve-out needed.
- Roadmapper output (`.planning/ROADMAP.md`) will be organized around: (a) Phase-0 infra completion on main, then (b) CAD IR rebuild Phases 1–19 on the rebuild branch. Slice 1 schema stays live throughout (a) and (b).
