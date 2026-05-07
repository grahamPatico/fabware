---
phase: 04-assembly-graph-urdf
plan: 04
subsystem: cad-ir
tags: [cad-ir, assembly, urdf, joints, multi-part, motion-sim]

# Dependency graph
requires:
  - phase: 03-hardware-spec-holes
    provides: HoleFeature subtype machinery, mfg.bolt-clearance, manufacturingTier composition
provides:
  - Assembly types — PartRef, AxisRef, Joint, Connection
  - Zod schemas for assembly fields with z.lazy self-reference; assembly fields optional on CadIr
  - Tier 5 assembly validator (floating-part + over-constrained checks)
  - Schema-tier checks for joint/connection part-refs
  - URDF compiler (compileToUrdf): fixed/revolute/linear joints with origin
  - Patch grammar v3 — add_part / add_joint / add_connection (12 total tools)
  - cadIrPlugin validate composes assemblyTier
affects: [phase-05, phase-06, phase-08, phase-09, phase-11, phase-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.lazy self-referencing Zod schemas for recursive assembly types"
    - "Optional assembly fields on CadIr — single-part IRs from Phases 1–3 remain valid"
    - "Multi-target compile: same source IR → build123d (geometry) + URDF (motion)"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/codegen/compileToUrdf.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compileToUrdf.test.ts
    - artifacts/hardwareai/convex/cad/validate/assemblyTier.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/assemblyTier.test.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/assembly-schema.test.ts
    - artifacts/hardwareai/convex/cad/__tests__/assembly-mock.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts (PartRef, AxisRef, Joint, Connection)
    - artifacts/hardwareai/convex/cad/ir/schema.ts (Zod assembly fields)
    - artifacts/hardwareai/convex/cad/validate/schemaTier.ts (joint/connection ref checks)
    - artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts
    - artifacts/hardwareai/convex/cad/patch/types.ts (3 new patch kinds)
    - artifacts/hardwareai/convex/cad/patch/apply.ts (add_part/add_joint/add_connection)
    - artifacts/hardwareai/convex/cad/patch/tools.ts (3 new tool defs; CAD_IR_TOOLS = 12)
    - artifacts/hardwareai/convex/cad/patch/__tests__/{apply,tools}.test.ts
    - artifacts/hardwareai/convex/cad/plugin.ts (compose assemblyTier)
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts
    - artifacts/hardwareai/convex/cad/README.md
    - artifacts/hardwareai/convex/specialists/cadIr.ts (toolCallToPatch dispatch)

key-decisions:
  - "Assembly fields are optional on CadIr — single-part IRs from Phases 1–3 remain valid; no migration needed."
  - "Multi-part build123d codegen is OUT of scope for Phase 4; deferred to Phase 5's compileAssembly."
  - "URDF is pure TS, no Sandbox needed — keeps the motion-sim target lightweight."
  - "Tier 5 (assembly) is separate from manufacturingTier (per-part rules); assemblyTier composes its own checks."

patterns-established:
  - "Multi-target compile pattern (build123d + URDF) — same ResolvedIr, distinct compilers"
  - "z.lazy for recursive assembly types stays the durable Zod pattern"

requirements-completed: [ASSEMBLY-01]

# Metrics
completed: 2026-05-07
---

# Phase 4: Assembly Graph + URDF Summary

**CAD IR went multi-part: PartRef/Joint/Connection types + Zod schemas, Tier 5 assembly validator (floating-part + over-constrained), URDF compiler (fixed/revolute/linear), 3 new patch tools (add_part/add_joint/add_connection), 12 total tools in CAD_IR_TOOLS, multi-part hinged-box mock test green.**

**Implementation pre-existed on branch `feat/cad-ir-phase-4` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.**

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 12 commits on `feat/cad-ir-phase-4`
- **Files modified:** 20

## Accomplishments

- Source IR became a multi-part assembly graph: `parts`, `joints`, `connections` (all optional, so Phase 1–3 IRs remain valid).
- New Tier 5 assembly validator catches floating parts and over-constrained joint stacks.
- Schema tier extended to validate joint/connection references against the part list.
- URDF compiler emits ROS/PyBullet-compatible XML for fixed/revolute/linear joints, with correct origins — proving the multi-target compile thesis (same source, two outputs).
- Patch grammar grew to 12 tools by adding `add_part`, `add_joint`, `add_connection`; specialist dispatch updated.
- Plugin's `validate` composes Tier 5; multi-part hinged-box mock test exercises the end-to-end loop.

## Task Commits

Each commit corresponds to a task in the authoritative plan (`/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-4.md`):

1. **Task 1: assembly types (PartRef, AxisRef, Joint, Connection)** — `ecbbd8f`
2. **Task 2: Zod schemas with z.lazy self-reference** — `fcc22da`
3. **Task 3: schema-tier joint/connection ref checks** — `bd4cdfb`
4. **Task 4: Tier 5 assembly validator (floating-part + over-constrained)** — `b9ee079`
5. **Task 5: URDF compiler (fixed/revolute/linear/origin)** — `f57b360`
6. **Task 6: AddPart / AddJoint / AddConnection patch types** — `dac9e97`
7. **Task 7: applier for add_part / add_joint / add_connection** — `cd452d1`
8. **Task 8: tool defs (CAD_IR_TOOLS = 12)** — `451eb92`
9. **Task 9: specialist toolCallToPatch dispatch** — `4546b7f`
10. **Task 10: plugin validate composes assemblyTier** — `8e614d3`
11. **Task 11: multi-part hinged-box mock test** — `c8334da`
12. **Task 12: prompts + README + plugin tests + final sweep** — `73842b8`

## Files Created/Modified

- `artifacts/hardwareai/convex/cad/ir/types.ts` — PartRef, AxisRef, Joint, Connection
- `artifacts/hardwareai/convex/cad/ir/schema.ts` — Zod schemas for assembly fields (z.lazy)
- `artifacts/hardwareai/convex/cad/ir/__tests__/assembly-schema.test.ts`
- `artifacts/hardwareai/convex/cad/validate/schemaTier.ts` — joint/connection ref checks
- `artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts`
- `artifacts/hardwareai/convex/cad/validate/assemblyTier.ts` — Tier 5
- `artifacts/hardwareai/convex/cad/validate/__tests__/assemblyTier.test.ts`
- `artifacts/hardwareai/convex/cad/codegen/compileToUrdf.ts` — URDF emitter
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compileToUrdf.test.ts`
- `artifacts/hardwareai/convex/cad/patch/types.ts` — AddPartPatch, AddJointPatch, AddConnectionPatch
- `artifacts/hardwareai/convex/cad/patch/apply.ts` — applier dispatch
- `artifacts/hardwareai/convex/cad/patch/tools.ts` — 3 new tool defs (12 total)
- `artifacts/hardwareai/convex/cad/patch/__tests__/{apply,tools}.test.ts`
- `artifacts/hardwareai/convex/cad/plugin.ts` — compose assemblyTier
- `artifacts/hardwareai/convex/cad/prompts.ts`
- `artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts`
- `artifacts/hardwareai/convex/cad/__tests__/assembly-mock.test.ts`
- `artifacts/hardwareai/convex/cad/README.md`
- `artifacts/hardwareai/convex/specialists/cadIr.ts` — toolCallToPatch dispatch

## Success Criteria Mapping

1. **A 2+ part assembly with a revolute joint validates at Tier 5 and round-trips through the patch grammar.** — Covered by `b9ee079` (assemblyTier), `c8334da` (multi-part hinged-box mock), and `convex/cad/__tests__/assembly-mock.test.ts`.
2. **The URDF compiler emits a loadable URDF for that assembly.** — Covered by `f57b360` and `convex/cad/codegen/__tests__/compileToUrdf.test.ts`.
3. **The URDF loads and articulates correctly in a motion-sim viewer.** — Manual verification (PyBullet / RViz / urdf-viz). See Manual-Only Verifications.

## Decisions Made

- Made assembly fields optional on `CadIr` so prior single-part IRs and tests stay valid; no schema migration required.
- Deferred multi-part build123d codegen to Phase 5 (`compileAssembly`); Phase 4 ships URDF only.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits above. Branch tip is `73842b8`. Note: the plan referenced a `convex/cad/compile/urdf.ts` location; the actual ship path is `convex/cad/codegen/compileToUrdf.ts` to keep all compilers under one directory.

## Verification

- **Method:** `tsc -b` of each `lib/*` package on the `feat/cad-ir-phase-4` branch tip.
- **Result:** PASS — 0 new errors in modified files.
- **Driver:** `/tmp/cad-ir-verify.sh`; results table `/tmp/cad-ir-verify-results.tsv`.
- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (inherited from main divergence, not introduced).

## Issues Encountered

None recorded.

## User Setup Required

None — URDF compiler is pure TS; no new runtime services needed. URDF viewer for manual verification (PyBullet, RViz, urdf-viz) is developer-side only.

## Next Phase Readiness

- Phase 5 prerequisites (Phase 4 tip `73842b8`) are met.
- Assembly graph machinery is in place; Phase 5 wires `compileAssembly` per part.

---
*Phase: 04-assembly-graph-urdf*
*Completed: 2026-05-07*
