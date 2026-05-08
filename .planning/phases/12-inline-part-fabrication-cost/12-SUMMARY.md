---
phase: 12-inline-part-fabrication-cost
plan: 12
subsystem: cad-ir
tags: [cad-ir, compile, cost, materials, volume]

requires:
  - phase: 10-cost-compiler-smoke-test
    provides: compileCost scaffold, PricingDb shape, CostResult envelope
provides:
  - BUILTIN_MATERIALS catalog + lookupMaterial helper
  - Optional `CadIr.material` field in types + Zod schema
  - estimateVolume across feature mixes
  - compileFabricationCost compiler
  - Wired fabrication into compileCost.totalUsd
  - Phase 12 prompts + README updates

affects: [phase-13-process-aware-machine-cost, phase-19-final-consolidation, cost compilation]

tech-stack:
  added: []
  patterns:
    - material catalog lookup pattern (BUILTIN_* table + lookup* helper)
    - layered cost compilation (fabrication line composed into total)

key-files:
  created:
    - artifacts/hardwareai/convex/cad/compile/materials.ts
    - artifacts/hardwareai/convex/cad/compile/volume.ts
    - artifacts/hardwareai/convex/cad/compile/fabricationCost.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/materials.test.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/volume.test.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/fabricationCost.test.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/material-schema.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/compile/cost.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/cost.test.ts
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/__tests__/integration-phase10.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "Material is an optional field on CadIr — parts without material skip the fabrication line cleanly."
  - "Volume estimator returns reasonable approximations across the v1 feature mix; exact mesh volume deferred."
  - "Fabrication cost = volume × density × $/kg, summed per inline part into a dedicated CostResult line."

patterns-established:
  - "BUILTIN_* catalog pattern: static table + lookup helper used for material (and later process) data."
  - "Compile-step composition: fabrication compiler is wired into compileCost without breaking existing budget rule."

requirements-completed: [COMPILE-03]

duration: docs-only retroactive verification
completed: 2026-05-07
---

# Phase 12: Inline-part Fabrication Cost Summary

**Material catalog, volume estimator, and fabrication-cost compiler that contribute volume × density × $/kg lines into compileCost for inline parts.**

Implementation pre-existed on branch `feat/cad-ir-phase-12` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Completed:** 2026-05-07
- **Tasks:** 6
- **Files modified:** 14

## Accomplishments
- `BUILTIN_MATERIALS` catalog covering the v1 material set with `lookupMaterial` helper.
- Optional `material` field on `CadIr` (types + Zod).
- `estimateVolume` across the v1 feature mix.
- `compileFabricationCost` compiler producing per-inline-part cost lines.
- Fabrication cost wired into `compileCost`; `totalUsd` includes fabrication.
- Phase 12 prompts and README updates.

## Task Commits

1. **Task 1: Material catalog** — `a172e87` feat(cad-ir/phase-12): Task 1 — material catalog (BUILTIN_MATERIALS + lookupMaterial)
2. **Task 2: Optional `CadIr.material` field** — `45c919f` feat(cad-ir/phase-12): Task 2 — optional CadIr.material field in types + Zod schema
3. **Task 3: Volume estimator** — `7c29b5a` feat(cad-ir/phase-12): Task 3 — volume estimator (estimateVolume)
4. **Task 4: Fabrication-cost compiler** — `d11594f` feat(cad-ir/phase-12): Task 4 — fabrication-cost compiler (compileFabricationCost)
5. **Task 5: Wire into compileCost** — `7a4d7bf` feat(cad-ir/phase-12): Task 5 — wire fabrication cost into compileCost; totalUsd includes fabrication
6. **Task 6: Prompts + README** — `32e90b8` docs(cad-ir/phase-12): Task 6 — prompts + README for Phase 12

## Files Created/Modified

Grouped by directory:

- `artifacts/hardwareai/convex/cad/compile/`
  - `materials.ts` — BUILTIN_MATERIALS + lookupMaterial.
  - `volume.ts` — estimateVolume.
  - `fabricationCost.ts` — compileFabricationCost.
  - `cost.ts` — wires fabrication into compileCost.
  - `__tests__/materials.test.ts`, `__tests__/volume.test.ts`, `__tests__/fabricationCost.test.ts`, `__tests__/cost.test.ts` — unit + integration tests.
- `artifacts/hardwareai/convex/cad/ir/`
  - `types.ts`, `schema.ts` — optional `material` field.
  - `__tests__/material-schema.test.ts` — schema validation.
- `artifacts/hardwareai/convex/cad/`
  - `prompts.ts` — Phase 12 prompt updates.
  - `README.md` — Phase 12 section.
  - `__tests__/integration-phase10.test.ts` — extended to cover fabrication line in cost results.

## Decisions Made
- Material is optional — backwards compatible with parts authored before Phase 12.
- Density × $/kg cost model — reasonable for v1; per-process surcharges deferred to Phase 13.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Success criteria mapping
1. **Material catalog covers v1 material set; volume estimator returns reasonable numbers across feature mixes** — `compile/materials.ts`, `compile/volume.ts` (`a172e87`, `7c29b5a`); covered by `compile/__tests__/materials.test.ts`, `compile/__tests__/volume.test.ts`.
2. **Inline part with known material contributes a non-zero volume × density × $/kg line in BOM** — `compile/fabricationCost.ts` + `compile/cost.ts` (`d11594f`, `7a4d7bf`); covered by `compile/__tests__/fabricationCost.test.ts` and updated `__tests__/integration-phase10.test.ts`.
3. **Changing material or volume changes the BOM line as expected** — `compile/__tests__/fabricationCost.test.ts` parametric cases (`d11594f`, `7a4d7bf`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Material/cost scaffolding ready for Phase 13 process catalog and machine-cost compiler.

---
*Phase: 12-inline-part-fabrication-cost*
*Completed: 2026-05-07*
