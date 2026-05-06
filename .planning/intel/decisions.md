# Decisions Intel

Synthesized from ADR sources in the ingest set. ADR > SPEC > PRD > DOC. LOCKED decisions cannot be auto-overridden.

---

## ADR-0001: CAD IR Backbone is the canonical architecture; supersedes AI Harness Design and Sheet-metal Assembly Design

- source: `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`
- status: Accepted
- locked: true
- date: 2026-05-06

### Decision Statement

The CAD IR Backbone (`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`) is the canonical architectural direction for Fabware going forward. The AI Harness Design and Sheet-metal Assembly Design are superseded at the architectural-direction level, with named carve-outs preserved.

### Scope

- CAD IR Backbone (canonical)
- AI Harness Design (superseded except retained carve-outs)
- Sheet-metal Assembly Design / Slice 1 (superseded except retained carve-outs)
- ProcessPlugin contract (retained, TDsl shape migrates to CadIr)
- PartDsl (deprecated as agent source of truth)
- cad_revisions / cad_revision_artifacts (replace partRevisions)
- useCadIr flag
- Branch strategy: `main` (Slice 1 + Phase-0 infra) and `feat/cad-ir-rebuild`
- Phase-0 infrastructure (AI Harness Plans 1+2+3, sheet-metal assembly plan) lands on main first
- Roadmap organization: Phase-0 infra on main → CAD IR rebuild Phases 1–19 on rebuild branch

### Retained from AI Harness Design

- `ProcessPlugin<TDsl>` contract; `TDsl` migrates from `PartDsl`-shaped to `CadIr`-shaped over time
- `runAgentRepairLoop` and the two-tier validation loop
- Orchestrator state machine and tool-call surface
- Convex tables: `violations`, `escalations`, `planEvents`, `parts`

### Retained from Sheet-metal Assembly Design (Slice 1)

- The shipped `parts` + `interfaces` + archetype tables on `main` remain the live customer surface until the CAD IR rebuild reaches parity behind `useCadIr`
- Tennis-ball-locker canonical end-to-end test continues to pass against the Slice 1 schema
- Frontend `AssembledView` / `Workspace` components are re-rendered against glTF preview when `useCadIr` is on; underlying components are not rewritten

### Deprecated / phasing out

- `PartDsl` (sheet-metal-only flat schema) as the agent source of truth
- Six-archetype direct-emission-into-parts-table pattern; `archetypes/` repurposed as a template library that emits CAD IR seeds
- `partRevisions` as the project-level snapshot mechanism; replaced by `cad_revisions` / `cad_revision_artifacts`

### Branch strategy (per CAD IR Backbone §11)

- `main` keeps Slice 1 / AI Harness Plans 1+2+3 as the live reality
- `feat/cad-ir-rebuild` (off main after Phase 0 completes) holds the 19 CAD IR phase plans
- Cutover to CAD IR happens behind `useCadIr` once Phase 19 ships and the canonical end-to-end tests pass against both schemas

### Consequences

- Future ingests of planning docs treat the CAD IR Backbone as the LOCKED architectural source; older specs contribute retained constraints but lose decision authority on overlapping scope.
- The 19 CAD IR phase plans (`2026-04-29-cad-ir-phase-1.md` through `2026-04-30-cad-ir-phase-19.md`) are the canonical execution plan stack for the rebuild.
- The earlier plan stack (`2026-04-25-ai-harness-step-0-scaffold.md`, `2026-04-26-ai-harness-step-1-sheet-metal-plugin.md`, `2026-04-26-ai-harness-step-1b-specialist-agent-repair-loop.md`, `2026-04-24-sheet-metal-assembly.md`) is treated as Phase-0 infrastructure that lands on main before the CAD IR rebuild branch is cut.
- `2026-04-25-multi-process-parts.md` is retained as a forward-looking SPEC that the CAD IR Backbone is designed to satisfy — no conflict.
- Roadmap organized around: (a) Phase-0 infra completion on main, then (b) CAD IR rebuild Phases 1–19 on the rebuild branch. Slice 1 schema stays live throughout (a) and (b).
