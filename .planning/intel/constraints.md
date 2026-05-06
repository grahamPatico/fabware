# Constraints Intel

Synthesized from SPEC sources. Per ADR-0001, the CAD IR Backbone SPEC is canonical; the older AI Harness and Sheet-metal Assembly SPECs contribute only their explicitly retained carve-outs. The 14 CAD-IR-phase SPEC-classified docs (phases 7–11, 13, 16, 17 plus the foundational backbone) define implementation contracts under the CAD IR umbrella.

---

## CAD IR Backbone (canonical)

- title: CAD IR Backbone — Design Spec
- source: `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`
- type: schema + protocol
- content:
  - CAD IR is a constraint-based parametric Intermediate Representation; replaces PartDsl as the AI harness's source of truth.
  - Storage: `cad_revisions` and `cad_revision_artifacts` Convex tables replace `partRevisions`.
  - Executor: build123d running inside Vercel Sandbox.
  - Validation tiers: schema, constraint (DOF), manufacturing, geometry, assembly.
  - Compile targets: build123d Python (geometry), URDF (motion-sim), MJCF (motion-sim alternate), BOM, cost.
  - Agent surface: typed patches against the IR via `applyPatch`; tool definitions registered with Anthropic specialist.
  - Plugin contract: `ProcessPlugin<CadIr>` is the canonical specialization (replacing `ProcessPlugin<PartDsl>`).

## Sheet-metal Assembly Slice 1 (retained per ADR-0001)

- title: Sheet-metal assembly — Slice 1 design (retained carve-outs only)
- source: `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md`
- type: schema + api-contract
- content (retained):
  - Convex schema: `parts`, `interfaces`, `projects` tables on `main` are the live customer surface until CAD IR reaches parity behind `useCadIr`.
  - Six starter archetypes (incl. hingedEnclosure) drive initial part generation.
  - Agent tool loop: capture_scope, select_archetype, refine_part, break_out, decompose_freeform.
  - Assembly validation rules in `convex/lib/assemblyRules.ts`.
  - Workspace UX option 2c.
  - Three.js assembled preview component (re-rendered against glTF preview when `useCadIr` is on; component itself not rewritten).
  - Per-part DXF export.
  - Tennis-ball-locker canonical acceptance test.
- precedence note: outside these retained items, this SPEC is superseded by ADR-0001 and does not contribute decisions on overlapping scope.

## AI Harness Design (retained per ADR-0001)

- title: AI Harness Design (retained carve-outs only)
- source: `docs/superpowers/specs/2026-04-25-ai-harness-design.md`
- type: api-contract + protocol
- content (retained):
  - `ProcessPlugin<TDsl>` contract; TDsl migrates from `PartDsl` to `CadIr` over time.
  - `runAgentRepairLoop` and the two-tier validation loop.
  - Orchestrator state machine and tool-call surface.
  - Convex tables: `violations`, `escalations`, `planEvents`, `parts`.
- precedence note: outside these retained items, this SPEC is superseded by ADR-0001. `PartDsl` as the agent's source of truth is deprecated.

## Multi-Process Parts

- title: Multi-Process Parts Implementation Plan
- source: `docs/superpowers/plans/2026-04-25-multi-process-parts.md`
- type: schema + api-contract
- content:
  - `kind` discriminator on parts: `sheet_metal | printed | purchased`.
  - Per-kind DSLs: SheetMetalDsl, PrintedDsl, PurchasedDsl in `convex/lib/`.
  - Per-kind validators: scsRules (sheet_metal), printedRules, purchasedRules.
  - STL generator for printed parts; DXF for sheet metal.
  - McMaster catalog integration for purchased parts.
  - Convex backend: amiable-emu-84.
  - UI: PartList, AssembledView, SpecCard, PartKindBadge, PartKindSwitcher.
  - assemblyDesigner agent tools.
- precedence note: ADR-0001 explicitly retains this as a forward-looking SPEC the CAD IR Backbone is designed to satisfy. No conflict with canonical direction.

## CAD IR Phase 7 — Sketch constraint grammar (Tier 2 v0)

- title: Sketch constraint grammar
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-7.md`
- type: schema + api-contract
- content: SketchConstraint type unions (coincident, distance, parallel, perpendicular, horizontal, vertical, angle, equal, fix); Zod schemas for each; schema-tier ref validation; Tier 2 v0 DOF analyzer; `modify_sketch` patch ops; `toolCallToPatch` mappings.

## CAD IR Phase 8 — AABB interference detection (Tier 5 expansion)

- title: AABB interference detection
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-8.md`
- type: api-contract
- content: `computePartBbox`, `transformBbox`, `partsInterfere` rule contract; rule severity; AABB interference geometry helpers; assemblyTier composition.

## CAD IR Phase 9 — External part references + BOM compiler

- title: External part references + BOM compiler
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-9.md`
- type: schema + api-contract
- content: `PartRef` becomes a discriminated union (`inline | external`); `ExternalPartRef` carries vendor, partNumber, boundingBox; CadIrSchema updated; `partsInterfere` handles externals; `compileBom(ir): BomEntry[]` aggregates externals by vendor+partNumber; `add_part` tool schema extended.

## CAD IR Phase 10 — Cost compiler + integration smoke test

- title: Cost compiler + integration smoke test
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-10.md`
- type: schema + api-contract
- content: `compileCost(ir, pricingDb): CostResult` contract; PricingDb shape; CadIr.budget optional field; budgetExceeded validation rule; full-stack integration smoke test; plugin.ts validate pipeline composition.

## CAD IR Phase 11 — Joint-range self-collision sampling

- title: Joint-range self-collision sampling (Tier 5)
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-11.md`
- type: api-contract
- content: Joint pose sampler for revolute and linear joints; `jointRangeCollision` rule samples N poses and runs AABB interference; assemblyTier composition.

## CAD IR Phase 13 — Process-aware machine-time cost

- title: Process-aware machine-time cost
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-13.md`
- type: schema + api-contract
- content: `BUILTIN_PROCESSES` catalog (laser_cut, cnc, print_3d, sheet_metal_bend); perimeter estimator; `machineCost` compiler; `CadIr.process` field; integrated into `compileCost`.

## CAD IR Phase 16 — 3D-print specific rules

- title: 3D-print specific rules
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-16.md`
- type: api-contract
- content: `mfg.print-3d-min-wall` rule with per-material thresholds; `mfg.print-3d-bed-size` rule with default bed dimensions; both fire only when process is `print_3d`; manufacturingTier integration.

## CAD IR Phase 17 — CNC tool-diameter + internal-corner rules

- title: CNC tool-diameter + internal-corner rules
- source: `docs/superpowers/plans/2026-04-30-cad-ir-phase-17.md`
- type: schema + api-contract
- content: `cncToolDiameter` field on CadIr; `mfg.cnc-min-internal-corner` rule; `mfg.cnc-pocket-too-deep` rule; both gated on process=cnc.

---

## Cross-spec consistency notes

- All CAD IR phase SPECs (7, 8, 9, 10, 11, 13, 16, 17) build on the CAD IR Backbone canonical SPEC and are consistent with it; no internal contradictions detected.
- AI Harness and Sheet-metal Assembly SPECs only contribute their retained carve-outs per ADR-0001 — outside those carve-outs they have no decision authority.
- Multi-process-parts SPEC overlaps in spirit with the CAD IR Backbone (both want process-aware design); ADR-0001 explicitly notes the CAD IR Backbone is designed to satisfy multi-process-parts requirements.
