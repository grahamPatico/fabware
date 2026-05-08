# Fabware Requirements

Source: synthesized from `docs/adr/0001-*`, `docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`, the 19 CAD IR phase plans, and ADR-0001 carve-outs. Per ADR-0001, the v1 milestone is the CAD IR rebuild on `feat/cad-ir-rebuild`. Each requirement maps to exactly one phase in ROADMAP.md.

The acceptance test that gates the milestone is REQ-ETE-01 (tennis-ball-locker end-to-end on both Slice 1 schema and CAD IR behind `useCadIr`).

## Categories

- **CADIR** — CAD IR core (schema, evaluator, executor, agent loop)
- **PATCH** — Patch grammar and tool surface
- **HARDWARE** — Hardware-spec features (holes, fasteners)
- **ASSEMBLY** — Multi-part assembly, joints, connections
- **FEATURE** — Geometry features (revolve, shell, bend, sweep, loft, weld_tab)
- **SKETCH** — Sketch primitives and constraint grammar
- **VALIDATE** — Validation tiers (schema, constraint, manufacturing, geometry, assembly)
- **COMPILE** — Compile targets (URDF, MJCF, BOM, cost)
- **MFG** — Manufacturing rules (process-aware, multi-process)
- **EXTERNAL** — External part references and STEP imports
- **CUTOVER** — Final consolidation, cutover, parity

---

## v1 Requirements

### CADIR — CAD IR core

#### CADIR-01: CAD IR foundation, executor, and first repair loop

The system has a `convex/cad` namespace with the CAD IR schema (parts, sketches, features, parameters), an evaluator, a validator, build123d codegen, a Vercel Sandbox executor, and a first repair loop. Patch tools `set_parameter` and `add_feature` are available. `ProcessPlugin` is specialized as `ProcessPlugin<CadIr>`.

**Acceptance:** A scoped CAD IR document round-trips through the evaluator, validator, build123d codegen, and Vercel Sandbox executor; the agent can apply `set_parameter` and `add_feature` patches and the repair loop converges on a synthetic violation.

**Source:** `docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`

#### CADIR-02: glTF preview pipeline parity

build123d-emitted geometry renders in the existing `AssembledView` / `Workspace` Three.js components via glTF when `useCadIr` is on. The component itself is not rewritten.

**Acceptance:** With `useCadIr=true`, the Workspace UI shows a glTF preview produced by the CAD IR executor for every part in the project.

**Source:** ADR-0001 carve-out; CAD IR Backbone SPEC §preview pipeline.

### PATCH — Patch grammar and tool surface

#### PATCH-01: Expanded patch grammar (9 tools) + sketch primitives

The patch grammar grows from 2 tools (Phase 1) to 9 tools, including sketch-primitive operations. A repair-loop test exercises the new grammar.

**Acceptance:** The agent has 9 working patch tools registered with Anthropic; sketch primitives can be added/modified; the repair-loop test passes.

**Source:** `docs/superpowers/plans/2026-04-29-cad-ir-phase-2.md`

#### PATCH-02: Sketch constraint grammar (Tier 2 v0)

`SketchConstraint` discriminated union (coincident, distance, parallel, perpendicular, horizontal, vertical, angle, equal, fix) lands with Zod schemas, schema-tier ref validation, a v0 DOF analyzer, `modify_sketch` patch ops, and `toolCallToPatch` mappings.

**Acceptance:** A sketch with mixed constraint kinds validates at Tier 2; the DOF analyzer reports under/over-constrained sketches; `modify_sketch` mutates constraints round-trip.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-7.md`

#### PATCH-03: Extended sketch primitives (arc, polygon, spline)

`SketchEntity` is extended with `arc`, `polygon`, and `spline` kinds across types, schema, volume/perimeter estimators, build123d codegen, and the `add_sketch` tool.

**Acceptance:** A sketch authored with all three new entity kinds compiles to build123d, estimates perimeter/volume correctly, and round-trips through `add_sketch`.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-15.md`

### HARDWARE — Hardware-spec features

#### HARDWARE-01: Hole subtypes + bolt-clearance rule

`HoleFeature` is extended with countersink/counterbore/threaded subtypes. A bolt-clearance manufacturing rule lands. Zod schemas, build123d codegen, the Anthropic tool schema, the system prompt, and the manufacturingTier validator all reflect the new subtypes.

**Acceptance:** Each hole subtype renders correctly via build123d; bolt-clearance violations are flagged at Tier 3; the agent uses the new subtypes in tool calls.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-3.md`

### ASSEMBLY — Multi-part assembly

#### ASSEMBLY-01: Assembly graph + joints + URDF compiler

CAD IR extends from single-part to multi-part with `parts`, `joints`, and `connections`. Tier 5 assembly validation lands. A URDF compiler emits motion-sim targets. New patch types and Anthropic tool defs cover assembly mutations.

**Acceptance:** A 2+ part assembly with a revolute joint passes Tier 5 validation, compiles to URDF, and the URDF loads in a motion-sim viewer.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-4.md`

#### ASSEMBLY-02: AABB interference detection (Tier 5)

`computePartBbox`, `transformBbox`, and a `partsInterfere` rule with severity levels land. AABB interference geometry helpers are composed into `assemblyTier`.

**Acceptance:** Two overlapping parts produce an interference violation at Tier 5 with the correct severity; non-overlapping parts pass.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-8.md`

#### ASSEMBLY-03: Joint-range self-collision sampling

A joint pose sampler covers revolute and linear joints. The `jointRangeCollision` rule samples N poses across a joint's range and runs AABB interference at each sample. Composed into `assemblyTier`.

**Acceptance:** A joint whose range causes self-collision somewhere in its arc produces a violation; a joint whose range stays clear passes across all samples.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-11.md`

### FEATURE — Geometry features

#### FEATURE-01: Revolve, shell, bend_flange + multi-part codegen

`revolve`, `shell`, and `bend_flange` features land. Multi-part build123d codegen (`compileAssembly`) lands. A `min-bend-radius` validation rule fires at Tier 3. Assembly graph integration is complete.

**Acceptance:** A multi-part assembly featuring a revolve, a shell, and a bend_flange compiles end-to-end; min-bend-radius violations flag correctly.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-5.md`

#### FEATURE-02: Sweep, loft, weld_tab + MJCF compiler

`sweep`, `loft`, and `weld_tab` features land. An MJCF compiler emits motion-sim targets as a second target alongside URDF.

**Acceptance:** An assembly with sweep/loft/weld_tab features compiles to both URDF and MJCF; both load in their respective motion-sim viewers.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-6.md`

### COMPILE — BOM and cost compilers

#### COMPILE-01: External part refs + BOM compiler

`PartRef` becomes a discriminated union (`inline | external`). `ExternalPartRef` carries vendor, partNumber, boundingBox. `CadIrSchema` updated. `partsInterfere` handles externals. `compileBom(ir): BomEntry[]` aggregates externals by vendor+partNumber. `add_part` tool schema is extended.

**Acceptance:** An assembly mixing inline and external parts compiles a BOM grouping externals by vendor+partNumber; `partsInterfere` correctly checks externals against inline parts using their bounding boxes.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-9.md`

#### COMPILE-02: Cost compiler + integration smoke test

`compileCost(ir, pricingDb): CostResult` and `PricingDb` shape land. `CadIr.budget` optional field gates a `budgetExceeded` validation rule. A full-stack integration smoke test composes the validate pipeline end-to-end.

**Acceptance:** An assembly with a `budget` produces a `budgetExceeded` violation when materials/processes exceed it; the smoke test passes from agent patch through validate, compile, BOM, and cost.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-10.md`

#### COMPILE-03: Inline-part fabrication cost

A material catalog and a volume estimator land. Per-inline-part fabrication cost (volume × density × $/kg) is integrated into `compileCost` and the BOM.

**Acceptance:** An inline part with a known material reports a non-zero fabrication cost line in the BOM; cost reflects volume and material density.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-12.md`

#### COMPILE-04: Process-aware machine-time cost

A `BUILTIN_PROCESSES` catalog (laser_cut, cnc, print_3d, sheet_metal_bend) lands with a perimeter estimator and a `machineCost` compiler. `CadIr.process` field is integrated into `compileCost`.

**Acceptance:** A part with `process: laser_cut` produces a machine-time cost line that scales with perimeter; switching `process` changes the cost.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-13.md`

### MFG — Process-aware manufacturing rules

#### MFG-01: Laser-cut process-aware rules

`mfg.laser-cut-min-hole` and `mfg.laser-cut-min-slot` rules fire only when `process` is `laser_cut`, integrated into `manufacturingTier`.

**Acceptance:** A laser-cut part with too-small holes/slots violates at Tier 3; the same geometry under a non-laser process passes those rules.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-14.md`

#### MFG-02: 3D-print specific rules

`mfg.print-3d-min-wall` (per-material thresholds) and `mfg.print-3d-bed-size` (default bed dimensions) rules land. Both fire only when `process` is `print_3d`. Integrated into `manufacturingTier`.

**Acceptance:** A printed part with sub-threshold walls or oversize footprint violates at Tier 3; the same geometry under a non-print process passes.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-16.md`

#### MFG-03: CNC tool-diameter + internal-corner rules

A `cncToolDiameter` field lands on `CadIr`. `mfg.cnc-min-internal-corner` and `mfg.cnc-pocket-too-deep` rules fire only when `process` is `cnc`.

**Acceptance:** A CNC part with internal corners smaller than the tool diameter or pockets too deep violates at Tier 3; non-CNC processes pass those rules.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-17.md`

### EXTERNAL — STEP imports

#### EXTERNAL-01: STEP imports for external parts

Optional `stepUrl` field on `ExternalPartRef`. `compileAssembly` emits build123d `import_step` calls for external parts that carry a `stepUrl`.

**Acceptance:** An assembly with a `stepUrl`-bearing external part compiles, the build123d run imports the STEP file, and the resulting geometry shows up in the assembled preview.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-18.md`

### CUTOVER — Final consolidation and cutover

#### CUTOVER-01: Mega-integration test + final verification sweep

A mega-integration test exercises every validation tier, every compile target, and every patch tool end-to-end. README final-state summary is updated. Final verification sweep confirms no regressions across the rebuild.

**Acceptance:** Mega-integration test passes; sweep confirms parity across all 5 validation tiers, all compile targets (build123d, URDF, MJCF, BOM, cost), and all patch tools.

**Source:** `docs/superpowers/plans/2026-04-30-cad-ir-phase-19.md`

#### CUTOVER-02: Tennis-ball-locker passes behind `useCadIr`

The canonical tennis-ball-locker end-to-end test passes against the CAD IR rebuild with `useCadIr=true`, in addition to continuing to pass against the live Slice 1 schema with `useCadIr=false`.

**Acceptance:** With `useCadIr=true`, the user can describe a tennis-ball locker via the scope wizard, the system generates a multi-part sheet-metal assembly, the user refines parts, and per-part DXF export produces valid files for every part. The same flow continues to work with `useCadIr=false`.

**Source:** ADR-0001 cutover gate; PROJECT.md headline success metric.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CADIR-01 | Phase 1 | Pending |
| PATCH-01 | Phase 2 | Pending |
| HARDWARE-01 | Phase 3 | Pending |
| ASSEMBLY-01 | Phase 4 | Pending |
| FEATURE-01 | Phase 5 | Pending |
| FEATURE-02 | Phase 6 | Pending |
| PATCH-02 | Phase 7 | Pending |
| ASSEMBLY-02 | Phase 8 | Pending |
| COMPILE-01 | Phase 9 | Pending |
| COMPILE-02 | Phase 10 | Pending |
| ASSEMBLY-03 | Phase 11 | Pending |
| COMPILE-03 | Phase 12 | Pending |
| COMPILE-04 | Phase 13 | Pending |
| MFG-01 | Phase 14 | Pending |
| PATCH-03 | Phase 15 | Pending |
| MFG-02 | Phase 16 | Pending |
| MFG-03 | Phase 17 | Pending |
| EXTERNAL-01 | Phase 18 | Pending |
| CUTOVER-01 | Phase 19 | Pending |
| CUTOVER-02 | Phase 19 | Pending |
| CADIR-02 | Phase 19 | Pending |

**Coverage:** 21/21 requirements mapped. No orphans.

Note: CADIR-02 (glTF preview parity) is grouped with CUTOVER (Phase 19) because parity is what gates cutover; the executor work it depends on lands in Phase 1.
