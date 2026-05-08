# Requirements Intel

No PRD-typed documents were classified in this ingest set. Requirements below are derived from product/business intent surfaced in DOC and SPEC sources where they were the load-bearing user-facing commitments. Each entry preserves source attribution; downstream roadmapper may promote any of these to formal requirements.

The canonical product vision lives in `docs/roadmap/2026-04-24-platform-vision.md` (DOC). Acceptance proofs live in the CAD IR Backbone SPEC and Sheet-metal Assembly SPEC.

---

## REQ-multi-part-assembly-platform

- source: `docs/roadmap/2026-04-24-platform-vision.md` (DOC)
- description: Fabware shifts from a single-part sheet-metal designer to a multi-part assembly platform driven by user intent. Users describe what they want; the platform produces a buildable assembly.
- acceptance criteria (from vision doc):
  - Sheet-metal assembly is the first slice and gates platform credibility
  - Tier-aware behavior across jerry-rigged / MVP / commercial outputs
  - Tennis-ball rental locker is the canonical end-to-end demonstrator

## REQ-tennis-ball-locker-end-to-end

- source: `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md` (SPEC, superseded by ADR-0001 except for retained Slice 1 carve-outs)
- description: A user describes a tennis-ball rental locker by intent; the system produces a multi-part sheet-metal assembly with archetypes, typed interfaces, assembled preview, and per-part DXF export.
- acceptance criteria:
  - Multi-part sheet-metal projects with parts + interfaces tables
  - Six starter archetypes drive initial geometry
  - Agent tool loop: capture_scope, select_archetype, refine_part, break_out, decompose_freeform
  - Three.js assembled preview
  - Per-part DXF export
  - Assembly validation rules
- constraint from ADR-0001: This requirement is locked to the Slice 1 schema on `main` until CAD IR Backbone reaches parity behind `useCadIr`.

## REQ-multi-process-parts

- source: `docs/superpowers/plans/2026-04-25-multi-process-parts.md` (SPEC)
- description: Fabware parts can be one of three kinds — sheet_metal, printed (3D-printed), purchased (off-the-shelf) — with per-kind DSLs, validators, agent tools, UI, and exporters.
- acceptance criteria:
  - `kind` discriminator on parts (sheet_metal | printed | purchased)
  - Per-kind DSLs: SheetMetalDsl, PrintedDsl, PurchasedDsl
  - Per-kind validators: existing scsRules for sheet_metal, printedRules for printed, purchasedRules for purchased
  - STL export for printed, DXF export for sheet_metal
  - McMaster catalog integration for purchased
  - PartList / AssembledView / SpecCard / PartKindBadge / PartKindSwitcher UI
- compatibility note: ADR-0001 explicitly states this SPEC is retained as a forward-looking requirement the CAD IR Backbone is designed to satisfy. No conflict.

## REQ-ai-driven-repair-loop

- source: `docs/superpowers/specs/2026-04-25-ai-harness-design.md` (SPEC, superseded by ADR-0001 except for retained ProcessPlugin / repair-loop carve-outs)
- description: An AI orchestrator drives per-process specialist agents that emit patches against the design, with a two-tier validation loop and auto-repair on violations.
- acceptance criteria (retained per ADR-0001 §carve-outs):
  - `ProcessPlugin<TDsl>` contract (TDsl migrates to CadIr over time)
  - Two-tier validation loop (schema tier + geometry/manufacturing tier)
  - `runAgentRepairLoop` driven by Anthropic specialist
  - Orchestrator state machine and tool-call surface
  - Convex tables: violations, escalations, planEvents, parts

## REQ-cad-ir-as-source-of-truth

- source: `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md` (SPEC, canonical per ADR-0001)
- description: The CAD IR (constraint-based parametric Intermediate Representation) is the single source of truth for every part and assembly. Agent emits typed patches against the IR; everything else is a compiler.
- acceptance criteria:
  - CAD IR schema covers parts, sketches, features, joints, connections, parameters, and constraints
  - Constraint solver resolves parametric references
  - Patch system applies typed mutations
  - build123d codegen + Vercel-Sandbox executor produce geometry
  - Five validation tiers (schema, constraint, manufacturing, geometry, assembly)
  - URDF and MJCF compilers emit motion-sim targets
  - BOM and cost compilers emit commercial outputs
  - `cad_revisions` / `cad_revision_artifacts` replace `partRevisions`
  - Cutover to CAD IR is gated behind `useCadIr` flag once Phase 19 ships and canonical end-to-end tests pass against both schemas

## REQ-iteration-targets

- source: `docs/roadmap/2026-04-27-iteration-plan.md` (DOC)
- description: Tracked iteration buckets — correctness, manufacturing realism, visual fidelity, validators, outputs, UX, agent improvements — that constitute Phase-0 infrastructure on `main` per ADR-0001.
- acceptance criteria:
  - Per-bucket checkmarks landed in working iteration plan
  - Outputs: DXF, PDF, BOM, OBJ
  - Studio UI improvements
  - Agent assembly designer improvements
  - Intersection validation, sheet-metal simulator, weight, cost, transform3d utilities

## REQ-scs-catalog-refresh-process

- source: `docs/SCS-SCRAPE.md` (DOC)
- description: SendCutSend materials catalog is refreshed quarterly via a scraper with human-in-the-loop review.
- acceptance criteria:
  - Quarterly cadence
  - `scripts/scrape-scs.ts` produces `scs-catalog.json`
  - Reviewer manually merges into `scsRules.ts`
- scope note: operational runbook; not a product requirement but a recurring engineering commitment.
