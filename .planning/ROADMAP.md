# Fabware Roadmap — v1: CAD IR Rebuild

**Milestone:** v1 — CAD IR Rebuild. **Status: 19/19 phases verified-complete (2026-05-07).**
**Branch reality:** Phases shipped as a linear stack on `feat/cad-ir-phase-1` … `feat/cad-ir-phase-19`, all based on `feat/ai-harness-step-0-scaffold` (38 ahead / 75 behind `main`). `feat/cad-ir-rebuild` was never cut. Cutover behind `useCadIr` is owed by branch reconciliation, not by additional implementation.
**Granularity:** Fine (one roadmap phase per CAD IR phase plan; per-phase scope authoritative in `docs/superpowers/plans/`, retroactively documented in `.planning/phases/NN-*/`).
**Coverage:** 21/21 requirements mapped; verified by per-phase typecheck (0 new errors per phase against scaffold baseline).

The earlier plan stack (AI Harness Plans 1+2+3, Sheet-metal Assembly Slice 1, multi-process-parts groundwork) is sealed as the v0 Foundations milestone in PROJECT.md and is not re-executed here.

## Phases

- [x] **Phase 1: CAD IR Foundation** — `convex/cad` namespace, schema, evaluator, validator, build123d codegen, Vercel Sandbox executor, first repair loop
- [x] **Phase 2: Patch Grammar Expansion** — Grow patch grammar from 2 to 9 tools, port manufacturing rules, add sketch primitives
- [x] **Phase 3: Hardware-spec Holes** — Countersink/counterbore/threaded hole subtypes + bolt-clearance rule
- [x] **Phase 4: Assembly Graph + URDF** — Multi-part CAD IR with parts/joints/connections; Tier 5 assembly validation; URDF compiler
- [x] **Phase 5: Feature Round-out + Multi-part Codegen** — Revolve, shell, bend_flange features; `compileAssembly`; min-bend-radius rule
- [x] **Phase 6: Sweep/Loft/Weld_tab + MJCF** — Sweep, loft, weld_tab features; MJCF as second motion-sim target
- [x] **Phase 7: Sketch Constraint Grammar** — Tier 2 v0 DOF analyzer; SketchConstraint union; `modify_sketch` patch ops
- [x] **Phase 8: AABB Interference Detection** — `computePartBbox`, `partsInterfere` rule; Tier 5 expansion
- [x] **Phase 9: External Parts + BOM Compiler** — `PartRef` discriminated union; `ExternalPartRef`; `compileBom`
- [x] **Phase 10: Cost Compiler + Smoke Test** — `compileCost`, `PricingDb`, `budgetExceeded` rule, full-stack integration smoke test
- [x] **Phase 11: Joint-Range Self-Collision** — Pose sampler for revolute/linear joints; `jointRangeCollision` rule
- [x] **Phase 12: Inline-part Fabrication Cost** — Material catalog, volume estimator, per-inline-part cost in BOM
- [x] **Phase 13: Process-aware Machine Cost** — `BUILTIN_PROCESSES` catalog, perimeter estimator, `machineCost` compiler
- [x] **Phase 14: Laser-cut Process Rules** — `laser-cut-min-hole`, `laser-cut-min-slot` (process-gated)
- [x] **Phase 15: Extended Sketch Primitives** — Arc, polygon, spline kinds across types, codegen, and `add_sketch`
- [x] **Phase 16: 3D-print Process Rules** — `print-3d-min-wall` (per-material), `print-3d-bed-size` (process-gated)
- [x] **Phase 17: CNC Process Rules** — `cncToolDiameter` field; `cnc-min-internal-corner`, `cnc-pocket-too-deep` (process-gated)
- [x] **Phase 18: STEP Imports for Externals** — `stepUrl` on `ExternalPartRef`; `import_step` in `compileAssembly`
- [x] **Phase 19: Final Consolidation + Cutover** — Mega-integration test, final verification sweep, glTF preview parity, tennis-ball-locker passes behind `useCadIr`

## Phase Details

### Phase 1: CAD IR Foundation
**Goal**: A scoped CAD IR document round-trips through schema, validator, build123d codegen, and Vercel Sandbox executor; the agent can apply the first two patch tools and the repair loop converges.
**Depends on**: Foundations / Already shipped (AI Harness Plans 1+2+3 on main)
**Requirements**: CADIR-01
**Success Criteria** (what must be TRUE):
  1. A CAD IR document with parts, sketches, features, and parameters validates and compiles to build123d Python.
  2. The Vercel Sandbox executor runs the generated build123d and returns geometry artifacts.
  3. The agent can apply `set_parameter` and `add_feature` patches via tool calls; `ProcessPlugin<CadIr>` is registered.
  4. A synthetic violation drives `runAgentRepairLoop` to convergence end-to-end.
**Plans**: `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`

### Phase 2: Patch Grammar Expansion
**Goal**: The agent has a 9-tool patch grammar covering sketch primitives, with manufacturing rules ported from Slice 1 and the repair loop exercising the new grammar.
**Depends on**: Phase 1
**Requirements**: PATCH-01
**Success Criteria** (what must be TRUE):
  1. Nine patch tools are registered with Anthropic and translate to typed CAD IR mutations.
  2. Sketch-primitive operations create and modify sketches in the IR.
  3. Ported manufacturing rules (incl. min-wall-thickness) fire at Tier 3.
  4. A repair-loop test exercises the new grammar and converges.
**Plans**: `docs/superpowers/plans/2026-04-29-cad-ir-phase-2.md`

### Phase 3: Hardware-spec Holes
**Goal**: Holes carry hardware semantics; the validator catches unsafe bolt clearances; the agent emits hardware-aware hole patches.
**Depends on**: Phase 2
**Requirements**: HARDWARE-01
**Success Criteria** (what must be TRUE):
  1. A `HoleFeature` can be countersink, counterbore, or threaded; each renders correctly via build123d.
  2. The bolt-clearance rule flags a too-tight hole at Tier 3 with a useful message.
  3. The Anthropic tool schema and system prompt expose the new subtypes; the agent uses them in patches.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-3.md`

### Phase 4: Assembly Graph + URDF
**Goal**: CAD IR represents multi-part assemblies with joints; Tier 5 catches assembly-level issues; URDF emits motion-sim targets.
**Depends on**: Phase 3
**Requirements**: ASSEMBLY-01
**Success Criteria** (what must be TRUE):
  1. A 2+ part assembly with a revolute joint validates at Tier 5 and round-trips through the patch grammar.
  2. The URDF compiler emits a loadable URDF for that assembly.
  3. The URDF loads and articulates correctly in a motion-sim viewer.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-4.md`

### Phase 5: Feature Round-out + Multi-part Codegen
**Goal**: The IR supports the core sheet-metal feature set (revolve, shell, bend_flange) and codegen handles multi-part assemblies; min-bend-radius is enforced.
**Depends on**: Phase 4
**Requirements**: FEATURE-01
**Success Criteria** (what must be TRUE):
  1. A multi-part assembly featuring a revolve, a shell, and a bend_flange compiles end-to-end.
  2. `compileAssembly` produces correct multi-part build123d output.
  3. A part with a sub-minimum bend radius produces a Tier 3 violation.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-5.md`

### Phase 6: Sweep/Loft/Weld_tab + MJCF
**Goal**: The IR covers richer geometry (sweep, loft, weld_tab); MJCF joins URDF as a second motion-sim target.
**Depends on**: Phase 5
**Requirements**: FEATURE-02
**Success Criteria** (what must be TRUE):
  1. An assembly with sweep, loft, and weld_tab features compiles via build123d.
  2. The same assembly compiles to both URDF and MJCF.
  3. Both motion-sim outputs load in their respective viewers.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-6.md`

### Phase 7: Sketch Constraint Grammar
**Goal**: Sketches can be parametrically constrained; Tier 2 reports DOF status; the agent can mutate constraints.
**Depends on**: Phase 6
**Requirements**: PATCH-02
**Success Criteria** (what must be TRUE):
  1. A sketch with mixed constraint kinds (coincident, distance, parallel, perpendicular, horizontal, vertical, angle, equal, fix) validates at Tier 2.
  2. The DOF analyzer reports under- and over-constrained sketches with actionable detail.
  3. `modify_sketch` patch ops mutate constraints and round-trip through `toolCallToPatch`.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-7.md`

### Phase 8: AABB Interference Detection
**Goal**: The assembly tier catches part-on-part interference using AABBs.
**Depends on**: Phase 7
**Requirements**: ASSEMBLY-02
**Success Criteria** (what must be TRUE):
  1. Two overlapping parts produce a `partsInterfere` violation at Tier 5 with the correct severity.
  2. Two non-overlapping parts pass cleanly.
  3. `computePartBbox` and `transformBbox` are correct under part rotations and translations.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-8.md`

### Phase 9: External Parts + BOM Compiler
**Goal**: Assemblies can reference external parts (vendor catalog items); BOM aggregates them by vendor + part number.
**Depends on**: Phase 8
**Requirements**: COMPILE-01
**Success Criteria** (what must be TRUE):
  1. `PartRef` is a discriminated union over `inline | external`; CAD IR validates with both kinds.
  2. `compileBom(ir)` aggregates externals by vendor + partNumber and lists inlines separately.
  3. `partsInterfere` checks externals against inline parts using their bounding boxes.
  4. The `add_part` tool accepts both inline and external part shapes.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-9.md`

### Phase 10: Cost Compiler + Smoke Test
**Goal**: A budget-aware cost pipeline runs end-to-end from agent patch through validate to BOM and cost; over-budget designs flag.
**Depends on**: Phase 9
**Requirements**: COMPILE-02
**Success Criteria** (what must be TRUE):
  1. `compileCost(ir, pricingDb)` returns a structured `CostResult`.
  2. An assembly with `budget` set produces a `budgetExceeded` violation when materials/processes exceed it.
  3. A full-stack integration smoke test passes from agent patch through validate, compile, BOM, and cost.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-10.md`

### Phase 11: Joint-Range Self-Collision
**Goal**: Joint ranges are validated dynamically; designs that self-collide somewhere in their motion arc fail.
**Depends on**: Phase 10
**Requirements**: ASSEMBLY-03
**Success Criteria** (what must be TRUE):
  1. The pose sampler covers revolute and linear joints across a configurable N samples.
  2. A joint range that causes self-collision somewhere in its arc produces a `jointRangeCollision` violation.
  3. A joint range that stays clear across all samples passes.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-11.md`

### Phase 12: Inline-part Fabrication Cost
**Goal**: Inline parts contribute realistic fabrication cost based on volume and material.
**Depends on**: Phase 11
**Requirements**: COMPILE-03
**Success Criteria** (what must be TRUE):
  1. The material catalog covers the v1 material set; the volume estimator returns reasonable numbers across feature mixes.
  2. An inline part with a known material contributes a non-zero `volume × density × $/kg` line in the BOM.
  3. Changing material or volume changes the BOM line as expected.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-12.md`

### Phase 13: Process-aware Machine Cost
**Goal**: Cost reflects manufacturing process and part perimeter; switching process changes cost.
**Depends on**: Phase 12
**Requirements**: COMPILE-04
**Success Criteria** (what must be TRUE):
  1. The `BUILTIN_PROCESSES` catalog includes laser_cut, cnc, print_3d, sheet_metal_bend with realistic rates.
  2. A laser-cut part's machine-time cost scales with perimeter; the perimeter estimator returns reasonable numbers.
  3. Changing `CadIr.process` changes the machine-cost line in `compileCost`.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-13.md`

### Phase 14: Laser-cut Process Rules
**Goal**: Manufacturing rules are gated on process; laser-cut parts catch sub-minimum holes and slots.
**Depends on**: Phase 13
**Requirements**: MFG-01
**Source plan**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-14.md`
**Success Criteria** (what must be TRUE):
  1. `mfg.laser-cut-min-hole` and `mfg.laser-cut-min-slot` fire at Tier 3 only when `process` is `laser_cut`.
  2. Sub-minimum holes/slots in laser-cut parts produce violations with useful messages.
  3. The same geometry under a non-laser process passes those rules.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-14.md`

### Phase 15: Extended Sketch Primitives
**Goal**: Sketches support arc, polygon, and spline kinds across types, schema, codegen, and tool surface.
**Depends on**: Phase 14
**Requirements**: PATCH-03
**Success Criteria** (what must be TRUE):
  1. A sketch authored with arc, polygon, and spline entities validates at Tier 1 and compiles to build123d.
  2. Volume and perimeter estimators return correct numbers for each new kind.
  3. The `add_sketch` tool accepts and round-trips all three new entity kinds.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-15.md`

### Phase 16: 3D-print Process Rules
**Goal**: 3D-print parts catch sub-threshold walls and oversize bed footprints; rules are process-gated.
**Depends on**: Phase 15
**Requirements**: MFG-02
**Success Criteria** (what must be TRUE):
  1. `mfg.print-3d-min-wall` fires only when `process` is `print_3d` and respects per-material thresholds.
  2. `mfg.print-3d-bed-size` flags parts whose footprint exceeds the default bed dimensions.
  3. The same geometry under a non-print process passes both rules.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-16.md`

### Phase 17: CNC Process Rules
**Goal**: CNC parts catch internal corners smaller than tool diameter and pockets too deep; rules are process-gated.
**Depends on**: Phase 16
**Requirements**: MFG-03
**Success Criteria** (what must be TRUE):
  1. `cncToolDiameter` is a first-class field on CAD IR.
  2. `mfg.cnc-min-internal-corner` flags internal corners smaller than `cncToolDiameter` only when `process` is `cnc`.
  3. `mfg.cnc-pocket-too-deep` flags excessively deep pockets only when `process` is `cnc`.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-17.md`

### Phase 18: STEP Imports for Externals
**Goal**: External parts can carry a `stepUrl`; the assembly compile imports those STEP files.
**Depends on**: Phase 17
**Requirements**: EXTERNAL-01
**Success Criteria** (what must be TRUE):
  1. `ExternalPartRef.stepUrl` is optional and validates.
  2. `compileAssembly` emits build123d `import_step` calls for external parts that carry a `stepUrl`.
  3. An assembly with a `stepUrl`-bearing external part compiles, runs, and the imported STEP geometry shows up in the assembled preview.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-18.md`

### Phase 19: Final Consolidation + Cutover
**Goal**: The CAD IR rebuild reaches parity with Slice 1 behind `useCadIr`; the canonical tennis-ball-locker test passes against both schemas; the existing Three.js Workspace re-renders against glTF when the flag is on.
**Depends on**: Phase 18
**Requirements**: CUTOVER-01, CUTOVER-02, CADIR-02
**Success Criteria** (what must be TRUE):
  1. The mega-integration test passes, exercising all 5 validation tiers, all compile targets (build123d, URDF, MJCF, BOM, cost), and all patch tools.
  2. With `useCadIr=true`, the Workspace UI renders a glTF preview produced by the CAD IR executor for every part — using the existing `AssembledView` / `Workspace` components unchanged.
  3. Tennis-ball-locker end-to-end passes with `useCadIr=true`: scope wizard → multi-part sheet-metal assembly → user refinement → per-part DXF export.
  4. Tennis-ball-locker end-to-end continues to pass with `useCadIr=false` against the live Slice 1 schema on `main`.
  5. The README final-state summary and verification sweep confirm no regressions.
**Plans**: `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. CAD IR Foundation | 0/1 | Not started | - |
| 2. Patch Grammar Expansion | 0/1 | Not started | - |
| 3. Hardware-spec Holes | 0/1 | Not started | - |
| 4. Assembly Graph + URDF | 0/1 | Not started | - |
| 5. Feature Round-out + Multi-part Codegen | 0/1 | Not started | - |
| 6. Sweep/Loft/Weld_tab + MJCF | 0/1 | Not started | - |
| 7. Sketch Constraint Grammar | 0/1 | Not started | - |
| 8. AABB Interference Detection | 0/1 | Not started | - |
| 9. External Parts + BOM Compiler | 0/1 | Not started | - |
| 10. Cost Compiler + Smoke Test | 0/1 | Not started | - |
| 11. Joint-Range Self-Collision | 0/1 | Not started | - |
| 12. Inline-part Fabrication Cost | 0/1 | Not started | - |
| 13. Process-aware Machine Cost | 0/1 | Not started | - |
| 14. Laser-cut Process Rules | 0/1 | Not started | - |
| 15. Extended Sketch Primitives | 0/1 | Not started | - |
| 16. 3D-print Process Rules | 0/1 | Not started | - |
| 17. CNC Process Rules | 0/1 | Not started | - |
| 18. STEP Imports for Externals | 0/1 | Not started | - |
| 19. Final Consolidation + Cutover | 0/1 | Not started | - |

## Notes

- Each phase's authoritative scope is the existing plan file in `docs/superpowers/plans/`. `/gsd-plan-phase N` should consume that plan file as the source.
- The Slice 1 schema on `main` stays live throughout. Cutover happens at Phase 19 behind `useCadIr`.
- The Three.js `AssembledView` / `Workspace` components are reused; Phase 19 wires them to a glTF preview from the CAD IR executor when `useCadIr` is on.
- Phase 19 carries the only explicit UI hint because that is where the existing UI is re-pointed at the new pipeline; intermediate phases produce backend artifacts that flow through the same UI without changes.
