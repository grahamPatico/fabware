# CAD IR Backbone — Design Spec

**Date:** 2026-04-29
**Status:** Draft for review
**Supersedes:** `PartDsl` (sheet-metal-only flat schema) as the AI harness's source of truth
**Builds on:** AI Harness Plans 1+2+3 (`feat/ai-harness-step-0-scaffold`)

## 1. Purpose

Replace the current flat `PartDsl` with a **constraint-based parametric CAD Intermediate Representation (IR)** that is the single source of truth for every part and assembly Fabware produces. The IR is what the AI agent reads and writes; everything else — geometry, code, simulation, manufacturing checks, cost, BOM — is a compiler that reads the IR.

The rebuild optimizes for, in order:

1. **Long-term model understanding** — stable named IDs, normalized schema, typed tool grammar.
2. **Speed of design** — patch-only edits, prompt-cache-friendly layout, kernel-side caching.
3. **Accuracy** — real OCCT geometry kernel, constraint solver, five validation tiers.
4. **Editability** — content-addressed revisions, targeted patches, branching/rollback.
5. **Simulation readiness** — assembly graph with explicit joints/DOFs/masses; URDF/MJCF compiler.
6. **Token usage** — agent never sees coordinates/code/geometry; output is bounded by patch size, not part complexity.

## 2. The single load-bearing architectural commitment

> **The agent's world is the intent layer. It cannot read coordinates, generated code, or geometry. It can only emit typed patches. Everything else is a compiler.**

Every property listed above falls out of holding that line. This is the line the existing `PartDsl` does not hold and cannot be made to hold without a redesign.

## 3. Three-layer architecture

```
┌─────────────────────────────────────────────────────────┐
│  AGENT (Claude Sonnet 4.6 + typed tools)                │
│   reads:  IR.intent slice  +  validation report         │
│   writes: typed patches  (no rewrites, ever)            │
└─────────────────────┬───────────────────────────────────┘
                      │ patches via tool calls
┌─────────────────────▼───────────────────────────────────┐
│  IR STORE (Convex)                                      │
│   parameters · sketches · features · constraints        │
│   joints · assembly graph · entity registry             │
│   content-addressed revisions                           │
└─────────────────────┬───────────────────────────────────┘
                      │ patch applied → new revision hash
┌─────────────────────▼───────────────────────────────────┐
│  CONSTRAINT SOLVER (pure TS library)                    │
│   expression eval · 2D sketch solver · assembly solver  │
│   output: ResolvedIR (concrete coordinates)             │
└─────────────────────┬───────────────────────────────────┘
                      │ ResolvedIR
        ┌─────────────┴──────────────┬───────────┬───────┐
        ▼                            ▼           ▼       ▼
   build123d                  URDF/MJCF        FEA      DRC
   executor                   generator        input    checker
   (Vercel Sandbox            (TS,             (later)  (TS)
    Python microVM)           PyBullet sim)
   STEP / STL / DXF /
   glTF preview /
   entity feedback
```

**Layer rules (enforced by code structure, not just convention):**
- The agent SDK only ever receives `IR.intent slice` + validation reports + (optional) preview image. No code, no coordinates.
- The constraint solver is a pure function `ResolvedIR = solve(IR)` — no Convex calls, no external state.
- Each compiler is read-only on `ResolvedIR`.
- The build123d executor is the only path that writes back into the IR, and only into `IR.entities` (face/edge/vertex IDs after execution).

## 4. CAD IR schema

```ts
interface CadIr {
  schemaVersion: 1;
  units: "mm" | "in";

  // Intent layer — agent's world
  parameters:  Record<ParamId, ParameterDef>;
  sketches:    Record<SketchId, SketchDef>;
  features:    Feature[];          // ordered timeline
  constraints: Constraint[];       // sketch + assembly mates

  // Assembly extension — optional for single parts
  parts?:        Record<PartId, PartRef>;     // ref to another CadIr
  joints?:       Joint[];
  connections?:  Connection[];                // bolt/weld/adhesive

  // Kernel-managed — agent reads as IDs+tags only
  entities?:     EntityRegistry;
}
```

### 4.1 Parameters

```ts
interface ParameterDef {
  id: ParamId;                              // snake_case agent-chosen
  value: number | ExpressionString;         // "length / 2 - edge_distance"
  unit?: "mm" | "in" | "deg" | "rad";
  description?: string;                     // for the agent's own reasoning
  bounds?: { min?: number; max?: number };
}
```

Solver evaluates expressions with cycle detection, unit propagation, and bounds enforcement. References between parameters form a DAG.

### 4.2 Sketches

```ts
interface SketchDef {
  id: SketchId;
  plane: PlaneRef;                          // "XY" | "XZ" | "YZ" | { face: FaceId }
  geometry: SketchEntity[];                 // line/arc/circle/rect/polygon/spline
  constraints: SketchConstraint[];          // coincident/distance/parallel/tangent/etc.
}
```

Coordinates inside a sketch are `ParamRef = ParamId | number | ExpressionString`. The 2D sketch solver resolves these subject to the sketch's constraints.

### 4.3 Features (timeline)

Each feature has a stable `FeatureId`, a typed kind, and references to sketches/faces/edges/bodies. Order matters.

```ts
type Feature =
  | ExtrudeFeature | CutExtrudeFeature
  | RevolveFeature | LoftFeature | SweepFeature
  | ShellFeature
  | FilletFeature | ChamferFeature
  | HoleFeature                              // simple/countersink/counterbore/threaded
  | PatternFeature | MirrorFeature
  | BooleanFeature
  | HardwareFeature;                          // bolt-hole/threaded-insert/weld-tab/
                                              // bend-flange/standoff/gasket-groove/keepout

interface BaseFeature {
  id: FeatureId;
  suppressed?: boolean;
  description?: string;
}
```

Feature inputs are **symbolic**: `profile: SketchId`, `face: FaceRef = { feature: FeatureId, tag: string }`, `edges: EdgeRef[]`. The agent says "fillet the top edges of `extrude_base` with radius `corner_radius`." It never says "fillet edges at world coords (...)."

### 4.4 Constraints, joints, connections

- **Sketch constraints** — coincident, distance, parallel, perpendicular, tangent, equal, horizontal, vertical.
- **Assembly constraints** — mate, concentric, planar, distance-between-faces. Two-part references plus optional offset/flipped.
- **Joints** — fixed, revolute (axis + angle limits), linear (axis + travel limits), ball (center vertex), rigid_group (multi-part lock). Joint limits make motion sim possible.
- **Connections** — bolt (M-spec, through_parts, hole_clearance), weld (contact area, type), adhesive (footprint).

### 4.5 Entity registry — kernel feedback

```ts
interface EntityRegistry {
  faces:    Record<FaceId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  edges:    Record<EdgeId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  vertices: Record<VertexId, { feature: FeatureId; tag: string }>;
}
```

After execution, the build123d script reports: "feature `extrude_base` produced faces tagged `top`, `bottom`, `north`, `south`, `east`, `west` with topology hash X." These get stable IDs the agent can reference. The agent never sees the topology hash.

### 4.6 ID conventions

- `ParamId`, `SketchId`, `FeatureId`, `PartId`, `JointId` — snake_case, agent-chosen, validated against `^[a-z][a-z0-9_]{0,31}$`.
- `FaceId`, `EdgeId`, `VertexId` — kernel-assigned, deterministic from `(featureId, tag, topologyHash)`. Stable across re-executions of the same resolved IR.

## 5. Patch system

### 5.1 The grammar — patch-tool families

Each row below represents one or more separate Anthropic tools (each with its own tight `input_schema`). The agent never emits IR JSON; it always calls one of these tools.

| Family | Purpose | Tool names |
|---|---|---|
| Parameters | Add/change one parameter (value or expression) | `set_parameter` |
| Sketches | Define a new sketch (plane + entities + sketch constraints) | `add_sketch` |
| Sketch edits | Targeted edit inside a sketch (add/remove/modify entity, add constraint) | `modify_sketch` |
| Features | Append a typed feature to the timeline | `add_feature` |
| Feature edits | Targeted edit on existing feature inputs | `modify_feature` |
| Suppression | Toggle feature without deleting | `suppress`, `unsuppress` |
| Reordering | Move feature in timeline | `reorder_feature` |
| Assembly | Assembly-tier additions | `add_constraint`, `add_joint`, `add_connection` |
| Removal | Generic remove by id (any entity type) | `remove` |

Total distinct tool names land in the low double digits in Phase 1. There is **no `replace_ir` tool**. The architecture refuses to compile against that pattern.

### 5.2 Patch applier

```ts
applyPatch(parentRevision: RevisionHash, patch: Patch): {
  newRevision: RevisionHash;
  ir: CadIr;
  schemaViolations: Violation[];
}
```

Pure TS. Convex mutation `submitPatch({revisionHash, patch})` wraps it: validates, applies, hashes, persists revision, schedules execution, ticks orchestrator. Atomic.

### 5.3 What the agent sees per turn

```
[immutable head — cached forever]
  schema version · tool definitions · rule reference · fastener tables

[stable body — cached until parameters change shape]
  parameters table · sketches summary · features timeline (id+kind+summary)
  entity registry summary (face/edge tags by feature)

[mutable tail — uncached]
  latest patch applied · validation report · optional preview image
  "next: emit one patch tool call"
```

Cache hit ratio per repair turn approaches 100% for the head, ~95% for the body. Token cost per turn is roughly constant in IR size.

### 5.4 What the agent never sees

- Generated build123d code
- Resolved coordinates
- Topology hashes
- Other parts' internal IR (in assembly mode, agent sees a part's *interface* — named faces/edges + bounding box — not its features)

## 6. Five validation tiers

Run in order; later tiers only run if earlier tiers pass.

### Tier 1 — Schema (synchronous, in `applyPatch`)
Reference resolution, ID uniqueness, expression-DAG cycle detection, unit compatibility, timeline ordering, suppression integrity. Failures **reject the patch** (the only tier that does).

### Tier 2 — Constraint solve (synchronous)
2D sketch solver (under/over-constrained), expression evaluator (div-by-zero, NaN, negatives), assembly solver (floating parts, conflicting mates).

### Tier 3 — Geometry (async, post-execution)
Per-feature build status, manifold/self-intersection checks, boolean op success, entity-tag query resolution (zero or multiple matches = violation).

### Tier 4 — Manufacturing (synchronous on ResolvedIR)
Existing `Rule<TDsl>` system reframed as `Rule<CadIr>`. Min wall thickness, hole edge distance, bend radius, tool access, bolt clearance, sensor/camera keepout overlap.

### Tier 5 — Assembly (synchronous on resolved assembly)
Part interference, bolt-hole alignment, joint-range self-collision (sample joint range, geometry-test each pose), weld contact area, all parts grounded, no over-constrained joints.

### Repair loop integration

Existing `runAgentRepairLoop` works unchanged. Tier-aware violations flow through it. Schema-tier rejections short-circuit (patch not applied; agent sees the error and tries again). Geometry-tier violations require re-execution after the patch — caching makes this cheap when resolved IR is unchanged.

## 7. Executor — build123d in Vercel Sandbox

### 7.1 Backend choice

- **build123d over CadQuery** — same OCCT kernel, cleaner typed Python (Part / Sketch / Edge / Face are distinct classes), shorter emitted code, better LLM-codegen target.
- **Vercel Sandbox over Modal/Lambda** — ephemeral Firecracker microVMs are exactly the right shape for "run AI-emitted Python in isolation, return artifacts, throw VM away." Stays on Vercel infra.

### 7.2 Execution flow

```
Convex action enqueues execution { revisionHash }
  ↓
1. Resolve IR (params evaluated, sketches solved, mates solved)
2. Code generator emits deterministic build123d script
   (TS function compileToBuild123d(resolvedIr): string)
3. Boot Vercel Sandbox, run script (<30s soft cap)
   → /out/preview.glb · part.step · part.stl · part.dxf
   → /out/entities.json · exec.log
4. Sandbox returns artifacts → Convex storage → signed URLs
5. Update IR.entities + execution-result row
6. Geometry-tier violations feed the repair loop
```

### 7.3 Code generator

Pure TS, one emit function per feature kind. Heavy golden-snapshot test coverage. Generated script includes sentinel comments mapping line ranges to `FeatureId`s so runtime errors map back. Example output sketch in §10.

### 7.4 Caching

Every `ResolvedIR` has a content hash. Executions cache by hash. Patches that don't change resolved geometry (e.g., editing `description`) return previous artifacts instantly. This is what keeps the repair loop cheap.

## 8. Revision storage

### 8.1 Schema

```ts
interface Revision {
  hash: string;                   // sha256 of canonicalized IR JSON
  parent: string | null;
  patch: Patch | null;            // patch that produced this from parent
  ir: CadIr;                      // full IR (redundant; pays off in read speed)
  author: "user" | "agent" | "system";
  agentTurn?: { sessionId: string; turn: number; toolName: string };
  createdAt: number;
  executionStatus: "pending" | "running" | "succeeded" | "failed" | "cached";
  artifacts?: { stepUrl, stlUrl, dxfUrl, glbUrl, entitiesUrl, logUrl };
  violations: Violation[];
}
```

### 8.2 Convex tables

- `cad_revisions` — indexed `by_part`, `by_part_hash`, `by_part_createdAt`
- `cad_revision_artifacts` — file storage refs, by revision hash
- `parts.headRevision` — current head pointer

### 8.3 Operations

- **Diff(a, b)** — structural diff of two IRs → patch sequence
- **Branch** — multiple head pointers per part (`head`, `experimental`)
- **Rollback** — pointer move; old revisions retained
- **Squash** — collapse a sequence of agent patches into one
- **Blame** — every line of resolved geometry traces to feature → patch → agent turn

## 9. Multi-target compilers

Same `ResolvedIR`, multiple compilers, added incrementally.

### 9.1 build123d (Phase 1)
Owns STEP/STL/DXF/glTF. Already covered above.

### 9.2 URDF / MJCF (Phase 4)
Reads assembly graph + per-part inertial properties (computed via build123d's `Part.center_of_mass` and `matrix_of_inertia`). Outputs URDF (XML) for ROS/PyBullet/Gazebo and MJCF (XML) for MuJoCo. Joint definitions in IR map directly: revolute → URDF revolute, linear → prismatic, ball → spherical. Unlocks **motion simulation** (PyBullet/MuJoCo) without a separate model.

### 9.3 FEA input (Phase 5+)
Reads ResolvedIR + materials + loads/constraints (new `analyses?` block). Outputs CalculiX `.inp` or Code_Aster command files. Mesh from STEP via `gmsh` in Sandbox.

### 9.4 DRC (manufacturing rules)
Tier 4. Listed here because it's a read-only compiler on ResolvedIR producing `Violation[]`.

### 9.5 Cost estimator
ResolvedIR + material database + process database → `CostBreakdown`: material cost (volume × density × $/kg), machine time, fasteners (BOM lookup), finish.

### 9.6 BOM
Assembly graph + connections + part references → flat parts list (custom-cut with STEP/DXF, fasteners with McMaster numbers, off-the-shelf components).

## 10. Worked example — parametric mounting bracket

**Agent receives prompt:**
> "Create a parametric mounting bracket, 120×40×3mm aluminum, two M6 holes 90mm apart, 4mm corner radius."

**Agent emits patches (in order):**

```
set_parameter { id: "length",         value: 120, unit: "mm" }
set_parameter { id: "width",          value:  40, unit: "mm" }
set_parameter { id: "thickness",      value:   3, unit: "mm" }
set_parameter { id: "hole_diameter",  value:   6.5, unit: "mm" }   // M6 clearance
set_parameter { id: "hole_spacing",   value:  90, unit: "mm" }
set_parameter { id: "corner_radius",  value:   4, unit: "mm" }

add_sketch {
  id: "base_profile",
  plane: "XY",
  geometry: [{ kind: "rect", id: "outer",
               center: { x: 0, y: 0 },
               width: "length", height: "width",
               cornerRadius: "corner_radius" }],
  constraints: []
}

add_feature {
  feature: { kind: "extrude", id: "extrude_base",
             profile: "base_profile",
             distance: "thickness",
             operation: "new_body" }
}

add_feature {
  feature: { kind: "hole", id: "mounting_holes",
             face: { feature: "extrude_base", tag: "top" },
             positions: [
               { x: "-hole_spacing / 2", y: 0 },
               { x:  "hole_spacing / 2", y: 0 }
             ],
             diameter: "hole_diameter",
             type: "simple" }
}
```

**Solver resolves → emits build123d:**

```python
# generated — do not edit
from build123d import *

# parameters
length = 120.0
width = 40.0
thickness = 3.0
hole_diameter = 6.5
hole_spacing = 90.0
corner_radius = 4.0

# feature: extrude_base
with BuildPart() as extrude_base:
    with BuildSketch():
        RectangleRounded(length, width, corner_radius)
    extrude(amount=thickness)
report_entities("extrude_base", extrude_base)

# feature: mounting_holes
with extrude_base:
    with Locations((-hole_spacing/2, 0), (hole_spacing/2, 0)):
        Hole(radius=hole_diameter/2, depth=thickness * 1.5)
report_entities("mounting_holes", extrude_base)

export_step(extrude_base.part, "/out/part.step")
export_stl(extrude_base.part, "/out/part.stl")
export_glb(extrude_base.part, "/out/preview.glb")
write_entities_json("/out/entities.json")
```

**Manufacturing tier surfaces:** "hole edge distance is 7.75mm; minimum is 9.75mm (1.5× hole_diameter)." Agent emits one patch:

```
set_parameter { id: "hole_spacing", value: 84 }
```

Resolved IR re-hashed, executor re-runs, geometry passes, manufacturing passes, design clean.

## 11. Migration plan

### Phase 0 (one PR before Plan 1)
- Land `feat/ai-harness-step-0-scaffold` (Plans 1+2+3) to `main`. The plugin scaffold + sheet-metal validator + agent repair loop are reusable infra.
- Fix or quarantine main's 7 failing tests in `archetypes/` and `assemblyRules`.

### Phase 1 (Plan 1 of the rebuild)
- CAD IR schema, expression evaluator, schema-tier validator
- `compileToBuild123d` for: extrude, cut_extrude, fillet, chamfer, hole (simple), pattern
- Vercel Sandbox executor + entity feedback round-trip
- Wire repair loop to schema- and geometry-tier violations
- Single tool: `add_feature` (build from scratch)
- **Net result:** parametric bracket end-to-end, STEP comes out, sheet-metal plugin still works for everything else

### Phase 2 (Plan 2)
- Patch tools: `set_parameter`, `modify_feature`, `suppress`, `reorder_feature`
- Tier 2 constraint solver (sketch only)
- Port `lib/scsRules.ts` rules to `Rule<CadIr>`

### Phase 3 (Plan 3)
- Sketch-first features (real sketches with sketch constraints)
- Hardware features (countersink/counterbore, threaded holes, bend-flange)
- Hole-pattern with referenced face

### Phase 4 (Plan 4)
- Assembly graph: parts/connections/joints
- Tier 5 assembly validation
- URDF/MJCF compiler
- PyBullet motion sim in Sandbox

### Phase 5+
- FEA input compiler
- More feature types (loft, sweep, shell, revolve)
- Multi-revision branching UI
- Sketch reuse / part library
- Cost + BOM compilers

### What happens to existing code

| Existing | Fate |
|---|---|
| `PartDsl` / `lib/dsl.ts` (both copies) | Deprecated, retained until UI migration. New parts use `CadIr`. |
| `lib/scsRules.ts` | Ported rule-by-rule into `Rule<CadIr>`. Old file removed once empty. |
| `assemblyDesigner.ts` (legacy archetype loop) | Deprecated; removed in Plan 9. |
| `archetypes/` | Repurposed as a **template library** that emits CAD IR seeds. |
| `ProcessPlugin<TDsl>` contract | Stays. New CAD-IR-based plugin replaces sheet-metal plugin in Phase N. |
| `runAgentRepairLoop` | Stays unchanged; tier-aware violations work transparently. |
| Convex tables (violations, escalations, planEvents, parts) | Stay. New tables added (cad_revisions, cad_revision_artifacts). |
| Frontend (`AssembledView`, `Workspace`) | Re-rendered against `glb` preview from new executor. Three.js viewer reused. |

### Branch strategy
- New branch `feat/cad-ir-rebuild` off main after Phase 0
- Each phase is a stack of commits, merged at phase boundary
- Behind a `useCadIr` project flag (mirrors `useNewHarness`); per-project rollout

## 12. Testing strategy

### Unit (vitest)
- Schema validators (one test per rule × valid/invalid)
- Expression evaluator (cycles, units, edge cases)
- Constraint solver (sketch DOF, over/under-constrained)
- Patch applier (each patch type × success + failure)
- Code generator (golden-snapshot per feature kind)
- Manufacturing rules (one test per rule × pass + fail)

### Integration (vitest, no external services)
- Patch → IR → resolve → emit → (mock executor) → entity feedback round-trip
- Repair loop with fake agent runner producing typed patches
- Revision DAG: branch, rollback, squash, diff
- Multi-tier validation surfaces correctly

### End-to-end (vitest + real Vercel Sandbox, gated by env)
- Generate bracket from known IR → real build123d → assert STEP non-empty, glTF parses, entities.json matches
- Repair loop against real Anthropic call (cassette-recorded) on broken IR → converges in ≤ 3 turns

### Visual regression (later)
- Render glTF preview for fixed corpus of test parts → screenshot diff. Catches code-generator regressions that pass schema/geometry but produce visually wrong geometry.

### CI matrix
- TS typecheck (baseline 38 maintained)
- Vitest unit + integration (target: 100% pass, no quarantines)
- Sandbox e2e nightly, separate workflow, non-blocking
- TS strict-mode budget for new modules (no implicit any in `cad/**`)

## 13. Risks and open questions

### Risks
1. **Sandbox cold start.** First execution per session may take 5–10s. Mitigations: warm pool, cache resolved IR hash → artifact. Acceptable for initial designs; matters more for repair loops (where caching dominates anyway).
2. **build123d coverage gaps.** Some niche features (bend-flange with K-factor, complex sweeps) may need custom OCCT calls bypassing build123d's high-level API. Plan: emit a small set of `bd.helpers` Python utilities, version-pinned alongside the executor.
3. **Constraint solver maturation.** Open-source 2D sketch solvers (planegcs, py-slvs) are mature; assembly constraint solvers are less so. Phase 2 ships sketch-only; assembly solver is a Phase 4 risk.
4. **Schema migration as the IR evolves.** `schemaVersion` is the lever; each version bump ships a migrator (`migrateIr(old, fromV, toV)`). Test corpus carried forward.
5. **Tool-schema explosion.** 9 patch tools is fine; if features × patch tools grows multiplicatively, tool-call accuracy degrades. Mitigation: keep `add_feature` and `modify_feature` parametric over feature kind via a `kind` discriminator + per-kind sub-schemas.

### Open questions (tracked, not blocking)
- **Sketch solver selection:** planegcs (Python, mature) vs. JS-native solver (no kernel boundary crossing). TBD in Phase 2.
- **Sandbox vs. dedicated Python service:** if Sandbox cold-start proves untenable, fallback is a Modal worker. Decision in Phase 1.
- **Multi-tenant artifact storage:** Convex storage handles per-deployment volumes; if scale demands, move artifacts to R2/S3 with signed URLs. Defer until needed.
- **Materials database:** small curated table to start; integrate with McMaster / SendCutSend material catalogs in Phase 5.

## 14. Success criteria

### Phase 1 ships when:
- A project with `useCadIr=true` can produce a parametric bracket end-to-end.
- The agent emits ≥ 5 patches (params + sketch + extrude + holes) and a STEP file is downloadable.
- Geometry-tier violations correctly identify a deliberately-broken IR and the repair loop converges in ≤ 3 turns.
- All 100 existing tests still pass; new modules add ≥ 30 tests; TS error baseline holds at 38.

### The architecture is validated when:
- Per-turn agent token cost stops scaling with part complexity (measured: tokens-per-turn flat across a 5-feature, 15-feature, 30-feature part).
- Repair-loop convergence rate (measured: % of broken IRs fixed within budget) is ≥ 80% on a corpus of 50 deliberately-broken IRs.
- A second compiler (URDF, Phase 4) ships without changing the IR schema.

## 15. Out of scope (explicitly)

- Replacing the AI agent itself (Sonnet 4.6 stays).
- A custom geometry kernel (OCCT via build123d only).
- Browser-side CAD execution (Sandbox-only for v1).
- User-authored Python in build123d scripts (only the code generator emits).
- Real-time collaborative editing (single-user-per-revision is fine for v1).
- Materials simulation beyond linear-elastic FEA (no plasticity, fluids, thermal coupling).
