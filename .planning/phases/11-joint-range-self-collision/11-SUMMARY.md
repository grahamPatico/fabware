---
phase: 11-joint-range-self-collision
plan: 11
subsystem: cad-ir
tags: [cad-ir, validation, assembly, joints, pose-sampling]

requires:
  - phase: 10-cost-compiler-smoke-test
    provides: assembly tier scaffolding, AABB interference primitives
provides:
  - sampleJointPoses + applyPoseToBbox pose sampler for revolute/linear joints
  - Tier 5 jointRangeCollision rule wired into assemblyTier
  - prompts + README updates for Phase 11

affects: [phase-19-final-consolidation, joint-range validation]

tech-stack:
  added: []
  patterns:
    - pose-sampling for dynamic joint-range validation
    - reuse of computePartBbox + transformBbox under joint pose transforms

key-files:
  created:
    - artifacts/hardwareai/convex/cad/geometry/jointPose.ts
    - artifacts/hardwareai/convex/cad/geometry/__tests__/jointPose.test.ts
    - artifacts/hardwareai/convex/cad/validate/rules/jointRangeCollision.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-jointRangeCollision.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/validate/assemblyTier.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "Pose sampler covers revolute and linear joint kinds with configurable N samples; other joint kinds skipped at Tier 5."
  - "jointRangeCollision rule reuses Phase 8 AABB primitives (computePartBbox / transformBbox) under per-sample joint transforms."

patterns-established:
  - "Pose-sampling pattern: enumerate N joint poses across declared range, apply transform to bbox, run interference checks per sample."
  - "Tier 5 rule composition: assemblyTier composes static interference (Phase 8) and dynamic joint-range collision (Phase 11) under one tier."

requirements-completed: [ASSEMBLY-03]

duration: docs-only retroactive verification
completed: 2026-05-07
---

# Phase 11: Joint-Range Self-Collision Summary

**Pose sampler for revolute/linear joints plus Tier 5 jointRangeCollision rule that catches self-collision anywhere along the declared motion arc.**

Implementation pre-existed on branch `feat/cad-ir-phase-11` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Duration:** Verification: docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Completed:** 2026-05-07
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added `sampleJointPoses` and `applyPoseToBbox` joint pose sampler covering revolute and linear joints.
- Added Tier 5 `jointRangeCollision` rule and wired it into `assemblyTier`.
- Updated prompts and `convex/cad/README.md` to document Phase 11 scope.

## Task Commits

1. **Task 1: Joint pose sampler** — `d2555e6` feat(cad-ir-phase-11): Task 1 — joint pose sampler (sampleJointPoses + applyPoseToBbox)
2. **Task 2: Tier 5 jointRangeCollision rule** — `a311593` feat(cad-ir-phase-11): Task 2 — Tier 5 joint-range-collision rule
3. **Task 3: Prompts + README** — `0a645e5` docs(cad-ir-phase-11): Task 3 — prompts + README for Phase 11

## Files Created/Modified
- `artifacts/hardwareai/convex/cad/geometry/jointPose.ts` — `sampleJointPoses` + `applyPoseToBbox` for revolute/linear joints.
- `artifacts/hardwareai/convex/cad/geometry/__tests__/jointPose.test.ts` — unit tests for pose sampler.
- `artifacts/hardwareai/convex/cad/validate/rules/jointRangeCollision.ts` — Tier 5 rule body.
- `artifacts/hardwareai/convex/cad/validate/__tests__/rules-jointRangeCollision.test.ts` — pass/fail rule tests.
- `artifacts/hardwareai/convex/cad/validate/assemblyTier.ts` — composes new rule into Tier 5.
- `artifacts/hardwareai/convex/cad/prompts.ts` — Phase 11 prompt updates.
- `artifacts/hardwareai/convex/cad/README.md` — Phase 11 section.

## Decisions Made
- Pose sampler scoped to revolute + linear joints only; other joint kinds left to future phases.
- Reused Phase 8 AABB primitives rather than introducing exact-mesh interference at this tier.

## Deviations from Plan

Documented retroactively from existing branch — see Task Commits below.

## Issues Encountered
None recorded.

## Verification

Typecheck: PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code.

### Success criteria mapping
1. **Pose sampler covers revolute and linear joints across N samples** — `geometry/jointPose.ts` (`d2555e6`).
2. **Self-colliding joint range produces `jointRangeCollision` violation** — `validate/rules/jointRangeCollision.ts` + `assemblyTier.ts` (`a311593`); covered by `validate/__tests__/rules-jointRangeCollision.test.ts`.
3. **Clear-arc joint range passes** — pass-case branch in `validate/__tests__/rules-jointRangeCollision.test.ts` (`a311593`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tier 5 dynamic checks ready for Phase 12 fabrication-cost work to consume the same assembly graph.

---
*Phase: 11-joint-range-self-collision*
*Completed: 2026-05-07*
