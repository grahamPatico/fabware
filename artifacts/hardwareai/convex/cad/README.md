# `convex/cad` — CAD Intermediate Representation Module

Phase 1 implementation of the CAD IR pipeline for Fabware hardware-AI.

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
│   ├── schemaTier.ts     — Tier-1: structural / schema rules (duplicate ids, missing refs)
│   ├── geometryTier.ts   — Tier-2 / Tier-3: geometry sanity (positive dims, etc.)
│   └── manufacturingTier.ts — Tier-4: manufacturing rules (hole-edge-distance, …)
│
├── patch/
│   ├── types.ts          — Patch union type (set_parameter, add_feature, …)
│   ├── apply.ts          — applyPatch(): immutable patch application + schema validation
│   └── tools.ts          — Claude tool-call definitions for patch operations
│
├── codegen/
│   ├── compileToBuild123d.ts — Compiles ResolvedIr → build123d Python script
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
├── plugin.ts             — cadIrPlugin: validates CadIr via all four tiers
└── prompts.ts            — System prompt fragment for the CAD IR specialist agent
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

## Phase 2 scope (shipped)

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

## Phase 3+ deferrals

The following are explicitly out of scope for Phase 1–2 and will be addressed in later phases:

| Feature | Notes |
|---|---|
| **Threaded / countersink / counterbore holes** | Hole `type` is locked to `"simple"`; richer types need kernel support |
| **Sheet-metal IR** — bends, K-factor, flat-pattern | Separate IR subtree; out of scope for solid-body phases |
| **Multi-body / assembly joints** | `JointId` type exists; assembly features deferred |
| **Sketch constraint solver** | Sketch geometry is unconstrained free-form in Phase 1–2; a proper constraint solver is Phase 3+ |
| **Hardware feature library** | Threaded inserts, standoffs, PCB mounts — Phase 3+ |
| **Assembly graph** | Multi-part mating / interference checks — Phase 3+ |
| **GLB / STEP export via sandbox** | Sandbox currently produces STEP via `export_step()`; GLB transcode deferred |
| **Streaming codegen** | Single-pass string builder today; chunked/streamed output for large IRs deferred |
| **AI-driven repair loop (production)** | Phase 2 has a mock multitool repair loop; real Claude-powered production loop is Phase 3+ |
| **Convex file storage for build artifacts** | Future phase will store STEP/GLB in Convex file storage and link to `cadIrRevisions` |
| **Version diffing / merge** | Revision hashes exist; structural diff / 3-way merge deferred |
