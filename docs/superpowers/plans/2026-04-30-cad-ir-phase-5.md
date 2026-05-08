# CAD IR Phase 5 — Round-out features + multi-part codegen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add three high-leverage feature kinds to the CAD IR — `revolve`, `shell`, `bend_flange` — and extend the build123d codegen so a multi-part assembly produces one Python script per part. This pairs with Phase 4's URDF compiler: every part in the assembly graph now has a STEP/STL/glTF pipeline alongside the URDF.

**Why this slice:** Phase 4 introduced the assembly graph but `compileToBuild123d` still produces a single-part script. Without per-part codegen, the assembly is structurally complete but geometrically empty. Adding three more feature kinds also rounds out the IR's expressiveness for common hardware: revolve handles cylindrical parts (axles, hubs, rivets), shell hollows out enclosures, and bend_flange unblocks sheet-metal forming with the min-bend-radius rule that was deferred from Phase 2.

**Architecture:** Same three-layer model. New `compileAssembly` entry point reads `ir.parts` and dispatches `compileToBuild123d` per part, returning a `Record<PartId, string>` of scripts. Single-part call sites stay unchanged.

**Spec:** [`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`](../specs/2026-04-29-cad-ir-backbone-design.md)
**Builds on:** Phase 4 tip `73842b8`. Worktree at `~/fabware-cad-ir-phase-5/` on branch `feat/cad-ir-phase-5`.

---

## Prerequisites

- Phase 4 complete (220/220 tests).
- New worktree at `~/fabware-cad-ir-phase-5/` on branch `feat/cad-ir-phase-5`.

---

## File Structure

```
convex/cad/ir/
├── types.ts             # MODIFY — add RevolveFeature, ShellFeature, BendFlangeFeature
└── schema.ts            # MODIFY — Zod schemas for new features

convex/cad/codegen/
├── compileToBuild123d.ts          # MODIFY — keep single-part API
├── compileAssembly.ts             # NEW — compileAssembly(ir): Record<PartId, string>
├── emitFeature.ts                 # MODIFY — add revolve/shell/bend_flange dispatch
└── features/
    ├── revolve.ts                 # NEW
    ├── shell.ts                   # NEW
    └── bendFlange.ts              # NEW

convex/cad/codegen/__tests__/
├── compile-revolve.test.ts        # NEW
├── compile-shell.test.ts          # NEW
├── compile-bendFlange.test.ts     # NEW
└── compile-assembly.test.ts       # NEW

convex/cad/validate/rules/
└── minBendRadius.ts               # NEW

convex/cad/validate/__tests__/rules-minBendRadius.test.ts  # NEW

convex/cad/validate/manufacturingTier.ts  # MODIFY — compose minBendRadius

convex/cad/patch/tools.ts          # MODIFY — extend add_feature with new kinds
convex/cad/prompts.ts              # MODIFY
convex/cad/README.md               # MODIFY
```

---

## Task 1: Revolve feature type + schema

**Files:** `convex/cad/ir/types.ts`, `convex/cad/ir/schema.ts`, `convex/cad/ir/__tests__/schema.test.ts`

- [ ] **Step 1**: Append type to `types.ts`:

```ts
export interface RevolveFeature extends BaseFeature {
  kind: "revolve";
  profile: SketchId;
  axis: { kind: "world"; axis: "x" | "y" | "z" };
  angle: ParamRef;        // degrees, e.g. 360 for a full revolve
  operation: "new_body" | "add" | "cut" | "intersect";
}
```

Add `RevolveFeature` to the `Feature` union.

- [ ] **Step 2**: Add Zod in `schema.ts`:

```ts
const RevolveFeatureSchema = z.object({
  ...Base, kind: z.literal("revolve"),
  profile: Snake,
  axis: z.object({ kind: z.literal("world"), axis: z.enum(["x", "y", "z"]) }),
  angle: ParamRef,
  operation: z.enum(["new_body", "add", "cut", "intersect"]),
});
```

Add to the `FeatureSchema` discriminated union.

- [ ] **Step 3**: Add test:

```ts
it("accepts a revolve feature with world axis and 360 degrees", () => {
  const ir = {
    schemaVersion: 1 as const, units: "mm" as const,
    parameters: {}, sketches: { p: { id: "p", plane: "XY" as const, geometry: [] } },
    features: [{ kind: "revolve", id: "spin", profile: "p", axis: { kind: "world", axis: "z" }, angle: 360, operation: "new_body" }],
  };
  expect(() => CadIrSchema.parse(ir)).not.toThrow();
});
```

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/
git commit -m "feat(cad-ir): RevolveFeature type + schema"
```

---

## Task 2: Revolve codegen

**Files:** `convex/cad/codegen/features/revolve.ts`, `compile-revolve.test.ts`, `emitFeature.ts`

- [ ] **Step 1**: Failing test:

```ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — revolve", () => {
  it("emits build123d revolve() with axis and angle", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { angle: { id: "angle", value: 360 } },
      sketches: { profile: { id: "profile", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "p", center: { x: 5, y: 0 }, width: 4, height: 2 }] } },
      features: [{ kind: "revolve" as const, id: "axle", profile: "profile", axis: { kind: "world" as const, axis: "y" as const }, angle: "angle", operation: "new_body" as const }],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("with BuildPart() as axle:");
    expect(py).toContain("Rectangle(4, 2)");
    expect(py).toMatch(/revolve\(axis=Axis\.Y, revolution_arc=angle\)/);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/codegen/features/revolve.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitRevolve(
  f: Extract<ResolvedIr["features"][number], { kind: "revolve" }>,
  ir: ResolvedIr,
): string[] {
  const sketch = ir.sketches[f.profile];
  if (!sketch) return [`# error: missing sketch ${f.profile}`];

  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };

  const lines = [`with BuildPart() as ${f.id}:`];
  lines.push(`    with BuildSketch():`);
  for (const g of sketch.geometry) {
    if (g.kind === "rect") {
      lines.push(`        Rectangle(${refOrLit(g.width)}, ${refOrLit(g.height)})`);
    } else if (g.kind === "circle") {
      lines.push(`        Circle(${refOrLit(g.radius)})`);
    }
  }
  const axisMap = { x: "Axis.X", y: "Axis.Y", z: "Axis.Z" };
  lines.push(`    revolve(axis=${axisMap[f.axis.axis]}, revolution_arc=${refOrLit(f.angle as number)})`);
  lines.push(`report_entities("${f.id}", ${f.id})`);
  return lines;
}
```

Add `case "revolve": return { lines: emitRevolve(f, ir), ctxOut: { parentBodyId: f.id } };` to `emitFeature.ts`. Import.

- [ ] **Step 3**: Run vitest, expect pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/codegen/features/revolve.ts artifacts/hardwareai/convex/cad/codegen/emitFeature.ts artifacts/hardwareai/convex/cad/codegen/__tests__/compile-revolve.test.ts
git commit -m "feat(cad-ir): codegen revolve feature (build123d revolve)"
```

---

## Task 3: Shell feature type + schema

- [ ] **Step 1**: Append type:

```ts
export interface ShellFeature extends BaseFeature {
  kind: "shell";
  thickness: ParamRef;
  /** Faces to remove (open) — typically the "top" of an enclosure. */
  removedFaces: FaceRef[];
}
```

Add to `Feature` union.

- [ ] **Step 2**: Add Zod:
```ts
const ShellFeatureSchema = z.object({
  ...Base, kind: z.literal("shell"),
  thickness: ParamRef,
  removedFaces: z.array(FaceRef).min(1),
});
```

Add to `FeatureSchema` union.

- [ ] **Step 3**: Schema test:
```ts
it("accepts a shell feature with one removed face", () => {
  const ir = {
    schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
    features: [
      { kind: "extrude", id: "box", profile: "x" as const, distance: 10, operation: "new_body" },
      { kind: "shell", id: "hollow", thickness: 2, removedFaces: [{ feature: "box", tag: "top" }] },
    ],
  };
  // The extrude has profile="x" without sketch — this will fail other checks but Zod alone passes
  // Just check the shell field shape
  expect(() => CadIrSchema.parse({ ...ir, sketches: { x: { id: "x", plane: "XY", geometry: [] } } })).not.toThrow();
});
```

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/
git commit -m "feat(cad-ir): ShellFeature type + schema"
```

---

## Task 4: Shell codegen

- [ ] **Step 1**: Failing test:

```ts
it("emits offset_3d() inside the parent body for shell", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: { wall: { id: "wall", value: 2 } },
    sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 50, height: 30 }] } },
    features: [
      { kind: "extrude" as const, id: "box", profile: "p", distance: 10, operation: "new_body" as const },
      { kind: "shell" as const, id: "hollow", thickness: "wall", removedFaces: [{ feature: "box", tag: "top" }] },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toContain("with box:");
  expect(py).toMatch(/offset\(amount=-wall, openings=box\.faces\(\)\.sort_by\(Axis\.Z\)\[-1\]\)/);
});
```

- [ ] **Step 2**: Implement `convex/cad/codegen/features/shell.ts`:

```ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitShell(
  f: Extract<ResolvedIr["features"][number], { kind: "shell" }>,
  ir: ResolvedIr,
  parentBodyId: string | null,
): string[] {
  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };

  const lines: string[] = [];
  // Phase 5: shell uses the most recently extruded body as its target.
  const target = parentBodyId ?? f.removedFaces[0].feature;
  lines.push(`with ${target}:`);
  // Build the openings expression: each removed face becomes a face query.
  // Phase 5 supports tag values "top" | "bottom" — handles only the first removedFace.
  const face = f.removedFaces[0];
  let faceExpr: string;
  if (face.tag === "top") {
    faceExpr = `${face.feature}.faces().sort_by(Axis.Z)[-1]`;
  } else if (face.tag === "bottom") {
    faceExpr = `${face.feature}.faces().sort_by(Axis.Z)[0]`;
  } else {
    faceExpr = `${face.feature}.faces().sort_by(Axis.Z)[-1]  # TODO: face tag "${face.tag}"`;
  }
  lines.push(`    offset(amount=-${refOrLit(f.thickness as number)}, openings=${faceExpr})`);
  lines.push(`report_entities("${f.id}", ${target})`);
  return lines;
}
```

Add to `emitFeature.ts`:
```ts
case "shell":
  return { lines: emitShell(f, ir, ctx.parentBodyId), ctxOut: ctx };
```

- [ ] **Step 3**: Run vitest, expect pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): codegen shell feature (build123d offset)"
```

---

## Task 5: Bend-flange feature type + schema + min-bend-radius rule

**Files:** types.ts, schema.ts, codegen/features/bendFlange.ts, validate/rules/minBendRadius.ts, three test files.

- [ ] **Step 1**: Type:

```ts
export interface BendFlangeFeature extends BaseFeature {
  kind: "bend_flange";
  /** The face whose edge gets the flange. */
  face: FaceRef;
  /** Length of the flange perpendicular to the bend. */
  length: ParamRef;
  /** Bend radius (inside). */
  radius: ParamRef;
  /** Bend angle in degrees, typical 90. */
  angle: ParamRef;
  /** Material thickness — used by min-bend-radius rule. */
  thickness: ParamRef;
}
```

Add to `Feature` union.

- [ ] **Step 2**: Zod:
```ts
const BendFlangeFeatureSchema = z.object({
  ...Base, kind: z.literal("bend_flange"),
  face: FaceRef,
  length: ParamRef,
  radius: ParamRef,
  angle: ParamRef,
  thickness: ParamRef,
});
```

Add to `FeatureSchema` union.

- [ ] **Step 3**: Min-bend-radius rule + test:

```ts
// convex/cad/validate/rules/minBendRadius.ts
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";

// Industry rule of thumb: minimum inside bend radius >= material thickness.
export function minBendRadius(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];
  for (const f of ir.features) {
    if (f.kind !== "bend_flange") continue;
    const t = f.thickness as number;
    const r = f.radius as number;
    if (r < t) {
      out.push({
        ruleId: "mfg.min-bend-radius",
        severity: "error",
        message: `Bend "${f.id}" radius ${r}mm is below the ${t}mm material thickness; this will crack on bend.`,
        agentMessage: `Increase the bend radius for "${f.id}" to at least the material thickness (${t}mm), or thin the material.`,
        location: { kind: "bend", id: f.id },
      });
    }
  }
  return out;
}
```

Test:
```ts
it("flags a bend whose radius is below material thickness", () => {
  const ir = {
    ...emptyIr("mm"),
    sketches: { p: { id: "p", plane: "XY" as const, geometry: [] } },
    features: [{ kind: "bend_flange" as const, id: "b1", face: { feature: "any", tag: "top" }, length: 20, radius: 1, angle: 90, thickness: 3 }],
  };
  const v = minBendRadius(resolveIr(ir));
  expect(v).toHaveLength(1);
  expect(v[0].ruleId).toBe("mfg.min-bend-radius");
});
```

Compose into `manufacturingTier.ts`:
```ts
import { minBendRadius } from "./rules/minBendRadius";
// ...
return [
  ...holeEdgeDistance(ir),
  ...minWallThickness(ir),
  ...boltClearance(ir),
  ...minBendRadius(ir),
];
```

- [ ] **Step 4**: Codegen — bend_flange in build123d is non-trivial (requires the sheet-metal extension or manual construction). For Phase 5, emit a comment placeholder + a basic offset that adds material at the right place; document as approximate.

```ts
// convex/cad/codegen/features/bendFlange.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitBendFlange(
  f: Extract<ResolvedIr["features"][number], { kind: "bend_flange" }>,
  ir: ResolvedIr,
): string[] {
  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };
  return [
    `# bend_flange ${f.id}: face=${f.face.feature}.${f.face.tag} length=${f.length} radius=${f.radius} angle=${f.angle} thickness=${f.thickness}`,
    `# Phase 5: full sheet-metal bend rendering deferred; this is a placeholder.`,
    `with ${f.face.feature}:`,
    `    pass  # TODO: build123d sheet_metal extension; bend approximation`,
    `report_entities("${f.id}", ${f.face.feature})`,
  ];
}
```

Add to `emitFeature.ts` switch.

- [ ] **Step 5**: Codegen test:

```ts
it("emits a comment + placeholder for bend_flange (Phase 5)", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: {},
    sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 50 }] } },
    features: [
      { kind: "extrude" as const, id: "base", profile: "p", distance: 3, operation: "new_body" as const },
      { kind: "bend_flange" as const, id: "lip", face: { feature: "base", tag: "top" }, length: 20, radius: 3, angle: 90, thickness: 3 },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toContain("# bend_flange lip");
  expect(py).toContain("Phase 5: full sheet-metal bend rendering deferred");
});
```

- [ ] **Step 6**: Commit (single commit grouping the bend-flange work):
```bash
git add artifacts/hardwareai/convex/cad/ir/ artifacts/hardwareai/convex/cad/codegen/ artifacts/hardwareai/convex/cad/validate/
git commit -m "feat(cad-ir): bend_flange feature + min-bend-radius rule (codegen is placeholder)"
```

---

## Task 6: Multi-part build123d codegen (`compileAssembly`)

**Files:** `convex/cad/codegen/compileAssembly.ts`, `compile-assembly.test.ts`

- [ ] **Step 1**: Failing test:

```ts
import { describe, expect, it } from "vitest";
import { compileAssembly } from "../compileAssembly";
import { emptyIr } from "../../ir/empty";

describe("compileAssembly", () => {
  it("returns one Python script per part in the assembly", () => {
    const partIr = {
      ...emptyIr("mm"),
      parameters: { len: { id: "len", value: 100 } },
      sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: "len", height: 30 }] } },
      features: [{ kind: "extrude" as const, id: "b", profile: "p", distance: 3, operation: "new_body" as const }],
    };
    const ir = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: partIr },
        lid: { id: "lid", ir: partIr },
      },
    };
    const scripts = compileAssembly(ir);
    expect(Object.keys(scripts).sort()).toEqual(["body", "lid"]);
    expect(scripts.body).toContain("with BuildPart() as b:");
    expect(scripts.lid).toContain("with BuildPart() as b:");
  });

  it("returns empty record for a single-part IR with no parts field", () => {
    expect(compileAssembly(emptyIr("mm"))).toEqual({});
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/codegen/compileAssembly.ts
import type { CadIr } from "../ir/types";
import { resolveIr } from "../resolve/resolveIr";
import { compileToBuild123d } from "./compileToBuild123d";

export function compileAssembly(ir: CadIr): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ir.parts) return out;
  for (const [partId, part] of Object.entries(ir.parts)) {
    out[partId] = compileToBuild123d(resolveIr(part.ir));
  }
  return out;
}
```

- [ ] **Step 3**: Run vitest, expect 2/2 pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/codegen/compileAssembly.ts artifacts/hardwareai/convex/cad/codegen/__tests__/compile-assembly.test.ts
git commit -m "feat(cad-ir): compileAssembly — per-part build123d scripts"
```

---

## Task 7: Update tools, prompts, plugin tests

- [ ] **Step 1**: Extend `add_feature` tool schema in `tools.ts` with three new entries (revolve, shell, bend_flange):

```ts
// inside add_feature input_schema's feature.oneOf array, append:
{
  type: "object",
  properties: {
    kind: { const: "revolve" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    profile: { type: "string", pattern: SNAKE_PATTERN },
    axis: {
      type: "object",
      properties: { kind: { const: "world" }, axis: { enum: ["x", "y", "z"] } },
      required: ["kind", "axis"],
    },
    angle: { oneOf: [{ type: "number" }, { type: "string" }] },
    operation: { enum: ["new_body", "add", "cut", "intersect"] },
  },
  required: ["kind", "id", "profile", "axis", "angle", "operation"],
},
{
  type: "object",
  properties: {
    kind: { const: "shell" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    thickness: { oneOf: [{ type: "number" }, { type: "string" }] },
    removedFaces: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: { feature: { type: "string", pattern: SNAKE_PATTERN }, tag: { type: "string" } },
        required: ["feature", "tag"],
      },
    },
  },
  required: ["kind", "id", "thickness", "removedFaces"],
},
{
  type: "object",
  properties: {
    kind: { const: "bend_flange" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    face: {
      type: "object",
      properties: { feature: { type: "string", pattern: SNAKE_PATTERN }, tag: { type: "string" } },
      required: ["feature", "tag"],
    },
    length: { oneOf: [{ type: "number" }, { type: "string" }] },
    radius: { oneOf: [{ type: "number" }, { type: "string" }] },
    angle: { oneOf: [{ type: "number" }, { type: "string" }] },
    thickness: { oneOf: [{ type: "number" }, { type: "string" }] },
  },
  required: ["kind", "id", "face", "length", "radius", "angle", "thickness"],
},
```

Update tools.test.ts to assert the new feature kinds appear in the schema.

- [ ] **Step 2**: Update `prompts.ts` to mention the three new feature kinds and their typical usage.

- [ ] **Step 3**: Plugin test stays unchanged (still 12 tools).

- [ ] **Step 4**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
git log --oneline 73842b8..HEAD | wc -l
git diff --stat 73842b8..HEAD | tail -1
```

Expect: tests ~232 (220 + ~12 new), TS ≤ 38, convex clean, ~7 commits.

- [ ] **Step 5**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts artifacts/hardwareai/convex/cad/prompts.ts
git commit -m "feat(cad-ir): tools + prompts list revolve/shell/bend_flange"
```

---

## Task 8: README + summary

- [ ] **Step 1**: Add Phase 5 section to `convex/cad/README.md` listing the 3 new features, the multi-part `compileAssembly` entry point, and the min-bend-radius rule.

- [ ] **Step 2**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 5 README — revolve/shell/bend_flange + compileAssembly"
```

---

## Phase 5 success criteria

| Criterion | How verified |
|---|---|
| `revolve`, `shell`, `bend_flange` accepted by Zod | Tasks 1, 3, 5 |
| Codegen emits build123d revolve/offset/placeholder for each | Tasks 2, 4, 5 |
| `compileAssembly` returns one script per part | Task 6 |
| `mfg.min-bend-radius` flags r < t | Task 5 |
| Phase 1+2+3+4 tests still pass | Task 7 final sweep |
| TS error baseline ≤ 38 | Task 7 final sweep |

---

## Out of scope for Phase 5 (deferred)

- **Sweep, loft features** — separate plan; pattern is the same as revolve.
- **Real bend-flange geometry** — needs build123d sheet-metal extension (or manual construction). Codegen is placeholder.
- **Weld-tab feature** — adjacent to bend-flange; can share a future plan.
- **Sketch constraint solver (Tier 2)** — separate plan; substantial standalone work.
- **Volumetric interference detection (Tier 5 extension)** — needs geometry; defer.
- **MJCF compiler** — second motion-sim target alongside URDF; small separate plan.
- **External part references / STEP imports** — separate plan.
- **Live e2e against Vercel Sandbox + Anthropic** — operational, not architectural; needs a dedicated session with secrets in env.
