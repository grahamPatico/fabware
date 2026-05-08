# CAD IR Phase 7 — Sketch constraint grammar (Tier 2 v0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Add declarative sketch constraints (coincident / distance / parallel / perpendicular / tangent / equal / horizontal / vertical / angle) to the CAD IR. The agent gains the ability to *describe relationships* between sketch entities instead of placing raw coordinates. Tier 2 validation gets a v0 implementation: constraint references are checked, and an approximate degrees-of-freedom analyzer flags severely under/over-constrained sketches as warnings.

**Why declarative constraints matter:** Until now, sketch entities use raw coordinates (`center: { x: 5, y: 0 }`). The agent has been doing coordinate math (e.g., "to center two holes at distance D apart, place them at -D/2 and +D/2"). Constraints let the agent say "these two circles are coincident" or "this line is horizontal" or "the distance between these two points is `hole_spacing`" — and let the (future) solver do the math. This is the architectural piece spec §4.2 promised but Phase 1 deferred.

**Scope:** Constraint *grammar* only. **A real geometric solver is deferred to a future phase** (planegcs or solvespace integration). Phase 7 stores constraints, validates references, and performs an approximate DOF count for over/under-constrained detection. Existing raw-coordinate sketches keep working — constraints are an additive grammar.

**Builds on:** Phase 6 tip `e547314`. Worktree at `~/fabware-cad-ir-phase-7/` on branch `feat/cad-ir-phase-7`.

---

## Prerequisites

- Phase 6 complete (258/258 tests).
- Worktree at `~/fabware-cad-ir-phase-7/` off Phase 6 tip.

---

## File Structure

```
convex/cad/ir/
├── types.ts          # MODIFY — SketchConstraint union, SketchDef.constraints
└── schema.ts         # MODIFY — Zod for SketchConstraint, add to SketchDef

convex/cad/validate/
├── schemaTier.ts     # MODIFY — constraint refs resolve to entities in same sketch
├── constraintTier.ts # NEW — Tier 2: approximate DOF analyzer
└── __tests__/{schemaTier,constraintTier}.test.ts

convex/cad/patch/
├── types.ts          # MODIFY — extend ModifySketchOp with add_constraint variant
├── apply.ts          # MODIFY — handle add_constraint op
├── tools.ts          # MODIFY — modify_sketch schema accepts add_constraint
└── __tests__/apply.test.ts  # MODIFY

convex/specialists/cadIr.ts  # MODIFY — toolCallToPatch handles add_constraint sub-op (already routes via modify_sketch wrapper)

convex/cad/plugin.ts       # MODIFY — validate composes constraintTier
convex/cad/prompts.ts      # MODIFY
convex/cad/README.md       # MODIFY
```

---

## Task 1: SketchConstraint types

**Files:** `convex/cad/ir/types.ts`

- [ ] **Step 1**: Add a SketchEntityRef helper and the SketchConstraint union:

```ts
// ─── Sketch constraints (Phase 7) ────────────────────────────────────────

/** Reference to an entity within the current sketch (entity id). */
export type SketchEntityRef = string;

/** Reference to a specific point on a sketch entity — e.g. the start/end of a line,
    or the center of a circle. */
export type SketchPointRef =
  | { entity: SketchEntityRef; point: "start" | "end" | "center" };

export type SketchConstraint =
  | { kind: "coincident"; id: string; a: SketchPointRef; b: SketchPointRef }
  | { kind: "distance"; id: string; a: SketchPointRef; b: SketchPointRef; value: ParamRef }
  | { kind: "parallel"; id: string; a: SketchEntityRef; b: SketchEntityRef }
  | { kind: "perpendicular"; id: string; a: SketchEntityRef; b: SketchEntityRef }
  | { kind: "tangent"; id: string; a: SketchEntityRef; b: SketchEntityRef }
  | { kind: "equal"; id: string; a: SketchEntityRef; b: SketchEntityRef }   // equal length / equal radius
  | { kind: "horizontal"; id: string; entity: SketchEntityRef }
  | { kind: "vertical"; id: string; entity: SketchEntityRef }
  | { kind: "angle"; id: string; a: SketchEntityRef; b: SketchEntityRef; value: ParamRef };  // degrees
```

- [ ] **Step 2**: Add `constraints?: SketchConstraint[]` to `SketchDef`:

```ts
export interface SketchDef {
  id: SketchId;
  plane: PlaneRef;
  geometry: SketchEntity[];
  constraints?: SketchConstraint[];
}
```

- [ ] **Step 3**: Verify TS:
```bash
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "convex/cad/ir/types" | head
```

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/types.ts
git commit -m "feat(cad-ir): SketchConstraint types (coincident/distance/parallel/etc.)"
```

---

## Task 2: Zod schemas for SketchConstraint

**Files:** `convex/cad/ir/schema.ts`, `__tests__/schema.test.ts`

- [ ] **Step 1**: Failing tests:

```ts
describe("SketchConstraint schemas", () => {
  it("accepts a coincident constraint", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {},
      sketches: {
        s: {
          id: "s", plane: "XY" as const,
          geometry: [
            { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 },
            { kind: "circle", id: "c2", center: { x: 10, y: 0 }, radius: 5 },
          ],
          constraints: [{
            kind: "coincident", id: "k1",
            a: { entity: "c1", point: "center" },
            b: { entity: "c2", point: "center" },
          }],
        },
      },
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a distance constraint with a parameterized value", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const,
      parameters: { spacing: { id: "spacing", value: 90 } },
      sketches: {
        s: {
          id: "s", plane: "XY" as const,
          geometry: [
            { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 },
            { kind: "circle", id: "c2", center: { x: 10, y: 0 }, radius: 5 },
          ],
          constraints: [{
            kind: "distance", id: "d1",
            a: { entity: "c1", point: "center" },
            b: { entity: "c2", point: "center" },
            value: "spacing",
          }],
        },
      },
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a horizontal constraint on a single line entity", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {},
      sketches: {
        s: {
          id: "s", plane: "XY" as const,
          geometry: [{ kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } }],
          constraints: [{ kind: "horizontal", id: "h1", entity: "l1" }],
        },
      },
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects an unknown constraint kind", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {},
      sketches: {
        s: {
          id: "s", plane: "XY" as const,
          geometry: [{ kind: "circle", id: "c", center: { x: 0, y: 0 }, radius: 5 }],
          constraints: [{ kind: "diagonal", id: "x", entity: "c" }],
        },
      },
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
```

- [ ] **Step 2**: Implement in `schema.ts`:

```ts
const SketchPointRef = z.object({
  entity: Snake,
  point: z.enum(["start", "end", "center"]),
});

const SketchConstraint = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("coincident"), id: Snake, a: SketchPointRef, b: SketchPointRef }),
  z.object({ kind: z.literal("distance"), id: Snake, a: SketchPointRef, b: SketchPointRef, value: ParamRef }),
  z.object({ kind: z.literal("parallel"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("perpendicular"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("tangent"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("equal"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("horizontal"), id: Snake, entity: Snake }),
  z.object({ kind: z.literal("vertical"), id: Snake, entity: Snake }),
  z.object({ kind: z.literal("angle"), id: Snake, a: Snake, b: Snake, value: ParamRef }),
]);
```

Update `SketchDef` schema:
```ts
const SketchDef = z.object({
  id: Snake,
  plane: PlaneRef,
  geometry: z.array(SketchEntity),
  constraints: z.array(SketchConstraint).optional(),
});
```

- [ ] **Step 3**: Run vitest. Expect 4/4 new + existing schema tests pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/schema.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): Zod schemas for sketch constraints"
```

---

## Task 3: Schema-tier — constraint refs resolve to entities in the same sketch

**Files:** `convex/cad/validate/schemaTier.ts`, `__tests__/schemaTier.test.ts`

- [ ] **Step 1**: Failing tests:

```ts
it("detects a sketch constraint referencing a missing entity", () => {
  const v = validateSchemaTier(ir({
    sketches: {
      s: {
        id: "s", plane: "XY",
        geometry: [{ kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 }],
        constraints: [{ kind: "horizontal", id: "h1", entity: "missing_line" }],
      },
    },
  }));
  expect(v.some(x => x.ruleId === "schema.unresolved-sketch-entity-ref")).toBe(true);
});

it("detects duplicate constraint ids within a sketch", () => {
  const v = validateSchemaTier(ir({
    sketches: {
      s: {
        id: "s", plane: "XY",
        geometry: [
          { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 },
          { kind: "circle", id: "c2", center: { x: 10, y: 0 }, radius: 5 },
        ],
        constraints: [
          { kind: "equal", id: "dup", a: "c1", b: "c2" },
          { kind: "equal", id: "dup", a: "c2", b: "c1" },
        ],
      },
    },
  }));
  expect(v.some(x => x.ruleId === "schema.duplicate-constraint-id")).toBe(true);
});
```

- [ ] **Step 2**: Extend `validateSchemaTier`:

```ts
// inside validateSchemaTier, after sketch checks:
for (const sketch of Object.values(ir.sketches)) {
  if (!sketch.constraints) continue;
  const entityIds = new Set(sketch.geometry.map(g => g.id));
  const seenConstraintIds = new Set<string>();

  for (const c of sketch.constraints) {
    if (seenConstraintIds.has(c.id)) {
      out.push(v(
        "schema.duplicate-constraint-id",
        `Sketch "${sketch.id}" has duplicate constraint id "${c.id}"`,
        `Rename one of the constraints with id "${c.id}".`,
        { kind: "feature", id: c.id },
      ));
    }
    seenConstraintIds.add(c.id);

    const refsToCheck: string[] = [];
    switch (c.kind) {
      case "coincident":
      case "distance":
        refsToCheck.push(c.a.entity, c.b.entity);
        break;
      case "parallel":
      case "perpendicular":
      case "tangent":
      case "equal":
      case "angle":
        refsToCheck.push(c.a, c.b);
        break;
      case "horizontal":
      case "vertical":
        refsToCheck.push(c.entity);
        break;
    }
    for (const ref of refsToCheck) {
      if (!entityIds.has(ref)) {
        out.push(v(
          "schema.unresolved-sketch-entity-ref",
          `Constraint "${c.id}" in sketch "${sketch.id}" references missing entity "${ref}"`,
          `Either add an entity with id "${ref}" to the sketch or change the reference.`,
          { kind: "feature", id: c.id },
        ));
      }
    }
  }
}
```

- [ ] **Step 3**: Run vitest, expect new tests pass + existing schemaTier tests still pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/schemaTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts
git commit -m "feat(cad-ir): schema-tier checks sketch constraint refs + dup ids"
```

---

## Task 4: Tier 2 v0 — approximate DOF analyzer

**Files:** `convex/cad/validate/constraintTier.ts`, `__tests__/constraintTier.test.ts`

The DOF formula for a 2D sketch:
- Each entity contributes degrees of freedom: line=4 (two endpoints), circle=3 (center + radius), rect=4 (treated as a parametric primitive), arc=5
- Each constraint reduces DOF by some amount (coincident=2, distance=1, parallel=1, perpendicular=1, tangent=1, equal=1, horizontal=1, vertical=1, angle=1)
- A free 2D sketch needs DOF=3 fixed (origin + rotation) to become rigid; the rule of thumb for hand-checking is DOF≈3

This is approximate — a real solver computes actual DOF on the geometric algebra. For Phase 7 v0, just count and warn on extremes.

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { validateConstraintTier } from "../constraintTier";
import type { CadIr } from "../../ir/types";
import { emptyIr } from "../../ir/empty";

describe("validateConstraintTier (Tier 2 v0 — DOF approximation)", () => {
  it("returns no violations for a sketch with no constraints (under-constrained but not flagged)", () => {
    // Phase 7 v0: silent on under-constrained; only flags severely over-constrained
    const ir: CadIr = {
      ...emptyIr("mm"),
      sketches: {
        s: {
          id: "s", plane: "XY",
          geometry: [{ kind: "circle", id: "c", center: { x: 0, y: 0 }, radius: 5 }],
        },
      },
    };
    expect(validateConstraintTier(ir)).toEqual([]);
  });

  it("flags a sketch with vastly more constraints than entities (likely contradictory)", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      sketches: {
        s: {
          id: "s", plane: "XY",
          geometry: [{ kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }],
          constraints: [
            { kind: "horizontal", id: "h1", entity: "l1" },
            { kind: "vertical", id: "v1", entity: "l1" },  // contradictory with horizontal
            { kind: "equal", id: "e1", a: "l1", b: "l1" }, // self-equal is silly
          ],
        },
      },
    };
    const v = validateConstraintTier(ir);
    expect(v.some(x => x.ruleId === "constraint.over-constrained-sketch")).toBe(true);
  });

  it("flags an obviously contradictory pair (horizontal + vertical on same entity)", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      sketches: {
        s: {
          id: "s", plane: "XY",
          geometry: [{ kind: "line", id: "l1", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }],
          constraints: [
            { kind: "horizontal", id: "h", entity: "l1" },
            { kind: "vertical", id: "v", entity: "l1" },
          ],
        },
      },
    };
    const v = validateConstraintTier(ir);
    expect(v.some(x => x.ruleId === "constraint.contradictory-pair")).toBe(true);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/validate/constraintTier.ts
import type { CadIr, SketchConstraint, SketchEntity } from "../ir/types";
import type { Violation } from "../../plugins/types";

function entityDof(e: SketchEntity): number {
  switch (e.kind) {
    case "rect": return 4;       // center.xy + width + height
    case "circle": return 3;     // center.xy + radius
    case "line": return 4;       // two endpoints
    default: return 0;
  }
}

function constraintDof(c: SketchConstraint): number {
  switch (c.kind) {
    case "coincident": return 2;
    case "distance": return 1;
    case "parallel":
    case "perpendicular":
    case "tangent":
    case "equal":
    case "horizontal":
    case "vertical":
    case "angle": return 1;
    default: return 0;
  }
}

export function validateConstraintTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];
  for (const sketch of Object.values(ir.sketches)) {
    if (!sketch.constraints || sketch.constraints.length === 0) continue;

    // Heuristic 1: contradictory pairs (horizontal AND vertical on the same entity)
    const horizontals = new Set<string>();
    const verticals = new Set<string>();
    for (const c of sketch.constraints) {
      if (c.kind === "horizontal") horizontals.add(c.entity);
      if (c.kind === "vertical") verticals.add(c.entity);
    }
    for (const id of horizontals) {
      if (verticals.has(id)) {
        out.push({
          ruleId: "constraint.contradictory-pair",
          severity: "error",
          message: `Entity "${id}" in sketch "${sketch.id}" has both horizontal and vertical constraints — contradictory.`,
          agentMessage: `Remove either the horizontal or vertical constraint on "${id}" — they cannot both hold.`,
          location: { kind: "feature", id },
        });
      }
    }

    // Heuristic 2: severely over-constrained (more constraint DOF than entity DOF + 3 for ground)
    const totalEntityDof = sketch.geometry.reduce((acc, e) => acc + entityDof(e), 0);
    const totalConstraintDof = sketch.constraints.reduce((acc, c) => acc + constraintDof(c), 0);
    // 3 represents the ground plane (origin + rotation lock)
    if (totalConstraintDof > totalEntityDof + 3) {
      out.push({
        ruleId: "constraint.over-constrained-sketch",
        severity: "warn",
        message: `Sketch "${sketch.id}" has ${totalConstraintDof} constraint DOF for ${totalEntityDof} entity DOF — likely over-constrained.`,
        agentMessage: `Sketch "${sketch.id}" has more constraints than the geometry needs. Remove redundant or contradictory constraints.`,
        location: { kind: "feature", id: sketch.id },
      });
    }
  }
  return out;
}
```

- [ ] **Step 3**: Run vitest, expect 3/3 pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/constraintTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/constraintTier.test.ts
git commit -m "feat(cad-ir): tier-2 v0 — approximate DOF analyzer + contradictory-pair detector"
```

---

## Task 5: Plugin validate composes constraintTier

**Files:** `convex/cad/plugin.ts`

- [ ] **Step 1**: Update the `validate` field to call `validateConstraintTier` between schema and assembly tiers:

```ts
validate: (ir) => {
  const t1 = validateSchemaTier(ir);
  if (t1.length > 0) return t1;
  const t2 = validateConstraintTier(ir);
  // Tier 2 violations include warnings (severity:"warn"); only short-circuit on errors
  if (t2.some(v => v.severity === "error")) return t2;
  const t5 = validateAssemblyTier(ir);
  if (t5.length > 0) return t5;
  try {
    const resolved = resolveIr(ir);
    return [...t2, ...validateManufacturingTier(resolved)];
  } catch (e) {
    return [{
      ruleId: "schema.expression-error",
      severity: "error",
      message: e instanceof Error ? e.message : String(e),
      agentMessage: e instanceof Error ? e.message : String(e),
    }];
  }
},
```

(Add `import { validateConstraintTier } from "./validate/constraintTier";` at top.)

- [ ] **Step 2**: Run plugin test, expect existing pass.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/plugin.ts
git commit -m "feat(cad-ir): plugin validate composes Tier 2 (constraintTier)"
```

---

## Task 6: Patch op — add_constraint inside modify_sketch

**Files:** `convex/cad/patch/types.ts`, `apply.ts`, `tools.ts`, `__tests__/apply.test.ts`, `convex/specialists/cadIr.ts`

The existing `modify_sketch` patch has ops `set_plane | add_entity | remove_entity | modify_entity`. Add `add_constraint`.

- [ ] **Step 1**: Extend `ModifySketchOp` in `types.ts`:

```ts
import type { SketchConstraint } from "../ir/types";

export type ModifySketchOp =
  | { kind: "set_plane"; plane: PlaneRef }
  | { kind: "add_entity"; entity: SketchEntity }
  | { kind: "remove_entity"; entityId: string }
  | { kind: "modify_entity"; entityId: string; changes: Partial<SketchEntity> }
  | { kind: "add_constraint"; constraint: SketchConstraint }
  | { kind: "remove_constraint"; constraintId: string };
```

- [ ] **Step 2**: Failing tests:

```ts
it("modify_sketch op:add_constraint appends a constraint", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: {
      s: {
        id: "s", plane: "XY",
        geometry: [{ kind: "circle", id: "c", center: { x: 0, y: 0 }, radius: 5 }],
      },
    },
  };
  const r = applyPatch(parent, {
    kind: "modify_sketch", sketchId: "s",
    op: { kind: "add_constraint", constraint: { kind: "horizontal", id: "h1", entity: "c" } as never },
  });
  // Note: horizontal on a circle is silly — but we still accept it; semantic checks live in Tier 2
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.sketches.s.constraints).toHaveLength(1);
});

it("modify_sketch op:remove_constraint removes by id", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: {
      s: {
        id: "s", plane: "XY",
        geometry: [{ kind: "line", id: "l", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }],
        constraints: [{ kind: "horizontal", id: "h", entity: "l" }],
      },
    },
  };
  const r = applyPatch(parent, {
    kind: "modify_sketch", sketchId: "s",
    op: { kind: "remove_constraint", constraintId: "h" },
  });
  expect(r.ir.sketches.s.constraints).toEqual([]);
});
```

- [ ] **Step 3**: Extend `applyPatch` `modify_sketch` switch in `apply.ts`:

```ts
case "add_constraint":
  return {
    ...parent,
    sketches: {
      ...parent.sketches,
      [patch.sketchId]: {
        ...sketch,
        constraints: [...(sketch.constraints ?? []), patch.op.constraint],
      },
    },
  };
case "remove_constraint":
  return {
    ...parent,
    sketches: {
      ...parent.sketches,
      [patch.sketchId]: {
        ...sketch,
        constraints: (sketch.constraints ?? []).filter(c => c.id !== patch.op.constraintId),
      },
    },
  };
```

- [ ] **Step 4**: Update `tools.ts` `modify_sketch` op schema. Add two new variants to the `oneOf`:

```ts
{ type: "object", properties: { kind: { const: "add_constraint" }, constraint: { type: "object" } }, required: ["kind", "constraint"] },
{ type: "object", properties: { kind: { const: "remove_constraint" }, constraintId: { type: "string", pattern: SNAKE_PATTERN } }, required: ["kind", "constraintId"] },
```

- [ ] **Step 5**: Update specialist `toolCallToPatch` `modify_sketch` op switch in `convex/specialists/cadIr.ts`:

```ts
case "add_constraint":
  if (!op.constraint || typeof op.constraint !== "object") return null;
  return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "add_constraint", constraint: op.constraint as SketchConstraint } };
case "remove_constraint":
  if (typeof op.constraintId !== "string") return null;
  return { kind: "modify_sketch", sketchId: inp.sketchId, op: { kind: "remove_constraint", constraintId: op.constraintId } };
```

(Add `import type { SketchConstraint } from "../cad/ir/types";`)

- [ ] **Step 6**: Run vitest, expect new tests pass.

- [ ] **Step 7**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/ artifacts/hardwareai/convex/specialists/cadIr.ts
git commit -m "feat(cad-ir): modify_sketch ops add_constraint / remove_constraint"
```

---

## Task 7: System prompt + README + final sweep

- [ ] **Step 1**: Add a "Sketch constraints" section to `convex/cad/prompts.ts`:

```
Sketch constraints (declarative — preferred over raw coordinates when possible):
- coincident: two points are at the same location (e.g. center of c1 = center of c2)
- distance: distance between two points equals a value (parameter or literal)
- parallel / perpendicular: two lines align as named
- tangent: a line is tangent to a circle/arc, or two arcs touch tangentially
- equal: two entities have equal length (lines) or equal radius (circles/arcs)
- horizontal / vertical: a line is axis-aligned
- angle: angle between two lines equals a value (degrees)

Use modify_sketch with op { kind: "add_constraint", constraint: {...} } to add constraints.

Constraints record relationships; the geometric solver (deferred) will enforce them at execution.
For now, prefer raw coordinates for entity placement and use constraints only for documenting
intent. The validator will warn if constraints look contradictory or over-constrained.
```

- [ ] **Step 2**: Add a Phase 7 section to `convex/cad/README.md`.

- [ ] **Step 3**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
git log --oneline e547314..HEAD | wc -l
```
Expect ~270 tests, TS ≤ 38, convex clean, ~7 commits.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/prompts.ts artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 7 — sketch constraints + Tier 2 v0"
```

---

## Phase 7 success criteria

- 9 sketch constraint kinds declared in types + Zod
- Schema-tier rejects unresolved entity refs + duplicate constraint ids
- Tier 2 v0 catches horizontal+vertical contradictions and severely over-constrained sketches
- `modify_sketch` patch supports add_constraint / remove_constraint
- All Phase 1-6 tests still pass
- TS baseline ≤ 38

---

## Out of scope for Phase 7 (deferred)

- **Real 2D geometric solver** — Phase 8 candidate. Options: planegcs (Python in Sandbox), solvespace-wasm, hand-rolled small solver. Decision needed.
- **Volumetric interference detection** — needs sandbox e2e geometry.
- **Constraint-aware codegen** — currently codegen ignores `sketch.constraints` and uses raw coords. Once a solver is integrated, the resolver will substitute solver-computed coords for the raw ones.
- **External sketch references** — separate plan.
- **Live e2e validation** — operational, not architectural.
