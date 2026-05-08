---
phase: 17-cnc-process-rules
plan: 17
subsystem: validate
tags: [cad-ir, manufacturing-rules, cnc, process-gating, schema, vitest]

# Dependency graph
requires:
  - phase: 13-process-aware-machine-cost
    provides: CadIr.process field with cnc as a known process
  - phase: 16-3d-print-process-rules
    provides: process-gated rule composition pattern
provides:
  - CadIr.cncToolDiameter first-class field (types + Zod schema)
  - mfg.cnc-min-internal-corner rule (gated on process === 'cnc')
  - mfg.cnc-pocket-too-deep rule (gated on process === 'cnc')
  - Composition into validateManufacturingTier
affects: [phase-19-final-consolidation-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - process-gated manufacturing rule (continued from Phases 14, 16)
    - process-specific tuning field on CadIr (cncToolDiameter)

key-files:
  created:
    - artifacts/hardwareai/convex/cad/validate/rules/cncMinInternalCorner.ts
    - artifacts/hardwareai/convex/cad/validate/rules/cncPocketTooDeep.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-cncMinInternalCorner.test.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-cncPocketTooDeep.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
    - artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "cncToolDiameter is a first-class top-level CadIr field (not nested under process), so the validator can reference it without process-specific schema branching."
  - "Pocket-too-deep ratio uses depth-to-diameter heuristic rather than absolute depth, so the rule scales with tool size."

patterns-established:
  - "Process-specific tuning field on CadIr: process gating + a numeric field that the rule consumes."
  - "Schema test colocated under ir/__tests__/ asserts new field is optional and round-trips."

requirements-completed: [MFG-03]

# Metrics
duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 17: CNC Process Rules Summary

**`cncToolDiameter` becomes a first-class CadIr field and two process-gated CNC rules (`mfg.cnc-min-internal-corner`, `mfg.cnc-pocket-too-deep`) land in `validateManufacturingTier`.**

Implementation pre-existed on branch `feat/cad-ir-phase-17` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments
- `CadIr.cncToolDiameter` lands in both TypeScript types and the Zod schema, with a colocated schema test.
- `mfg.cnc-min-internal-corner` flags internal corners smaller than `cncToolDiameter` only when `process === 'cnc'`.
- `mfg.cnc-pocket-too-deep` flags excessive depth-to-diameter pocket ratios only when `process === 'cnc'`.
- Composition into `validateManufacturingTier`; prompts and README updated.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add `cncToolDiameter` field** — `d73984d` (feat)
2. **Task 2: `mfg.cnc-min-internal-corner` rule** — `25bbaa4` (feat)
3. **Task 3: `mfg.cnc-pocket-too-deep` rule** — `26e2280` (feat)
4. **Task 4: Compose CNC rules into manufacturingTier + prompts/README** — `f0020dc` (feat)

_Note: TDD tasks may have multiple commits (test → feat → refactor); these are squashed feat commits._

## Files Created/Modified

### `artifacts/hardwareai/convex/cad/ir/`
- `types.ts` — `CadIr.cncToolDiameter` added to TypeScript type
- `schema.ts` — Zod schema field for `cncToolDiameter` (optional number)
- `__tests__/schema.test.ts` — round-trip test for the new field

### `artifacts/hardwareai/convex/cad/validate/`
- `rules/cncMinInternalCorner.ts` — internal-corner radius vs tool-diameter rule
- `rules/cncPocketTooDeep.ts` — pocket depth-to-diameter ratio rule
- `__tests__/rules-cncMinInternalCorner.test.ts` — unit tests including non-CNC pass case
- `__tests__/rules-cncPocketTooDeep.test.ts` — unit tests including non-CNC pass case
- `manufacturingTier.ts` — both rules composed behind process === 'cnc' gate

### `artifacts/hardwareai/convex/cad/`
- `prompts.ts` — agent prompt enumerates new CNC rule names
- `README.md` — manufacturing-rules section updated

## Decisions Made
Documented retroactively from existing branch — see Task Commits below.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Mapping to ROADMAP success criteria
1. `cncToolDiameter` is a first-class field on CAD IR — `ir/types.ts` and `ir/schema.ts` (`d73984d`), schema test in `ir/__tests__/schema.test.ts`.
2. `mfg.cnc-min-internal-corner` flags internal corners smaller than `cncToolDiameter` only when `process` is `cnc` — `cncMinInternalCorner.ts` (`25bbaa4`), tests cover both CNC violation and non-CNC pass.
3. `mfg.cnc-pocket-too-deep` flags excessively deep pockets only when `process` is `cnc` — `cncPocketTooDeep.ts` (`26e2280`), tests cover both CNC violation and non-CNC pass; composition in `manufacturingTier.ts` (`f0020dc`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Process-gated rule infrastructure now covers laser-cut, print-3d, and CNC; ready for Phase 19 mega-integration.
- No blockers.

---
*Phase: 17-cnc-process-rules*
*Completed: 2026-05-07*
