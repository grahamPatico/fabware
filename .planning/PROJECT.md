# Fabware

> Multi-part assembly platform driven by user intent. Users describe what they want; the platform produces a buildable assembly with manufacturing-aware geometry, validated constraints, and per-part fabrication outputs.

## Core Value

Fabware turns a natural-language scope ("I want a tennis-ball rental locker") into a buildable, multi-part, multi-process assembly. The agent emits typed patches against a constraint-based parametric CAD IR; everything else (geometry, manufacturing rules, motion-sim, BOM, cost, fabrication exports) is a compiler over that IR.

## Headline Success Metric

**Tennis-ball-locker end-to-end** must pass on:
1. The live Slice 1 schema on `main` today (already passing).
2. The CAD IR rebuild behind the `useCadIr` flag once Phase 19 (final consolidation) ships and canonical end-to-end tests pass against both schemas.

The locker is the canonical demonstrator referenced in `docs/roadmap/2026-04-24-platform-vision.md` and `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md`. End-to-end means: scope wizard → generated multi-part sheet-metal assembly → user refinement → individual part DXF export.

## Target Runtime

TypeScript monorepo (pnpm workspace).

- **Backend:** Convex serverless + Express server (`artifacts/api-server`)
- **Frontend:** Vite + React + shadcn/ui (`artifacts/hardwareai`)
- **Database:** Postgres via Drizzle (`lib/db`)
- **API contracts:** OpenAPI source of truth (`lib/api-spec`); orval-generated zod (`lib/api-zod`) and React Query hooks (`lib/api-client-react`)
- **Geometry kernel (CAD IR rebuild):** build123d (Python) running inside Vercel Sandbox per ADR-0001
- **Agent surface:** Anthropic specialist via `runAgentRepairLoop`; tool calls translate to typed patches against the IR
- **3D rendering:** Three.js (`AssembledView.tsx`, `Workspace.tsx`); re-rendered against glTF preview when `useCadIr` is on

Repository conventions: see `CONTEXT.md` and `artifacts/hardwareai/AGENTS.md`.

## Decisions (LOCKED)

<decisions>

### ADR-0001: CAD IR Backbone is the canonical architecture (LOCKED, 2026-05-06)

**Source:** `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`

**Statement:** The CAD IR Backbone (`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`) is the canonical architectural direction for Fabware. The AI Harness Design and Sheet-metal Assembly Design are superseded at the architectural-direction level, with explicit carve-outs preserved.

**Carve-outs retained from Sheet-metal Assembly Slice 1:**
- The shipped `parts` + `interfaces` + `projects` + archetype tables on `main` remain the live customer surface until the CAD IR rebuild reaches parity behind `useCadIr`.
- Tennis-ball-locker canonical end-to-end test continues to pass against the Slice 1 schema.
- Frontend `AssembledView` / `Workspace` components are reused; re-rendered against glTF preview when `useCadIr` is on.

**Carve-outs retained from AI Harness Design:**
- `ProcessPlugin<TDsl>` contract (TDsl migrates from `PartDsl`-shaped to `CadIr`-shaped over time).
- `runAgentRepairLoop` and the two-tier validation loop.
- Orchestrator state machine and tool-call surface.
- Convex tables: `violations`, `escalations`, `planEvents`, `parts`.

**Deprecated:**
- `PartDsl` as the agent source of truth.
- The six-archetype direct-emission-into-parts-table pattern. `archetypes/` is repurposed as a template library that emits CAD IR seeds.
- `partRevisions` as the project-level snapshot mechanism — replaced by `cad_revisions` / `cad_revision_artifacts`.

**Branch strategy:**
- `main` keeps Slice 1 + AI Harness Plans 1+2+3 as the live reality.
- `feat/cad-ir-rebuild` (off main after Phase-0 completes) holds the 19 CAD IR phase plans.
- Cutover to CAD IR is gated behind `useCadIr` once Phase 19 ships and the canonical end-to-end tests pass against both schemas.

</decisions>

## Foundations / Already Shipped (Sealed v0 Milestone)

The following work landed on `main` ahead of the CAD IR rebuild and is treated as Phase-0 infrastructure. It is **not** a roadmap phase — it is the substrate the rebuild branches off of. Status drawn from `docs/roadmap/2026-04-27-iteration-plan.md` (Tier 1–5 complete, Tier 6 partial).

- **AI Harness Plan 1** (`step-0-scaffold`): plugin contract types, three Convex tables (`violations`, `escalations`, `planEvents`), two project fields, no-op orchestrator tick — shipped.
- **AI Harness Plan 2** (`step-1-sheet-metal-plugin`): first sheet-metal `ProcessPlugin`, validator wired into orchestrator tick, end-to-end fixture, `parts.status` schema field — shipped.
- **AI Harness Plan 3** (`step-1b-specialist-agent-repair-loop`): `runAgentRepairLoop`, violations batching, `answerEscalation` mutation, `anthropicClient` helper — shipped.
- **Sheet-metal Assembly Slice 1**: `parts` + `interfaces` tables, six starter archetypes, agent tool loop (`capture_scope`, `select_archetype`, `refine_part`, `break_out`, `decompose_freeform`), Three.js assembled preview, per-part DXF export, tennis-ball-locker passing — shipped.
- **Multi-Process Parts groundwork**: `kind` discriminator, per-kind DSL stubs, multi-process surfaces — partial; long-term satisfaction migrates onto the CAD IR Backbone (ADR-0001 explicitly notes the IR is designed to satisfy this SPEC).
- **Iteration-plan utilities** (`bendSim.ts`, `dxf.ts`, `pdf.ts`, `bom.ts`, `obj.ts`, `weight.ts`, `cost.ts`, `transform3d.ts`, `intersect.ts`, `positions.ts`) — Tier 1–5 complete, Tier 6 partial.

## v1 Scope: CAD IR Rebuild (active milestone)

The 19 CAD IR phase plans (`2026-04-29-cad-ir-phase-1.md` through `2026-04-30-cad-ir-phase-19.md`) constitute the v1 milestone, executed on `feat/cad-ir-rebuild`. Each phase plan in `docs/superpowers/plans/` is the authoritative scope-per-phase document; the roadmap mirrors that structure 1:1 so `/gsd-plan-phase N` resolves to the existing plan file.

The Slice 1 schema on `main` stays live throughout. Cutover happens at Phase 19 behind `useCadIr`.

## Out of Scope (v2+)

- Full McMaster-Carr live catalog integration (beyond the smoke-test STEP imports in Phase 18).
- Tier-aware behavior beyond MVP (jerry-rigged / commercial tiers from the platform vision are deferred).
- Multi-tenant accounts, billing, organizations.
- Operational SCS catalog refresh (covered by `docs/SCS-SCRAPE.md` runbook; recurring engineering, not a v1 deliverable).

## Constraints Summary

- **Geometry kernel:** build123d (Python) inside Vercel Sandbox is the only sanctioned executor for CAD IR.
- **Storage:** `cad_revisions` and `cad_revision_artifacts` Convex tables replace `partRevisions`.
- **Validation:** Five tiers (schema, constraint/DOF, manufacturing, geometry, assembly) gate every patch.
- **Compile targets:** build123d Python (geometry), URDF (motion-sim), MJCF (motion-sim alternate), BOM, cost.
- **Agent surface:** Typed patches via `applyPatch`; tool definitions registered with the Anthropic specialist; specialization is `ProcessPlugin<CadIr>`.
- **Repo layout:** Per `CONTEXT.md` / `artifacts/hardwareai/AGENTS.md`. OpenAPI is the source of truth; zod and React Query hooks are generated.

## References

- `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md` (ADR-0001, LOCKED)
- `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md` (canonical SPEC)
- `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md` (Slice 1, retained carve-outs)
- `docs/superpowers/specs/2026-04-25-ai-harness-design.md` (retained carve-outs)
- `docs/superpowers/plans/2026-04-25-multi-process-parts.md` (forward-looking SPEC)
- `docs/roadmap/2026-04-24-platform-vision.md`
- `docs/roadmap/2026-04-27-iteration-plan.md`
- CAD IR phase plans: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md` through `2026-04-30-cad-ir-phase-19.md`
