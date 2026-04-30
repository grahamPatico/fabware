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
├── validate/
│   ├── schemaTier.ts     — Tier-1: structural / schema rules (duplicate ids, missing refs, joint refs)
│   ├── geometryTier.ts   — Tier-2 / Tier-3: geometry sanity (positive dims, etc.)
│   ├── assemblyTier.ts   — Tier-5: assembly topology rules (floating parts, over-constrained groups)
│   └── manufacturingTier.ts — Tier-4: manufacturing rules (hole-edge-distance, …)
│
├── patch/
│   ├── types.ts          — Patch union type (set_parameter, add_feature, …)
│   ├── apply.ts          — applyPatch(): immutable patch application + schema validation
│   └── tools.ts          — Claude tool-call definitions for patch operations
│
├── codegen/
│   ├── compileToBuild123d.ts — Compiles ResolvedIr → build123d Python script
│   ├── compileToUrdf.ts      — Compiles CadIr assembly → URDF XML string
│   ├── emitParameters.ts     — Parameter variable declarations
│   ├── emitFeature.ts        — Dispatches to per-kind emitters
│   └── features/
│       ├── emitExtrude.ts
│       ├── emitCutExtrude.ts
│       ├── emitFillet.ts
│       ├── emitChamfer.ts
│       ├── emitHole.ts
│       └── emitPattern.ts
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

## Phase 5+ deferrals

The following remain out of scope after Phase 4 and will be addressed in later phases:

| Feature | Notes |
|---|---|
| **Threaded / countersink / counterbore holes** | ✅ Shipped in Phase 3 |
| **Multi-part assembly joints + URDF** | ✅ Shipped in Phase 4 |
| **Sheet-metal IR** — bends, K-factor, flat-pattern | Separate IR subtree; out of scope for solid-body phases |
| **AxisRef.kind === "edge" resolution** | Requires geometry (sandbox face/edge entities); deferred |
| **Sketch constraint solver** | Sketch geometry is unconstrained free-form; a proper constraint solver is Phase 5+ |
| **Hardware feature library** | Threaded inserts, standoffs, PCB mounts — Phase 5+ |
| **Assembly interference / clearance checks** | Multi-part bounding-box / mesh overlap detection — Phase 5+ |
| **GLB / STEP export via sandbox** | Sandbox currently produces STEP via `export_step()`; GLB transcode deferred |
| **Streaming codegen** | Single-pass string builder today; chunked/streamed output for large IRs deferred |
| **AI-driven repair loop (production)** | Mock repair loops tested; real Claude-powered production loop is Phase 5+ |
| **Convex file storage for build artifacts** | Future phase will store STEP/GLB in Convex file storage |
| **Version diffing / merge** | Revision hashes exist; structural diff / 3-way merge deferred |
