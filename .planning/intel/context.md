# Context Intel

Topic-keyed running notes from DOC-typed sources. Each entry is verbatim or near-verbatim summary with full source attribution.

---

## Topic: Platform Vision

source: `docs/roadmap/2026-04-24-platform-vision.md`

Fabware is shifting from a single-part sheet-metal designer to a multi-part assembly platform driven by user intent. Status: "Roadmap — not yet scoped for implementation" (as of 2026-04-24). The vision decomposes into 16 subsystems with tier-aware behavior (jerry-rigged / MVP / commercial). First slice: sheet-metal assembly. Architectural commitment "B leads to C" is documented in the roadmap. Tennis-ball rental locker is the canonical demonstrator.

Note: this DOC contains some embedded ADR-shaped decisions ("Decided 2026-04-24") that the synthesizer surfaces here for traceability. ADR-0001 (later, locked) supersedes architectural-direction decisions on overlapping scope.

## Topic: Iteration Plan (working tracker)

source: `docs/roadmap/2026-04-27-iteration-plan.md`

Working iteration tracker for fabware/hardwareai progress: tiered chunks across correctness, manufacturing realism, visual fidelity, validators, outputs (DXF/PDF/BOM/OBJ), studio UI, agent assembly designer, and Convex backend. Mentions `convex/lib/bendSim.ts`, `dxf.ts`, `pdf.ts`, `bom.ts`, `obj.ts`, `weight.ts`, `cost.ts`, `transform3d.ts`, `intersect.ts`, `positions.ts`. Per ADR-0001, the work tracked here lands as Phase-0 infrastructure on `main` before the CAD IR rebuild branch is cut.

## Topic: Coordinate Frames

source: `docs/conventions/coordinate-frames.md`

Convention doc explaining the data frame vs Three.js renderer frame, the Y/Z permutation in the renderer, Euler XYZ rotation order, and authoring recipes for archetype writers. References `AssembledView.tsx`, `convex/lib/intersect.ts`, `convex/lib/positions.ts`, `_audit:auditAllArchetypes`. Consumed by archetype authors and SAT collision-check writers.

## Topic: SCS Catalog Refresh Runbook

source: `docs/SCS-SCRAPE.md`

Operational runbook for refreshing Fabware's SendCutSend materials catalog quarterly via `scripts/scrape-scs.ts`, producing `artifacts/api-server/data/scs-catalog.json`, with a manual review step before merging into `artifacts/api-server/src/lib/scsRules.ts`.

## Topic: Fabware Plan (2026-04-23)

source: `docs/PLAN.md`

Iteration plan for rebranding Hardware-Genesis to Fabware and adding McMaster-Carr assembly-parts support. Inherited components: Part DSL, SCS rules engine, DXF generator, AI designer agent. New scope: assembly_parts schema, AssemblyPartsPanel UI, OpenAPI/zod/React Query monorepo layout, GitHub org transfer. Pre-dates the CAD IR direction; used as historical context.

## Topic: AI Harness — Step 0 Scaffold (Plan 1)

source: `docs/superpowers/plans/2026-04-25-ai-harness-step-0-scaffold.md`

Implementation runbook for scaffolding the AI harness plugin contract types, three Convex tables (`violations`, `escalations`, `planEvents`), two project fields, and a no-op orchestrator tick action. References `artifacts/hardwareai/convex/...` paths. Per ADR-0001: lands as Phase-0 infra on main.

## Topic: AI Harness — Step 1 Sheet-Metal Plugin (Plan 2)

source: `docs/superpowers/plans/2026-04-26-ai-harness-step-1-sheet-metal-plugin.md`

13-task implementation plan to land Plan-1 handoff fixes, build the first sheet-metal ProcessPlugin, wire its validator into the orchestrator tick, and prove an end-to-end fixture. Schema additions: `parts.status`, `planEvents`. Per ADR-0001: lands as Phase-0 infra on main.

## Topic: AI Harness — Step 1b Specialist Agent Repair Loop (Plan 3)

source: `docs/superpowers/plans/2026-04-26-ai-harness-step-1b-specialist-agent-repair-loop.md`

Task-by-task plan adding an Anthropic-driven repair loop to the sheet-metal specialist plus three Plan-2 prereq fixes. Adds `runAgentRepairLoop`, violations batching, `answerEscalation` mutation, `anthropicClient` helper. Per ADR-0001: lands as Phase-0 infra on main; the repair-loop pattern itself is retained under the AI Harness carve-outs.

## Topic: Sheet-metal Assembly Implementation Plan

source: `docs/superpowers/plans/2026-04-24-sheet-metal-assembly.md`

Phased implementation plan to extend Fabware from single-part to multi-part sheet-metal assemblies with archetypes, typed interfaces, and assembled preview. References the canonical Slice 1 SPEC. Per ADR-0001: this plan stays executable as Phase-0 infra on main; not deleted.

## Topic: CAD IR Phase 1 — Foundation, Executor, First Repair Loop

source: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`

Implementation plan for Phase 1 of the CAD IR foundation: `convex/cad` namespace, schema, evaluator, validator, build123d codegen, sandbox executor, first repair loop integration. Patch tools introduced: `set_parameter`, `add_feature`. ProcessPlugin specialized as `ProcessPlugin<CadIr>`. First plan in the canonical CAD IR rebuild execution stack.

## Topic: CAD IR Phase 2 — Patch Grammar Expansion + Sketch Primitives

source: `docs/superpowers/plans/2026-04-29-cad-ir-phase-2.md`

Expands patch grammar from 2 to 9 tools, ports additional manufacturing rules (incl. min-wall-thickness), adds sketch primitives. Repair-loop test added.

## Topic: CAD IR Phase 3 — Hardware-spec hole types + bolt clearance

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-3.md`

Extends `HoleFeature` with countersink/counterbore/threaded subtypes; adds bolt-clearance manufacturing rule; updates Zod schemas, build123d codegen, Anthropic tool schema, system prompt, and manufacturingTier validator.

## Topic: CAD IR Phase 4 — Assembly graph + joints + URDF compiler

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-4.md`

Extends CAD IR from single-part to multi-part with parts/joints/connections; introduces Tier 5 assembly validation; adds URDF compiler; new patch types and Anthropic tool defs.

## Topic: CAD IR Phase 5 — Round-out features + multi-part codegen

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-5.md`

Adds revolve/shell/bend_flange features and multi-part build123d codegen (`compileAssembly`); adds min-bend-radius validation rule; assembly graph integration.

## Topic: CAD IR Phase 6 — Sweep/loft/weld_tab features + MJCF compiler

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-6.md`

Adds sweep/loft/weld_tab features and an MJCF compiler as a second motion-sim target alongside URDF.

## Topic: CAD IR Phase 12 — Inline-part fabrication cost estimation

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-12.md`

Adds material catalog, volume estimator, and per-inline-part fabrication cost (volume × density × $/kg) into compileCost and BOM.

## Topic: CAD IR Phase 14 — Process-aware manufacturing rules

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-14.md`

Adds `mfg.laser-cut-min-hole` and `mfg.laser-cut-min-slot` rules to manufacturingTier; rules fire only when process is laser_cut.

## Topic: CAD IR Phase 15 — Extended sketch primitives

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-15.md`

Extends `SketchEntity` with arc, polygon, and spline kinds across types, schema, volume/perimeter estimators, build123d codegen, and the `add_sketch` tool.

## Topic: CAD IR Phase 18 — STEP imports for external parts

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-18.md`

Adds optional `stepUrl` field to `ExternalPartRef`; `compileAssembly` emits build123d `import_step` calls for external parts.

## Topic: CAD IR Phase 19 — Final consolidation

source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`

Caps the 19-phase rebuild with a mega-integration test, README final-state summary, and a final verification sweep across validation tiers, compile targets, and patch tools.

---

## Cross-cutting context

- **Branch reality (per ADR-0001):** `main` carries Slice 1 + AI Harness Plans 1+2+3 as the live customer surface. `feat/cad-ir-rebuild` (off main after Phase 0) holds the 19 CAD IR phase plans. Cutover is gated behind `useCadIr` once Phase 19 ships and canonical end-to-end tests pass against both schemas.
- **Convex deployment names referenced:** `amiable-emu-84` (multi-process-parts plan).
- **Backends in scope:** Convex, Vercel Sandbox (build123d executor), Anthropic API (specialist agent).
- **Frontend stack referenced:** React + Three.js (`AssembledView.tsx`, `Workspace.tsx`).
