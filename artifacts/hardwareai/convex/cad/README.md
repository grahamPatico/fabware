# `convex/cad` — CAD Intermediate Representation Module

Phase 4 implementation of the CAD IR pipeline for Fabware hardware-AI.

---

## Module layout

```
convex/cad/
├── ir/
│   ├── types.ts          — All CAD IR TypeScript types (CadIr, Feature, SketchDef, …)
│   ├── schema.ts         — Zod schema for CadIr (runtime validation / JSON parsing)
│   └── empty.ts          — emptyIr() factory
│
├── expression/
│   ├── parser.ts         — Recursive-descent expression parser → ExprNode AST
│   └── evaluator.ts      — Evaluates parameter expressions to numbers
│
├── resolve/
│   └── resolveIr.ts      — resolveIr(): evaluates all ParamRefs → ResolvedIr
│
├── geometry/                                              — Phase 8 / Phase 11
│   ├── partBbox.ts       — computePartBbox(): AABB from extrude/revolve features; AABB type
│   ├── transform.ts      — transformBbox(): translate + conservative sphere-expand for rotation
│   └── jointPose.ts      — sampleJointPoses() + applyPoseToBbox() — Phase 11
│
├── validate/
│   ├── schemaTier.ts     — Tier-1: structural / schema rules (duplicate ids, missing refs, joint refs, constraint refs)
│   ├── constraintTier.ts — Tier-2: sketch constraint rules (contradictions, DOF heuristic) — Phase 7
│   ├── geometryTier.ts   — Tier-3: geometry sanity (positive dims, etc.)
│   ├── assemblyTier.ts   — Tier-5: assembly topology rules (floating parts, over-constrained groups, AABB interference)
│   ├── manufacturingTier.ts — Tier-4: manufacturing rules (hole-edge-distance, …)
│   └── rules/
│       ├── holeEdgeDistance.ts  — mfg.hole-edge-distance
│       ├── minWallThickness.ts  — mfg.min-wall-thickness
│       ├── boltClearance.ts          — mfg.bolt-clearance
│       ├── minBendRadius.ts          — mfg.min-bend-radius
│       ├── partsInterfere.ts         — assembly.parts-interfere (Phase 8)
│       └── jointRangeCollision.ts    — assembly.joint-range-collision (Phase 11)
│
├── patch/
│   ├── types.ts          — Patch union type (set_parameter, add_feature, …)
│   ├── apply.ts          — applyPatch(): immutable patch application + schema validation
│   └── tools.ts          — Claude tool-call definitions for patch operations
│
├── compile/                                                   — Phase 9 / Phase 10 / Phase 12 / Phase 13
│   ├── bom.ts            — compileBom(): recursive BOM aggregation (ExternalPartRef → BomLine[])
│   ├── cost.ts           — compileCost(): BOM pricing + fabrication + machine cost roll-up (Phase 10/12/13)
│   ├── materials.ts      — BUILTIN_MATERIALS catalog + lookupMaterial() (Phase 12)
│   ├── volume.ts         — estimateVolume(): mm³ from extrude/cut_extrude features (Phase 12)
│   ├── fabricationCost.ts — compileFabricationCost(): per-part cost from mass × density (Phase 12)
│   ├── processes.ts      — BUILTIN_PROCESSES catalog + lookupProcess() (Phase 13)
│   ├── perimeter.ts      — estimatePerimeter(): cut-path mm from extrude/cut_extrude features (Phase 13)
│   └── machineCost.ts    — compileMachineCost(): per-part machine cost by process (Phase 13)
│
├── codegen/
│   ├── compileToBuild123d.ts — Compiles ResolvedIr → build123d Python script
│   ├── compileAssembly.ts    — Compiles multi-part CadIr → Record<PartId, Python script> (skips externals)
│   ├── compileToUrdf.ts      — Compiles CadIr assembly → URDF XML string
│   ├── compileToMjcf.ts      — Compiles CadIr assembly → MJCF XML string (Phase 6)
│   ├── emitParameters.ts     — Parameter variable declarations
│   ├── emitFeature.ts        — Dispatches to per-kind emitters
│   └── features/
│       ├── extrude.ts
│       ├── cutExtrude.ts
│       ├── fillet.ts
│       ├── chamfer.ts
│       ├── hole.ts
│       ├── pattern.ts
│       ├── revolve.ts        — Phase 5
│       ├── shell.ts          — Phase 5
│       ├── bendFlange.ts     — Phase 5 (placeholder codegen)
│       ├── sweep.ts          — Phase 6
│       ├── loft.ts           — Phase 6
│       └── weldTab.ts        — Phase 6
│
├── executor/
│   ├── runSandbox.ts     — Python sandbox runner (executes build123d scripts)
│   └── entitiesParser.ts — Parses report_entities() output → EntityRegistry
│
├── revisions/
│   └── hash.ts           — Deterministic revision hash for CadIr snapshots
│
├── plugin.ts             — cadIrPlugin: validates CadIr via schema, assembly, and manufacturing tiers
└── prompts.ts            — System prompt fragment for the CAD IR specialist agent (includes assembly rules)
```

---

## Phase 1 scope

Everything listed in the module layout above is implemented and tested in Phase 1. Key capabilities:

- **Parametric IR** — `CadIr` carries named parameters with expression support (`"length * 2 - 10"`), resolved via `resolveIr()` before codegen or validation.
- **Four-tier validation** — schema → geometry → (reserved) → manufacturing, each returning typed `Violation[]` with agent-readable messages.
- **`mfg.hole-edge-distance` rule** — rejects holes whose centres are closer than `1.5 × d + d/2` to any edge of the parent extrude's bounding rectangle.
- **Immutable patch application** — `applyPatch()` returns the new IR or rolls back and surfaces violations; schema is always re-checked after every patch.
- **Mock repair loop** — integration test proves the loop converges in ≤ 3 turns on a hole-edge violation.
- **build123d codegen** — `compileToBuild123d()` emits runnable Python for all six feature kinds (extrude, cut_extrude, fillet, chamfer, hole, pattern); stability is guarded by a golden snapshot test.
- **Python sandbox executor** — runs generated scripts and parses `report_entities()` output back into the IR's `EntityRegistry`.
- **Revision hashing** — deterministic SHA-256 of the canonical IR JSON for cache keys / change detection.
- **Convex integration** — Convex schema tables (`cadIrRevisions`, `cadIrJobs`) + `setUseCadIr` mutation + `cadIrSpecialist` action.
- **React preview** — `CadPreview` Three.js component renders GLB build artifacts in the browser.

Tests: **≥ 151 passing** (`pnpm test --run`).

---

## Phase 3 scope (shipped)

Phase 3 extends hole features with four subtypes, a new manufacturing rule, richer tool schemas, and codegen for non-simple hole variants.

### Hole sub-types

`HoleFeature.type` is now a 4-value enum: `"simple" | "countersink" | "counterbore" | "threaded"`.

Three new optional sub-object fields are added to `HoleFeature`:

| Field | Type | Required when |
|---|---|---|
| `countersink` | `{ angle, diameter }` | `type === "countersink"` |
| `counterbore` | `{ diameter, depth }` | `type === "counterbore"` |
| `thread` | `{ spec }` | `type === "threaded"` |

Schema validation (Zod `superRefine`) rejects any hole that declares a sub-type without its required sub-object. Thread `spec` must match `M<n>x<pitch>` or `<n>/<d>-<tpi>` format (e.g. `"M6x1.0"`, `"1/4-20"`).

### Codegen — `emitHole` dispatch

`emitHole` now switches on `f.type`:

| Type | Python call |
|---|---|
| `simple` | `Hole(radius=d/2, depth=...)` |
| `countersink` | `CounterSinkHole(radius=d/2, counter_sink_radius=cs.d/2, depth=..., counter_sink_angle=cs.angle)` |
| `counterbore` | `CounterBoreHole(radius=d/2, counter_bore_radius=cb.d/2, counter_bore_depth=cb.depth, depth=...)` |
| `threaded` | `# threaded hole: spec=<spec>` + `Hole(radius=d/2, depth=...)` |

### `mfg.bolt-clearance` manufacturing rule

New rule in `validate/rules/boltClearance.ts`:

> For a `counterbore` hole, `counterbore.diameter` must be ≥ `1.2 × pilot diameter`.

Wired into `validateManufacturingTier()` alongside `holeEdgeDistance` and `minWallThickness`.

### Tool schema + system prompt

`add_feature` JSON Schema updated: hole `type` changed from `{ const: "simple" }` to `{ enum: [...4 types] }` with optional `countersink`, `counterbore`, and `thread` sub-object schemas.

System prompt updated to explain all 4 hole types, required sub-objects, and the `mfg.bolt-clearance` constraint.

Tests: **≥ 221 passing** (`pnpm test --run`).

---

## Phase 5 scope (shipped)

Phase 5 extends the CAD IR with three new feature kinds, a new manufacturing validation rule,
and a per-part assembly codegen entry point.

### New feature kinds (Phase 5 Tasks 1–5)

| Kind | Description |
|---|---|
| `revolve` | Sweeps a profile sketch around an axis (x/y/z) by an angle in degrees (0 < angle ≤ 360). Creates a new body. |
| `shell` | Hollows a solid to a uniform wall thickness, opening one or more faces. `tag: "top"` → highest-Z face; `tag: "bottom"` → lowest-Z face. |
| `bend_flange` | Adds a flanged bend to a sheet-metal part. Codegen emits a descriptive comment + `pass` placeholder (real bend geometry deferred to a sheet-metal extension). |

All three kinds are added to:
- `Feature` discriminated union in `ir/types.ts`
- `FeatureSchema` Zod discriminated union in `ir/schema.ts`
- `resolveIr()` in `resolve/resolveIr.ts`
- `emitFeature()` dispatch in `codegen/emitFeature.ts`
- `add_feature` tool schema in `patch/tools.ts`
- CAD IR system prompt fragment in `prompts.ts`

### Codegen emitters (Phase 5 Task 2)

| Feature | Python produced |
|---|---|
| `revolve` | `with BuildPart() as <id>:` / `revolve(revolution_arc=<angle>)` |
| `shell` | `shell(<parent>.part, amount=-<t>, openings=[<face_selectors>])` |
| `bend_flange` | `# bend_flange <id>: ...` comment + `pass` placeholder |

Revolve angle is in degrees in the IR; `revolution_arc` in build123d is also degrees — no conversion needed.

### `mfg.min-bend-radius` rule (Phase 5 Task 5)

New rule in `validate/rules/minBendRadius.ts`:

> For a `bend_flange` feature, `radius` must be ≥ `thickness`.

Bending to a radius tighter than the sheet thickness causes cracking along the bend line.
Wired into `validateManufacturingTier()` alongside the existing rules.

### `compileAssembly` entry point (Phase 5 Task 6)

`compileAssembly(ir)` in `codegen/compileAssembly.ts` iterates `ir.parts` and returns
`Record<PartId, string>` — one build123d Python script per part. Returns `{}` when
`ir.parts` is undefined (single-part IR). Existing callers of `compileToBuild123d` are
unaffected.

Tests: **≥ 258 passing** (`pnpm test --run`).

---

## Phase 6 scope (shipped)

Phase 6 extends the CAD IR with three new feature kinds (sweep, loft, weld_tab) and adds
an MJCF physics simulator compiler alongside the existing URDF compiler.

### New feature kinds (Phase 6 Tasks 1–3)

| Kind | Description |
|---|---|
| `sweep` | Sweeps a cross-section profile sketch along a path sketch → `BuildPart/BuildSketch/BuildLine/sweep(sections=, path=)`. Creates a new body. |
| `loft` | Lofts through an ordered list of ≥ 2 profile sketches → `BuildPart/multiple BuildSketch contexts/loft(sections=[...])`. Creates a new body. |
| `weld_tab` | Adds a small rectangular weld tab to an existing body face → `Locations/BuildSketch/Rectangle/extrude` inside parent body context. Modifies parent body in-place. |

All three kinds are added to:
- `Feature` discriminated union in `ir/types.ts`
- `FeatureSchema` Zod discriminated union in `ir/schema.ts` (loft enforces `profiles.min(2)`)
- `resolveIr()` in `resolve/resolveIr.ts` (sweep/loft pass through; weld_tab resolves ParamRefs)
- `emitFeature()` dispatch in `codegen/emitFeature.ts`
- `add_feature` tool schema in `patch/tools.ts`
- CAD IR system prompt fragment in `prompts.ts`

### MJCF compiler (Phase 6 Task 5)

`compileToMjcf(ir, modelName)` in `codegen/compileToMjcf.ts` emits MJCF XML for MuJoCo:
- Each `parts` entry → `<body name="...">` inside `<worldbody>`
- Joint elements live **inside the child body** (MJCF convention, unlike URDF)
- `revolute` → `<joint type="hinge" axis="..." range="..."/>`
- `linear`   → `<joint type="slide" axis="..." range="..."/>`
- `fixed`    → no `<joint>` element (rigid attachment)
- Unit conversions: mm→m (÷1000), in→m (×0.0254), deg→rad (×π/180)

### `add_feature` tool schema update (Phase 6 Task 4)

`add_feature` JSON Schema updated: three new `oneOf` variants added for `sweep`, `loft`,
and `weld_tab`. `tools.test.ts` assertion updated from "nine" to "twelve" feature kinds.

Tests: **≥ 258 passing** (`pnpm test --run`).

---

## Phase 4 scope (shipped)

Phase 4 adds multi-part assembly support to the CAD IR pipeline.

### Assembly types (Phase 4 Task 1)

`CadIr` gains three optional fields: `parts`, `joints`, `connections`.

| Type | Description |
|---|---|
| `PartRef` | A sub-part placed in an assembly: `{ id, ir, origin?, rotation? }`. `ir` is a nested `CadIr`. |
| `Joint` | Kinematic connection: `{ id, parent, child, type, axis?, limits?, origin? }`. Types: `fixed`, `revolute`, `linear`. |
| `Connection` | Geometric/interface mating: `{ partA, featureA, partB, featureB, type }`. Types: `face_mate`, `bolt_pattern`, `snap_fit`. |
| `AxisRef` | Either `{ kind: "standard", axis: "x"/"y"/"z" }` or `{ kind: "edge", ... }` (requires geometry). |

### Zod schemas with `z.lazy` (Phase 4 Task 2)

`CadIrSchema` is now wrapped in `z.lazy()` to support recursive `PartRef.ir` references. Annotated as `ZodType<unknown>` at the boundary; callers use `as CadIr` casts.

### Schema-tier checks (Phase 4 Task 3)

`validateSchemaTier` detects:
- `schema.joint-missing-part` — joint parent/child references an unknown part id
- `schema.duplicate-joint-id` — two joints share the same id
- `schema.connection-missing-part` — connection references an unknown part id

### Tier 5: assembly validator (Phase 4 Task 4)

`validateAssemblyTier` in `validate/assemblyTier.ts` detects:
- `assembly.floating-part` — a part in a multi-part assembly has no joints
- `assembly.over-constrained-rigid-group` — a cycle of fixed joints over-constrains a rigid group (detected via Union-Find)

Wired into `cadIrPlugin.validate` between schema-tier and manufacturing-tier.

### URDF compiler (Phase 4 Task 5)

`compileToUrdf(ir, robotName)` in `codegen/compileToUrdf.ts` emits URDF XML:
- Each `parts` entry → `<link name="..."/>`
- Each `joints` entry → `<joint type="...">` with `<parent>`, `<child>`, `<origin>`, `<axis>`, `<limit>`
- Unit conversions: mm→m (÷1000), in→m (×0.0254), deg→rad (×π/180)
- `AxisRef.kind === "edge"` defaults to `0 0 1` (geometry resolution not yet available)

### 3 new patch types + applier (Phase 4 Tasks 6–7)

| Patch | Description |
|---|---|
| `add_part` | Adds a `PartRef` to `ir.parts[id]` |
| `add_joint` | Appends a `Joint` to `ir.joints[id]`; schema-tier catches missing part refs |
| `add_connection` | Appends a `Connection` to `ir.connections[]` |

### 3 new tools (Phase 4 Tasks 8–9)

`CAD_IR_TOOLS` now exports **12 tools** (was 9). New tools: `add_part`, `add_joint`, `add_connection`. Wired into `toolCallToPatch` in the specialist.

### Hinged-box integration test (Phase 4 Task 11)

`cad/__tests__/assembly-mock.test.ts` proves:
1. Adding parts before joints yields `assembly.floating-part` violations for both parts.
2. Adding a revolute hinge joint resolves both violations.
3. `compileToUrdf` produces correct URDF with `<link>` elements, revolute `<joint>`, axis, and converted limits/origin.

---

## Phase 3 scope (shipped)

Phase 2 extended the CAD IR pipeline with richer patch coverage, manufacturing rule decomposition, and a harder integration test:

### 7 new patch tools (+ prompt coverage)

Phase 1 shipped `set_parameter` and `add_feature`. Phase 2 adds the remaining 7 tools, bringing the total to **9**:

| Tool | Description |
|---|---|
| `modify_feature` | Merge partial changes into an existing feature |
| `suppress` / `unsuppress` | Toggle features out of / back into the build |
| `reorder_feature` | Move a feature to a different timeline position |
| `remove` | Delete a parameter, sketch, or feature |
| `add_sketch` | Insert a new sketch definition |
| `modify_sketch` | Change plane or geometry entities on an existing sketch |

All 9 tools are wired into `cadIrPlugin.tools` and covered by `patch/apply.ts`.

### Manufacturing rules refactor

`validate/manufacturingTier.ts` was refactored from a single monolithic file into a composed set of per-rule files under `validate/rules/`:

- `rules/holeEdgeDistance.ts` — extracted hole-edge-distance logic (behaviour preserved exactly)
- `rules/minWallThickness.ts` — new rule: extrude `distance` must be ≥ 2 mm

`validateManufacturingTier()` now composes both rules via spread:

```ts
return [...holeEdgeDistance(ir), ...minWallThickness(ir)];
```

Adding future rules is a one-liner import + spread.

### Multitool repair loop integration test

`cad/__tests__/repair-loop-multitool.test.ts` proves the loop handles **two simultaneous violations** with two different patch kinds:

- Turn 1: `set_parameter` fixes the thin-wall violation
- Turn 2: `modify_feature` moves the hole to clear the edge-distance violation
- Asserts convergence in ≤ 2 turns

Tests: **182 passing** (`pnpm test --run`).

---

## Phase 7 scope (shipped)

Phase 7 adds sketch constraint types, Tier 2 constraint validation, `add_constraint` / `remove_constraint` patch ops, and wires Tier 2 into the plugin validate pipeline.

### SketchConstraint types (Phase 7 Task 1)

`SketchDef` gains an optional `constraints?: SketchConstraint[]` field. `SketchConstraint` is a 9-kind discriminated union:

| Kind | Fields | Operates on |
|---|---|---|
| `coincident` | `a: SketchPointRef, b: SketchPointRef` | entity points (start/end/center) |
| `distance` | `a: SketchPointRef, b: SketchPointRef, distance: ParamRef` | entity points |
| `parallel` | `a: SketchEntityRef, b: SketchEntityRef` | entity ids |
| `perpendicular` | `a: SketchEntityRef, b: SketchEntityRef` | entity ids |
| `tangent` | `a: SketchEntityRef, b: SketchEntityRef` | entity ids |
| `equal` | `a: SketchEntityRef, b: SketchEntityRef` | entity ids |
| `angle` | `a: SketchEntityRef, b: SketchEntityRef, angle: ParamRef` | entity ids |
| `horizontal` | `entity: SketchEntityRef` | single entity id |
| `vertical` | `entity: SketchEntityRef` | single entity id |

Two new helper types: `SketchPointRef` (`{ entity, point: "start"|"end"|"center" }`) and `SketchEntityRef` (alias for `string`).

### Zod schema (Phase 7 Task 2)

`SketchConstraintSchema` is a `z.discriminatedUnion("kind", [...])` covering all 9 kinds. Exported from `ir/schema.ts`. `SketchDef` Zod schema updated to include `constraints: z.array(SketchConstraintSchema).optional()`.

### Schema-tier constraint checks (Phase 7 Task 3)

`validateSchemaTier` detects:
- `schema.constraint-unresolved-entity-ref` — constraint references an entity id not in `sketch.geometry`
- `schema.duplicate-constraint-id` — two constraints in the same sketch share an id

### Tier 2: constraint validation (Phase 7 Task 4)

`validateConstraintTier` in `validate/constraintTier.ts` detects:
- `constraint.contradictory-axis` **(error)** — entity has both `horizontal` and `vertical` constraints (mutually exclusive)
- `constraint.over-constrained` **(warn)** — total constraint DOF exceeds 2× entity DOF (heuristic; approximate until Phase 8 solver)

### Plugin pipeline update (Phase 7 Task 5)

`cadIrPlugin.validate` now runs Tier 2 between Tier 1 (schema) and Tier 5 (assembly):
- Tier 2 **errors** short-circuit (return immediately, like Tier 1 errors)
- Tier 2 **warnings** propagate alongside manufacturing-tier violations (agent sees both)

### Patch ops (Phase 7 Task 6)

`ModifySketchOp` union gains two new variants:
- `{ kind: "add_constraint"; constraint: SketchConstraint }` — appends to `sketch.constraints` (defaults to `[]` if absent)
- `{ kind: "remove_constraint"; constraintId: string }` — filters out the constraint by id

`modify_sketch` tool schema updated with two new `oneOf` variants. `toolCallToPatch` in `specialists/cadIr.ts` handles both new cases.

Tests: **≥ 279 passing** (`pnpm test --run`).

---

## Phase 8 scope (shipped)

Phase 8 adds bounding-box geometry helpers and a Tier 5 interference rule for assembly part pairs.

### `geometry/partBbox.ts` — `computePartBbox` (Task 1)

`computePartBbox(ir: CadIr): AABB | null` walks the part's resolved features and builds an AABB:
- **`extrude`**: rect/circle sketch geometry × `distance` in the Z direction
- **`revolve`**: conservative cylinder — profile bbox revolved 360° enclosed in an axis-aligned cylinder
- All other feature kinds (cut, fillet, chamfer, hole, etc.) are skipped (they modify/subtract, not grow)

Returns `null` if the part has no extrude or revolve features.

`AABB` type is exported from this module; `transform.ts` and `partsInterfere.ts` import from here.

### `geometry/transform.ts` — `transformBbox` (Task 2)

`transformBbox(local, origin, rotation?): AABB` places a local AABB into the assembly frame:
- **No rotation** (undefined or all-zero): pure translation by `origin` (exact result)
- **Any rotation component non-zero**: expand to a sphere centered at the local bbox center
  with radius = bbox half-diagonal length, then translate. Always a superset of the rotated box.

### `validate/rules/partsInterfere.ts` — `partsInterfere` (Task 3)

Tier 5 rule `assembly.parts-interfere`: checks every pair of parts in `ir.parts` for AABB overlap.
- Overlap test uses strict inequality — touching parts (coincident faces) are not flagged.
- Severity `"error"` when neither part is rotated (bbox is exact).
- Severity `"warn"` when at least one part is rotated (conservative sphere expansion may be a false positive).

Composed into `validateAssemblyTier()` via `out.push(...partsInterfere(ir))`.

### Prompts update (Task 4)

`prompts.ts` system prompt fragment updated with `assembly.parts-interfere` rule documentation
(severity meanings, fix guidance, touching-face clarification).

Tests: **≥ 291 passing** (`pnpm test --run`).

---

---

## Phase 9 scope (shipped)

Phase 9 extends the `PartRef` type to support purchased / off-the-shelf (external) parts, adds a
BOM compiler, and wires external parts into the AABB interference check.

### `PartRef` union (Task 1)

`PartRef` is now a union type `InlinePartRef | ExternalPartRef`:

| Type | Key fields | Use |
|---|---|---|
| `InlinePartRef` | `id`, `ir: CadIr`, `kind?: "inline"` | Sub-assemblies with inline geometry (Phase 4 default; backward compat: `kind` is optional) |
| `ExternalPartRef` | `id`, `kind: "external"`, `vendor`, `partNumber`, `description?`, `boundingBox?` | Purchased / off-the-shelf parts (fasteners, bearings, etc.) |

Both variants share `origin?` and `rotation?` (now typed as `{ x: ParamRef; y: ParamRef; z: ParamRef }` etc.).

### Zod schema (Task 2)

`PartRefSchema` now uses `z.union([InlinePartRefSchema, ExternalPartRefSchema])`. `z.discriminatedUnion`
is NOT used because `InlinePartRef.kind` is optional — discriminated union requires a required discriminator.

### AABB interference (Task 4)

`partsInterfere` updated to handle both variants:
- **External with no `boundingBox`**: skipped (no geometry to check).
- **External with `boundingBox`**: uses a synthetic AABB `[-w/2, w/2] × [-h/2, h/2] × [0, d]`.
- **Inline**: existing `computePartBbox(ir)` path unchanged.

### BOM compiler — `compile/bom.ts` (Task 5)

`compileBom(ir: CadIr): BomLine[]` recursively walks the assembly tree:
- External parts aggregate by `vendor + "::" + partNumber` key (quantity ++)
- Inline parts are recursed into (nested assemblies contribute their external parts)
- Result sorted by vendor then partNumber

### `add_part` tool schema (Task 6)

`add_part` now accepts both inline and external part fields. `id` is the only required field;
`ir` is required for inline parts, `vendor` + `partNumber` for external parts.
`boundingBox` is exposed as an optional field for external parts.

### Specialist `toolCallToPatch` (Task 7)

`toolCallToPatch` for `add_part` updated to dispatch on `kind === "external"` and build the
correct `ExternalPartRef` or `InlinePartRef` shape. No breaking change to existing inline paths.

### `compileAssembly` (Task 8 / fixup)

`compileAssembly` skips external parts (`kind === "external"`) — they have no inline geometry
to compile to build123d Python.

Tests: **≥ 303 passing** (`pnpm test --run`).

---

## Phase 10 scope (shipped)

Phase 10 adds BOM cost estimation, an optional `CadIr.budget` field, a `bom.budget-exceeded`
validation rule, and a comprehensive end-to-end integration smoke test.

### `compile/cost.ts` — `compileCost` (Task 1)

`compileCost(ir, pricing?)` in `compile/cost.ts` aggregates external parts by `vendor::partNumber`,
looks up each key in a `PricingDb`, and returns a `CostResult`:

| Field | Type | Description |
|---|---|---|
| `lines` | `CostLine[]` | Per-line breakdown sorted by vendor then partNumber |
| `totalKnown` | `number` | Sum of all known line totals (USD) |
| `hasMissingPrices` | `boolean` | True if any part had no entry in the pricing db |

`BUILTIN_PRICING` is a starter set of McMaster-Carr fasteners and Misumi bearings:

| Key | Part | USD |
|---|---|---|
| `McMaster-Carr::91290A115` | M6×10 SHCS | $0.42 |
| `McMaster-Carr::91290A130` | M6×25 SHCS | $0.55 |
| `McMaster-Carr::91294A150` | M6×40 SHCS | $0.75 |
| `McMaster-Carr::91100A030` | M3 hex nut | $0.08 |
| `McMaster-Carr::91100A060` | M6 hex nut | $0.15 |
| `McMaster-Carr::92141A012` | M3 flat washer | $0.05 |
| `Misumi::B-6800ZZ` | 6800ZZ ball bearing | $3.20 |

### `CadIr.budget` field (Task 2)

`CadIr` gains an optional `budget?: number` field (Zod: `z.number().positive().optional()`).
Represents the target BOM cost ceiling in USD.

### `validate/rules/budgetExceeded.ts` — `budgetExceeded` (Task 3)

`budgetExceeded(ir): Violation[]` fires a `bom.budget-exceeded` **warn** violation when
`compileCost(ir).totalKnown > ir.budget`. Severity is warn (not error) to avoid blocking
codegen — missing prices make the total an underestimate.

Composed into `cadIrPlugin.validate` alongside `validateManufacturingTier`:

```ts
return [...t2, ...validateManufacturingTier(resolved), ...budgetExceeded(ir)];
```

### Integration smoke test (Task 4)

`cad/__tests__/integration-phase10.test.ts` exercises every Phase 1–10 system in a single test:

- Two inline parts (body + lid) with extrude features
- Revolute hinge joint (Phase 4)
- 4 × M6 SHCS + 4 × M6 hex nuts as external parts (Phase 9)
- Fixed screw↔nut joint pairs satisfying floating-part rule
- Bolt connections between body+lid and each screw+nut pair
- Budget $5.00 (cost $2.28 — under budget)
- Validates all tiers, compiles all outputs (build123d, URDF, MJCF, BOM, cost), checks hash

### Prompts + README (Task 5)

`prompts.ts` updated with Phase 10 cost estimation section. README updated with Phase 10 scope.

Tests: **≥ 317 passing** (`pnpm test --run`).

---

## Phase 11 scope (shipped)

Phase 11 adds joint pose sampling and a swept-range collision rule to the assembly tier.

### `geometry/jointPose.ts` — pose sampler (Task 1)

`sampleJointPoses(joint, n=5): JointPose[]` samples n poses linearly across the joint's motion limits:
- **Revolute**: degrees stored; axis = world axis (x/y/z); rotation applied to the named axis, translation zero.
- **Linear**: mm stored (or in × 25.4 if `unit="in"`); axis = world axis; translation applied, rotation zero.
- **Fixed / no limits**: returns a single resting pose `{ rotation: {rx:0,ry:0,rz:0}, translation: {x:0,y:0,z:0} }`.

`applyPoseToBbox(bbox, pose): AABB` delegates to `transformBbox(bbox, pose.translation, pose.rotation)`.

### `validate/rules/jointRangeCollision.ts` — `jointRangeCollision` (Task 2)

Tier 5 rule `assembly.joint-range-collision`: for each revolute or linear joint with limits:
1. Pre-computes static bboxes for all parts (reused across joints).
2. Computes child's local bbox and applies child's static origin offset (translation only).
3. Samples 5 poses; for each pose applies the pose to the origin-shifted child bbox.
4. Checks the swept bbox against every other part's static bbox (excluding joint endpoints — parent and child are always skipped).
5. Emits a **warn** violation per (joint, other-part) pair that has any pose overlap.

Severity is always `"warn"` (conservative AABB expansion; false positives are expected for large sweeps near adjacent geometry).

Composed into `validateAssemblyTier()` via `out.push(...jointRangeCollision(ir))`.

### Prompts + README (Task 3)

`prompts.ts` updated with `assembly.joint-range-collision` rule documentation. README updated with Phase 11 scope.

Tests: **≥ 329 passing** (`pnpm test --run`).

---

## Phase 12 scope (shipped)

Phase 12 adds a material catalog, a volume estimator, and a fabrication-cost compiler. `compileCost` now returns a full cost total that includes BOM pricing plus estimated fabrication cost for inline parts.

### `compile/materials.ts` — `BUILTIN_MATERIALS` + `lookupMaterial` (Task 1)

`BUILTIN_MATERIALS` is a `Record<string, MaterialEntry>` with 6 common engineering materials:

| Key | Material | Density (g/cm³) | Cost (USD/kg) |
|---|---|---|---|
| `aluminum` | Aluminum 6061 | 2.7 | $8 |
| `steel` | Mild steel 1020 | 7.85 | $5 |
| `stainless` | Stainless steel 304 | 8.0 | $12 |
| `pla` | PLA (3D print) | 1.24 | $25 |
| `abs` | ABS (3D print) | 1.05 | $22 |
| `nylon` | Nylon PA12 | 1.01 | $30 |

`lookupMaterial(name?, catalog?)` resolves case-insensitively (exact key, then substring), falling back to `DEFAULT_MATERIAL` (aluminum) when no match is found or name is absent.

### `CadIr.material` field (Task 2)

`CadIr` gains an optional `material?: string` field. Accepted by the Zod schema (`z.string().min(1).optional()`). Set on a sub-part's inline IR to override the assembly-level material for that part.

### `compile/volume.ts` — `estimateVolume` (Task 3)

`estimateVolume(ir: CadIr): number` returns the estimated manufactured volume in mm³:
- **`extrude` (new_body / add)**: profile area × distance. Rect = w × h; circle = π × r². `cornerRadius` ignored.
- **`cut_extrude`**: subtracts profile area × distance.
- All other feature kinds are skipped.
- Result clamped to 0 (`Math.max(0, ...)`).

### `compile/fabricationCost.ts` — `compileFabricationCost` (Task 4)

`compileFabricationCost(ir: CadIr): FabCostResult` estimates fabrication cost for all inline parts:
- Skips external parts (already in BOM pricing).
- For each inline part: `volume_cm3 × density / 1000 × costPerKgUsd`.
- Top-level single-part IRs (no `parts`) emit a single `partId: "root"` entry.
- Material resolution: `partIr.material` → `ir.material` → `DEFAULT_MATERIAL` (aluminum).

### `compileCost` updated (Task 5)

`CostResult` gains two new fields:

| Field | Type | Description |
|---|---|---|
| `fabricationTotalUsd` | `number` | Sum of all inline part fabrication costs |
| `totalUsd` | `number` | `totalKnown` + `fabricationTotalUsd` |

`totalKnown` is unchanged (BOM-only, external parts with known prices). `totalUsd` is the canonical total cost estimate.

### Prompts + README (Task 6)

`prompts.ts` updated with Phase 12 material catalog and fabrication cost documentation. README updated with Phase 12 scope.

Tests: **≥ 345 passing** (`pnpm test --run`).

---

## Phase 13 scope (shipped)

Phase 13 adds a manufacturing process catalog, a perimeter estimator, and a machine-cost compiler. `compileCost` now returns a `machine` field and includes machine cost in `totalUsd`.

### `compile/processes.ts` — `BUILTIN_PROCESSES` + `lookupProcess` (Task 1)

`BUILTIN_PROCESSES` is a `Record<ProcessName, ProcessEntry>` with 5 manufacturing processes:

| Key | Process | Setup (USD) | Variable rate |
|---|---|---|---|
| `laser_cut` | Laser / plasma / waterjet cut | $15 | $0.005/mm perimeter |
| `cnc` | CNC milling | $50 | removeUsd=0 (deferred) |
| `print_3d` | 3-D printing (FDM/SLA/SLS) | $5 | $0.0002/mm³ volume |
| `sheet_metal_bend` | Press-brake bending | $20 | $2/bend_flange |
| `none` | No machine processing | $0 | — |

`lookupProcess(name?)` resolves a `ProcessName` or `undefined`, falling back to the "none" entry.

### `CadIr.process` field (Task 2)

`CadIr` gains an optional `process?: ProcessName` field. Accepted by the Zod schema as `z.enum([...5 process names]).optional()`. Defaults to "none" when absent (no machine cost).

### `compile/perimeter.ts` — `estimatePerimeter` (Task 3)

`estimatePerimeter(ir: CadIr): number` returns the total cut-path length in mm:
- **`extrude` (new_body / add)**: profile perimeter. Rect = 2(w+h); circle = 2πr; line = Euclidean distance.
- **`cut_extrude`**: adds interior cutout perimeter (same rules).
- All other feature kinds and suppressed features are skipped.

### `compile/machineCost.ts` — `compileMachineCost` (Task 4)

`compileMachineCost(ir: CadIr): MachineCostResult` estimates machine cost for all inline parts:
- External parts are skipped (purchased, not machine-processed).
- Parts with `process="none"` or no process return `null` from `machineCostForPart` and are excluded from `perPart`.
- Formula:
  - `laser_cut`: `setupUsd + perimeter_mm × cutUsdPerMm`
  - `cnc`: `setupUsd` (removeUsd=0 in Phase 13 v0)
  - `print_3d`: `setupUsd + volumeMm3 × buildUsdPerMm3`
  - `sheet_metal_bend`: `setupUsd + non-suppressed bend_flange count × bendUsdEach`

### `compileCost` updated (Task 5)

`CostResult` gains a new field:

| Field | Type | Description |
|---|---|---|
| `machine` | `MachineCostLine[]` | Per-part machine cost lines (excludes process="none" parts) |

`totalUsd` now includes `machineTotalUsd` in addition to BOM + fabrication costs. Parts without a declared process contribute $0 to machine cost — backward compatible.

### Prompts + README (Task 6)

`prompts.ts` updated with Phase 13 process catalog and machine cost documentation. README updated with Phase 13 scope.

Tests: **≥ 372 passing** (`pnpm test --run`).

---

## Phase 10+ deferrals

The following remain out of scope after Phase 10 and will be addressed in later phases:

| Feature | Notes |
|---|---|
| **Threaded / countersink / counterbore holes** | ✅ Shipped in Phase 3 |
| **Multi-part assembly joints + URDF** | ✅ Shipped in Phase 4 |
| **Revolve / shell / bend_flange codegen + validation** | ✅ Shipped in Phase 5 |
| **Sweep / loft / weld_tab codegen + MJCF compiler** | ✅ Shipped in Phase 6 |
| **PartRef union + BOM compiler** | ✅ Shipped in Phase 9 |
| **compileCost + BUILTIN_PRICING + budget rule** | ✅ Shipped in Phase 10 |
| **bend_flange real geometry** | Placeholder `pass` in Phase 5; full sheet-metal extension deferred |
| **K-factor / flat-pattern DXF export** | Requires sheet-metal extension; Phase 10+ |
| **AxisRef.kind === "edge" resolution** | Requires geometry (sandbox face/edge entities); deferred |
| **Sketch constraint solver** | Types + Tier 2 heuristic shipped in Phase 7; full DOF solver deferred |
| **Hardware feature library** | Threaded inserts, standoffs, PCB mounts — Phase 10+ |
| **Assembly interference / clearance checks** | ✅ AABB interference shipped in Phase 8; ✅ Joint range sweep check shipped in Phase 11; exact mesh overlap deferred |
| **GLB / STEP export via sandbox** | Sandbox currently produces STEP via `export_step()`; GLB transcode deferred |
| **Streaming codegen** | Single-pass string builder today; chunked/streamed output for large IRs deferred |
| **AI-driven repair loop (production)** | Mock repair loops tested; real Claude-powered production loop deferred |
| **Convex file storage for build artifacts** | Future phase will store STEP/GLB in Convex file storage |
| **Version diffing / merge** | Revision hashes exist; structural diff / 3-way merge deferred |
| **BOM export (CSV / PDF)** | `compileBom()` returns `BomLine[]`; CSV/PDF export is Phase 11+ |
| **Supplier API integration** | BUILTIN_PRICING is a static file; live pricing via supplier APIs deferred |
