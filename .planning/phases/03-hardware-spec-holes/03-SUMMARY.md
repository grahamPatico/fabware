---
phase: 03-hardware-spec-holes
plan: 03
subsystem: cad-ir
tags: [cad-ir, holes, hardware, fasteners, manufacturing-rules, build123d]

# Dependency graph
requires:
  - phase: 02-patch-grammar-expansion
    provides: validate/rules/ pattern, patch grammar v2, manufacturingTier composition
provides:
  - HoleFeature subtype union (simple | countersink | counterbore | threaded)
  - Hole codegen for CounterSinkHole / CounterBoreHole / threaded variants
  - mfg.bolt-clearance manufacturing rule
  - Updated add_feature tool schema covering 4 hole sub-types
  - System prompt guidance for hole subtype selection
affects: [phase-04, phase-05, all-subsequent-cad-ir-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated union via Zod superRefine for HoleFeature subtypes"
    - "Codegen switch on hole.type → distinct build123d emitters"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/validate/rules/boltClearance.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-boltClearance.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts (HoleFeature subtype fields)
    - artifacts/hardwareai/convex/cad/ir/schema.ts (Zod superRefine per subtype)
    - artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
    - artifacts/hardwareai/convex/cad/codegen/features/hole.ts (subtype dispatch)
    - artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts
    - artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts (compose boltClearance)
    - artifacts/hardwareai/convex/cad/patch/tools.ts (add_feature input_schema for subtypes)
    - artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "HoleFeature is one type with a `type` discriminator + Zod superRefine, rather than four sibling feature kinds. Keeps existing add_feature tool surface coherent."
  - "Bolt-clearance rule lives in validate/rules/ alongside Phase 2 rules — no new tier introduced."

patterns-established:
  - "superRefine for subtype-level field requirements is the durable pattern for discriminated features in CAD IR"

requirements-completed: [HARDWARE-01]

# Metrics
completed: 2026-05-07
---

# Phase 3: Hardware-spec Holes Summary

**HoleFeature extended from a single simple type to four real-world hardware subtypes (simple, countersink, counterbore, threaded); each renders via build123d (CounterSinkHole, CounterBoreHole, threaded); mfg.bolt-clearance rule added; add_feature tool schema and system prompt teach the agent the new subtypes.**

**Implementation pre-existed on branch `feat/cad-ir-phase-3` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.**

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 9 commits on `feat/cad-ir-phase-3`
- **Files modified:** 12

## Accomplishments

- Hole IR became hardware-aware: countersink (with `csDiameter`/`csAngle`), counterbore (with `cbDiameter`/`cbDepth`), and threaded (with `threadSpec`) subtypes augment the simple variant.
- Each subtype has a codegen path emitting the matching build123d primitive (`CounterSinkHole`, `CounterBoreHole`, threaded hole emitter).
- New manufacturing rule `mfg.bolt-clearance` flags holes too close to bends/edges given a bolt+nut footprint at Tier 4.
- The `add_feature` Anthropic tool schema and system prompt now expose the four subtypes; the agent can pick the right one.

## Task Commits

Each commit corresponds to a task in the authoritative plan (`/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-3.md`):

1. **Task 1: extend HoleFeature TS types** — `fca39e7`
2. **Task 2: extend Zod schema with subtype superRefine** — `aa950be`
3. **Task 3: codegen CounterSinkHole** — `518c8a7`
4. **Task 4: codegen CounterBoreHole test** — `39bba90`
5. **Task 5: codegen threaded hole test** — `7086c86`
6. **Task 6: mfg.bolt-clearance rule** — `81a32ba`
7. **Task 7: add_feature tool schema for 4 hole subtypes** — `89f6442`
8. **Task 8: system prompt subtype guidance** — `2036895`
9. **Task 9: README + final sweep** — `b699b4e`

## Files Created/Modified

- `artifacts/hardwareai/convex/cad/ir/types.ts` — HoleFeature subtype fields
- `artifacts/hardwareai/convex/cad/ir/schema.ts` — superRefine per subtype
- `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts` — subtype validation cases
- `artifacts/hardwareai/convex/cad/codegen/features/hole.ts` — `switch (hole.type)`
- `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts` — countersink + counterbore + threaded cases
- `artifacts/hardwareai/convex/cad/validate/rules/boltClearance.ts` — new rule
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-boltClearance.test.ts`
- `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` — compose boltClearance
- `artifacts/hardwareai/convex/cad/patch/tools.ts` — extended `add_feature` input_schema
- `artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts`
- `artifacts/hardwareai/convex/cad/prompts.ts` — subtype guidance
- `artifacts/hardwareai/convex/cad/README.md` — Phase 3 scope

## Success Criteria Mapping

1. **HoleFeature can be countersink, counterbore, or threaded; each renders correctly via build123d.** — Covered by `fca39e7` + `aa950be` (types + schema), `518c8a7` (CounterSinkHole codegen), `39bba90` (CounterBoreHole codegen test), `7086c86` (threaded codegen test).
2. **Bolt-clearance rule flags a too-tight hole at Tier 3 [manufacturingTier] with a useful message.** — Covered by `81a32ba` and `convex/cad/validate/__tests__/rules-boltClearance.test.ts`.
3. **Anthropic tool schema and system prompt expose new subtypes; agent uses them in patches.** — Covered by `89f6442` (tool schema), `2036895` (system prompt), and `convex/cad/patch/__tests__/tools.test.ts`.

## Decisions Made

- HoleFeature stayed a single feature kind with a `type` discriminator (Zod superRefine) instead of becoming four sibling feature kinds. Avoids tool-surface explosion and keeps `add_feature` coherent.
- Bolt-clearance rule was placed alongside other manufacturing rules; no separate hardware tier was introduced.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits above. Branch tip is `b699b4e`.

## Verification

- **Method:** `tsc -b` of each `lib/*` package on the `feat/cad-ir-phase-3` branch tip.
- **Result:** PASS — 0 new errors in modified files.
- **Driver:** `/tmp/cad-ir-verify.sh`; results table `/tmp/cad-ir-verify-results.tsv`.
- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (inherited from main divergence, not introduced).

## Issues Encountered

None recorded.

## User Setup Required

None.

## Next Phase Readiness

- Phase 4 prerequisites (Phase 3 tip `b699b4e`) are met.
- HoleFeature subtype machinery is in place for assembly-level hardware-aware design in Phase 4+.

---
*Phase: 03-hardware-spec-holes*
*Completed: 2026-05-07*
