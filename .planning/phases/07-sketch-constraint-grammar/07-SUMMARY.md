---
phase: 07-sketch-constraint-grammar
plan: 07
subsystem: cad-ir
tags: [cad-ir, sketches, constraints, dof, tier-2, validation, patch-grammar]

requires:
  - phase: 06-sweep-loft-weld-tab-mjcf
    provides: full feature catalog (sweep/loft/weld_tab + MJCF) on top of which constraints layer
provides:
  - SketchConstraint discriminated union (coincident, distance, parallel, perpendicular, tangent, equal, horizontal, vertical, angle)
  - Zod SketchConstraintSchema
  - Schema-tier reference resolution + duplicate-id checks
  - Tier 2 constraintTier with contradiction detector + DOF heuristic
  - add_constraint / remove_constraint sub-ops on modify_sketch
affects: [phase-15, phase-19]

tech-stack:
  added: []
  patterns:
    - "Constraint grammar is additive — raw-coordinate sketches keep working"
    - "Tier 2 = approximate DOF analyzer; real geometric solver deferred"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/validate/constraintTier.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/constraintSchema.test.ts
    - artifacts/hardwareai/convex/cad/patch/__tests__/constraintPatch.test.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/constraintTier.test.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/constraintTierSchema.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/patch/types.ts
    - artifacts/hardwareai/convex/cad/patch/apply.ts
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/plugin.ts
    - artifacts/hardwareai/convex/cad/validate/schemaTier.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/specialists/cadIr.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "v0 Tier 2 uses an approximate DOF count, not a real geometric solver (planegcs/solvespace deferred)"
  - "Constraint refs resolved at schema tier; entity ids checked, duplicate constraint ids rejected"
  - "modify_sketch wrapper carries add_constraint / remove_constraint sub-ops to keep the public tool surface small"

patterns-established:
  - "Tier 2 sits between schema and assembly tiers in the plugin compose order"
  - "Discriminated union per constraint kind keeps Zod parse errors actionable"

requirements-completed: [PATCH-02]

duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 7: Sketch Constraint Grammar Summary

**Declarative sketch constraints (coincident, distance, parallel, perpendicular, tangent, equal, horizontal, vertical, angle) added to the IR with Tier 2 v0 DOF analysis and modify_sketch patch ops.**

> Implementation pre-existed on branch `feat/cad-ir-phase-7` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 7
- **Files modified:** 15

## Accomplishments
- SketchConstraint discriminated union with 9 kinds, optional on every SketchDef.
- Zod schema parses each variant with kind-specific fields; schema tier resolves constraint refs against entity ids in the same sketch and rejects duplicate constraint ids.
- New Tier 2 `constraintTier` runs between schema and assembly: detects contradictions (e.g. horizontal + vertical on the same line) and reports under/over-constrained sketches via a DOF heuristic.
- Plugin compose order updated: `schemaTier → constraintTier → assemblyTier → manufacturingTier`.
- `modify_sketch` patch grows `add_constraint` and `remove_constraint` sub-ops; specialist `toolCallToPatch` routes them.

## Task Commits

1. **Task 1: SketchConstraint union + SketchDef.constraints** — `bb2cb30` (feat)
2. **Task 2: Zod SketchConstraintSchema + schema tests** — `e8d8032` (feat)
3. **Task 3: Schema-tier ref resolution + duplicate-id checks** — `c24f6f7` (feat)
4. **Task 4: Tier 2 contradiction detector + DOF heuristic** — `25f755c` (feat)
5. **Task 5: Plugin compose: constraintTier between schema and assembly** — `1c327c6` (feat)
6. **Task 6: add_constraint / remove_constraint in modify_sketch** — `e09121a` (feat)
7. **Task 7: Prompt + README** — `c1c29a0` (docs)

## Files Created/Modified

Grouped under `artifacts/hardwareai/convex/`:

- `cad/ir/types.ts`, `cad/ir/schema.ts` — SketchConstraint types + Zod
- `cad/ir/__tests__/constraintSchema.test.ts` — schema test suite
- `cad/validate/schemaTier.ts` — ref resolution + duplicate-id checks
- `cad/validate/constraintTier.ts` (new) — contradiction detector + DOF heuristic
- `cad/validate/__tests__/constraintTier.test.ts`, `constraintTierSchema.test.ts` — Tier 2 tests
- `cad/patch/types.ts`, `cad/patch/apply.ts`, `cad/patch/tools.ts` — `add_constraint` / `remove_constraint` sub-ops
- `cad/patch/__tests__/constraintPatch.test.ts` — patch round-trip
- `cad/plugin.ts` — compose order
- `cad/prompts.ts`, `cad/README.md` — documentation
- `specialists/cadIr.ts` — `toolCallToPatch` routing

## Decisions Made
- v0 Tier 2 deliberately ships without a geometric solver. The DOF analyzer is heuristic; real solver integration (planegcs / solvespace) is a future phase.
- Constraint storage is additive: existing raw-coordinate sketches in earlier phases continue to validate without changes.

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

1. **Mixed-kind constraint sketch validates at Tier 2** — covered by `constraintSchema.test.ts` + `constraintTier.test.ts` (commits `e8d8032`, `25f755c`).
2. **DOF analyzer reports under/over-constrained sketches actionably** — covered by `constraintTier.test.ts` (commit `25f755c`).
3. **modify_sketch ops mutate constraints and round-trip through `toolCallToPatch`** — covered by `constraintPatch.test.ts` + `specialists/cadIr.ts` test paths (commits `e09121a`, `c1c29a0`).

## Plan Reference

Authoritative scope: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-7.md`.

## Next Phase Readiness
Phase 8 (AABB interference) operates at the part level and is unaffected by the constraint grammar. Future phases that touch the patch grammar should keep `modify_sketch` as the sole entry point for sketch mutation.

---
*Phase: 07-sketch-constraint-grammar*
*Completed: 2026-05-07*
