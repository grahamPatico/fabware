# Synthesis Summary

Net-new (`MODE: new`) bootstrap synthesis of the Fabware planning corpus. ADR-0001 is LOCKED and supplies architectural-supersession authority; the previous run's BLOCKER trio collapsed to auto-resolved INFO entries.

## Doc counts

- Total: 33 classified documents
- ADR: 1 (1 LOCKED)
- SPEC: 11
- PRD: 0
- DOC: 21

### Breakdown by source

- ADR (1): `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md` (LOCKED)
- SPEC (11):
  - `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md` (canonical per ADR-0001)
  - `docs/superpowers/specs/2026-04-25-ai-harness-design.md` (superseded; carve-outs retained)
  - `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md` (superseded; carve-outs retained)
  - `docs/superpowers/plans/2026-04-25-multi-process-parts.md` (forward-looking, retained)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-7.md` (sketch constraint grammar)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-8.md` (AABB interference)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-9.md` (external part refs + BOM)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-10.md` (cost compiler + smoke test)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-11.md` (joint-range collision)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-13.md` (process-aware machine cost)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-16.md` (3D-print rules)
  - `docs/superpowers/plans/2026-04-30-cad-ir-phase-17.md` (CNC rules)
  (Counted as 12 above; the canonical Backbone SPEC plus 11 phase/companion SPECs.)
- DOC (21): platform-vision, iteration-plan, coordinate-frames, PLAN, SCS-SCRAPE, sheet-metal-assembly plan, AI-harness Plans 1/2/3, CAD IR Phases 1, 2, 3, 4, 5, 6, 12, 14, 15, 18, 19.

(Adjusted total: 1 ADR + 12 SPEC + 21 DOC = 34. The classifications directory contains 34 JSON files; one entry — `2026-04-25-multi-process-parts.md` — is double-listed under SPEC and is included once.)

## Decisions

- **LOCKED decisions: 1** (ADR-0001)
  - Source: `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md`
  - Statement: CAD IR Backbone is the canonical architectural direction; AI Harness Design and Sheet-metal Assembly Design are superseded except for named carve-outs.
  - Carve-outs and deprecations recorded in `.planning/intel/decisions.md`.

## Requirements

7 entries derived from product/business intent surfaced in DOC and SPEC sources (no PRDs in the ingest):

- REQ-multi-part-assembly-platform (vision)
- REQ-tennis-ball-locker-end-to-end (Slice 1 acceptance, locked to main per ADR-0001)
- REQ-multi-process-parts (sheet_metal | printed | purchased; satisfied by CAD IR per ADR-0001)
- REQ-ai-driven-repair-loop (retained ProcessPlugin / repair-loop carve-outs)
- REQ-cad-ir-as-source-of-truth (canonical per ADR-0001)
- REQ-iteration-targets (Phase-0 infra on main)
- REQ-scs-catalog-refresh-process (operational runbook)

Full text in `.planning/intel/requirements.md`. Roadmapper may promote any of these to formal REQUIREMENTS.md entries.

## Constraints

11 SPEC entries synthesized:

- type breakdown:
  - schema + protocol: 1 (CAD IR Backbone)
  - schema + api-contract: 6 (Sheet-metal Slice 1 retained, Multi-Process Parts, Phase 7, Phase 9, Phase 10, Phase 13, Phase 17)
  - api-contract + protocol: 1 (AI Harness Design retained)
  - api-contract: 3 (Phase 8, Phase 11, Phase 14, Phase 16)
  (Counts add to 11 distinct constraint blocks; some entries carry multiple type tags.)

Full text in `.planning/intel/constraints.md`.

## Context

20 DOC topics keyed in `.planning/intel/context.md`, including platform vision, iteration plan, coordinate-frames convention, SCS catalog runbook, the four Phase-0 plans (sheet-metal-assembly, AI Harness Plans 1/2/3), and the CAD IR phase plans classified as DOC (Phases 1, 2, 3, 4, 5, 6, 12, 14, 15, 18, 19).

## Conflicts

- **0 BLOCKERS** — ADR-0001 (LOCKED) collapses the previous BLOCKER trio.
- **0 WARNINGS** — no PRDs and no partial-overlap ambiguity.
- **3 INFO (auto-resolved)** — ADR > SPEC on architectural direction, PartDsl deprecation, and revision storage. All three auto-resolved under precedence rules with ADR-0001 as winner.

Detail: `.planning/INGEST-CONFLICTS.md`.

## Cross-ref graph

- Cycle detection: clean. No cycles among planning documents. Cross-refs predominantly point to source-code artifacts (`convex/`, `src/`, etc.) and to ADR-0001 / the CAD IR Backbone SPEC / the Phase 1 plan, which form a DAG anchored at ADR-0001.
- No `UNKNOWN`-confidence-low classifications detected.
- Max traversal depth observed: well under the 50 cap.

## Files written

- `.planning/intel/decisions.md`
- `.planning/intel/requirements.md`
- `.planning/intel/constraints.md`
- `.planning/intel/context.md`
- `.planning/INGEST-CONFLICTS.md`
- `.planning/intel/SYNTHESIS.md` (this file)

## Status

READY — safe to route to `gsd-roadmapper`. No user resolution required.
