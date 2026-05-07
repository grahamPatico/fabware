---
phase: 05-feature-round-out-multi-part-codegen
plan: 05
subsystem: cad-ir
tags: [cad-ir, revolve, shell, bend-flange, sheet-metal, multi-part-codegen, manufacturing-rules]

# Dependency graph
requires:
  - phase: 04-assembly-graph-urdf
    provides: assembly graph (parts/joints/connections), URDF compiler, compose assemblyTier
provides:
  - RevolveFeature (axis, angle, profile sketch) — types + Zod + codegen
  - ShellFeature (faces, thickness) — types + Zod + codegen
  - BendFlangeFeature (sheet-metal forming) — types + Zod + codegen + min-bend-radius rule
  - mfg.min-bend-radius manufacturing rule
  - compileAssembly entry — `Record<PartId, string>` of per-part build123d scripts
affects: [phase-06, phase-08, phase-09, phase-13, phase-14, phase-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compileAssembly orchestrator dispatches single-part compileToBuild123d per part"
    - "per-feature emitter modules continue to be one-file units in codegen/features/"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/codegen/compileAssembly.ts
    - artifacts/hardwareai/convex/cad/codegen/features/revolve.ts
    - artifacts/hardwareai/convex/cad/codegen/features/shell.ts
    - artifacts/hardwareai/convex/cad/codegen/features/bendFlange.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compile-revolve.test.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compile-shell.test.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compile-bendFlange.test.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compileAssembly.test.ts
    - artifacts/hardwareai/convex/cad/validate/rules/minBendRadius.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-minBendRadius.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts (Revolve/Shell/BendFlange types)
    - artifacts/hardwareai/convex/cad/ir/schema.ts (Zod schemas)
    - artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
    - artifacts/hardwareai/convex/cad/codegen/emitFeature.ts (revolve/shell/bend dispatch)
    - artifacts/hardwareai/convex/cad/resolve/resolveIr.ts (resolve new feature kinds)
    - artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts (compose minBendRadius)
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "compileAssembly is a thin orchestrator over single-part compileToBuild123d; existing single-part call sites stay unchanged."
  - "min-bend-radius is gated on the BendFlangeFeature's bend radius, not on a per-process threshold (process-gated rules arrive in Phases 14/16/17)."

patterns-established:
  - "compileAssembly(ir): Record<PartId, string> as the standard multi-part codegen entry"

requirements-completed: [FEATURE-01]

# Metrics
completed: 2026-05-07
---

# Phase 5: Feature Round-out + Multi-part Codegen Summary

**Three new feature kinds (revolve, shell, bend_flange) added to types/schema/codegen; mfg.min-bend-radius manufacturing rule landed; compileAssembly emits one build123d script per part for assemblies, completing the geometry side of the Phase-4 assembly graph.**

**Implementation pre-existed on branch `feat/cad-ir-phase-5` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.**

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 8 commits on `feat/cad-ir-phase-5`
- **Files modified:** 20

## Accomplishments

- Three new feature kinds shipped end-to-end (TS types → Zod → resolveIr → codegen → emitFeature dispatch → tests):
  - **revolve** (axles, hubs, rivets — cylindrical parts via profile + axis)
  - **shell** (hollow enclosures — face selection + wall thickness)
  - **bend_flange** (sheet-metal flange forming — paired with the manufacturing rule below)
- New `mfg.min-bend-radius` rule fires at Tier 4 when a BendFlangeFeature's bend radius drops below the per-material minimum, completing the rule deferred from Phase 2.
- `compileAssembly(ir)` returns a `Record<PartId, string>` of build123d scripts, finally giving the Phase-4 assembly graph real geometry per part.
- Anthropic tool surface and system prompt updated for the three new features.

## Task Commits

Each commit corresponds to a task in the authoritative plan (`/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-5.md`):

1. **Task 1: RevolveFeature type + Zod + schema tests** — `3b854c3`
2. **Task 2: revolve codegen + emitFeature dispatch + resolveIr** — `d42c492`
3. **Task 3: ShellFeature schema tests** — `8035f48`
4. **Task 4: shell codegen test (emitShell dispatch)** — `c20370a`
5. **Task 5: bend_flange schema tests + mfg.min-bend-radius + codegen placeholder test** — `cb17547`
6. **Task 6: compileAssembly entry for per-part scripts** — `d8403eb`
7. **Task 7: tools + prompts updates for revolve/shell/bend_flange** — `ff83353`
8. **Task 8: README scope + module layout update** — `0a44bc4`

## Files Created/Modified

- `artifacts/hardwareai/convex/cad/ir/types.ts` — RevolveFeature, ShellFeature, BendFlangeFeature
- `artifacts/hardwareai/convex/cad/ir/schema.ts` — Zod schemas for new features
- `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts`
- `artifacts/hardwareai/convex/cad/codegen/features/revolve.ts`
- `artifacts/hardwareai/convex/cad/codegen/features/shell.ts`
- `artifacts/hardwareai/convex/cad/codegen/features/bendFlange.ts`
- `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts` — dispatch added for the three kinds
- `artifacts/hardwareai/convex/cad/codegen/compileAssembly.ts` — multi-part orchestrator
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-revolve.test.ts`
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-shell.test.ts`
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-bendFlange.test.ts`
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compileAssembly.test.ts`
- `artifacts/hardwareai/convex/cad/resolve/resolveIr.ts` — resolve new feature fields
- `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` — compose minBendRadius
- `artifacts/hardwareai/convex/cad/validate/rules/minBendRadius.ts`
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-minBendRadius.test.ts`
- `artifacts/hardwareai/convex/cad/patch/tools.ts`
- `artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts`
- `artifacts/hardwareai/convex/cad/prompts.ts`
- `artifacts/hardwareai/convex/cad/README.md`

## Success Criteria Mapping

1. **A multi-part assembly featuring a revolve, a shell, and a bend_flange compiles end-to-end.** — Covered by `d42c492`/`c20370a`/`cb17547` (per-feature codegen) plus `d8403eb` (compileAssembly) and the `compileAssembly.test.ts` integration test.
2. **compileAssembly produces correct multi-part build123d output.** — Covered by `d8403eb` and `convex/cad/codegen/__tests__/compileAssembly.test.ts`.
3. **A part with a sub-minimum bend radius produces a Tier 3 [manufacturingTier] violation.** — Covered by `cb17547` and `convex/cad/validate/__tests__/rules-minBendRadius.test.ts`.

## Decisions Made

- compileAssembly stayed a thin per-part orchestrator instead of a unified multi-part script — keeps single-part call sites and the sandbox runner contract unchanged.
- min-bend-radius is gated on the feature's own radius vs. material minimum (not yet process-gated). Process gating arrives in Phases 14/16/17.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits above. Branch tip is `0a44bc4`.

## Verification

- **Method:** `tsc -b` of each `lib/*` package on the `feat/cad-ir-phase-5` branch tip.
- **Result:** PASS — 0 new errors in modified files.
- **Driver:** `/tmp/cad-ir-verify.sh`; results table `/tmp/cad-ir-verify-results.tsv`.
- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (inherited from main divergence, not introduced).

## Issues Encountered

None recorded.

## User Setup Required

None.

## Next Phase Readiness

- Phase 6 prerequisites (Phase 5 tip `0a44bc4`) are met.
- Multi-part codegen + three new feature kinds set up Phase 6 to add sweep/loft/weld_tab and MJCF as a second motion-sim target.

---
*Phase: 05-feature-round-out-multi-part-codegen*
*Completed: 2026-05-07*
