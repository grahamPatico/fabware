# CAD IR Phase 2 — Patch Grammar Expansion + Sketch Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the agent's patch grammar from 2 tools (Phase 1 — `set_parameter`, `add_feature`) to ~8, so the agent can edit existing features and sketches incrementally. Port additional manufacturing rules from `lib/scsRules.ts`. Verify the speed/understanding thesis with a multi-tool repair-loop mock test.

**Architecture:** All work continues in `convex/cad/`. Each new patch family lights up one applier case, one tool definition, one mock test. The plugin's `validate` hook stays unchanged; the manufacturing-tier rule set grows. No schema changes, no new Convex tables, no UI changes.

**Tech stack:** Same as Phase 1.

**Spec:** [`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`](../specs/2026-04-29-cad-ir-backbone-design.md)
**Builds on:** [`docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`](2026-04-29-cad-ir-phase-1.md) — Phase 1 must be merged or branched-from.

---

## Prerequisites

1. Phase 1 has landed (or work happens on a worktree off `feat/cad-ir-phase-1` at commit `d46ca95`).
2. Baseline: 151/151 tests passing on `feat/cad-ir-phase-1`.
3. New worktree at `~/fabware-cad-ir-phase-2/` on branch `feat/cad-ir-phase-2`, branched off `feat/cad-ir-phase-1`.

---

## File Structure

All paths under `artifacts/hardwareai/`. **Existing files modified:** `convex/cad/patch/types.ts` (Phase 2 patches were already declared — implement them in `apply.ts`), `convex/cad/patch/apply.ts` (extend switch), `convex/cad/patch/tools.ts` (add tool defs), `convex/cad/prompts.ts` (mention new tools), `convex/cad/README.md` (Phase 2 scope update). **New files:** per-rule modules under `convex/cad/validate/rules/`, new test files for each tool.

```
convex/cad/patch/
├── apply.ts                                   # MODIFY — extend applyToCandidate switch
├── tools.ts                                   # MODIFY — add ~6 new tool defs
├── types.ts                                   # already has full union (Phase 1 declared all kinds)
└── __tests__/
    ├── apply.test.ts                          # MODIFY — add cases per new patch
    └── tools.test.ts                          # MODIFY — verify all tools present

convex/cad/validate/
├── manufacturingTier.ts                       # MODIFY — composes rules from rules/
├── rules/                                     # NEW — one file per rule
│   ├── holeEdgeDistance.ts                    # extracted from current monolithic mfg
│   ├── minWallThickness.ts                    # NEW
│   ├── minBendRadius.ts                       # NEW
│   └── boltClearance.ts                       # NEW
└── __tests__/
    ├── rules-holeEdgeDistance.test.ts
    ├── rules-minWallThickness.test.ts
    ├── rules-minBendRadius.test.ts
    └── rules-boltClearance.test.ts

convex/cad/prompts.ts                          # MODIFY — list new tools
convex/cad/README.md                           # MODIFY — Phase 2 scope
convex/cad/__tests__/repair-loop-multitool.test.ts   # NEW — drives several patch types
```

---

## Task 1: Extend `applyPatch` for `modify_feature`

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/patch/apply.ts`
- Modify: `artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts`

- [ ] **Step 1: Add failing tests** to `apply.test.ts`:

```ts
it("modify_feature updates fields on an existing feature", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
  };
  const r = applyPatch(parent, {
    kind: "modify_feature",
    featureId: "e",
    changes: { distance: 5 },
  });
  expect(r.schemaViolations).toEqual([]);
  expect((r.ir.features[0] as { distance: number }).distance).toBe(5);
});

it("modify_feature rejects changing the feature kind", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
  };
  const r = applyPatch(parent, {
    kind: "modify_feature",
    featureId: "e",
    changes: { kind: "fillet" } as never,
  });
  expect(r.schemaViolations.length).toBeGreaterThan(0);
});

it("modify_feature targeting a missing id is a no-op that records a violation", () => {
  const r = applyPatch(emptyIr("mm"), {
    kind: "modify_feature", featureId: "missing", changes: { distance: 5 } as never,
  });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
  expect(r.ir.features).toHaveLength(0);
});
```

Run: `npx vitest run convex/cad/patch/__tests__/apply.test.ts`. Expect failures.

- [ ] **Step 2: Extend `applyToCandidate`** in `apply.ts`:

```ts
case "modify_feature": {
  const idx = parent.features.findIndex(f => f.id === patch.featureId);
  if (idx === -1) return parent;  // schemaTier will surface the missing-ref violation
  const existing = parent.features[idx];
  // Reject kind changes — they require remove + add_feature
  if (patch.changes && "kind" in patch.changes && patch.changes.kind !== existing.kind) {
    // Mark as invalid by adding a synthetic feature with mismatched kind so schemaTier rejects
    return {
      ...parent,
      features: [
        ...parent.features.slice(0, idx),
        { ...existing, ...patch.changes } as Feature,
        ...parent.features.slice(idx + 1),
      ],
    };
  }
  return {
    ...parent,
    features: [
      ...parent.features.slice(0, idx),
      { ...existing, ...patch.changes } as Feature,
      ...parent.features.slice(idx + 1),
    ],
  };
}
```

The Zod schema already enforces that a Feature must have one of the six valid kinds, so a kind mismatch will surface as a schema violation. To make Test 2 pass, add a parallel check in `validateSchemaTier`: if the Zod parse of a feature fails, surface a `schema.invalid-feature` violation. (Alternatively, run `CadIrSchema.safeParse(candidate)` inside `applyPatch` after applying — if it fails, push violations.)

The simpler approach: re-run `CadIrSchema.safeParse` in `applyPatch` and surface a `schema.zod-validation` violation per Zod issue. Add this at the top of `applyPatch`, before `validateSchemaTier`:

```ts
import { CadIrSchema } from "../ir/schema";

// inside applyPatch, after applyToCandidate:
const zodResult = CadIrSchema.safeParse(candidate);
if (!zodResult.success) {
  const violations: Violation[] = zodResult.error.issues.map(issue => ({
    ruleId: "schema.zod-validation",
    severity: "error",
    message: `${issue.path.join(".")}: ${issue.message}`,
    agentMessage: `Patch produced invalid IR: ${issue.path.join(".")} ${issue.message}. Fix the patch values.`,
  }));
  return { ir: parent, schemaViolations: violations };
}
```

This makes Test 2 (kind change) pass — Zod's discriminated-union check will reject it.

For Test 3 (missing target id), the candidate is unchanged from parent, so `validateSchemaTier(candidate)` won't produce the `schema.unresolved-feature-ref` because the parent already validated. The cleanest fix: have `modify_feature` push a synthetic violation directly when target is missing:

```ts
case "modify_feature": {
  const idx = parent.features.findIndex(f => f.id === patch.featureId);
  if (idx === -1) {
    // Surface as schema violation; do not modify
    return parent;
  }
  // ...
}
```

Then in `applyPatch`:

```ts
if (patch.kind === "modify_feature") {
  const idx = parent.features.findIndex(f => f.id === patch.featureId);
  if (idx === -1) {
    return {
      ir: parent,
      schemaViolations: [{
        ruleId: "schema.unresolved-feature-ref",
        severity: "error",
        message: `modify_feature target "${patch.featureId}" not found`,
        agentMessage: `No feature with id "${patch.featureId}" exists. Either correct the id or use add_feature.`,
        location: { kind: "feature", id: patch.featureId },
      }],
    };
  }
}
```

Run tests. Expect all 3 new + 4 existing = 7 passing.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): patch applier supports modify_feature with Zod re-validation"
```

---

## Task 2: Extend `applyPatch` for `suppress` / `unsuppress`

- [ ] **Step 1: Failing tests** in `apply.test.ts`:

```ts
it("suppress sets the suppressed flag on a feature", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" }],
  };
  const r = applyPatch(parent, { kind: "suppress", featureId: "e" });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.features[0].suppressed).toBe(true);
});

it("unsuppress clears the suppressed flag", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [{ kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body", suppressed: true }],
  };
  const r = applyPatch(parent, { kind: "unsuppress", featureId: "e" });
  expect(r.ir.features[0].suppressed).toBe(false);
});

it("suppress on a missing feature returns a violation", () => {
  const r = applyPatch(emptyIr("mm"), { kind: "suppress", featureId: "missing" });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
});
```

- [ ] **Step 2: Implement** in `apply.ts`:

```ts
case "suppress":
case "unsuppress": {
  const idx = parent.features.findIndex(f => f.id === patch.featureId);
  if (idx === -1) return parent; // applyPatch wraps and returns violation at the entry guard
  return {
    ...parent,
    features: [
      ...parent.features.slice(0, idx),
      { ...parent.features[idx], suppressed: patch.kind === "suppress" },
      ...parent.features.slice(idx + 1),
    ],
  };
}
```

Add the missing-target guard at `applyPatch` entry (mirror the `modify_feature` handling): if `patch.kind === "suppress" || "unsuppress"` and target not found, return a `schema.unresolved-feature-ref` violation.

Run tests. Expect all pass.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): suppress/unsuppress patches"
```

---

## Task 3: Extend `applyPatch` for `reorder_feature`

- [ ] **Step 1: Failing tests**:

```ts
it("reorder_feature with beforeFeatureId moves a feature earlier", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [
      { kind: "extrude", id: "a", profile: "s", distance: 3, operation: "new_body" },
      { kind: "extrude", id: "b", profile: "s", distance: 3, operation: "new_body" },
      { kind: "extrude", id: "c", profile: "s", distance: 3, operation: "new_body" },
    ],
  };
  const r = applyPatch(parent, { kind: "reorder_feature", featureId: "c", beforeFeatureId: "b" });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.features.map(f => f.id)).toEqual(["a", "c", "b"]);
});

it("reorder_feature with afterFeatureId moves a feature later", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [
      { kind: "extrude", id: "a", profile: "s", distance: 3, operation: "new_body" },
      { kind: "extrude", id: "b", profile: "s", distance: 3, operation: "new_body" },
    ],
  };
  const r = applyPatch(parent, { kind: "reorder_feature", featureId: "a", afterFeatureId: "b" });
  expect(r.ir.features.map(f => f.id)).toEqual(["b", "a"]);
});

it("reorder_feature that creates forward references is rejected", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [
      { kind: "extrude", id: "base", profile: "s", distance: 3, operation: "new_body" },
      { kind: "fillet", id: "f", edges: [{ feature: "base", query: "all" }], radius: 1 },
    ],
  };
  // Move base after fillet — fillet now references a later feature
  const r = applyPatch(parent, { kind: "reorder_feature", featureId: "base", afterFeatureId: "f" });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.forward-feature-ref")).toBe(true);
  // ir reverts to parent
  expect(r.ir.features.map(f => f.id)).toEqual(["base", "f"]);
});
```

- [ ] **Step 2: Implement**:

```ts
case "reorder_feature": {
  const fromIdx = parent.features.findIndex(f => f.id === patch.featureId);
  if (fromIdx === -1) return parent;
  const moved = parent.features[fromIdx];
  const remaining = [...parent.features.slice(0, fromIdx), ...parent.features.slice(fromIdx + 1)];
  let toIdx: number;
  if (patch.beforeFeatureId !== undefined) {
    toIdx = remaining.findIndex(f => f.id === patch.beforeFeatureId);
    if (toIdx === -1) return parent;
  } else if (patch.afterFeatureId !== undefined) {
    const afterIdx = remaining.findIndex(f => f.id === patch.afterFeatureId);
    if (afterIdx === -1) return parent;
    toIdx = afterIdx + 1;
  } else {
    return parent;
  }
  return { ...parent, features: [...remaining.slice(0, toIdx), moved, ...remaining.slice(toIdx)] };
}
```

`validateSchemaTier` (already in place) catches the forward-ref case in Test 3 and rejects.

Add missing-target guard in `applyPatch` entry: if `patch.kind === "reorder_feature"` and either feature is missing, return `schema.unresolved-feature-ref`.

Run tests. Expect 3/3 pass.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): reorder_feature with forward-ref rejection"
```

---

## Task 4: Extend `applyPatch` for `remove`

- [ ] **Step 1: Failing tests**:

```ts
it("remove deletes a parameter", () => {
  const parent: CadIr = { ...emptyIr("mm"), parameters: { x: { id: "x", value: 1 } } };
  const r = applyPatch(parent, { kind: "remove", entityType: "parameter", id: "x" });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.parameters).toEqual({});
});

it("remove deletes a sketch", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
  };
  const r = applyPatch(parent, { kind: "remove", entityType: "sketch", id: "s" });
  expect(r.ir.sketches).toEqual({});
});

it("remove deletes a feature", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [
      { kind: "extrude", id: "e1", profile: "s", distance: 3, operation: "new_body" },
      { kind: "extrude", id: "e2", profile: "s", distance: 3, operation: "new_body" },
    ],
  };
  const r = applyPatch(parent, { kind: "remove", entityType: "feature", id: "e1" });
  expect(r.ir.features.map(f => f.id)).toEqual(["e2"]);
});

it("remove that orphans a reference is rejected", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
    features: [
      { kind: "extrude", id: "base", profile: "s", distance: 3, operation: "new_body" },
      { kind: "fillet", id: "f", edges: [{ feature: "base", query: "all" }], radius: 1 },
    ],
  };
  const r = applyPatch(parent, { kind: "remove", entityType: "feature", id: "base" });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-feature-ref")).toBe(true);
});
```

- [ ] **Step 2: Implement**:

```ts
case "remove": {
  switch (patch.entityType) {
    case "parameter": {
      const { [patch.id]: _, ...rest } = parent.parameters;
      return { ...parent, parameters: rest };
    }
    case "sketch": {
      const { [patch.id]: _, ...rest } = parent.sketches;
      return { ...parent, sketches: rest };
    }
    case "feature":
      return { ...parent, features: parent.features.filter(f => f.id !== patch.id) };
  }
}
```

`validateSchemaTier` catches orphan references (Test 4) — already implemented.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): generic remove patch with orphan-ref rejection"
```

---

## Task 5: Add `add_sketch` patch

The `Patch` union in `types.ts` currently only declares `set_parameter` / `add_feature` / etc. — `add_sketch` is missing. Add it.

- [ ] **Step 1: Extend `types.ts`**:

```ts
import type { SketchDef } from "../ir/types";

export interface AddSketchPatch {
  kind: "add_sketch";
  sketch: SketchDef;
}
```

Add `AddSketchPatch` to the `Patch` union.

- [ ] **Step 2: Failing test** in `apply.test.ts`:

```ts
it("add_sketch creates a new sketch", () => {
  const r = applyPatch(emptyIr("mm"), {
    kind: "add_sketch",
    sketch: {
      id: "base",
      plane: "XY",
      geometry: [{ kind: "rect", id: "outer", center: { x: 0, y: 0 }, width: 100, height: 50 }],
    },
  });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.sketches.base.geometry).toHaveLength(1);
});

it("add_sketch with a duplicate id is rejected", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { dup: { id: "dup", plane: "XY", geometry: [] } },
  };
  const r = applyPatch(parent, {
    kind: "add_sketch",
    sketch: { id: "dup", plane: "XY", geometry: [] },
  });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.duplicate-sketch-id")).toBe(true);
});
```

- [ ] **Step 3: Implement** in `apply.ts` switch:

```ts
case "add_sketch": {
  if (patch.sketch.id in parent.sketches) {
    // Mark with synthetic violation via schemaTier — we'll add a duplicate-sketch-id rule
    return parent;
  }
  return { ...parent, sketches: { ...parent.sketches, [patch.sketch.id]: patch.sketch } };
}
```

- [ ] **Step 4: Add the duplicate-sketch-id rule** in `validateSchemaTier`:

```ts
// inside validateSchemaTier, after duplicate-feature-id check:
const seenSketchIds = new Set<string>();
for (const id of Object.keys(ir.sketches)) {
  if (seenSketchIds.has(id)) {
    out.push(v(
      "schema.duplicate-sketch-id",
      `Sketch id "${id}" is duplicated`,
      `Rename one of the sketches with id "${id}".`,
      { kind: "feature", id },
    ));
  }
  seenSketchIds.add(id);
}
```

Note: since `parent.sketches` is a Record, duplicates can't actually exist in the object — but the *applyPatch* path needs to return a violation when the agent tries to add an existing id. Add the check at applyPatch entry:

```ts
if (patch.kind === "add_sketch" && patch.sketch.id in parent.sketches) {
  return {
    ir: parent,
    schemaViolations: [{
      ruleId: "schema.duplicate-sketch-id",
      severity: "error",
      message: `Sketch "${patch.sketch.id}" already exists.`,
      agentMessage: `Use modify_sketch to edit "${patch.sketch.id}" or pick a different id.`,
    }],
  };
}
```

Run tests. Expect 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/types.ts artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): add_sketch patch with dup-id rejection"
```

---

## Task 6: Add `modify_sketch` patch

Sub-edits inside a sketch: add/remove/modify a SketchEntity.

- [ ] **Step 1: Extend `types.ts`**:

```ts
import type { SketchEntity } from "../ir/types";

export type ModifySketchOp =
  | { op: "add_entity"; entity: SketchEntity }
  | { op: "remove_entity"; entityId: string }
  | { op: "modify_entity"; entityId: string; changes: Partial<SketchEntity> };

export interface ModifySketchPatch {
  kind: "modify_sketch";
  sketchId: string;
  op: ModifySketchOp;
}
```

Add to `Patch` union.

- [ ] **Step 2: Failing tests**:

```ts
it("modify_sketch op:add_entity appends an entity", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [] } },
  };
  const r = applyPatch(parent, {
    kind: "modify_sketch", sketchId: "s",
    op: { op: "add_entity", entity: { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 } },
  });
  expect(r.schemaViolations).toEqual([]);
  expect(r.ir.sketches.s.geometry).toHaveLength(1);
});

it("modify_sketch op:remove_entity removes by id", () => {
  const parent: CadIr = {
    ...emptyIr("mm"),
    sketches: { s: { id: "s", plane: "XY", geometry: [
      { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 },
    ] } },
  };
  const r = applyPatch(parent, {
    kind: "modify_sketch", sketchId: "s",
    op: { op: "remove_entity", entityId: "c1" },
  });
  expect(r.ir.sketches.s.geometry).toEqual([]);
});

it("modify_sketch with missing sketchId returns a violation", () => {
  const r = applyPatch(emptyIr("mm"), {
    kind: "modify_sketch", sketchId: "missing",
    op: { op: "add_entity", entity: { kind: "circle", id: "c1", center: { x: 0, y: 0 }, radius: 5 } },
  });
  expect(r.schemaViolations.some(v => v.ruleId === "schema.unresolved-sketch-ref")).toBe(true);
});
```

- [ ] **Step 3: Implement**:

```ts
case "modify_sketch": {
  const sketch = parent.sketches[patch.sketchId];
  if (!sketch) return parent;
  let geometry = sketch.geometry;
  switch (patch.op.op) {
    case "add_entity":
      geometry = [...geometry, patch.op.entity];
      break;
    case "remove_entity":
      geometry = geometry.filter(g => g.id !== patch.op.entityId);
      break;
    case "modify_entity":
      geometry = geometry.map(g =>
        g.id === patch.op.entityId
          ? ({ ...g, ...patch.op.changes } as SketchEntity)
          : g
      );
      break;
  }
  return {
    ...parent,
    sketches: { ...parent.sketches, [patch.sketchId]: { ...sketch, geometry } },
  };
}
```

Add missing-sketch-ref guard at `applyPatch` entry similar to other handlers.

Run tests. Expect 3/3 pass.

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/types.ts artifacts/hardwareai/convex/cad/patch/apply.ts artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
git commit -m "feat(cad-ir): modify_sketch with add/remove/modify entity ops"
```

---

## Task 7: Add Anthropic tool defs for all new patches

- [ ] **Step 1: Extend `tools.ts`** — add 6 new `AgentTool` entries: `modify_feature`, `suppress`, `unsuppress`, `reorder_feature`, `remove`, `add_sketch`, `modify_sketch`.

For each, build a tight JSON-Schema `input_schema`. Concrete shapes:

```ts
const modifyFeature: AgentTool = {
  name: "modify_feature",
  description: "Update one or more fields on an existing feature in the timeline. Cannot change the feature kind — use remove + add_feature for that.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN },
      changes: { type: "object", description: "Partial feature object; provide only fields to change." },
    },
    required: ["featureId", "changes"],
  },
};

const suppress: AgentTool = {
  name: "suppress",
  description: "Suppress (disable without deleting) an existing feature. Use unsuppress to re-enable.",
  input_schema: {
    type: "object",
    properties: { featureId: { type: "string", pattern: SNAKE_PATTERN } },
    required: ["featureId"],
  },
};

const unsuppress: AgentTool = {
  name: "unsuppress",
  description: "Re-enable a previously suppressed feature.",
  input_schema: {
    type: "object",
    properties: { featureId: { type: "string", pattern: SNAKE_PATTERN } },
    required: ["featureId"],
  },
};

const reorderFeature: AgentTool = {
  name: "reorder_feature",
  description: "Move a feature in the timeline. Provide either beforeFeatureId or afterFeatureId.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN },
      beforeFeatureId: { type: "string", pattern: SNAKE_PATTERN },
      afterFeatureId: { type: "string", pattern: SNAKE_PATTERN },
    },
    required: ["featureId"],
  },
};

const remove: AgentTool = {
  name: "remove",
  description: "Remove an entity by id. entityType is one of parameter | sketch | feature.",
  input_schema: {
    type: "object",
    properties: {
      entityType: { enum: ["parameter", "sketch", "feature"] },
      id: { type: "string", pattern: SNAKE_PATTERN },
    },
    required: ["entityType", "id"],
  },
};

const addSketch: AgentTool = {
  name: "add_sketch",
  description: "Define a new sketch (plane + entities) with a snake_case id.",
  input_schema: {
    type: "object",
    properties: {
      sketch: {
        type: "object",
        properties: {
          id: { type: "string", pattern: SNAKE_PATTERN },
          plane: {
            oneOf: [
              { enum: ["XY", "XZ", "YZ"] },
              { type: "object", properties: { face: { type: "string" } }, required: ["face"] },
            ],
          },
          geometry: {
            type: "array",
            items: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    kind: { const: "rect" },
                    id: { type: "string", pattern: SNAKE_PATTERN },
                    center: { type: "object", properties: { x: { oneOf: [{ type: "number" }, { type: "string" }] }, y: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["x", "y"] },
                    width: { oneOf: [{ type: "number" }, { type: "string" }] },
                    height: { oneOf: [{ type: "number" }, { type: "string" }] },
                    cornerRadius: { oneOf: [{ type: "number" }, { type: "string" }] },
                  },
                  required: ["kind", "id", "center", "width", "height"],
                },
                {
                  type: "object",
                  properties: {
                    kind: { const: "circle" },
                    id: { type: "string", pattern: SNAKE_PATTERN },
                    center: { type: "object", properties: { x: { oneOf: [{ type: "number" }, { type: "string" }] }, y: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["x", "y"] },
                    radius: { oneOf: [{ type: "number" }, { type: "string" }] },
                  },
                  required: ["kind", "id", "center", "radius"],
                },
                {
                  type: "object",
                  properties: {
                    kind: { const: "line" },
                    id: { type: "string", pattern: SNAKE_PATTERN },
                    p1: { type: "object", properties: { x: { oneOf: [{ type: "number" }, { type: "string" }] }, y: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["x", "y"] },
                    p2: { type: "object", properties: { x: { oneOf: [{ type: "number" }, { type: "string" }] }, y: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["x", "y"] },
                  },
                  required: ["kind", "id", "p1", "p2"],
                },
              ],
            },
          },
        },
        required: ["id", "plane", "geometry"],
      },
    },
    required: ["sketch"],
  },
};

const modifySketch: AgentTool = {
  name: "modify_sketch",
  description: "Edit an existing sketch — add/remove/modify a single entity inside it.",
  input_schema: {
    type: "object",
    properties: {
      sketchId: { type: "string", pattern: SNAKE_PATTERN },
      op: {
        oneOf: [
          { type: "object", properties: { op: { const: "add_entity" }, entity: { type: "object" } }, required: ["op", "entity"] },
          { type: "object", properties: { op: { const: "remove_entity" }, entityId: { type: "string", pattern: SNAKE_PATTERN } }, required: ["op", "entityId"] },
          { type: "object", properties: { op: { const: "modify_entity" }, entityId: { type: "string", pattern: SNAKE_PATTERN }, changes: { type: "object" } }, required: ["op", "entityId", "changes"] },
        ],
      },
    },
    required: ["sketchId", "op"],
  },
};
```

Update the export:

```ts
export const CAD_IR_TOOLS: AgentTool[] = [
  setParameter, addFeature,
  modifyFeature, suppress, unsuppress, reorderFeature, remove,
  addSketch, modifySketch,
];
```

- [ ] **Step 2: Update tools test** in `tools.test.ts`:

```ts
it("exports all 9 patch tool families", () => {
  const names = CAD_IR_TOOLS.map(t => t.name).sort();
  expect(names).toEqual([
    "add_feature", "add_sketch",
    "modify_feature", "modify_sketch",
    "remove", "reorder_feature",
    "set_parameter", "suppress", "unsuppress",
  ]);
});
```

(Replace the older "exports set_parameter and add_feature" test or extend it.)

Run tests. Expect green.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
git commit -m "feat(cad-ir): Anthropic tool defs for all 9 patch families"
```

---

## Task 8: Update specialist `toolCallToPatch` for new tools

The `convex/specialists/cadIr.ts` from Phase 1 has a `toolCallToPatch` helper that maps tool calls to typed `Patch` objects. Currently it only handles `set_parameter` and `add_feature`. Extend it to handle the 7 new tool names.

- [ ] **Step 1: Extend** the function:

```ts
function toolCallToPatch(tool: { name: string; input: Record<string, unknown> }): Patch | null {
  switch (tool.name) {
    case "set_parameter":
      return { kind: "set_parameter", param: tool.input as never };
    case "add_feature":
      return { kind: "add_feature", feature: (tool.input as { feature: unknown }).feature as never };
    case "modify_feature":
      return {
        kind: "modify_feature",
        featureId: (tool.input as { featureId: string }).featureId,
        changes: (tool.input as { changes: never }).changes,
      };
    case "suppress":
    case "unsuppress":
      return { kind: tool.name, featureId: (tool.input as { featureId: string }).featureId };
    case "reorder_feature":
      return {
        kind: "reorder_feature",
        featureId: (tool.input as { featureId: string }).featureId,
        beforeFeatureId: (tool.input as { beforeFeatureId?: string }).beforeFeatureId,
        afterFeatureId: (tool.input as { afterFeatureId?: string }).afterFeatureId,
      };
    case "remove":
      return {
        kind: "remove",
        entityType: (tool.input as { entityType: never }).entityType,
        id: (tool.input as { id: string }).id,
      };
    case "add_sketch":
      return { kind: "add_sketch", sketch: (tool.input as { sketch: never }).sketch };
    case "modify_sketch":
      return {
        kind: "modify_sketch",
        sketchId: (tool.input as { sketchId: string }).sketchId,
        op: (tool.input as { op: never }).op,
      };
    default:
      return null;
  }
}
```

- [ ] **Step 2: Verify** no TS errors:

```bash
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "specialists/cadIr" | head
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/specialists/cadIr.ts
git commit -m "feat(cad-ir): specialist routes all 9 patch tool families"
```

---

## Task 9: Update system prompt to mention new tools

- [ ] **Step 1: Edit `convex/cad/prompts.ts`** to enumerate all 9 tools and brief usage hints.

```ts
export const cadIrSystemPromptFragment = `
You are designing a parametric mechanical part using a structured CAD IR.

You MUST work through patch tools. Never emit JSON directly; always call a tool.

Available patch tools:
- set_parameter: add or change one parameter (literal number or expression string)
- add_feature: append a typed feature to the timeline
- modify_feature: update fields on an existing feature (cannot change kind)
- suppress / unsuppress: toggle a feature without deleting it
- reorder_feature: move a feature earlier or later in the timeline
- remove: delete a parameter, sketch, or feature by id
- add_sketch: define a new sketch (plane + geometry entities)
- modify_sketch: add/remove/modify an entity inside an existing sketch

Editing strategy:
- Prefer set_parameter for dimensional changes — features that reference the parameter rebuild automatically.
- Prefer modify_feature over remove + add_feature when only field values change.
- Use suppress to test variations without losing the feature definition.
- Reorder when a constraint requires a different timeline order (fillet must come after extrude, etc.).

Rules:
- All ids are snake_case (a-z, 0-9, _; ≤ 32 chars).
- Parameters can reference each other by name in expressions, e.g. "length / 2 - 8".
- Order matters: a fillet/chamfer/hole must reference a feature defined earlier.
- Reference faces and edges symbolically:
    face: { feature: "<id>", tag: "top" | "bottom" | "north" | "south" | "east" | "west" }
    edges: [{ feature: "<id>", query: "all" | "top_loop" | "bottom_loop" }]
- Default units are millimeters unless told otherwise.
- Default minimum hole edge distance is 1.5 × hole diameter.
- Default minimum wall thickness is 2 mm.
- Avoid zero-thickness geometry.

If a validation report says a feature failed, propose ONE patch (the smallest possible)
to fix it. Prefer set_parameter or modify_feature over rewriting features.
`;
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/prompts.ts
git commit -m "feat(cad-ir): system prompt enumerates all 9 patch tools + edit-strategy hints"
```

---

## Task 10: Port additional manufacturing rules

Phase 1 ships only `mfg.hole-edge-distance`. Port three more from `lib/scsRules.ts`:
- `mfg.min-wall-thickness` — fail when any sheet of geometry has a min dimension below `2 mm` (default; override via `minWallThickness` in plugin config later)
- `mfg.min-bend-radius` — for now, a stub since bend features arrive in Phase 3; create the rule file and emit only when a synthetic `bend` feature appears (skip otherwise)
- `mfg.bolt-clearance` — when two holes share the same diameter and are within bolt-stack reach, assume bolt assembly and warn if either is closer than `1.5 × diameter` to a bend or part edge

For Phase 2, do **only** `min-wall-thickness` (a rule that's actually exercisable on Phase 1 features). Defer the others to Phase 3 with placeholder rule files that return `[]`.

### Task 10a: Refactor manufacturingTier into rules/

- [ ] **Step 1**: Create `convex/cad/validate/rules/holeEdgeDistance.ts` containing the existing logic. Export as a function `holeEdgeDistance(ir: ResolvedIr): Violation[]`.
- [ ] **Step 2**: Create `convex/cad/validate/rules/minWallThickness.ts`:

```ts
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";

const DEFAULT_MIN_WALL = 2; // mm

export function minWallThickness(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];
  for (const f of ir.features) {
    if (f.kind === "extrude" && f.distance < DEFAULT_MIN_WALL) {
      out.push({
        ruleId: "mfg.min-wall-thickness",
        severity: "error",
        message: `Extrude "${f.id}" thickness ${f.distance}mm is below the ${DEFAULT_MIN_WALL}mm minimum wall thickness.`,
        agentMessage: `Increase the extrude distance for "${f.id}" to at least ${DEFAULT_MIN_WALL}mm, or change the parameter that drives it.`,
        location: { kind: "feature", id: f.id },
      });
    }
  }
  return out;
}
```

- [ ] **Step 3**: Update `convex/cad/validate/manufacturingTier.ts` to compose:

```ts
import type { ResolvedIr } from "../resolve/resolveIr";
import type { Violation } from "../../plugins/types";
import { holeEdgeDistance } from "./rules/holeEdgeDistance";
import { minWallThickness } from "./rules/minWallThickness";

export function validateManufacturingTier(ir: ResolvedIr): Violation[] {
  return [
    ...holeEdgeDistance(ir),
    ...minWallThickness(ir),
  ];
}
```

- [ ] **Step 4: Add tests** for `minWallThickness`:

```ts
// convex/cad/validate/__tests__/rules-minWallThickness.test.ts
import { describe, expect, it } from "vitest";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";
import { minWallThickness } from "../rules/minWallThickness";

describe("minWallThickness", () => {
  it("flags an extrude under 2mm", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 50, height: 30 }] } },
      features: [{ kind: "extrude" as const, id: "thin", profile: "s", distance: 1.5, operation: "new_body" as const }],
    };
    const v = minWallThickness(resolveIr(ir));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("mfg.min-wall-thickness");
  });

  it("passes for an extrude at or above 2mm", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 50, height: 30 }] } },
      features: [{ kind: "extrude" as const, id: "ok", profile: "s", distance: 3, operation: "new_body" as const }],
    };
    expect(minWallThickness(resolveIr(ir))).toEqual([]);
  });
});
```

- [ ] **Step 5**: Verify the existing `manufacturingTier.test.ts` still passes (it calls `validateManufacturingTier`, which now composes both rules — the original test only exercised hole-edge-distance and should still pass since no extrude in the test is under 2mm).

Run tests. Expect existing 145 + 2 new = 147+. Specifically, the cad/validate suite should grow.

- [ ] **Step 6: Commit**

```bash
git add artifacts/hardwareai/convex/cad/validate/rules/ artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/rules-minWallThickness.test.ts
git commit -m "feat(cad-ir): refactor mfg tier into rules/; add min-wall-thickness rule"
```

---

## Task 11: Multi-tool repair-loop mock test

Verify the speed/understanding thesis: a fake agent driving multiple patch types converges in fewer turns than one limited to add_feature.

- [ ] **Step 1: Write** `convex/cad/__tests__/repair-loop-multitool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch/apply";
import { resolveIr } from "../resolve/resolveIr";
import { validateSchemaTier } from "../validate/schemaTier";
import { validateManufacturingTier } from "../validate/manufacturingTier";
import { emptyIr } from "../ir/empty";
import type { CadIr } from "../ir/types";
import type { Patch } from "../patch/types";

function multitoolFakeAgent(violations: { ruleId: string }[]): Patch[] {
  // The agent uses different tools for different problems.
  if (violations.some(v => v.ruleId === "mfg.hole-edge-distance")) {
    return [{ kind: "set_parameter", param: { id: "length", value: 130 } }];
  }
  if (violations.some(v => v.ruleId === "mfg.min-wall-thickness")) {
    return [{ kind: "modify_feature", featureId: "base", changes: { distance: 3 } as never }];
  }
  return [];
}

describe("CAD IR multitool repair loop", () => {
  it("fixes a chain of issues using set_parameter then modify_feature", () => {
    let ir: CadIr = {
      ...emptyIr("mm"),
      parameters: {
        length: { id: "length", value: 50 },
        width: { id: "width", value: 30 },
      },
      sketches: { s: { id: "s", plane: "XY", geometry: [{ kind: "rect", id: "o", center: { x: 0, y: 0 }, width: "length", height: "width" }] } },
      features: [
        { kind: "extrude", id: "base", profile: "s", distance: 1.5, operation: "new_body" }, // too thin
        { kind: "hole", id: "h", type: "simple", face: { feature: "base", tag: "top" }, positions: [{ x: 24, y: 0 }], diameter: 6 }, // too close to edge
      ],
    };

    let violations = [...validateSchemaTier(ir), ...validateManufacturingTier(resolveIr(ir))];
    const initialIssues = new Set(violations.map(v => v.ruleId));
    expect(initialIssues.has("mfg.hole-edge-distance")).toBe(true);
    expect(initialIssues.has("mfg.min-wall-thickness")).toBe(true);

    let turn = 0;
    while (turn < 4 && violations.length > 0) {
      for (const patch of multitoolFakeAgent(violations)) {
        const r = applyPatch(ir, patch);
        if (r.schemaViolations.length === 0) ir = r.ir;
      }
      violations = [...validateSchemaTier(ir), ...validateManufacturingTier(resolveIr(ir))];
      turn++;
    }

    expect(violations).toEqual([]);
    expect(turn).toBeLessThanOrEqual(2); // 1 turn fixes hole-edge, next fixes wall thickness
    expect(ir.parameters.length.value).toBe(130);
    expect((ir.features[0] as { distance: number }).distance).toBe(3);
  });
});
```

Run. Expect PASS.

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/__tests__/repair-loop-multitool.test.ts
git commit -m "test(cad-ir): multitool repair loop uses set_parameter + modify_feature"
```

---

## Task 12: README update + plugin test refresh

- [ ] **Step 1: Update `convex/cad/README.md`** Phase 1 → Phase 2 sections:

Phase 2 shipped:
- 7 additional patch tools (modify_feature, suppress, unsuppress, reorder_feature, remove, add_sketch, modify_sketch)
- Manufacturing rules refactored into per-rule files; min-wall-thickness rule added
- Multi-tool repair-loop mock test confirms agent converges in ≤ 2 turns on a 2-issue IR

Phase 3+ remains:
- Hardware features (countersink, threaded, bend-flange)
- Sketch constraint solver (Tier 2)
- Assembly graph + URDF/MJCF (Phase 4)
- FEA / cost / BOM compilers (Phase 5+)

- [ ] **Step 2: Update `convex/cad/__tests__/plugin.test.ts`** if the existing test asserts only 2 tool names — change to assert 9.

- [ ] **Step 3: Final test sweep**:

```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
```

Expect:
- ~165 tests passing (151 baseline + 3 modify_feature + 3 suppress/unsuppress + 3 reorder + 4 remove + 2 add_sketch + 3 modify_sketch + 2 minWallThickness + 1 multitool ≈ 14 new — wait, 151 + 18 = 169. Adjust expectation; the actual count is what tests report)
- TS errors ≤ 38
- Convex push clean

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/cad/README.md artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts
git commit -m "docs(cad-ir): Phase 2 README + plugin test refresh"
```

---

## Phase 2 success criteria

| Criterion | How verified |
|---|---|
| All 9 patch tools defined and routable | Task 7 + Task 8 |
| Each new patch type has applier + test | Tasks 1–6 |
| Schema-tier rejects orphan refs / dup ids | Tasks 4, 5 |
| Multi-tool repair loop converges < add_feature-only baseline | Task 11 |
| Manufacturing tier composes from per-rule files | Task 10 |
| All Phase 1 tests still pass | Task 12 final sweep |
| TS error baseline ≤ 38 | Task 12 final sweep |

---

## Out of scope for Phase 2 (deferred)

- Sketch constraint solver (Tier 2) — Phase 3
- Hardware features (countersink, counterbore, threaded, bend-flange, weld-tab) — Phase 3
- Assembly graph + joints + URDF/MJCF compiler — Phase 4
- FEA, cost, BOM compilers — Phase 5
- Frontend revision/timeline UI — Phase 5
- Multi-revision branching — Phase 5
- Live e2e against real Vercel Sandbox + cassette-recorded Anthropic — Phase 5
