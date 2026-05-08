# CAD IR Phase 4 — Assembly graph + joints + URDF compiler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Extend the CAD IR from single-part to multi-part. Add `parts`, `joints`, `connections` to the schema. Add Tier 5 assembly validation. Add a URDF compiler that turns the assembly graph into ROS/PyBullet-compatible robot description XML — unlocking motion simulation as a downstream target without changing the source IR.

**Why this slice:** This is the largest single architectural step remaining from the spec. It enables the agent to design multi-part hardware (hinged enclosures, brackets-with-electronics-boxes, motion mechanisms) instead of single isolated parts. The URDF compiler is a multi-target proof-of-concept: the same source IR now compiles to two outputs (build123d for geometry, URDF for motion).

**Architecture:** All work continues in `convex/cad/`. Assembly fields are optional on `CadIr`, so existing single-part IRs remain valid. Multi-part build123d codegen is **out of scope** for Phase 4 — codegen continues to produce one part at a time. URDF is pure TS, no Sandbox needed.

**Spec:** [`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`](../specs/2026-04-29-cad-ir-backbone-design.md) §4.4
**Builds on:** Phase 3 tip `b699b4e`. Worktree at `~/fabware-cad-ir-phase-4/` on branch `feat/cad-ir-phase-4`.

---

## Prerequisites

- Phase 3 complete on `feat/cad-ir-phase-3` (199/199 tests).
- New worktree at `~/fabware-cad-ir-phase-4/` on branch `feat/cad-ir-phase-4` (off Phase 3 tip).
- `node_modules`, `convex/_generated`, `.env.local` copied/installed.

---

## File Structure

```
convex/cad/ir/
├── types.ts               # MODIFY — add PartRef, AxisRef, Joint, Connection types
└── schema.ts              # MODIFY — add Zod schemas for assembly fields

convex/cad/validate/
├── schemaTier.ts          # MODIFY — extend with part-id / joint-ref / connection-ref checks
├── assemblyTier.ts        # NEW — Tier 5 (mate alignment, joint constrained-ness)
├── rules/
│   └── (rules go here later if Tier 5 grows)
└── __tests__/
    ├── schemaTier.test.ts # MODIFY — add assembly-ref test cases
    └── assemblyTier.test.ts # NEW

convex/cad/compile/
└── urdf.ts                # NEW — ResolvedIr → URDF XML
convex/cad/compile/__tests__/urdf.test.ts  # NEW

convex/cad/patch/
├── types.ts               # MODIFY — add AddPartPatch / AddJointPatch / AddConnectionPatch
├── apply.ts               # MODIFY — implement the new applier cases
├── tools.ts               # MODIFY — add 3 new tool defs
└── __tests__/{apply,tools}.test.ts   # MODIFY

convex/specialists/
└── cadIr.ts               # MODIFY — extend toolCallToPatch with 3 new tool names

convex/cad/plugin.ts       # MODIFY — validate now also calls assemblyTier
convex/cad/prompts.ts      # MODIFY — explain assembly grammar
convex/cad/README.md       # MODIFY — Phase 4 section

convex/cad/__tests__/repair-loop-assembly.test.ts  # NEW — multi-part mock test
```

---

## Task 1: Assembly types

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/ir/types.ts`

- [ ] **Step 1**: Append to types.ts:

```ts
// ─── Assembly extension (Phase 4) ─────────────────────────────────────────

/** Reference to a sub-part. v1 supports inline IR only; external refs come later. */
export interface PartRef {
  id: PartId;
  /** Inline IR for this part. */
  ir: CadIr;
  /** Optional placement of this part's origin in the parent assembly's frame.
      All values in the assembly's units. */
  origin?: { x: ParamRef; y: ParamRef; z: ParamRef };
  rotation?: { rx: ParamRef; ry: ParamRef; rz: ParamRef };  // Euler XYZ degrees
}

/** Axis reference for revolute/linear joints — pointed by feature+tag (e.g. an edge), or world axis. */
export type AxisRef =
  | { kind: "world"; axis: "x" | "y" | "z" }
  | { kind: "edge"; part: PartId; feature: FeatureId; query: "first" | { tag: string } };

export type Joint =
  | { kind: "fixed"; id: JointId; a: PartId; b: PartId }
  | { kind: "revolute"; id: JointId; a: PartId; b: PartId; axis: AxisRef; limits?: { min: ParamRef; max: ParamRef; unit: "deg" | "rad" } }
  | { kind: "linear"; id: JointId; a: PartId; b: PartId; axis: AxisRef; limits?: { min: ParamRef; max: ParamRef; unit: "mm" | "in" } }
  | { kind: "ball"; id: JointId; a: PartId; b: PartId }
  | { kind: "rigid_group"; id: JointId; parts: PartId[] };

export type Connection =
  | { kind: "bolt"; id: string; spec: string; throughParts: PartId[]; clearance?: ParamRef }
  | { kind: "weld"; id: string; partA: PartId; partB: PartId; type: "fillet" | "groove" | "spot" }
  | { kind: "adhesive"; id: string; partA: PartId; partB: PartId };

export interface CadIr {
  schemaVersion: 1;
  units: Units;
  parameters: Record<ParamId, ParameterDef>;
  sketches:   Record<SketchId, SketchDef>;
  features:   Feature[];

  // Assembly extension — all optional, present only for multi-part designs
  parts?:        Record<PartId, PartRef>;
  joints?:       Joint[];
  connections?:  Connection[];

  entities?: EntityRegistry;
}
```

(Note: `CadIr` is now self-referential through `PartRef.ir`. TypeScript handles this fine as long as both definitions are in the same module.)

- [ ] **Step 2**: Verify TS:
```bash
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "convex/cad/ir/types" | head
```
Expect 0 errors.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/types.ts
git commit -m "feat(cad-ir): assembly types — PartRef, AxisRef, Joint, Connection"
```

---

## Task 2: Zod schemas for assembly

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/ir/schema.ts`
- Modify: `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts`

- [ ] **Step 1**: Add tests:

```ts
describe("Assembly schema", () => {
  it("accepts a CadIr with two inline parts and a fixed joint", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const,
      parameters: {}, sketches: {}, features: [],
      parts: {
        a: { id: "a", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
        b: { id: "b", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
      },
      joints: [{ kind: "fixed", id: "j1", a: "a", b: "b" }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a revolute joint with limits", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: {
        body: { id: "body", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
        lid: { id: "lid", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
      },
      joints: [{
        kind: "revolute", id: "hinge", a: "body", b: "lid",
        axis: { kind: "world", axis: "y" },
        limits: { min: 0, max: 90, unit: "deg" },
      }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a revolute joint with limits in mm units", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: {
        a: { id: "a", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
        b: { id: "b", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
      },
      joints: [{
        kind: "revolute", id: "j", a: "a", b: "b",
        axis: { kind: "world", axis: "z" },
        limits: { min: 0, max: 50, unit: "mm" }, // wrong unit for revolute
      }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });

  it("accepts a bolt connection through two parts", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: {
        bracket: { id: "bracket", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
        plate: { id: "plate", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } },
      },
      connections: [{ kind: "bolt", id: "b1", spec: "M6", throughParts: ["bracket", "plate"], clearance: 0.5 }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });
});
```

- [ ] **Step 2**: Add Zod schemas in `schema.ts` (before the top-level `CadIrSchema`). Forward-ref the assembly fields so that `PartRef.ir` references `CadIrSchema`:

```ts
// Forward declaration (before CadIrSchema):
const Origin = z.object({ x: ParamRef, y: ParamRef, z: ParamRef });
const Rotation = z.object({ rx: ParamRef, ry: ParamRef, rz: ParamRef });

const AxisRef = z.union([
  z.object({ kind: z.literal("world"), axis: z.enum(["x", "y", "z"]) }),
  z.object({ kind: z.literal("edge"), part: Snake, feature: Snake, query: z.union([z.literal("first"), z.object({ tag: z.string().max(32) })]) }),
]);

const RevoluteLimits = z.object({ min: ParamRef, max: ParamRef, unit: z.enum(["deg", "rad"]) });
const LinearLimits = z.object({ min: ParamRef, max: ParamRef, unit: z.enum(["mm", "in"]) });

const Joint = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("revolute"), id: Snake, a: Snake, b: Snake, axis: AxisRef, limits: RevoluteLimits.optional() }),
  z.object({ kind: z.literal("linear"), id: Snake, a: Snake, b: Snake, axis: AxisRef, limits: LinearLimits.optional() }),
  z.object({ kind: z.literal("ball"), id: Snake, a: Snake, b: Snake }),
  z.object({ kind: z.literal("rigid_group"), id: Snake, parts: z.array(Snake).min(2) }),
]);

const Connection = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bolt"), id: Snake, spec: z.string().regex(/^(M\d+(\.\d+)?|\d+(\/\d+)?-\d+)$/i), throughParts: z.array(Snake).min(2), clearance: ParamRef.optional() }),
  z.object({ kind: z.literal("weld"), id: Snake, partA: Snake, partB: Snake, type: z.enum(["fillet", "groove", "spot"]) }),
  z.object({ kind: z.literal("adhesive"), id: Snake, partA: Snake, partB: Snake }),
]);

// Use z.lazy for self-referential PartRef (its ir field is a CadIrSchema):
const PartRef: z.ZodType<{ id: string; ir: unknown; origin?: unknown; rotation?: unknown }> = z.lazy(() =>
  z.object({
    id: Snake,
    ir: CadIrSchema,
    origin: Origin.optional(),
    rotation: Rotation.optional(),
  })
);
```

Then extend `CadIrSchema` to include the optional assembly fields:

```ts
export const CadIrSchema: z.ZodType<unknown> = z.object({
  schemaVersion: z.literal(1),
  units: z.enum(["mm", "in"]),
  parameters: z.record(Snake, ParameterDef),
  sketches: z.record(Snake, SketchDef),
  features: z.array(FeatureSchema),
  parts: z.record(Snake, PartRef).optional(),
  joints: z.array(Joint).optional(),
  connections: z.array(Connection).optional(),
  entities: z.object({
    faces: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    edges: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    vertices: z.record(z.string(), z.object({ feature: Snake, tag: z.string() })),
  }).optional(),
});
```

**Note:** the type annotation `z.ZodType<unknown>` on `CadIrSchema` is required because the self-reference makes Zod unable to infer the type. Existing callers that did `CadIrSchema.parse(ir)` and trusted the returned type may need a cast — typically `CadIrSchema.parse(ir) as CadIr`. Search for usages and adjust.

- [ ] **Step 3**: Run vitest. Expect existing schema tests + 4 new ones pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/schema.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): Zod schemas for parts/joints/connections (self-referential PartRef)"
```

---

## Task 3: Schema-tier checks for assembly references

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/validate/schemaTier.ts`
- Modify: `artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts`

- [ ] **Step 1**: Add failing tests:

```ts
it("detects a joint that references a missing part", () => {
  const v = validateSchemaTier(ir({
    parts: { a: { id: "a", ir: emptyIr("mm") } },
    joints: [{ kind: "fixed", id: "j", a: "a", b: "missing_part" }],
  }));
  expect(v.some(x => x.ruleId === "schema.unresolved-part-ref")).toBe(true);
});

it("detects a connection that references a missing part", () => {
  const v = validateSchemaTier(ir({
    parts: { a: { id: "a", ir: emptyIr("mm") } },
    connections: [{ kind: "bolt", id: "b1", spec: "M6", throughParts: ["a", "missing"] }],
  }));
  expect(v.some(x => x.ruleId === "schema.unresolved-part-ref")).toBe(true);
});

it("detects duplicate joint ids", () => {
  const v = validateSchemaTier(ir({
    parts: { a: { id: "a", ir: emptyIr("mm") }, b: { id: "b", ir: emptyIr("mm") } },
    joints: [
      { kind: "fixed", id: "dup", a: "a", b: "b" },
      { kind: "fixed", id: "dup", a: "b", b: "a" },
    ],
  }));
  expect(v.some(x => x.ruleId === "schema.duplicate-joint-id")).toBe(true);
});
```

- [ ] **Step 2**: Extend `validateSchemaTier`:

```ts
// inside validateSchemaTier, after feature checks:
const partIds = new Set(Object.keys(ir.parts ?? {}));

// joints
const seenJointIds = new Set<string>();
for (const j of ir.joints ?? []) {
  if (seenJointIds.has(j.id)) {
    out.push(v("schema.duplicate-joint-id", `Joint id "${j.id}" duplicated`, `Rename one of the joints with id "${j.id}".`, { kind: "feature", id: j.id }));
  }
  seenJointIds.add(j.id);

  const refs: string[] = j.kind === "rigid_group" ? j.parts : [j.a, j.b];
  for (const p of refs) {
    if (!partIds.has(p)) {
      out.push(v("schema.unresolved-part-ref", `Joint "${j.id}" references missing part "${p}"`, `Add part "${p}" or change the joint reference.`, { kind: "feature", id: j.id }));
    }
  }
}

// connections
for (const c of ir.connections ?? []) {
  const refs: string[] = c.kind === "bolt" ? c.throughParts : [c.partA, c.partB];
  for (const p of refs) {
    if (!partIds.has(p)) {
      out.push(v("schema.unresolved-part-ref", `Connection "${c.id}" references missing part "${p}"`, `Add part "${p}" or change the connection reference.`, { kind: "feature", id: c.id }));
    }
  }
}
```

Run vitest. Expect all schema-tier tests passing.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/schemaTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts
git commit -m "feat(cad-ir): schema-tier checks for joints/connections part refs + dup ids"
```

---

## Task 4: Tier 5 — assembly validator (mate alignment, joint constrained-ness)

**Files:**
- Create: `artifacts/hardwareai/convex/cad/validate/assemblyTier.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/__tests__/assemblyTier.test.ts`

For Phase 4, Tier 5 implements two cheap structural checks:
1. **Floating part** — a part not connected to anything via joints or connections.
2. **Over-constrained `rigid_group`** — a rigid_group whose parts are also separately joined elsewhere.

Volumetric interference and joint-range self-collision are deferred (need geometry).

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { validateAssemblyTier } from "../assemblyTier";
import { emptyIr } from "../../ir/empty";

describe("validateAssemblyTier", () => {
  it("returns no violations for a single-part IR", () => {
    expect(validateAssemblyTier(emptyIr("mm"))).toEqual([]);
  });

  it("flags a floating part not joined to anything", () => {
    const v = validateAssemblyTier({
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: emptyIr("mm") },
        b: { id: "b", ir: emptyIr("mm") },
        c: { id: "c", ir: emptyIr("mm") },  // floating
      },
      joints: [{ kind: "fixed", id: "j", a: "a", b: "b" }],
    });
    expect(v.some(x => x.ruleId === "assembly.floating-part" && x.location?.id === "c")).toBe(true);
  });

  it("does not flag parts connected via bolt connections", () => {
    const v = validateAssemblyTier({
      ...emptyIr("mm"),
      parts: {
        bracket: { id: "bracket", ir: emptyIr("mm") },
        plate: { id: "plate", ir: emptyIr("mm") },
      },
      connections: [{ kind: "bolt", id: "b1", spec: "M6", throughParts: ["bracket", "plate"] }],
    });
    expect(v.find(x => x.ruleId === "assembly.floating-part")).toBeUndefined();
  });

  it("flags a rigid_group whose member is also separately joined", () => {
    const v = validateAssemblyTier({
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: emptyIr("mm") },
        b: { id: "b", ir: emptyIr("mm") },
        c: { id: "c", ir: emptyIr("mm") },
      },
      joints: [
        { kind: "rigid_group", id: "rg", parts: ["a", "b"] },
        { kind: "revolute", id: "j", a: "a", b: "c", axis: { kind: "world", axis: "z" } },
      ],
    });
    expect(v.some(x => x.ruleId === "assembly.over-constrained-rigid-group")).toBe(true);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// artifacts/hardwareai/convex/cad/validate/assemblyTier.ts
import type { CadIr } from "../ir/types";
import type { Violation } from "../../plugins/types";

export function validateAssemblyTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];
  if (!ir.parts || Object.keys(ir.parts).length === 0) return out;

  // Build a set of part ids that participate in any joint or connection
  const connected = new Set<string>();
  for (const j of ir.joints ?? []) {
    if (j.kind === "rigid_group") {
      for (const p of j.parts) connected.add(p);
    } else {
      connected.add(j.a); connected.add(j.b);
    }
  }
  for (const c of ir.connections ?? []) {
    if (c.kind === "bolt") {
      for (const p of c.throughParts) connected.add(p);
    } else {
      connected.add(c.partA); connected.add(c.partB);
    }
  }

  for (const partId of Object.keys(ir.parts)) {
    if (!connected.has(partId)) {
      out.push({
        ruleId: "assembly.floating-part",
        severity: "error",
        message: `Part "${partId}" is not connected to any other part.`,
        agentMessage: `Add a joint or connection that references "${partId}", or remove it.`,
        location: { kind: "part", id: partId },
      });
    }
  }

  // Over-constrained rigid_group check
  const rigidMembers = new Set<string>();
  for (const j of ir.joints ?? []) {
    if (j.kind === "rigid_group") for (const p of j.parts) rigidMembers.add(p);
  }
  for (const j of ir.joints ?? []) {
    if (j.kind === "rigid_group") continue;
    const refs = [j.a, j.b];
    for (const p of refs) {
      if (rigidMembers.has(p)) {
        out.push({
          ruleId: "assembly.over-constrained-rigid-group",
          severity: "error",
          message: `Part "${p}" is in a rigid_group AND has a separate joint "${j.id}".`,
          agentMessage: `Either remove "${p}" from the rigid_group or remove the conflicting joint "${j.id}".`,
          location: { kind: "feature", id: j.id },
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 3**: Run vitest. Expect 4/4 new pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/assemblyTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/assemblyTier.test.ts
git commit -m "feat(cad-ir): tier-5 assembly validator (floating-part + over-constrained-rigid-group)"
```

---

## Task 5: URDF compiler

**Files:**
- Create: `artifacts/hardwareai/convex/cad/compile/urdf.ts`
- Create: `artifacts/hardwareai/convex/cad/compile/__tests__/urdf.test.ts`

URDF format: `<robot name="...">` containing `<link name="...">` entries (one per part) and `<joint name="..." type="..."><parent link="..." /><child link="..." /></joint>` (one per joint). Limits use `<limit lower="..." upper="..." />`. Origin/rotation become `<origin xyz="x y z" rpy="rx ry rz" />`.

- [ ] **Step 1**: Failing test:

```ts
import { describe, expect, it } from "vitest";
import { compileToUrdf } from "../urdf";
import type { CadIr } from "../../ir/types";
import { emptyIr } from "../../ir/empty";

describe("compileToUrdf", () => {
  it("emits a minimal robot with two links and a fixed joint", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: [{ kind: "fixed", id: "lid_to_body", a: "body", b: "lid" }],
    };
    const xml = compileToUrdf(ir, "test_assembly");
    expect(xml).toContain("<robot name=\"test_assembly\">");
    expect(xml).toContain("<link name=\"body\"");
    expect(xml).toContain("<link name=\"lid\"");
    expect(xml).toContain("<joint name=\"lid_to_body\" type=\"fixed\">");
    expect(xml).toContain("<parent link=\"body\"/>");
    expect(xml).toContain("<child link=\"lid\"/>");
  });

  it("emits a revolute joint with limits in radians (converts deg→rad)", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: emptyIr("mm") },
        b: { id: "b", ir: emptyIr("mm") },
      },
      joints: [{
        kind: "revolute", id: "hinge", a: "a", b: "b",
        axis: { kind: "world", axis: "y" },
        limits: { min: 0, max: 90, unit: "deg" },
      }],
    };
    const xml = compileToUrdf(ir, "robot");
    expect(xml).toContain("<joint name=\"hinge\" type=\"revolute\">");
    expect(xml).toContain("<axis xyz=\"0 1 0\"/>");
    // 90 degrees = 1.5708 rad
    expect(xml).toMatch(/<limit lower="0" upper="1\.570/);
  });

  it("emits a linear joint as prismatic", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        carriage: { id: "carriage", ir: emptyIr("mm") },
        rail: { id: "rail", ir: emptyIr("mm") },
      },
      joints: [{
        kind: "linear", id: "slide", a: "rail", b: "carriage",
        axis: { kind: "world", axis: "x" },
        limits: { min: 0, max: 100, unit: "mm" },
      }],
    };
    const xml = compileToUrdf(ir, "linear");
    expect(xml).toContain("<joint name=\"slide\" type=\"prismatic\">");
    // mm → m: 100mm = 0.1m
    expect(xml).toMatch(/<limit lower="0" upper="0\.1"/);
  });

  it("includes part origin/rotation in <origin> element", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: emptyIr("mm") },
        b: { id: "b", ir: emptyIr("mm"), origin: { x: 50, y: 0, z: 30 } },
      },
      joints: [{ kind: "fixed", id: "j", a: "a", b: "b" }],
    };
    const xml = compileToUrdf(ir, "robot");
    // 50mm = 0.05m
    expect(xml).toMatch(/<link name="b">[\s\S]*<origin xyz="0\.05 0 0\.03"/);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// artifacts/hardwareai/convex/cad/compile/urdf.ts
import type { CadIr, Joint, AxisRef, ParamRef } from "../ir/types";

const DEG_TO_RAD = Math.PI / 180;

function num(p: ParamRef | undefined, fallback = 0): number {
  if (typeof p === "number") return p;
  return fallback; // expression strings will not appear in resolved-IR contexts
}

function lengthMmToM(p: ParamRef | undefined, units: "mm" | "in"): number {
  const n = num(p, 0);
  if (units === "mm") return n / 1000;
  return n * 0.0254; // inches → meters
}

function axisXyz(a: AxisRef): string {
  if (a.kind === "world") {
    return a.axis === "x" ? "1 0 0" : a.axis === "y" ? "0 1 0" : "0 0 1";
  }
  return "0 0 1"; // edge-axis resolution is geometry-dependent; default for v1
}

function jointTypeUrdf(j: Joint): string {
  switch (j.kind) {
    case "fixed": return "fixed";
    case "revolute": return "revolute";
    case "linear": return "prismatic";
    case "ball": return "floating"; // URDF doesn't have a ball joint; floating allows 6 DOF
    case "rigid_group": return "fixed"; // collapse; rigid_group renders as N-1 fixed joints
  }
}

export function compileToUrdf(ir: CadIr, robotName: string): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0"?>`);
  lines.push(`<robot name="${robotName}">`);

  for (const [id, part] of Object.entries(ir.parts ?? {})) {
    const ox = lengthMmToM(part.origin?.x, ir.units);
    const oy = lengthMmToM(part.origin?.y, ir.units);
    const oz = lengthMmToM(part.origin?.z, ir.units);
    const rx = (num(part.rotation?.rx) * DEG_TO_RAD).toFixed(4);
    const ry = (num(part.rotation?.ry) * DEG_TO_RAD).toFixed(4);
    const rz = (num(part.rotation?.rz) * DEG_TO_RAD).toFixed(4);
    lines.push(`  <link name="${id}">`);
    lines.push(`    <origin xyz="${ox} ${oy} ${oz}" rpy="${rx} ${ry} ${rz}"/>`);
    lines.push(`  </link>`);
  }

  for (const j of ir.joints ?? []) {
    if (j.kind === "rigid_group") {
      // Synthesize N-1 fixed joints from parts[0] to parts[1..]
      for (let i = 1; i < j.parts.length; i++) {
        lines.push(`  <joint name="${j.id}_${i}" type="fixed">`);
        lines.push(`    <parent link="${j.parts[0]}"/>`);
        lines.push(`    <child link="${j.parts[i]}"/>`);
        lines.push(`  </joint>`);
      }
      continue;
    }
    lines.push(`  <joint name="${j.id}" type="${jointTypeUrdf(j)}">`);
    lines.push(`    <parent link="${j.a}"/>`);
    lines.push(`    <child link="${j.b}"/>`);
    if (j.kind === "revolute" || j.kind === "linear") {
      lines.push(`    <axis xyz="${axisXyz(j.axis)}"/>`);
      if (j.limits) {
        let lo: number, hi: number;
        if (j.kind === "revolute") {
          const factor = j.limits.unit === "deg" ? DEG_TO_RAD : 1;
          lo = num(j.limits.min) * factor;
          hi = num(j.limits.max) * factor;
        } else {
          const factor = j.limits.unit === "mm" ? 0.001 : 0.0254;
          lo = num(j.limits.min) * factor;
          hi = num(j.limits.max) * factor;
        }
        lines.push(`    <limit lower="${lo}" upper="${hi}"/>`);
      }
    }
    lines.push(`  </joint>`);
  }

  lines.push(`</robot>`);
  return lines.join("\n");
}
```

- [ ] **Step 3**: Run vitest. Expect 4/4 pass. (Test 4 — origin xyz — depends on the order of `<link>` elements; if `b` is rendered before `a`, regex still matches.)

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/compile/
git commit -m "feat(cad-ir): URDF compiler — fixed/revolute/linear/ball/rigid_group with mm→m, deg→rad"
```

---

## Task 6: Patch types for assembly

- [ ] **Step 1**: Extend `convex/cad/patch/types.ts`:

```ts
import type { PartRef, Joint, Connection } from "../ir/types";

export interface AddPartPatch {
  kind: "add_part";
  part: PartRef;
}

export interface AddJointPatch {
  kind: "add_joint";
  joint: Joint;
}

export interface AddConnectionPatch {
  kind: "add_connection";
  connection: Connection;
}
```

Add to `Patch` union.

- [ ] **Step 2**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/types.ts
git commit -m "feat(cad-ir): patch types for add_part, add_joint, add_connection"
```

---

## Task 7: Patch applier for assembly + tests

- [ ] **Step 1**: Failing tests in `apply.test.ts`:

```ts
it("add_part appends a new part to the assembly", () => {
  const r = applyPatch(emptyIr("mm"), {
    kind: "add_part",
    part: { id: "bracket", ir: emptyIr("mm") },
  });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.parts?.bracket).toBeDefined();
});

it("add_part rejects a duplicate id", () => {
  const parent: CadIr = { ...emptyIr("mm"), parts: { dup: { id: "dup", ir: emptyIr("mm") } } };
  const r = applyPatch(parent, { kind: "add_part", part: { id: "dup", ir: emptyIr("mm") } });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.duplicate-part-id")).toBe(true);
});

it("add_joint appends a joint after parts exist", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    parts: {
      a: { id: "a", ir: emptyIr("mm") },
      b: { id: "b", ir: emptyIr("mm") },
    },
  };
  const r = applyPatch(parent, { kind: "add_joint", joint: { kind: "fixed", id: "j1", a: "a", b: "b" } });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.joints).toHaveLength(1);
});

it("add_joint with missing part is rejected", () => {
  const r = applyPatch(emptyIr("mm"), { kind: "add_joint", joint: { kind: "fixed", id: "j", a: "x", b: "y" } });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-part-ref")).toBe(true);
});

it("add_connection appends a bolt", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    parts: { a: { id: "a", ir: emptyIr("mm") }, b: { id: "b", ir: emptyIr("mm") } },
  };
  const r = applyPatch(parent, {
    kind: "add_connection",
    connection: { kind: "bolt", id: "b1", spec: "M6", throughParts: ["a", "b"] },
  });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.connections).toHaveLength(1);
});
```

- [ ] **Step 2**: Implement in `apply.ts`:

Add to the `applyToCandidate` switch:

```ts
case "add_part":
  return {
    ...parent,
    parts: { ...(parent.parts ?? {}), [patch.part.id]: patch.part },
  };
case "add_joint":
  return {
    ...parent,
    joints: [...(parent.joints ?? []), patch.joint],
  };
case "add_connection":
  return {
    ...parent,
    connections: [...(parent.connections ?? []), patch.connection],
  };
```

Add entry-guard to `applyPatch` for duplicate part id (mirror existing duplicate-sketch-id guard):

```ts
if (patch.kind === "add_part" && parent.parts?.[patch.part.id]) {
  return {
    ir: parent,
    schemaViolations: [{
      ruleId: "schema.duplicate-part-id",
      severity: "error",
      message: `Part "${patch.part.id}" already exists.`,
      agentMessage: `Use add_part with a different id, or remove the existing part first.`,
    }],
  };
}
```

`add_joint` and `add_connection` validation (missing part refs) is handled by `validateSchemaTier` (Task 3) — applied automatically in `applyPatch`.

- [ ] **Step 3**: Run vitest. Expect 5/5 new pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): apply add_part / add_joint / add_connection patches"
```

---

## Task 8: Anthropic tool defs for assembly

- [ ] **Step 1**: Add three new tool defs in `convex/cad/patch/tools.ts`:

```ts
const addPart: AgentTool = {
  name: "add_part",
  description: "Add a new sub-part to the assembly. Provide an inline CAD IR for the part. Use snake_case id.",
  input_schema: {
    type: "object",
    properties: {
      part: {
        type: "object",
        properties: {
          id: { type: "string", pattern: SNAKE_PATTERN },
          ir: { type: "object", description: "An inline CadIr for this part." },
          origin: {
            type: "object",
            properties: {
              x: { oneOf: [{ type: "number" }, { type: "string" }] },
              y: { oneOf: [{ type: "number" }, { type: "string" }] },
              z: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["x", "y", "z"],
          },
          rotation: {
            type: "object",
            properties: {
              rx: { oneOf: [{ type: "number" }, { type: "string" }] },
              ry: { oneOf: [{ type: "number" }, { type: "string" }] },
              rz: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["rx", "ry", "rz"],
          },
        },
        required: ["id", "ir"],
      },
    },
    required: ["part"],
  },
};

const addJoint: AgentTool = {
  name: "add_joint",
  description: "Add a joint between two parts. Joint kinds: fixed, revolute (axis + angle limits), linear (axis + travel limits), ball, rigid_group (multi-part lock).",
  input_schema: {
    type: "object",
    properties: {
      joint: {
        oneOf: [
          { type: "object", properties: { kind: { const: "fixed" }, id: { type: "string", pattern: SNAKE_PATTERN }, a: { type: "string", pattern: SNAKE_PATTERN }, b: { type: "string", pattern: SNAKE_PATTERN } }, required: ["kind", "id", "a", "b"] },
          { type: "object", properties: { kind: { const: "revolute" }, id: { type: "string", pattern: SNAKE_PATTERN }, a: { type: "string", pattern: SNAKE_PATTERN }, b: { type: "string", pattern: SNAKE_PATTERN }, axis: { type: "object" }, limits: { type: "object", properties: { min: { oneOf: [{ type: "number" }, { type: "string" }] }, max: { oneOf: [{ type: "number" }, { type: "string" }] }, unit: { enum: ["deg", "rad"] } }, required: ["min", "max", "unit"] } }, required: ["kind", "id", "a", "b", "axis"] },
          { type: "object", properties: { kind: { const: "linear" }, id: { type: "string", pattern: SNAKE_PATTERN }, a: { type: "string", pattern: SNAKE_PATTERN }, b: { type: "string", pattern: SNAKE_PATTERN }, axis: { type: "object" }, limits: { type: "object", properties: { min: { oneOf: [{ type: "number" }, { type: "string" }] }, max: { oneOf: [{ type: "number" }, { type: "string" }] }, unit: { enum: ["mm", "in"] } }, required: ["min", "max", "unit"] } }, required: ["kind", "id", "a", "b", "axis"] },
          { type: "object", properties: { kind: { const: "ball" }, id: { type: "string", pattern: SNAKE_PATTERN }, a: { type: "string", pattern: SNAKE_PATTERN }, b: { type: "string", pattern: SNAKE_PATTERN } }, required: ["kind", "id", "a", "b"] },
          { type: "object", properties: { kind: { const: "rigid_group" }, id: { type: "string", pattern: SNAKE_PATTERN }, parts: { type: "array", items: { type: "string", pattern: SNAKE_PATTERN }, minItems: 2 } }, required: ["kind", "id", "parts"] },
        ],
      },
    },
    required: ["joint"],
  },
};

const addConnection: AgentTool = {
  name: "add_connection",
  description: "Add a fastener connection between parts. Kinds: bolt (M-spec, multiple parts in stack), weld (fillet/groove/spot), adhesive.",
  input_schema: {
    type: "object",
    properties: {
      connection: {
        oneOf: [
          { type: "object", properties: { kind: { const: "bolt" }, id: { type: "string", pattern: SNAKE_PATTERN }, spec: { type: "string" }, throughParts: { type: "array", items: { type: "string", pattern: SNAKE_PATTERN }, minItems: 2 }, clearance: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["kind", "id", "spec", "throughParts"] },
          { type: "object", properties: { kind: { const: "weld" }, id: { type: "string", pattern: SNAKE_PATTERN }, partA: { type: "string", pattern: SNAKE_PATTERN }, partB: { type: "string", pattern: SNAKE_PATTERN }, type: { enum: ["fillet", "groove", "spot"] } }, required: ["kind", "id", "partA", "partB", "type"] },
          { type: "object", properties: { kind: { const: "adhesive" }, id: { type: "string", pattern: SNAKE_PATTERN }, partA: { type: "string", pattern: SNAKE_PATTERN }, partB: { type: "string", pattern: SNAKE_PATTERN } }, required: ["kind", "id", "partA", "partB"] },
        ],
      },
    },
    required: ["connection"],
  },
};

// Update the export array
export const CAD_IR_TOOLS: AgentTool[] = [
  setParameter, addFeature,
  modifyFeature, suppress, unsuppress, reorderFeature, remove,
  addSketch, modifySketch,
  addPart, addJoint, addConnection,
];
```

- [ ] **Step 2**: Update `tools.test.ts`:

```ts
it("exports all 12 patch tool families", () => {
  const names = CAD_IR_TOOLS.map(t => t.name).sort();
  expect(names).toEqual([
    "add_connection", "add_feature", "add_joint", "add_part", "add_sketch",
    "modify_feature", "modify_sketch", "remove", "reorder_feature",
    "set_parameter", "suppress", "unsuppress",
  ]);
});
```

- [ ] **Step 3**: Run vitest. Expect existing tools tests + 1 updated case pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
git commit -m "feat(cad-ir): Anthropic tool defs for add_part/add_joint/add_connection"
```

---

## Task 9: Specialist toolCallToPatch for assembly tools

- [ ] **Step 1**: In `convex/specialists/cadIr.ts` `toolCallToPatch`, add three new tool-name cases:

```ts
if (tool.name === "add_part") {
  if (!inp?.part || typeof inp.part !== "object") return null;
  return { kind: "add_part", part: inp.part as PartRef };
}
if (tool.name === "add_joint") {
  if (!inp?.joint || typeof inp.joint !== "object") return null;
  return { kind: "add_joint", joint: inp.joint as Joint };
}
if (tool.name === "add_connection") {
  if (!inp?.connection || typeof inp.connection !== "object") return null;
  return { kind: "add_connection", connection: inp.connection as Connection };
}
```

(Add `import type { PartRef, Joint, Connection } from "../cad/ir/types";` at top.)

- [ ] **Step 2**: Verify TS:
```bash
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "specialists/cadIr" | head
```
Expect 0 errors.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/specialists/cadIr.ts
git commit -m "feat(cad-ir): specialist routes add_part/add_joint/add_connection tools"
```

---

## Task 10: Plugin validate composes assemblyTier

- [ ] **Step 1**: In `convex/cad/plugin.ts`, update the `validate` field to also call `validateAssemblyTier`:

```ts
validate: (ir) => {
  const t1 = validateSchemaTier(ir);
  if (t1.length > 0) return t1;
  const t5 = validateAssemblyTier(ir);
  if (t5.length > 0) return t5;
  try {
    const resolved = resolveIr(ir);
    return validateManufacturingTier(resolved);
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

(Add `import { validateAssemblyTier } from "./validate/assemblyTier";` at top.)

- [ ] **Step 2**: Run plugin test, expect existing pass.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/plugin.ts
git commit -m "feat(cad-ir): plugin validate composes assemblyTier (Tier 5)"
```

---

## Task 11: Multi-part hinged-box mock test

- [ ] **Step 1**: Create `convex/cad/__tests__/repair-loop-assembly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch/apply";
import { validateSchemaTier } from "../validate/schemaTier";
import { validateAssemblyTier } from "../validate/assemblyTier";
import { emptyIr } from "../ir/empty";
import { compileToUrdf } from "../compile/urdf";
import type { CadIr } from "../ir/types";
import type { Patch } from "../patch/types";

function fakeAssemblyAgent(violations: { ruleId: string; location?: { id: string } }[]): Patch[] {
  if (violations.some(v => v.ruleId === "assembly.floating-part" && v.location?.id === "lid")) {
    return [{ kind: "add_joint", joint: { kind: "revolute", id: "hinge", a: "body", b: "lid", axis: { kind: "world", axis: "y" }, limits: { min: 0, max: 90, unit: "deg" } } }];
  }
  return [];
}

describe("CAD IR assembly repair loop", () => {
  it("connects a floating part by adding a revolute hinge, then compiles URDF", () => {
    let ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },  // floating
      },
    };

    let violations = [...validateSchemaTier(ir), ...validateAssemblyTier(ir)];
    expect(violations.some(v => v.ruleId === "assembly.floating-part")).toBe(true);

    for (let turn = 0; turn < 3 && violations.length > 0; turn++) {
      for (const patch of fakeAssemblyAgent(violations)) {
        const r = applyPatch(ir, patch);
        if (r.schemaViolations.length === 0) ir = r.ir;
      }
      violations = [...validateSchemaTier(ir), ...validateAssemblyTier(ir)];
    }

    expect(violations).toEqual([]);
    expect(ir.joints).toHaveLength(1);

    // Now compile to URDF and verify it's valid-shape XML
    const urdf = compileToUrdf(ir, "hinged_box");
    expect(urdf).toContain("<robot name=\"hinged_box\">");
    expect(urdf).toContain("<joint name=\"hinge\" type=\"revolute\">");
    expect(urdf).toContain("<parent link=\"body\"/>");
    expect(urdf).toContain("<child link=\"lid\"/>");
  });
});
```

- [ ] **Step 2**: Run vitest. Expect pass.

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/__tests__/repair-loop-assembly.test.ts
git commit -m "test(cad-ir): assembly repair loop adds hinge to floating part, compiles URDF"
```

---

## Task 12: Prompts + README + plugin tests + final sweep

- [ ] **Step 1**: Update `convex/cad/prompts.ts` to mention assembly tools and the joint-kind taxonomy.

- [ ] **Step 2**: Update `convex/cad/__tests__/plugin.test.ts` to assert 12 tool names.

- [ ] **Step 3**: Update `convex/cad/README.md` with a Phase 4 section.

- [ ] **Step 4**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
git log --oneline b699b4e..HEAD | wc -l
git diff --stat b699b4e..HEAD | tail -1
```
Expect: tests ~221 (199 + ~22 new), TS ≤ 38, convex clean, ~12 commits.

- [ ] **Step 5**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/prompts.ts artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 4 — assembly + URDF; prompt + plugin test + README"
```

---

## Phase 4 success criteria

| Criterion | How verified |
|---|---|
| `CadIr` accepts optional `parts`/`joints`/`connections` without breaking single-part designs | Tasks 1+2 |
| Joint refs to missing parts surface as schema violations | Task 3 |
| Tier 5 catches floating parts and over-constrained rigid_groups | Task 4 |
| URDF compiler produces valid XML for fixed/revolute/linear joints with mm→m, deg→rad conversion | Task 5 |
| 12 patch tools live (Phase 1: 2, Phase 2: +7, Phase 4: +3) | Task 8 |
| Assembly repair loop converges using `add_joint` | Task 11 |
| All Phase 1+2+3 tests still pass | Task 12 |
| TS error baseline ≤ 38 | Task 12 |

---

## Out of scope for Phase 4 (deferred)

- **Multi-part build123d codegen** — currently `compileToBuild123d` runs per-part; combined assembly STEP/STL/glTF would require either (a) a multi-part orchestrator that places each part in its own `BuildPart` block then assembles via `Compound`, or (b) per-part artifacts + a separate assembly viewer. Phase 5.
- **Volumetric interference detection** — needs geometry. Phase 5+.
- **Joint-range self-collision sampling** — sample joint at N angles, run interference at each. Phase 5+.
- **MJCF (MuJoCo)** — second motion-sim target. Phase 5.
- **External part references** — `PartRef` only supports inline IR. External refs (e.g. STEP imports, off-the-shelf parts) come later.
- **`AxisRef` of kind "edge"** — schema accepts it, but URDF compiler currently falls back to default axis. Real edge-axis resolution requires the resolved geometry of the referenced part. Phase 5.
- **`modify_part` / `modify_joint` / `modify_connection`** — Phase 5 if needed.
- **Sketch constraint solver (Tier 2)** — orthogonal feature, separate plan.
- **Bend-flange + weld-tab features** — orthogonal feature, separate plan.
