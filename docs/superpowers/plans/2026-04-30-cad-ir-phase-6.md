# CAD IR Phase 6 — Sweep/loft/weld_tab features + MJCF compiler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Round out the feature catalog with `sweep` (extrude along a path), `loft` (blend between profiles), and `weld_tab` (sheet-metal welding aid). Add an MJCF compiler so MuJoCo becomes a second motion-sim target alongside URDF.

**Architecture:** Same pattern as Phase 5. Each feature gets a type, a Zod schema, a codegen file, a dispatch case, and a test. MJCF mirrors the URDF compiler (different XML grammar, same source IR).

**Builds on:** Phase 5 tip `0a44bc4`. Worktree at `~/fabware-cad-ir-phase-6/` on branch `feat/cad-ir-phase-6`.

---

## Prerequisites

- Phase 5 complete (244/244 tests).
- Worktree at `~/fabware-cad-ir-phase-6/` off Phase 5 tip.

---

## Task 1: Sweep feature

**Files:** `convex/cad/ir/types.ts`, `schema.ts`, schema test, `convex/cad/codegen/features/sweep.ts`, codegen test, `emitFeature.ts`, `resolveIr.ts`.

- [ ] **Step 1**: Add type:

```ts
export interface SweepFeature extends BaseFeature {
  kind: "sweep";
  /** Profile sketch (cross-section). */
  profile: SketchId;
  /** Path sketch (centerline along which the profile sweeps). */
  path: SketchId;
  operation: "new_body" | "add" | "cut" | "intersect";
}
```

Add to `Feature` union.

- [ ] **Step 2**: Zod:

```ts
const SweepFeatureSchema = z.object({
  ...Base, kind: z.literal("sweep"),
  profile: Snake,
  path: Snake,
  operation: z.enum(["new_body", "add", "cut", "intersect"]),
});
```

Add to `FeatureSchema` discriminated union.

Test:
```ts
it("accepts a sweep feature with profile and path sketches", () => {
  const ir = {
    schemaVersion: 1 as const, units: "mm" as const, parameters: {},
    sketches: { profile: { id: "profile", plane: "XY" as const, geometry: [] }, path: { id: "path", plane: "XZ" as const, geometry: [] } },
    features: [{ kind: "sweep", id: "tube", profile: "profile", path: "path", operation: "new_body" }],
  };
  expect(() => CadIrSchema.parse(ir)).not.toThrow();
});
```

- [ ] **Step 3**: Codegen `sweep.ts`:

```ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitSweep(
  f: Extract<ResolvedIr["features"][number], { kind: "sweep" }>,
  ir: ResolvedIr,
): string[] {
  const profile = ir.sketches[f.profile];
  const path = ir.sketches[f.path];
  if (!profile || !path) return [`# error: missing sweep sketch (profile or path)`];

  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };

  const lines = [`with BuildPart() as ${f.id}:`];
  lines.push(`    with BuildSketch() as profile_sketch:`);
  for (const g of profile.geometry) {
    if (g.kind === "rect") lines.push(`        Rectangle(${refOrLit(g.width)}, ${refOrLit(g.height)})`);
    else if (g.kind === "circle") lines.push(`        Circle(${refOrLit(g.radius)})`);
  }
  lines.push(`    with BuildLine() as path_line:`);
  for (const g of path.geometry) {
    if (g.kind === "line") lines.push(`        Line((${g.p1.x}, ${g.p1.y}), (${g.p2.x}, ${g.p2.y}))`);
  }
  lines.push(`    sweep(sections=profile_sketch.sketch, path=path_line.line)`);
  lines.push(`report_entities("${f.id}", ${f.id})`);
  return lines;
}
```

Codegen test:
```ts
it("emits sweep() with profile and path", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: {},
    sketches: {
      profile: { id: "profile", plane: "XY" as const, geometry: [{ kind: "circle" as const, id: "c", center: { x: 0, y: 0 }, radius: 5 }] },
      path: { id: "path", plane: "XZ" as const, geometry: [{ kind: "line" as const, id: "l", p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } }] },
    },
    features: [{ kind: "sweep" as const, id: "tube", profile: "profile", path: "path", operation: "new_body" as const }],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toContain("with BuildPart() as tube:");
  expect(py).toContain("Circle(5)");
  expect(py).toContain("Line((0, 0), (100, 0))");
  expect(py).toContain("sweep(sections=profile_sketch.sketch, path=path_line.line)");
});
```

Add `case "sweep": return { lines: emitSweep(f, ir), ctxOut: { parentBodyId: f.id } };` to `emitFeature.ts`.

Update `resolveIr.ts` switch to pass through `sweep` features unchanged (they have no ParamRef fields beyond their nested sketches' coords).

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/
git commit -m "feat(cad-ir): SweepFeature — type + schema + codegen"
```

---

## Task 2: Loft feature

```ts
export interface LoftFeature extends BaseFeature {
  kind: "loft";
  /** Ordered list of profile sketches to blend. */
  profiles: SketchId[];
  operation: "new_body" | "add" | "cut" | "intersect";
}
```

```ts
const LoftFeatureSchema = z.object({
  ...Base, kind: z.literal("loft"),
  profiles: z.array(Snake).min(2),
  operation: z.enum(["new_body", "add", "cut", "intersect"]),
});
```

Schema test:
```ts
it("accepts a loft feature with at least 2 profiles", () => {
  const ir = {
    schemaVersion: 1 as const, units: "mm" as const, parameters: {},
    sketches: {
      a: { id: "a", plane: "XY" as const, geometry: [] },
      b: { id: "b", plane: "XY" as const, geometry: [] },
    },
    features: [{ kind: "loft", id: "blend", profiles: ["a", "b"], operation: "new_body" }],
  };
  expect(() => CadIrSchema.parse(ir)).not.toThrow();
});

it("rejects a loft feature with only one profile", () => {
  const ir = {
    schemaVersion: 1 as const, units: "mm" as const, parameters: {},
    sketches: { a: { id: "a", plane: "XY" as const, geometry: [] } },
    features: [{ kind: "loft", id: "blend", profiles: ["a"], operation: "new_body" }],
  };
  expect(() => CadIrSchema.parse(ir)).toThrow();
});
```

Codegen `loft.ts`:

```ts
export function emitLoft(
  f: Extract<ResolvedIr["features"][number], { kind: "loft" }>,
  ir: ResolvedIr,
): string[] {
  const sketches = f.profiles.map(id => ir.sketches[id]).filter(Boolean);
  if (sketches.length < 2) return [`# error: loft ${f.id} needs ≥2 profiles`];

  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };

  const lines = [`with BuildPart() as ${f.id}:`];
  // Each profile becomes its own sketch context, then loft joins them
  for (let i = 0; i < sketches.length; i++) {
    lines.push(`    with BuildSketch(${i === 0 ? "" : `Plane.XY.offset(${i * 10})`}) as profile_${i}:`);
    for (const g of sketches[i].geometry) {
      if (g.kind === "rect") lines.push(`        Rectangle(${refOrLit(g.width)}, ${refOrLit(g.height)})`);
      else if (g.kind === "circle") lines.push(`        Circle(${refOrLit(g.radius)})`);
    }
  }
  const profileExprs = sketches.map((_, i) => `profile_${i}.sketch`).join(", ");
  lines.push(`    loft(sections=[${profileExprs}])`);
  lines.push(`report_entities("${f.id}", ${f.id})`);
  return lines;
}
```

Codegen test:
```ts
it("emits loft() with multiple profiles", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: {},
    sketches: {
      bottom: { id: "bottom", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "b", center: { x: 0, y: 0 }, width: 30, height: 20 }] },
      top: { id: "top", plane: "XY" as const, geometry: [{ kind: "circle" as const, id: "c", center: { x: 0, y: 0 }, radius: 8 }] },
    },
    features: [{ kind: "loft" as const, id: "transition", profiles: ["bottom", "top"], operation: "new_body" as const }],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toMatch(/loft\(sections=\[profile_0\.sketch, profile_1\.sketch\]\)/);
});
```

Wire in `emitFeature.ts` and `resolveIr.ts`.

Commit:
```bash
git add artifacts/hardwareai/convex/cad/
git commit -m "feat(cad-ir): LoftFeature — type + schema + codegen"
```

---

## Task 3: WeldTab feature

```ts
export interface WeldTabFeature extends BaseFeature {
  kind: "weld_tab";
  /** Face on which the tab is welded. */
  face: FaceRef;
  /** Tab dimensions: length × width × thickness. */
  length: ParamRef;
  width: ParamRef;
  thickness: ParamRef;
  /** Offset position on the face (x,y in face-local 2D coords). */
  position: { x: ParamRef; y: ParamRef };
}
```

```ts
const WeldTabFeatureSchema = z.object({
  ...Base, kind: z.literal("weld_tab"),
  face: FaceRef,
  length: ParamRef,
  width: ParamRef,
  thickness: ParamRef,
  position: z.object({ x: ParamRef, y: ParamRef }),
});
```

Codegen `weldTab.ts`:

```ts
export function emitWeldTab(
  f: Extract<ResolvedIr["features"][number], { kind: "weld_tab" }>,
  ir: ResolvedIr,
): string[] {
  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };
  return [
    `# weld_tab ${f.id}: face=${f.face.feature}.${f.face.tag}`,
    `with ${f.face.feature}:`,
    `    with Locations((${f.position.x}, ${f.position.y})):`,
    `        with BuildSketch() as tab_sketch:`,
    `            Rectangle(${refOrLit(f.length as number)}, ${refOrLit(f.width as number)})`,
    `        extrude(amount=${refOrLit(f.thickness as number)})`,
    `report_entities("${f.id}", ${f.face.feature})`,
  ];
}
```

Test:
```ts
it("emits weld_tab as Locations + Rectangle + extrude", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: { tab_l: { id: "tab_l", value: 20 }, tab_w: { id: "tab_w", value: 10 }, tab_t: { id: "tab_t", value: 3 } },
    sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 60 }] } },
    features: [
      { kind: "extrude" as const, id: "base", profile: "p", distance: 3, operation: "new_body" as const },
      { kind: "weld_tab" as const, id: "tab1", face: { feature: "base", tag: "top" }, length: "tab_l", width: "tab_w", thickness: "tab_t", position: { x: 10, y: 0 } },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toContain("# weld_tab tab1");
  expect(py).toContain("Locations((10, 0))");
  expect(py).toContain("Rectangle(tab_l, tab_w)");
  expect(py).toContain("extrude(amount=tab_t)");
});
```

Wire in `emitFeature.ts` and `resolveIr.ts` (the `weld_tab` resolver case must concretize `length`, `width`, `thickness`, and `position.x`/`y`).

Commit:
```bash
git add artifacts/hardwareai/convex/cad/
git commit -m "feat(cad-ir): WeldTabFeature — type + schema + codegen"
```

---

## Task 4: Update tools (add sweep/loft/weld_tab to add_feature schema)

In `convex/cad/patch/tools.ts`, append three new entries to `addFeature.input_schema.properties.feature.oneOf`:

```ts
{
  type: "object",
  properties: {
    kind: { const: "sweep" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    profile: { type: "string", pattern: SNAKE_PATTERN },
    path: { type: "string", pattern: SNAKE_PATTERN },
    operation: { enum: ["new_body", "add", "cut", "intersect"] },
  },
  required: ["kind", "id", "profile", "path", "operation"],
},
{
  type: "object",
  properties: {
    kind: { const: "loft" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    profiles: { type: "array", items: { type: "string", pattern: SNAKE_PATTERN }, minItems: 2 },
    operation: { enum: ["new_body", "add", "cut", "intersect"] },
  },
  required: ["kind", "id", "profiles", "operation"],
},
{
  type: "object",
  properties: {
    kind: { const: "weld_tab" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    face: {
      type: "object",
      properties: { feature: { type: "string", pattern: SNAKE_PATTERN }, tag: { type: "string" } },
      required: ["feature", "tag"],
    },
    length: { oneOf: [{ type: "number" }, { type: "string" }] },
    width: { oneOf: [{ type: "number" }, { type: "string" }] },
    thickness: { oneOf: [{ type: "number" }, { type: "string" }] },
    position: {
      type: "object",
      properties: {
        x: { oneOf: [{ type: "number" }, { type: "string" }] },
        y: { oneOf: [{ type: "number" }, { type: "string" }] },
      },
      required: ["x", "y"],
    },
  },
  required: ["kind", "id", "face", "length", "width", "thickness", "position"],
},
```

Update tools.test.ts to include new kind names in the schema-text assertion.

Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/
git commit -m "feat(cad-ir): tools — add_feature schema accepts sweep/loft/weld_tab"
```

---

## Task 5: MJCF compiler

**Files:** `convex/cad/compile/mjcf.ts`, `convex/cad/compile/__tests__/mjcf.test.ts`

MJCF is MuJoCo's XML format. Like URDF: `<mujoco model="..."><worldbody><body name="..."><joint name="..." type="hinge" range="..."/></body></worldbody></mujoco>`.

Joint type mapping:
- fixed → no joint element (rigid attachment via parent body nesting)
- revolute → `<joint type="hinge" axis="x y z" range="lo hi" />` (radians)
- linear → `<joint type="slide" axis="x y z" range="lo hi" />` (meters)
- ball → `<joint type="ball" />`
- rigid_group → flatten as nested bodies under the first member

Test:
```ts
import { describe, expect, it } from "vitest";
import { compileToMjcf } from "../mjcf";
import type { CadIr } from "../../ir/types";
import { emptyIr } from "../../ir/empty";

describe("compileToMjcf", () => {
  it("emits a minimal mujoco model with two bodies and a hinge", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: emptyIr("mm") },
        lid: { id: "lid", ir: emptyIr("mm") },
      },
      joints: [{
        kind: "revolute", id: "hinge", a: "body", b: "lid",
        axis: { kind: "world", axis: "y" },
        limits: { min: 0, max: 90, unit: "deg" },
      }],
    };
    const xml = compileToMjcf(ir, "test_assembly");
    expect(xml).toContain("<mujoco model=\"test_assembly\">");
    expect(xml).toContain("<body name=\"body\">");
    expect(xml).toContain("<body name=\"lid\">");
    expect(xml).toContain("<joint name=\"hinge\" type=\"hinge\"");
    expect(xml).toContain("axis=\"0 1 0\"");
    expect(xml).toMatch(/range="0 1\.570/);
  });

  it("emits a slide joint for linear", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        rail: { id: "rail", ir: emptyIr("mm") },
        car: { id: "car", ir: emptyIr("mm") },
      },
      joints: [{
        kind: "linear", id: "slide", a: "rail", b: "car",
        axis: { kind: "world", axis: "x" },
        limits: { min: 0, max: 100, unit: "mm" },
      }],
    };
    const xml = compileToMjcf(ir, "linear");
    expect(xml).toContain("<joint name=\"slide\" type=\"slide\"");
    expect(xml).toContain("axis=\"1 0 0\"");
    // 100mm = 0.1m
    expect(xml).toMatch(/range="0 0\.1"/);
  });
});
```

Implementation:

```ts
// convex/cad/compile/mjcf.ts
import type { CadIr, Joint, AxisRef, ParamRef } from "../ir/types";

const DEG_TO_RAD = Math.PI / 180;

function num(p: ParamRef | undefined, fallback = 0): number {
  if (typeof p === "number") return p;
  return fallback;
}

function lengthMmToM(p: ParamRef | undefined, units: "mm" | "in"): number {
  const n = num(p, 0);
  return units === "mm" ? n / 1000 : n * 0.0254;
}

function axisXyz(a: AxisRef): string {
  if (a.kind === "world") {
    return a.axis === "x" ? "1 0 0" : a.axis === "y" ? "0 1 0" : "0 0 1";
  }
  return "0 0 1";
}

function jointTypeMjcf(j: Joint): string | null {
  switch (j.kind) {
    case "fixed": return null; // no joint element
    case "revolute": return "hinge";
    case "linear": return "slide";
    case "ball": return "ball";
    case "rigid_group": return null;
  }
}

export function compileToMjcf(ir: CadIr, modelName: string): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0"?>`);
  lines.push(`<mujoco model="${modelName}">`);
  lines.push(`  <worldbody>`);

  for (const [id, part] of Object.entries(ir.parts ?? {})) {
    const ox = lengthMmToM(part.origin?.x, ir.units);
    const oy = lengthMmToM(part.origin?.y, ir.units);
    const oz = lengthMmToM(part.origin?.z, ir.units);
    lines.push(`    <body name="${id}" pos="${ox} ${oy} ${oz}">`);

    // Find any joint that has this part as the child (b)
    for (const j of ir.joints ?? []) {
      const childName = j.kind === "rigid_group" ? null : j.b;
      if (childName !== id) continue;
      const jtype = jointTypeMjcf(j);
      if (!jtype) continue;
      let rangeAttr = "";
      if ((j.kind === "revolute" || j.kind === "linear") && j.limits) {
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
        rangeAttr = ` range="${lo} ${hi}"`;
      }
      let axisAttr = "";
      if (j.kind === "revolute" || j.kind === "linear") {
        axisAttr = ` axis="${axisXyz(j.axis)}"`;
      }
      lines.push(`      <joint name="${j.id}" type="${jtype}"${axisAttr}${rangeAttr}/>`);
    }

    lines.push(`    </body>`);
  }

  lines.push(`  </worldbody>`);
  lines.push(`</mujoco>`);
  return lines.join("\n");
}
```

Commit:
```bash
git add artifacts/hardwareai/convex/cad/compile/
git commit -m "feat(cad-ir): MJCF compiler — second motion-sim target alongside URDF"
```

---

## Task 6: Final sweep — README + prompts + tests

- [ ] **Step 1**: Update `convex/cad/prompts.ts` to mention sweep/loft/weld_tab usage.

- [ ] **Step 2**: Update `convex/cad/README.md` Phase 6 section.

- [ ] **Step 3**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
```

Expect ~258 tests (244 + ~14), TS ≤ 38, convex clean.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/prompts.ts artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 6 — sweep/loft/weld_tab + MJCF"
```

---

## Phase 6 success criteria

- `sweep`, `loft`, `weld_tab` features pass schema + codegen tests
- MJCF compiler emits valid XML for fixed/revolute/linear/ball with mm→m, deg→rad
- All Phase 1-5 tests still pass
- TS baseline ≤ 38

---

## Out of scope for Phase 6 (deferred)

- **Sketch constraint solver (Tier 2)** — separate plan; substantial novel work
- **Volumetric interference detection** — needs geometry kernel access
- **External part references / STEP imports** — separate plan
- **Live e2e** — operational, not architectural; needs env secrets
- **Frontend integration** — wire CadPreview to a part page
- **Real bend-flange / weld-tab geometry rendering** — needs build123d sheet-metal extension
