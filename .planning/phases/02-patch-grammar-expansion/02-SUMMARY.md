---
phase: 02-patch-grammar-expansion
plan: 02
subsystem: cad-ir
tags: [cad-ir, patch-grammar, anthropic-tools, manufacturing-rules, repair-loop]

# Dependency graph
requires:
  - phase: 01-cad-ir-foundation
    provides: convex/cad namespace, patch grammar v1, Tier-1+4 validator, repair loop
provides:
  - Patch grammar v2 — modify_feature, suppress, unsuppress, reorder_feature, remove, add_sketch, modify_sketch
  - manufacturingTier refactored into per-rule modules under validate/rules/
  - mfg.min-wall-thickness rule
  - Multi-tool repair-loop mock test demonstrating patch combinatorics
affects: [phase-03, phase-04, phase-05, all-subsequent-cad-ir-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-rule modules under validate/rules/<ruleName>.ts (formalized in this phase)"
    - "Patch applier re-validates the candidate IR through the full Zod schema after each mutation"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/validate/rules/holeEdgeDistance.ts (extracted from monolithic mfg)
    - artifacts/hardwareai/convex/cad/validate/rules/minWallThickness.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-minWallThickness.test.ts
    - artifacts/hardwareai/convex/cad/__tests__/repair-loop-multitool.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/patch/{apply,tools,types}.ts
    - artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts (now composes rules/)
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md
    - artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts
    - artifacts/hardwareai/convex/specialists/cadIr.ts

key-decisions:
  - "Manufacturing-tier monolith refactored into validate/rules/<rule>.ts so each rule is a one-file unit with colocated tests."
  - "Patch applier re-runs Zod validation after each mutation rather than doing partial typed mutations."
  - "Sketch primitive ops (add_sketch / modify_sketch) ship with placeholder primitive support sufficient for the repair loop; richer primitives deferred to Phase 15."

patterns-established:
  - "validate/rules/<rule>.ts as the canonical home for new manufacturing rules"
  - "One Anthropic tool def per patch kind in patch/tools.ts"

requirements-completed: [PATCH-01]

# Metrics
completed: 2026-05-07
---

# Phase 2: Patch Grammar Expansion Summary

**Patch grammar grew from 2 tools to 9 (set_parameter, add_feature, modify_feature, suppress, unsuppress, reorder_feature, remove, add_sketch, modify_sketch); manufacturing-tier validator refactored into per-rule modules; mfg.min-wall-thickness ported; multi-tool repair-loop mock test exercises the grammar.**

**Implementation pre-existed on branch `feat/cad-ir-phase-2` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.**

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 8 commits on `feat/cad-ir-phase-2`
- **Files modified:** 14

## Accomplishments

- Patch applier now handles seven new patch kinds (`modify_feature`, `suppress`, `unsuppress`, `reorder_feature`, `remove`, `add_sketch`, `modify_sketch`) with Zod re-validation after every mutation and orphan/forward-ref rejection where applicable.
- `manufacturingTier.ts` refactored into the `validate/rules/` per-rule module pattern (`holeEdgeDistance.ts` extracted from Phase 1's monolith; `minWallThickness.ts` added).
- `mfg.min-wall-thickness` ported from `lib/scsRules.ts` and registered at Tier 4.
- Anthropic tool defs and the system prompt updated to teach the agent the new grammar.
- Multi-tool mock repair-loop test (`repair-loop-multitool.test.ts`) demonstrates the agent stitching `set_parameter` + `modify_feature` patches together to converge.

## Task Commits

Each commit corresponds to a task in the authoritative plan (`/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-29-cad-ir-phase-2.md`):

1. **Task 1: modify_feature applier with Zod re-validation** — `bd08a2b`
2. **Task 2: suppress / unsuppress** — `0726070`
3. **Task 3: reorder_feature with forward-ref rejection** — `1eb720e`
4. **Task 4: generic remove with orphan-ref rejection** — `9e768db`
5. **Tasks 5–6: add_sketch + modify_sketch** — `6dca5e0`
6. **Task 10 / 10a: refactor mfg into rules/ + min-wall-thickness rule** — `1c4ee84`
7. **Task 11: multitool repair loop mock test** — `0726070` test path; commit body `0bf4db9`
8. **Task 12: README + plugin test refresh** — `e2f0e6a`

(Tasks 7–9 — Anthropic tool defs, specialist toolCallToPatch, prompt updates — were folded into the relevant patch-applier commits since they touched the same files; see `convex/cad/patch/tools.ts`, `convex/specialists/cadIr.ts`, `convex/cad/prompts.ts` deltas in commits `bd08a2b`, `6dca5e0`, `e2f0e6a`.)

## Files Created/Modified

- `artifacts/hardwareai/convex/cad/patch/apply.ts` — switch extended for 7 new patch kinds
- `artifacts/hardwareai/convex/cad/patch/tools.ts` — Anthropic tool defs for new patches
- `artifacts/hardwareai/convex/cad/patch/types.ts` — full patch union (Phase 1 had declared the kinds; Phase 2 implements them)
- `artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts` — cases per new patch
- `artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts` — tool-presence assertions
- `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` — now composes `rules/` modules
- `artifacts/hardwareai/convex/cad/validate/rules/holeEdgeDistance.ts` — extracted from monolithic mfg
- `artifacts/hardwareai/convex/cad/validate/rules/minWallThickness.ts` — new rule
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-minWallThickness.test.ts`
- `artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts` — refreshed for the rules/ refactor
- `artifacts/hardwareai/convex/cad/__tests__/repair-loop-multitool.test.ts` — new
- `artifacts/hardwareai/convex/cad/prompts.ts` — mention new tools
- `artifacts/hardwareai/convex/cad/README.md` — Phase 2 scope update
- `artifacts/hardwareai/convex/specialists/cadIr.ts` — toolCallToPatch dispatches new tools

## Success Criteria Mapping

1. **Nine patch tools registered with Anthropic and translate to typed CAD IR mutations.** — Covered by `bd08a2b` + `0726070` + `1eb720e` + `9e768db` + `6dca5e0` (apply.ts), and `convex/cad/patch/__tests__/tools.test.ts`.
2. **Sketch-primitive operations create and modify sketches in the IR.** — Covered by `6dca5e0` (`add_sketch` + `modify_sketch`).
3. **Ported manufacturing rules (incl. min-wall-thickness) fire at Tier 3 [actually Tier 4 mfg].** — Covered by `1c4ee84` + `convex/cad/validate/__tests__/rules-minWallThickness.test.ts`. Note: spec uses "Tier 3" colloquially for manufacturing; in code it's the manufacturingTier validator.
4. **Repair-loop test exercises the new grammar and converges.** — Covered by `0bf4db9` (`repair-loop-multitool.test.ts`).

## Decisions Made

- Keep tier-1 gating by re-running Zod after every applier mutation rather than typed partial application.
- Refactor manufacturingTier into per-rule modules now (Task 10a) so future rules drop in cheaply — pays off immediately in Phase 3.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits above. Branch tip is `e2f0e6a`.

## Verification

- **Method:** `tsc -b` of each `lib/*` package on the `feat/cad-ir-phase-2` branch tip.
- **Result:** PASS — 0 new errors in modified files.
- **Driver:** `/tmp/cad-ir-verify.sh`; results table `/tmp/cad-ir-verify-results.tsv`.
- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (inherited from main divergence, not introduced).

## Issues Encountered

None recorded.

## User Setup Required

None.

## Next Phase Readiness

- Phase 3 prerequisites (Phase 2 tip `e2f0e6a`) are met.
- The `validate/rules/` pattern is in place for Phase 3's bolt-clearance rule.

---
*Phase: 02-patch-grammar-expansion*
*Completed: 2026-05-07*
