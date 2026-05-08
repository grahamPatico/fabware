---
phase: 16-3d-print-process-rules
plan: 16
subsystem: validate
tags: [cad-ir, manufacturing-rules, print-3d, process-gating, vitest]

# Dependency graph
requires:
  - phase: 13-process-aware-machine-cost
    provides: BUILTIN_PROCESSES catalog and CadIr.process field
  - phase: 14-laser-cut-process-rules
    provides: process-gated rule pattern in manufacturingTier
provides:
  - mfg.print-3d-min-wall rule (per-material thresholds)
  - mfg.print-3d-bed-size rule (default bed footprint)
  - Composition into validateManufacturingTier behind process === 'print_3d'
affects: [phase-17-cnc-process-rules, phase-19-final-consolidation-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - process-gated manufacturing rule (extends laser-cut pattern from Phase 14)
    - per-material threshold lookup table inside rule module

key-files:
  created:
    - artifacts/hardwareai/convex/cad/validate/rules/print3dMinWall.ts
    - artifacts/hardwareai/convex/cad/validate/rules/print3dBedSize.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dMinWall.test.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dBedSize.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "Per-material wall thresholds live in rule module, not in CadIr schema (rules own their thresholds)."
  - "Bed-size rule uses a single default footprint constant; per-printer override deferred."

patterns-established:
  - "Process-gated rule: every print-3d rule guards on `ir.process === 'print_3d'` before evaluating geometry."
  - "Rule + colocated test: each rule.ts file ships with rules-{name}.test.ts under validate/__tests__/."

requirements-completed: [MFG-02]

# Metrics
duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 16: 3D-print Process Rules Summary

**Two process-gated 3D-printing manufacturing rules (`mfg.print-3d-min-wall` per-material, `mfg.print-3d-bed-size`) wired into `validateManufacturingTier` behind `process === 'print_3d'`.**

Implementation pre-existed on branch `feat/cad-ir-phase-16` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- `mfg.print-3d-min-wall` flags walls thinner than per-material thresholds when `process === 'print_3d'`.
- `mfg.print-3d-bed-size` flags parts whose footprint exceeds the default print-bed dimensions.
- Both rules composed into `validateManufacturingTier` and exposed in `prompts.ts` so the agent can reason about them; README updated.

## Task Commits

Each task was committed atomically:

1. **Task 1: `mfg.print-3d-min-wall` rule** — `a46123a` (feat)
2. **Task 2: `mfg.print-3d-bed-size` rule** — `d9732cf` (feat)
3. **Task 3: Compose into manufacturingTier + prompts/README** — `1f883be` (feat)

_Note: TDD tasks may have multiple commits (test → feat → refactor); these are squashed feat commits._

## Files Created/Modified
- `artifacts/hardwareai/convex/cad/validate/rules/print3dMinWall.ts` — per-material min-wall rule
- `artifacts/hardwareai/convex/cad/validate/rules/print3dBedSize.ts` — default-bed footprint rule
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dMinWall.test.ts` — unit tests for min-wall
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dBedSize.test.ts` — unit tests for bed-size
- `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` — composition of new rules behind process gate
- `artifacts/hardwareai/convex/cad/prompts.ts` — agent system prompt updated with new rule names
- `artifacts/hardwareai/convex/cad/README.md` — manufacturing-rules section updated

## Decisions Made
Documented retroactively from existing branch — see Task Commits below.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Mapping to ROADMAP success criteria
1. `mfg.print-3d-min-wall` fires only when `process` is `print_3d` and respects per-material thresholds — `print3dMinWall.ts` (`a46123a`), tests in `rules-print3dMinWall.test.ts`.
2. `mfg.print-3d-bed-size` flags parts whose footprint exceeds the default bed dimensions — `print3dBedSize.ts` (`d9732cf`), tests in `rules-print3dBedSize.test.ts`.
3. The same geometry under a non-print process passes both rules — covered by negative-case assertions in both rule test files; composition lives in `manufacturingTier.ts` (`1f883be`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Process-gated rule pattern is ready for the CNC rules in Phase 17.
- No blockers.

---
*Phase: 16-3d-print-process-rules*
*Completed: 2026-05-07*
