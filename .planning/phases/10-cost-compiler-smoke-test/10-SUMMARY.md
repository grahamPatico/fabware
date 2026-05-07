---
phase: 10-cost-compiler-smoke-test
plan: 10
subsystem: cad-ir
tags: [cad-ir, cost, pricing, budget, integration-test, smoke-test, compile-target]

requires:
  - phase: 09-external-parts-bom-compiler
    provides: BOM compiler + ExternalPartRef the cost compiler consumes
provides:
  - compileCost(ir, db?): structured CostResult { totalUsd, entries, unknown }
  - BUILTIN_PRICING: small in-code map keyed by `${vendor}::${partNumber}`
  - Optional CadIr.budget field + Zod
  - budgetExceeded validation rule (warns when total > budget)
  - End-to-end integration smoke test (hinged enclosure) exercising the full Phase 1–10 stack
affects: [phase-12, phase-13, phase-19]

tech-stack:
  added: []
  patterns:
    - "PricingDb is caller-supplied with BUILTIN_PRICING fallback"
    - "Unknown parts surface in CostResult.unknown rather than throwing"
    - "Integration smoke test = canonical regression net for the architectural stack"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/compile/cost.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/cost.test.ts
    - artifacts/hardwareai/convex/cad/validate/rules/budgetExceeded.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-budgetExceeded.test.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/budget-schema.test.ts
    - artifacts/hardwareai/convex/cad/__tests__/integration-phase10.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/plugin.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "BUILTIN_PRICING ships a few representative entries; production will query vendor APIs (McMaster-Carr / Misumi)"
  - "Unknown parts go in CostResult.unknown rather than throwing — keeps cost a soft signal"
  - "budgetExceeded is a warn-tier rule, not a hard fail"
  - "Integration smoke lives in convex/cad/__tests__/integration-phase10.test.ts as the canonical end-to-end test"

patterns-established:
  - "Compile targets accumulate in convex/cad/compile/ (bom from Phase 9, cost here, more in Phase 12+)"
  - "Per-phase integration tests document architectural reach"

requirements-completed: [COMPILE-02]

duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 10: Cost Compiler + Smoke Test Summary

**`compileCost(ir, db?)` turns the BOM into a dollar total with a built-in pricing fallback; `budgetExceeded` warns when a declared `CadIr.budget` is overrun; a hinged-enclosure integration smoke test exercises every Phase 1–10 system together.**

> Implementation pre-existed on branch `feat/cad-ir-phase-10` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 5
- **Files modified:** 11

## Accomplishments
- `compileCost(ir, db?)` returns `{ totalUsd, entries, unknown }`. Known parts aggregate by `${vendor}::${partNumber}`; unknown parts surface in `unknown` instead of throwing.
- `BUILTIN_PRICING` ships a small representative pricing map; callers may pass a custom `PricingDb` to override.
- `CadIr.budget` is an optional top-level field (number, USD); Zod parses it with budget-schema tests.
- `budgetExceeded` rule: warns when `compileCost(ir).totalUsd > ir.budget`; composed into the plugin's manufacturing tier alongside other warn-tier rules.
- Comprehensive integration smoke test (`integration-phase10.test.ts`) exercises a hinged enclosure end-to-end: parametric IR → multi-feature codegen → multi-part assembly → AABB interference → BOM → cost → URDF + MJCF — all green.
- Prompts + README updated with cost-estimation guidance.

## Task Commits

1. **Task 1: compileCost + BUILTIN_PRICING** — `220fa58` (feat)
2. **Task 2: CadIr.budget optional field — types + Zod** — `4feb6ce` (feat)
3. **Task 3: budgetExceeded rule + plugin compose** — `c6b16c9` (feat)
4. **Task 4: comprehensive integration smoke test (hinged enclosure)** — `621577d` (test)
5. **Task 5: prompts + README — cost section** — `90b588e` (docs)

## Files Created/Modified

Grouped under `artifacts/hardwareai/convex/cad/`:

- `compile/cost.ts` (new) + `compile/__tests__/cost.test.ts` — cost compiler
- `validate/rules/budgetExceeded.ts` (new) + `validate/__tests__/rules-budgetExceeded.test.ts` — budget rule
- `ir/types.ts`, `ir/schema.ts`, `ir/__tests__/budget-schema.test.ts` — `CadIr.budget` field
- `plugin.ts` — compose `budgetExceeded` into validate
- `__tests__/integration-phase10.test.ts` — full-stack hinged-enclosure smoke
- `prompts.ts`, `README.md` — documentation

## Decisions Made
- Cost is a soft signal: unknown parts do not fail validation; they appear in `CostResult.unknown` for the agent to triage.
- `budgetExceeded` is warn-tier, mirroring how Tier 3 manufacturing rules treat soft constraints.
- The integration smoke is co-located in `convex/cad/__tests__/` (not `compile/__tests__/`) to signal its cross-cutting role.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded on the implementation branch.

## User Setup Required
None.

## Verification

- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (chat.ts, projectChat.ts, partSpecs.ts, partValidator.ts, AssembledView.tsx, AssemblyPartsPanel.tsx, CanvasPanel.tsx, ChatPanel.tsx, InterfaceList.tsx, PartList.tsx, RulesStatusStrip.tsx, Chat.tsx, Export.tsx, Home.tsx, Workspace.tsx) inherited from main / scaffold.
- **Method:** typecheck on phase branch tip after `tsc -b` of each `lib/*` package; intersect error paths with the modified-files list.

## Success Criteria → Evidence

1. **`compileCost(ir, pricingDb)` returns structured CostResult** — `cost.test.ts` (commit `220fa58`).
2. **Assembly with `budget` set produces `budgetExceeded` violation when materials/processes exceed it** — `rules-budgetExceeded.test.ts` (commit `c6b16c9`); `budget-schema.test.ts` for the schema (commit `4feb6ce`).
3. **Full-stack integration smoke test passes from agent patch through validate, compile, BOM, and cost** — `integration-phase10.test.ts` (commit `621577d`).

## Plan Reference

Authoritative scope: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-10.md`.

## Next Phase Readiness
The compile/ directory now hosts BOM (Phase 9) + cost (this phase). Phase 11 (joint-range self-collision) and Phase 12 (inline-part fab cost) extend along the validate and compile axes respectively. The integration smoke test is the canonical regression net going forward.

---
*Phase: 10-cost-compiler-smoke-test*
*Completed: 2026-05-07*
