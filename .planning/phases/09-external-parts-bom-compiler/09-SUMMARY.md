---
phase: 09-external-parts-bom-compiler
plan: 09
subsystem: cad-ir
tags: [cad-ir, external-parts, bom, vendor, mcmaster, compile-target, discriminated-union]

requires:
  - phase: 08-aabb-interference-detection
    provides: AABB interference rule that now needs to handle external parts with declared bboxes
provides:
  - PartRef discriminated union (InlinePartRef | ExternalPartRef)
  - ExternalPartRef with vendor + partNumber (+ optional declared boundingBox)
  - compileBom(ir): aggregates externals by vendor + partNumber; lists inlines separately
  - partsInterfere skips externals without bbox; uses declared bbox if present
  - add_part tool schema accepts inline and external variants
affects: [phase-10, phase-12, phase-18, phase-19]

tech-stack:
  added: []
  patterns:
    - "PartRef discriminator: kind: 'inline' | 'external' (inline default for back-compat)"
    - "BOM aggregation key: `${vendor}::${partNumber}`"

key-files:
  created:
    - artifacts/hardwareai/convex/cad/compile/bom.ts
    - artifacts/hardwareai/convex/cad/compile/__tests__/bom.test.ts
    - artifacts/hardwareai/convex/cad/ir/__tests__/partRefSchema.test.ts
  modified:
    - artifacts/hardwareai/convex/cad/ir/types.ts
    - artifacts/hardwareai/convex/cad/ir/schema.ts
    - artifacts/hardwareai/convex/cad/codegen/compileAssembly.ts
    - artifacts/hardwareai/convex/cad/validate/rules/partsInterfere.ts
    - artifacts/hardwareai/convex/cad/validate/__tests__/rules-partsInterfere.test.ts
    - artifacts/hardwareai/convex/cad/patch/tools.ts
    - artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
    - artifacts/hardwareai/convex/cad/prompts.ts
    - artifacts/hardwareai/convex/specialists/cadIr.ts
    - artifacts/hardwareai/convex/cad/README.md

key-decisions:
  - "External parts may carry an optional declared boundingBox; without it, partsInterfere skips them"
  - "BOM aggregates externals by vendor + partNumber; inline parts are listed individually"
  - "kind discriminator defaults to 'inline' for backward compatibility with Phase 4–8 IRs"

patterns-established:
  - "compile/ directory hosts non-build123d compilers (BOM here, cost in Phase 10)"
  - "Discriminated PartRef supports vendor catalog integrations (McMaster-Carr) without inlining CAD"

requirements-completed: [COMPILE-01]

duration: docs-only retroactive walk
completed: 2026-05-07
---

# Phase 9: External Parts + BOM Compiler Summary

**`PartRef` becomes a discriminated union (inline | external); `compileBom` walks the assembly tree and emits a flat parts list aggregated by vendor + part number; AABB interference learns to handle externals.**

> Implementation pre-existed on branch `feat/cad-ir-phase-9` (off `feat/ai-harness-step-0-scaffold`); this milestone retroactively verified and documented it.

## Performance

- **Verification:** docs-only retroactive walk on 2026-05-07. Implementation predates this milestone.
- **Tasks:** 7 (Task 3 schema-tier change folded into Task 2; commit log shows 7 commits for 8 plan tasks)
- **Files modified:** 13

## Accomplishments
- `PartRef` is now `InlinePartRef | ExternalPartRef`; the schema parses both, defaults missing `kind` to inline.
- `ExternalPartRef` carries `vendor`, `partNumber`, optional `description`, optional `origin`, optional `rotation`, and optional `boundingBox`.
- `partsInterfere` (Phase 8) updated: externals without `boundingBox` are skipped; declared bboxes participate in overlap checks.
- `compileBom(ir)` aggregates externals by `${vendor}::${partNumber}`, lists inline parts separately, and is covered by 4 tests.
- `add_part` Anthropic tool schema accepts both inline and external shapes; specialist `toolCallToPatch` routes both variants.
- `compileAssembly` updated to thread external part refs without breaking build123d codegen.
- Prompts + README updated.

## Task Commits

1. **Task 1: PartRef union (InlinePartRef | ExternalPartRef)** — `937d47e` (feat)
2. **Task 2: Zod for PartRef union + 5 schema tests** — `454c1f7` (feat)
3. **Task 4: AABB interference handles external parts** — `24e4cff` (feat)
4. **Task 5: BOM compiler + 4 tests** — `91cad35` (feat)
5. **Task 6: add_part tool schema accepts inline + external** — `e2692d0` (feat)
6. **Task 7: specialist toolCallToPatch handles ExternalPartRef** — `aa0ab47` (feat)
7. **Task 8: prompts + README** — `6974ebc` (docs)

_Note: Plan Task 3 (schema-tier external parts skip ir field check) is folded into the schema commit `454c1f7`; no separate commit._

## Files Created/Modified

Grouped under `artifacts/hardwareai/convex/`:

- `cad/ir/types.ts`, `cad/ir/schema.ts` — PartRef union + Zod
- `cad/ir/__tests__/partRefSchema.test.ts` — schema tests
- `cad/compile/bom.ts` (new) + `cad/compile/__tests__/bom.test.ts` — BOM compiler
- `cad/codegen/compileAssembly.ts` — multi-part codegen handles externals
- `cad/validate/rules/partsInterfere.ts` + `cad/validate/__tests__/rules-partsInterfere.test.ts` — interference handles externals
- `cad/patch/tools.ts` + `cad/patch/__tests__/tools.test.ts` — `add_part` accepts both kinds
- `specialists/cadIr.ts` — `toolCallToPatch` handles `ExternalPartRef`
- `cad/prompts.ts`, `cad/README.md` — documentation

## Decisions Made
- BOM key is `${vendor}::${partNumber}`; identical entries collapse into a single line with quantity.
- Externals without `boundingBox` are excluded from interference (silently skipped, not warned). Phase 18 will revisit when STEP imports add real geometry for externals.

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

1. **PartRef is a discriminated union; CAD IR validates with both kinds** — `partRefSchema.test.ts` (commit `454c1f7`).
2. **`compileBom(ir)` aggregates externals by vendor + partNumber; inlines separate** — `bom.test.ts` (commit `91cad35`).
3. **`partsInterfere` checks externals against inlines using declared bboxes** — `rules-partsInterfere.test.ts` (commit `24e4cff`).
4. **`add_part` accepts inline and external** — `tools.test.ts` (commits `e2692d0`, `aa0ab47`).

## Plan Reference

Authoritative scope: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-9.md`.

## Next Phase Readiness
Phase 10 layers `compileCost` over the BOM produced here. The `compile/` directory + aggregation key pattern carry forward.

---
*Phase: 09-external-parts-bom-compiler*
*Completed: 2026-05-07*
