---
phase: 18-step-imports-for-externals
plan: 18
subsystem: codegen
tags: [cad-ir, build123d, step, external-parts, schema, patch-tools, vitest]

# Dependency graph
requires:
  - phase: 9-external-parts-bom-compiler
    provides: ExternalPartRef discriminated union and PartRef
  - phase: 5-feature-round-out-multi-part-codegen
    provides: compileAssembly multi-part codegen
provides:
  - ExternalPartRef.stepUrl optional field (types + Zod schema)
  - compileAssembly emits build123d import_step calls for externals with stepUrl
  - add_part / patch tool surface accepts stepUrl
affects: [phase-19-final-consolidation-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - URL-bearing optional field on a discriminated-union variant (ExternalPartRef)
    - codegen emits a side-effect import call when an optional field is present

key-files:
  created: []
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/partRefSchema.test.ts
    - artifacts/hardwareai/convex/cad/codegen/compileAssembly.ts
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compileAssembly.test.ts
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "stepUrl is optional, not required, to keep BOM-only externals (no STEP) working unchanged."
  - "compileAssembly emits import_step inline in the generated build123d script; the Vercel Sandbox executor handles the actual fetch at run time."

patterns-established:
  - "Optional URL field on a union variant flows through schema → patch tools → codegen as one cohesive change."

requirements-completed: [EXTERNAL-01]

# Metrics
duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 18: STEP Imports for Externals Summary

**`ExternalPartRef.stepUrl` is an optional first-class field; `compileAssembly` emits build123d `import_step` for externals that carry one; the patch tool surface accepts it.**

Implementation pre-existed on branch `feat/cad-ir-phase-18` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Started:** 2026-05-07
- **Completed:** 2026-05-07
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- `ExternalPartRef.stepUrl` lands as an optional field in both TypeScript types and the Zod schema, with a colocated `partRefSchema.test.ts`.
- `compileAssembly` emits `import_step` calls for external parts that carry a `stepUrl`; build123d output verified by `compileAssembly.test.ts`.
- `add_part` / patch tool surface accepts `stepUrl`, exercised by `patch/__tests__/tools.test.ts`.
- Prompts and README updated to describe the new field and codegen behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ExternalPartRef with stepUrl** — `87f2b4e` (feat)
2. **Task 2: compileAssembly emits import_step for externals with stepUrl** — `d410cc8` (feat)
3. **Task 3: Update tools + prompts + README** — `fedb181` (feat)

_Note: TDD tasks may have multiple commits (test → feat → refactor); these are squashed feat commits._

## Files Created/Modified

### `artifacts/hardwareai/convex/cad/ir/`
- `types.ts` — `ExternalPartRef.stepUrl?: string` added
- `schema.ts` — optional `stepUrl` on the external variant of the PartRef union
- `__tests__/partRefSchema.test.ts` — round-trip test confirming both with-stepUrl and without-stepUrl variants validate

### `artifacts/hardwareai/convex/cad/codegen/`
- `compileAssembly.ts` — emits `import_step('<url>')` inline in the generated build123d script when an external part carries `stepUrl`
- `__tests__/compileAssembly.test.ts` — asserts `import_step` appears in generated script for stepUrl-bearing externals

### `artifacts/hardwareai/convex/cad/patch/`
- `tools.ts` — `add_part` (and related) accept the optional `stepUrl`
- `__tests__/tools.test.ts` — round-trip patch test through `toolCallToPatch`

### `artifacts/hardwareai/convex/cad/`
- `prompts.ts` — agent prompt mentions `stepUrl` for external parts
- `README.md` — external-parts / codegen sections updated

## Decisions Made
Documented retroactively from existing branch — see Task Commits below.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Mapping to ROADMAP success criteria
1. `ExternalPartRef.stepUrl` is optional and validates — `ir/types.ts` and `ir/schema.ts` (`87f2b4e`); test in `ir/__tests__/partRefSchema.test.ts`.
2. `compileAssembly` emits build123d `import_step` calls for external parts that carry a `stepUrl` — `codegen/compileAssembly.ts` (`d410cc8`); asserted by `codegen/__tests__/compileAssembly.test.ts`.
3. An assembly with a `stepUrl`-bearing external part compiles, runs, and the imported STEP geometry shows up in the assembled preview — codegen path verified by automated test (`d410cc8`); the actual Vercel-Sandbox `import_step` execution + glTF preview is exercised by the Phase 19 mega-integration test and verified visually (see Phase 19 manual verifications).

## User Setup Required
None - no external service configuration required. STEP files are fetched at executor time from the URL the agent supplies; no system-wide CAD library install needed.

## Next Phase Readiness
- All Phase 19 prerequisites in place: external-with-stepUrl flows into compileAssembly, ready for the mega-integration test.
- No blockers.

---
*Phase: 18-step-imports-for-externals*
*Completed: 2026-05-07*
