---
phase: 06-sweep-loft-weld-tab-mjcf
plan: 06
subsystem: cad-ir
tags: [cad-ir, sweep, loft, weld-tab, mjcf, motion-sim, build123d, codegen]

requires:
  - phase: 05-feature-round-out-multi-part-codegen
    provides: revolve/shell/bend_flange features, multi-part compileAssembly, min-bend-radius rule
provides:
  - SweepFeature, LoftFeature, WeldTabFeature types + Zod schemas + build123d codegen
  - add_feature tool entries for sweep / loft / weld_tab
  - compileToMjcf compiler (revolute → hinge, linear → slide) — second motion-sim target alongside URDF
affects: [phase-07, phase-19]

tech-stack:
  added: []
  patterns:
    - "Feature dispatch: type → Zod schema → codegen file → emitFeature dispatch case"
    - "Motion-sim compilers share source IR; XML grammar differs (URDF vs MJCF)"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/codegen/features/sweep.ts
    - artifacts/hardwareai/convex/cad/codegen/features/loft.ts
    - artifacts/hardwareai/convex/cad/codegen/features/weldTab.ts
    - artifacts/hardwareai/convex/cad/codegen/compileToMjcf.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/codegen/emitFeature.ts
    - artifacts/hardwareai/convex/cad/resolve/resolveIr.ts
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "MJCF mirrors the URDF compiler: same source IR, different XML grammar"
  - "weld_tab is a sheet-metal welding aid; treated as a generative feature in build123d codegen"

patterns-established:
  - "Each new feature gets: type, Zod variant, codegen file, dispatch case, schema test, codegen test"
  - "Motion-sim joint-kind mapping table lives in the compiler, not the IR"

requirements-completed: [FEATURE-02]

duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 6: Sweep/Loft/Weld_tab + MJCF Summary

**SweepFeature / LoftFeature / WeldTabFeature added to the IR with build123d codegen, plus a compileToMjcf compiler that emits MuJoCo XML from the same assembly source as URDF.**

> Implementation pre-existed on branch `feat/cad-ir-phase-6` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 6
- **Files modified:** 17

## Accomplishments
- SweepFeature (profile sketch + path sketch) compiles to build123d `Path → sweep`.
- LoftFeature blends ≥2 profile sketches; codegen rejects single-profile lofts at the schema tier.
- WeldTabFeature emits a generative tab as a sheet-metal welding aid.
- MJCF compiler emits MuJoCo XML with revolute joints mapped to `hinge` and linear joints mapped to `slide`, mirroring the URDF compiler's joint translation table.
- `add_feature` tool schema accepts the three new feature kinds; system prompt + README updated.

## Task Commits

1. **Task 1: SweepFeature** — `41b7599` (feat)
2. **Task 2: LoftFeature codegen + accept ≥2 / reject 1 tests** — `d8681ba` (feat)
3. **Task 3: WeldTabFeature codegen + test** — `2c7aaff` (feat)
4. **Task 4: tools.ts add_feature schema for sweep/loft/weld_tab** — `c61369e` (feat)
5. **Task 5: MJCF compiler (revolute→hinge, linear→slide)** — `1daeae5` (feat)
6. **Task 6: Prompts + README** — `e547314` (docs)

## Files Created/Modified

Grouped under `artifacts/hardwareai/convex/cad/`:

- `ir/types.ts`, `ir/schema.ts`, `ir/__tests__/schema.test.ts` — types + Zod for sweep/loft/weld_tab
- `codegen/features/sweep.ts`, `loft.ts`, `weldTab.ts` — per-feature build123d emitters
- `codegen/__tests__/compile-sweep.test.ts`, `compile-loft.test.ts`, `compile-weldTab.test.ts` — codegen tests
- `codegen/emitFeature.ts` — dispatch added for the three new kinds
- `codegen/compileToMjcf.ts`, `codegen/__tests__/compileToMjcf.test.ts` — MJCF compiler + tests
- `resolve/resolveIr.ts` — resolver updates for new feature kinds
- `patch/tools.ts`, `patch/__tests__/tools.test.ts` — add_feature schema + test
- `prompts.ts` — agent system prompt updated
- `README.md` — feature catalog updated

## Decisions Made
- MJCF and URDF share the same source IR; both compilers live in `codegen/` and translate joint kinds via a small lookup (revolute → hinge for MJCF, revolute joint for URDF; linear → slide / prismatic respectively).
- WeldTabFeature is codegen-only — no Tier 3 manufacturing rule introduced this phase.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded on the implementation branch.

## User Setup Required
None.

## Verification

- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (chat.ts, projectChat.ts, partSpecs.ts, partValidator.ts, AssembledView.tsx, AssemblyPartsPanel.tsx, CanvasPanel.tsx, ChatPanel.tsx, InterfaceList.tsx, PartList.tsx, RulesStatusStrip.tsx, Chat.tsx, Export.tsx, Home.tsx, Workspace.tsx) inherited from main / scaffold.
- **Method:** typecheck on phase branch tip after `tsc -b` of each `lib/*` package; intersect error paths with per-phase modified files.

## Success Criteria → Evidence

1. **Assembly with sweep/loft/weld_tab compiles via build123d** — covered by `compile-sweep.test.ts`, `compile-loft.test.ts`, `compile-weldTab.test.ts` (commits `41b7599`, `d8681ba`, `2c7aaff`).
2. **Same assembly compiles to URDF and MJCF** — `compileToMjcf.ts` + `compileToMjcf.test.ts` (commit `1daeae5`); URDF compiler from Phase 4 unchanged.
3. **Both motion-sim outputs load in their viewers** — manual verification (URDF/MJCF viewer load).

## Plan Reference

Authoritative scope: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-6.md`.

## Next Phase Readiness
Feature catalog is wide enough for Phase 7 to layer declarative sketch constraints on top. MJCF is a stable second motion-sim target.

---
*Phase: 06-sweep-loft-weld-tab-mjcf*
*Completed: 2026-05-07*
