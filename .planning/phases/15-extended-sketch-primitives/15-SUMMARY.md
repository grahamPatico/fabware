---
phase: 15-extended-sketch-primitives
plan: 15
subsystem: cad-ir
tags: [cad-ir, sketch, primitives, codegen, patch]

requires:
  - phase: 14-laser-cut-process-rules
    provides: stable sketch entity surface; perimeter estimator
provides:
  - arc, polygon, spline sketch entity kinds in types + Zod schema
  - volume + perimeter estimators handle the new kinds
  - codegen for arc/polygon/spline in build123d output
  - add_sketch tool schema accepts and round-trips the new kinds
  - Phase 15 prompts + README updates

affects: [phase-19-final-consolidation, sketch grammar, downstream codegen]

tech-stack:
  added: []
  patterns:
    - sketch entity kind expansion (types → schema → estimators → codegen → tools)
    - feature-dispatch in emitSketchGeometry for new entity kinds

key-files:
  created:
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compile-sketch-entities-phase15.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/codegen/emitSketchGeometry.ts
    - artifacts/hardwareai/convex/cad/codegen/features/cutExtrude.ts
    - artifacts/hardwareai/convex/cad/codegen/features/extrude.ts
    - artifacts/hardwareai/convex/cad/compile/perimeter.ts
    - artifacts/hardwareai/convex/cad/compile/volume.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/perimeter.test.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/volume.test.ts
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
    - artifacts/hardwareai/convex/cad/resolve/resolveIr.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "Each new entity kind (arc, polygon, spline) is a discriminated-union variant on the existing sketch entity type."
  - "Codegen routes per-kind in emitSketchGeometry rather than per-feature, so cut_extrude and extrude share emitter logic."
  - "Volume + perimeter estimators approximate spline length/area conservatively; exact arclength deferred."

patterns-established:
  - "Sketch-kind expansion playbook: types/schema → estimators → codegen → tool schema → prompts/README, in that order."
  - "Tool schema mirrors entity union exactly so add_sketch round-trips without lossy mapping."

requirements-completed: [PATCH-03]

duration: docs-only retroactive verification
completed: 2026-05-07
---

# Phase 15: Extended Sketch Primitives Summary

**Arc, polygon, and spline entity kinds plumbed through types, Zod schema, volume/perimeter estimators, build123d codegen, and the `add_sketch` tool surface.**

Implementation pre-existed on branch `feat/cad-ir-phase-15` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Completed:** 2026-05-07
- **Tasks:** 4
- **Files modified:** 16

## Accomplishments
- New entity kinds (arc, polygon, spline) added to types + Zod.
- Volume and perimeter estimators handle the new kinds.
- build123d codegen emits arc/polygon/spline geometry from sketches.
- `add_sketch` tool schema accepts and round-trips the new kinds.
- Phase 15 prompts and README updates.

## Task Commits

1. **Task 1: Types + Zod for arc/polygon/spline** — `0e1b214` feat(ir): add arc, polygon, spline sketch entity kinds (Phase 15 Task 1)
2. **Task 2: Volume + perimeter estimators** — `32cf956` feat(compile): handle arc, polygon, spline in volume/perimeter estimators (Phase 15 Task 2)
3. **Task 3: Codegen for new kinds** — `cba8324` feat(codegen): emit polygon/spline/arc sketch geometry in build123d output (Phase 15 Task 3)
4. **Task 4: Tool def + prompts + README** — `8b017a4` feat(patch): update add_sketch tool schema, prompts, README for Phase 15 entity kinds (Phase 15 Task 4)

## Files Created/Modified

Grouped by directory:

- `artifacts/hardwareai/convex/cad/ir/`
  - `types.ts`, `schema.ts` — arc/polygon/spline variants.
  - `__tests__/schema.test.ts` — Zod coverage for new kinds.
- `artifacts/hardwareai/convex/cad/compile/`
  - `perimeter.ts`, `volume.ts` — handle new kinds.
  - `__tests__/perimeter.test.ts`, `__tests__/volume.test.ts` — extended cases.
- `artifacts/hardwareai/convex/cad/codegen/`
  - `emitSketchGeometry.ts` — per-kind dispatch for arc/polygon/spline.
  - `features/extrude.ts`, `features/cutExtrude.ts` — share new sketch emitter.
  - `__tests__/compile-sketch-entities-phase15.test.ts` — codegen tests for new kinds.
- `artifacts/hardwareai/convex/cad/patch/`
  - `tools.ts`, `__tests__/tools.test.ts` — `add_sketch` accepts new kinds; tool round-trip tests.
- `artifacts/hardwareai/convex/cad/resolve/resolveIr.ts` — resolves IR with new entity kinds.
- `artifacts/hardwareai/convex/cad/prompts.ts` — Phase 15 prompt surface.
- `artifacts/hardwareai/convex/cad/README.md` — Phase 15 section.

## Decisions Made
- Spline arclength approximated for v1 perimeter purposes; exact NURBS arclength deferred.
- Tool schema mirrors the discriminated union — keeps `add_sketch` round-trip lossless.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Success criteria mapping
1. **Sketch authored with arc/polygon/spline validates at Tier 1 and compiles to build123d** — `ir/schema.ts`, `codegen/emitSketchGeometry.ts`, `codegen/features/{extrude,cutExtrude}.ts` (`0e1b214`, `cba8324`); covered by `ir/__tests__/schema.test.ts` and `codegen/__tests__/compile-sketch-entities-phase15.test.ts`.
2. **Volume and perimeter estimators return correct numbers for each new kind** — `compile/volume.ts`, `compile/perimeter.ts` (`32cf956`); covered by `compile/__tests__/volume.test.ts`, `compile/__tests__/perimeter.test.ts`.
3. **`add_sketch` tool accepts and round-trips all three new entity kinds** — `patch/tools.ts` (`8b017a4`); covered by `patch/__tests__/tools.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sketch grammar is now broad enough to feed Phase 16 / 17 process rules with realistic geometry.

---
*Phase: 15-extended-sketch-primitives*
*Completed: 2026-05-07*
