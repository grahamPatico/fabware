---
phase: 13-process-aware-machine-cost
plan: 13
subsystem: cad-ir
tags: [cad-ir, compile, cost, process, perimeter]

requires:
  - phase: 12-inline-part-fabrication-cost
    provides: material catalog, fabrication cost line, optional material field
provides:
  - BUILTIN_PROCESSES catalog + lookupProcess helper
  - Optional `CadIr.process` field (ProcessName enum + Zod)
  - estimatePerimeter perimeter estimator
  - compileMachineCost machine-cost compiler
  - Wired machine cost into compileCost; new `machine` field on CostResult
  - Phase 13 prompts + README updates

affects: [phase-14-laser-cut-process-rules, phase-16-3d-print-process-rules, phase-17-cnc-process-rules, phase-19-final-consolidation]

tech-stack:
  added: []
  patterns:
    - process catalog lookup mirroring Phase 12 material catalog
    - perimeter-based machine-time cost line composed into total

key-files:
  created:
    - artifacts/hardwareai/convex/cad/compile/processes.ts
    - artifacts/hardwareai/convex/cad/compile/perimeter.ts
    - artifacts/hardwareai/convex/cad/compile/machineCost.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/processes.test.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/perimeter.test.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/machineCost.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/compile/cost.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/cost.test.ts
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "Process is optional — defaults preserve existing cost behavior when omitted."
  - "BUILTIN_PROCESSES covers laser_cut, cnc, print_3d, sheet_metal_bend with realistic per-process rates."
  - "Machine-time cost for laser_cut scales with perimeter; other processes use process-specific drivers."

patterns-established:
  - "Process catalog pattern reuses BUILTIN_*/lookup* shape from Phase 12 materials."
  - "CostResult gains a `machine` field alongside fabrication; future per-process rules gate on `CadIr.process`."

requirements-completed: [COMPILE-04]

duration: docs-only retroactive verification
completed: 2026-05-07
---

# Phase 13: Process-aware Machine Cost Summary

**`BUILTIN_PROCESSES` catalog plus perimeter estimator and `compileMachineCost` compiler that adds process-driven machine-time lines to `compileCost`.**

Implementation pre-existed on branch `feat/cad-ir-phase-13` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Completed:** 2026-05-07
- **Tasks:** 6
- **Files modified:** 13

## Accomplishments
- `BUILTIN_PROCESSES` catalog with `lookupProcess` helper covering laser_cut, cnc, print_3d, sheet_metal_bend.
- Optional `process` field on CadIr (`ProcessName` enum + Zod).
- `estimatePerimeter` perimeter estimator across feature mix.
- `compileMachineCost` machine-cost compiler.
- `machine` field exposed on CostResult; total reflects machine cost.
- Phase 13 prompts and README updates.

## Task Commits

1. **Task 1: Process catalog** — `65f5a8f` feat(cad-ir/phase-13): Task 1 — process catalog (BUILTIN_PROCESSES + lookupProcess)
2. **Task 2: Optional `CadIr.process` field** — `3629090` feat(cad-ir/phase-13): Task 2 — optional CadIr.process field (ProcessName enum + Zod schema)
3. **Task 3: Perimeter estimator** — `471a1ce` feat(cad-ir/phase-13): Task 3 — perimeter estimator (estimatePerimeter)
4. **Task 4: Machine-cost compiler** — `a8da2c3` feat(cad-ir/phase-13): Task 4 — machine-cost compiler (compileMachineCost)
5. **Task 5: Wire into compileCost** — `80a4b47` feat(cad-ir/phase-13): Task 5 — wire machine cost into compileCost; new machine field in CostResult
6. **Task 6: Prompts + README** — `d806cb1` docs(cad-ir/phase-13): Task 6 — prompts + README for Phase 13

## Files Created/Modified
- `artifacts/hardwareai/convex/cad/compile/processes.ts` — BUILTIN_PROCESSES + lookupProcess.
- `artifacts/hardwareai/convex/cad/compile/perimeter.ts` — estimatePerimeter.
- `artifacts/hardwareai/convex/cad/compile/machineCost.ts` — compileMachineCost.
- `artifacts/hardwareai/convex/cad/compile/cost.ts` — wires machine cost into compileCost.
- `artifacts/hardwareai/convex/cad/compile/__tests__/processes.test.ts` — process catalog tests.
- `artifacts/hardwareai/convex/cad/compile/__tests__/perimeter.test.ts` — perimeter estimator tests.
- `artifacts/hardwareai/convex/cad/compile/__tests__/machineCost.test.ts` — machine-cost tests.
- `artifacts/hardwareai/convex/cad/compile/__tests__/cost.test.ts` — extended for machine line.
- `artifacts/hardwareai/convex/cad/ir/types.ts` — `process` field + ProcessName enum.
- `artifacts/hardwareai/convex/cad/ir/schema.ts` — Zod schema for process.
- `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts` — schema validation.
- `artifacts/hardwareai/convex/cad/prompts.ts` — Phase 13 prompts.
- `artifacts/hardwareai/convex/cad/README.md` — Phase 13 section.

## Decisions Made
- Process is optional and additive; absent = no machine line.
- Per-process rate model is intentionally simple — finer-grained rates can be added per-installation via PricingDb overrides later.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Success criteria mapping
1. **BUILTIN_PROCESSES includes laser_cut, cnc, print_3d, sheet_metal_bend with realistic rates** — `compile/processes.ts` (`65f5a8f`); covered by `compile/__tests__/processes.test.ts`.
2. **Laser-cut machine cost scales with perimeter; estimator is reasonable** — `compile/perimeter.ts` + `compile/machineCost.ts` (`471a1ce`, `a8da2c3`); covered by `compile/__tests__/perimeter.test.ts` and `compile/__tests__/machineCost.test.ts`.
3. **Changing `CadIr.process` changes machine-cost line** — `compile/cost.ts` (`80a4b47`); covered by `compile/__tests__/cost.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `process` field is in place — Phase 14's process-gated laser-cut rules can branch on it directly.

---
*Phase: 13-process-aware-machine-cost*
*Completed: 2026-05-07*
