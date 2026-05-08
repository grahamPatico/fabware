---
phase: 01-cad-ir-foundation
plan: 01
subsystem: cad-ir
tags: [cad-ir, build123d, vercel-sandbox, zod, convex, anthropic-tools, repair-loop]

# Dependency graph
requires:
  - phase: v0-foundations
    provides: AI Harness Plans 1+2+3 (plugin scaffold, sheet-metal validator, agent repair loop) on main
provides:
  - convex/cad namespace with IR types, Zod schema, expression parser/evaluator
  - resolveIr (parameter evaluation, ref concretization)
  - Tier-1 schema validator and Tier-3 geometry validator (entities parser)
  - build123d codegen (extrude, cut_extrude, fillet, chamfer, hole, pattern)
  - Vercel Sandbox executor with build123d-runner.py + report_helpers.py
  - Content-addressed revision hashing (SHA-256)
  - cad_revisions / cad_revision_artifacts tables; parts.useCadIr + parts.headRevisionHash
  - Patch grammar v1 (set_parameter, add_feature) with applier, Anthropic tool defs, system-prompt fragment
  - First manufacturing rule (mfg.hole-edge-distance) at Tier 4
  - cadIrPlugin (ProcessPlugin<CadIr>) with Tier-1+4 validate
  - Specialist action wiring patch+execute repair loop
  - setUseCadIr part-level toggle
  - CadPreview three.js component for glb artifacts
affects: [phase-02, phase-03, phase-04, phase-05, all-subsequent-cad-ir-phases]

# Tech tracking
tech-stack:
  added: ["@vercel/sandbox", "build123d==0.7.0 (sandbox)", "zod v4 schemas for CAD IR"]
  patterns:
    - "convex/cad/ namespace as single source of CAD IR truth"
    - "Tiered validation (1 schema, 3 geometry, 4 manufacturing)"
    - "ProcessPlugin<CadIr> + repair loop reuse"
    - "Content-addressed revision storage"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/ir/{types,schema,empty}.ts
    - artifacts/hardwareai/convex/cad/expression/{parser,evaluator}.ts
    - artifacts/hardwareai/convex/cad/validate/{schemaTier,geometryTier,manufacturingTier}.ts
    - artifacts/hardwareai/convex/cad/codegen/compileToBuild123d.ts
    - artifacts/hardwareai/convex/cad/codegen/features/{extrude,cutExtrude,fillet,chamfer,hole,pattern}.ts
    - artifacts/hardwareai/convex/cad/executor/{runSandbox,entitiesParser}.ts
    - artifacts/hardwareai/convex/cad/patch/{types,apply,tools}.ts
    - artifacts/hardwareai/convex/cad/plugin.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/resolve/resolveIr.ts
    - artifacts/hardwareai/convex/cad/revisions/hash.ts
    - artifacts/hardwareai/convex/specialists/{cadIr,cadIrInternals}.ts
    - artifacts/hardwareai/scripts/sandbox/{build123d-runner.py,report_helpers.py,requirements.txt}
    - artifacts/hardwareai/src/components/CadPreview.tsx
  modified:
    - artifacts/hardwareai/convex/schema.ts (cad_revisions, cad_revision_artifacts, parts.useCadIr/headRevisionHash)
    - artifacts/hardwareai/convex/projects.ts (setUseCadIr mutation)
    - artifacts/hardwareai/convex/orchestrator/tick.ts

key-decisions:
  - "Phase 1 ships TWO patch tools (set_parameter + add_feature), not one as spec §11 implied — agent cannot author parameters from inside add_feature without violating the patch grammar."
  - "Zod v4 (matches existing harness code) used for all CAD IR schemas."
  - "Tier-1 gating in patch applier: every applied patch is re-parsed through the Zod schema."
  - "SHA-256 of canonicalized JSON used for revision hash — content-addressed, not opaque ID."

patterns-established:
  - "Per-feature emitter modules in codegen/features/<kind>.ts"
  - "Per-rule modules under validate/rules/ (formalized in Phase 2 refactor)"
  - "Tests colocated under __tests__ next to source"
  - "Sandbox runner consumes JSON IR on stdin, emits JSON report to stdout"

requirements-completed: [CADIR-01]

# Metrics
completed: 2026-05-07
---

# Phase 1: CAD IR Foundation Summary

**convex/cad namespace shipped end-to-end: types/schema/evaluator/Tier-1+3 validator/build123d codegen (6 features)/Vercel Sandbox executor/patch grammar v1 (set_parameter, add_feature)/Anthropic tool defs/cadIrPlugin/repair-loop wiring/CadPreview UI.**

**Implementation pre-existed on branch `feat/cad-ir-phase-1` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.**

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 31 commits on `feat/cad-ir-phase-1` (1 deps commit + 30 implementation/test/docs commits)
- **Files modified:** 60 (entire convex/cad/ namespace bootstrap + sandbox runner + UI preview + Convex schema)

## Accomplishments

- Stood up the full convex/cad namespace including IR types/schema, expression parser+evaluator, resolver, Tier-1 schema validator, Tier-3 geometry validator (with entities parser), Tier-4 manufacturing validator, six-feature build123d codegen, Vercel Sandbox executor, content-addressed revision hashing, and Convex schema additions.
- Wired the agent: patch grammar v1 with set_parameter + add_feature, Anthropic tool defs, system prompt fragment, specialist action that drives the existing runAgentRepairLoop, and a setUseCadIr part-level toggle.
- Demonstrated convergence: a synthetic hole-edge-distance violation drives `runAgentRepairLoop` to convergence end-to-end via the mock repair-loop test.
- Locked codegen stability with the bracket golden snapshot and shipped the CadPreview three.js component for glb artifacts.

## Task Commits

Each commit corresponds to one of the 30 task commits in the authoritative plan (`/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`):

1. **Task 1: CAD IR types** — `ce2fe0f`
2. **Task 2: CAD IR Zod schema** — `0564470`
3. **Task 3: emptyIr() factory** — `89cf5d6`
4. **Task 4: Expression parser** — `04d55d6`
5. **Task 5: Expression evaluator** — `b50d4d4`
6. **Task 6: Schema-tier validator** — `1c9cf38`
7. **Task 7: ResolvedIR + resolver** — `cd9d5ae`
8. **Task 8: Codegen skeleton + extrude** — `497155e`
9. **Task 9: cut_extrude emit** — `1859cf7`
10. **Task 10: fillet emit** — `4daf589`
11. **Task 11: chamfer emit** — `c6cb586`
12. **Task 12: hole emit (simple)** — `9367307`
13. **Task 13: pattern emit** — `28252e2`
14. **Task 14: Sandbox runner Python** — `2564a05`
15. **Deps: @vercel/sandbox** — `b407c60`
16. **Task 15: Sandbox executor TS wrapper** — `4431c5b`
17. **Task 16: Entities parser + geometry-tier validator** — `1485b47`
18. **Task 17: Revision hashing** — `df90be7`
19. **Task 18: Convex schema additions** — `178ef10`
20. **Task 19: Patch types** — `39c21b5`
21. **Task 20: Patch applier** — `6dc7f80`
22. **Task 21: Patch agent tools** — `359a929`
23. **Task 22: System prompt** — `ea7e9a3`
24. **Task 23: Manufacturing-rule port (hole-edge-distance)** — `54e848d`
25. **Task 24: CAD IR plugin object** — `a9432f3`
26. **Task 25: CAD IR specialist action** — `9c903d1`
27. **Task 26: setUseCadIr mutation** — `367e876`
28. **Task 27: End-to-end mock repair-loop integration test** — `9af46d1`
29. **Task 28: Full bracket golden snapshot** — `8a1c662`
30. **Task 29: Frontend preview component** — `ef89b8d`
31. **Task 30: Module README** — `d46ca95`

## Files Created/Modified

Grouped by directory:

- `artifacts/hardwareai/convex/cad/ir/` — `types.ts`, `schema.ts`, `empty.ts` (Zod schema + types + factory)
- `artifacts/hardwareai/convex/cad/expression/` — `parser.ts`, `evaluator.ts` (no-deps expression engine)
- `artifacts/hardwareai/convex/cad/resolve/` — `resolveIr.ts` (param evaluation, ref concretization)
- `artifacts/hardwareai/convex/cad/validate/` — `schemaTier.ts` (Tier 1), `geometryTier.ts` (Tier 3), `manufacturingTier.ts` (Tier 4)
- `artifacts/hardwareai/convex/cad/codegen/` — `compileToBuild123d.ts`, `emitFeature.ts`, `emitParameters.ts`, `refOrLit.ts`, plus `features/{extrude,cutExtrude,fillet,chamfer,hole,pattern}.ts`
- `artifacts/hardwareai/convex/cad/executor/` — `runSandbox.ts`, `entitiesParser.ts`
- `artifacts/hardwareai/convex/cad/patch/` — `types.ts`, `apply.ts`, `tools.ts` (set_parameter + add_feature)
- `artifacts/hardwareai/convex/cad/revisions/` — `hash.ts` (canonicalized SHA-256)
- `artifacts/hardwareai/convex/cad/` — `plugin.ts`, `prompts.ts`, `README.md`
- `artifacts/hardwareai/convex/cad/__tests__/` — `plugin.test.ts`, `repair-loop-mock.test.ts`
- `artifacts/hardwareai/convex/specialists/` — `cadIr.ts`, `cadIrInternals.ts`
- `artifacts/hardwareai/convex/` — `schema.ts` (cad_revisions, cad_revision_artifacts, parts.useCadIr/headRevisionHash), `projects.ts` (setUseCadIr mutation), `orchestrator/tick.ts`
- `artifacts/hardwareai/scripts/sandbox/` — `build123d-runner.py`, `report_helpers.py`, `requirements.txt`
- `artifacts/hardwareai/src/components/CadPreview.tsx` — three.js glb preview
- Test colocations: per-feature codegen tests, expression tests, resolveIr test, schema/geometry/manufacturing tier tests, patch apply/tools tests, hash test, entitiesParser test
- Tooling: `artifacts/hardwareai/package.json` (@vercel/sandbox), `artifacts/hardwareai/vitest.config.ts`, `pnpm-lock.yaml`

## Success Criteria Mapping

1. **CAD IR document with parts/sketches/features/parameters validates and compiles to build123d Python.** — Covered by `0564470` (schema), `1c9cf38` (Tier-1 validator), `497155e`–`28252e2` (six-feature codegen), `8a1c662` (bracket golden snapshot).
2. **Vercel Sandbox executor runs generated build123d and returns geometry artifacts.** — Covered by `2564a05` (sandbox runner Python), `4431c5b` (TS wrapper), `1485b47` (entities parser + geometry-tier validator), `b407c60` (@vercel/sandbox dep).
3. **Agent applies set_parameter and add_feature patches via tool calls; ProcessPlugin<CadIr> registered.** — Covered by `39c21b5` (patch types), `6dc7f80` (applier), `359a929` (Anthropic tool defs), `a9432f3` (cadIrPlugin), `9c903d1` (specialist wiring).
4. **Synthetic violation drives runAgentRepairLoop to convergence.** — Covered by `9af46d1` (mock repair-loop test on hole-edge violation), built on `54e848d` (mfg.hole-edge-distance rule).

## Decisions Made

- Phase 1 shipped two tools (set_parameter, add_feature) rather than one — see plan §"Spec Correction".
- Zod v4 + per-feature codegen modules + per-tier validator modules adopted as the durable pattern carried into Phase 2+.
- Content-addressed SHA-256 of canonicalized JSON for `cad_revisions.hash`.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits above. Branch tip is `d46ca95`.

## Verification

- **Method:** `tsc -b` of each `lib/*` package on the `feat/cad-ir-phase-1` branch tip; resulting error file paths intersected with `/tmp/cad-ir-phase-1-files.txt`.
- **Result:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (chat.ts, projectChat.ts, partSpecs.ts, partValidator.ts, AssembledView.tsx, AssemblyPartsPanel.tsx, CanvasPanel.tsx, ChatPanel.tsx, InterfaceList.tsx, PartList.tsx, RulesStatusStrip.tsx, Chat.tsx, Export.tsx, Home.tsx, Workspace.tsx) inherited from main divergence, not introduced.
- **Driver:** `/tmp/cad-ir-verify.sh`; results table `/tmp/cad-ir-verify-results.tsv`.
- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code (inherited from main divergence, not introduced).

## Issues Encountered

None recorded. Branch landed cleanly per ROADMAP scope.

## User Setup Required

None — Phase 1's runtime dependencies (@vercel/sandbox SDK, build123d sandbox image) are pinned in repo files (`package.json`, `scripts/sandbox/requirements.txt`). VERCEL_API_TOKEN provisioning was a Phase 0 prerequisite covered upstream.

## Next Phase Readiness

- convex/cad foundation in place; subsequent phases (2–19) extend in-place.
- Phase 2 builds directly on Phase 1 tip `d46ca95` (per Phase 2 plan prerequisites).

---
*Phase: 01-cad-ir-foundation*
*Completed: 2026-05-07*
