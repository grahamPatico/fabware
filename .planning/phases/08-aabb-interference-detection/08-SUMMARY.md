---
phase: 08-aabb-interference-detection
plan: 08
subsystem: cad-ir
tags: [cad-ir, geometry, aabb, interference, tier-5, assembly, validation]

requires:
  - phase: 07-sketch-constraint-grammar
    provides: Tier 2 in plugin compose order; assembly graph (from Phase 4) intact
provides:
  - computePartBbox(ir): walks extrude/revolve features, returns null on empty parts
  - transformBbox: translates by part origin; sphere-expands on rotation (conservative)
  - partsInterfere Tier 5 rule: AABB overlap across all part pairs
affects: [phase-09, phase-19]

tech-stack:
  added: []
  patterns:
    - "AABB v0 only grows on extrude / revolve; subtractive features (cut_extrude, fillet, hole, etc.) do not enlarge bbox"
    - "Rotated parts conservatively expanded to sphere-equivalent (over-flags rather than miss)"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/geometry/partBbox.ts
    - artifacts/hardwareai/convex/cad/geometry/transform.ts
    - artifacts/hardwareai/convex/cad/geometry/__tests__/partBbox.test.ts
    - artifacts/hardwareai/convex/cad/geometry/__tests__/transform.test.ts
    - artifacts/hardwareai/convex/cad/validate/rules/partsInterfere.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-partsInterfere.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/validate/assemblyTier.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "AABB only — OBB and geometry-based interference deferred"
  - "Rotated parts use sphere-equivalent bbox (over-flag, never miss)"
  - "Subtractive features don't enlarge bbox; extrude + revolve are the only growers in v0"

patterns-established:
  - "Geometry helpers live in convex/cad/geometry/, separate from codegen and validate"
  - "Tier 5 rules compose into assemblyTier alongside floating-part / over-constrained checks"

requirements-completed: [ASSEMBLY-02]

duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 8: AABB Interference Detection Summary

**`computePartBbox` + `partsInterfere` Tier 5 rule give the validator part-on-part overlap detection from axis-aligned bounding boxes, with conservative sphere-expansion for rotated parts.**

> Implementation pre-existed on branch `feat/cad-ir-phase-8` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 4
- **Files modified:** 9

## Accomplishments
- `computePartBbox(ir)` walks features and returns AABB for parts with at least one extrude/revolve; returns null for empty parts.
- `transformBbox` translates by `PartRef.origin` and, on non-zero rotation, expands the bbox to its sphere-equivalent.
- `partsInterfere` walks all part pairs, applies `transformBbox`, and emits a Tier 5 violation per overlapping pair.
- `assemblyTier` composes `partsInterfere` alongside the existing floating-part / over-constrained checks.
- Prompts + README updated so the agent can reason about interference proactively.

## Task Commits

1. **Task 1: computePartBbox walks extrude/revolve features** — `c359e64` (feat)
2. **Task 2: transformBbox translates and sphere-expands for rotation** — `dd2814f` (feat)
3. **Task 3: partsInterfere Tier 5 rule + wire into assemblyTier** — `1f313be` (feat)
4. **Task 4: prompts + README** — `12f8eac` (docs)

## Files Created/Modified

Grouped under `artifacts/hardwareai/convex/cad/`:

- `geometry/partBbox.ts` (new) + `geometry/__tests__/partBbox.test.ts` — per-part AABB
- `geometry/transform.ts` (new) + `geometry/__tests__/transform.test.ts` — origin/rotation transform
- `validate/rules/partsInterfere.ts` (new) + `validate/__tests__/rules-partsInterfere.test.ts` — Tier 5 rule
- `validate/assemblyTier.ts` — compose partsInterfere
- `prompts.ts`, `README.md` — documentation

## Decisions Made
- v0 ships AABB only; OBB / geometry-based interference deferred to a future phase.
- The rotation case uses a sphere-equivalent expansion: lossy but never produces false negatives.
- Subtractive features (cut_extrude, fillet, chamfer, hole, pattern, sweep, loft, shell, weld_tab, bend_flange) do not enlarge bbox; only extrude + revolve grow it.

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

1. **Two overlapping parts → `partsInterfere` violation at Tier 5 with correct severity** — covered by `rules-partsInterfere.test.ts` (commit `1f313be`).
2. **Two non-overlapping parts pass cleanly** — same test file (commit `1f313be`).
3. **`computePartBbox` and `transformBbox` correct under rotations and translations** — covered by `partBbox.test.ts` + `transform.test.ts` (commits `c359e64`, `dd2814f`).

## Plan Reference

Authoritative scope: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-8.md`.

## Next Phase Readiness
Phase 9 extends `partsInterfere` to handle external parts (declared bbox or skip). The geometry/ helpers established here are the foundation for that extension.

---
*Phase: 08-aabb-interference-detection*
*Completed: 2026-05-07*
