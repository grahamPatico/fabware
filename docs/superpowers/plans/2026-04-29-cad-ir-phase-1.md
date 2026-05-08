# CAD IR Phase 1 — Foundation, Executor, First Repair Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CAD IR foundation end-to-end for a single feature surface (parametric brackets/plates with extrude, cut_extrude, fillet, chamfer, simple holes, and patterns), with a Vercel-Sandbox build123d executor and the existing repair loop wired to schema- and geometry-tier violations.

**Architecture:** New `convex/cad/` namespace holds the IR schema, expression evaluator, schema-tier validator, resolver, deterministic build123d code generator, sandbox executor, content-addressed revision storage, and a `ProcessPlugin<CadIr>`. The agent's only patch tools in Phase 1 are `set_parameter` and `add_feature`. The existing `runAgentRepairLoop` works unchanged — tier-aware violations flow through it transparently.

**Tech Stack:**
- TypeScript + Convex for schema/mutations/actions/state
- Zod v4 for schemas (matches existing harness code)
- vitest for unit + integration tests
- Python + build123d in Vercel Sandbox for geometry execution
- `@anthropic-ai/sdk` for the agent (already integrated)

**Spec:** [`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`](../specs/2026-04-29-cad-ir-backbone-design.md)

---

## Prerequisites (Phase 0 — outside this plan)

Before Phase 1 tasks begin:

1. **Land Plans 1+2+3 to `main`.** The branch `feat/ai-harness-step-0-scaffold` (worktree at `~/fabware-harness-step0/`) holds 38 commits implementing the plugin scaffold + sheet-metal validator + agent repair loop. These are reused by Phase 1; they must be on `main` before this plan starts.
2. **Fix main's 7 failing tests** in `archetypes/{boxWithLid,dividedTray,hingedEnclosure,slidingEnclosure}` and `lib/assemblyRules` (caused by the recent FastenerStack / hole-alignment TDD work). Phase 1's success criterion "all 100 existing tests still pass" depends on a green main.
3. **Create branch `feat/cad-ir-phase-1`** off main; create a dedicated worktree at `~/fabware-cad-ir-phase-1/`.
4. **Verify Convex dev deployment** `amiable-emu-84` is reachable (`CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once` from `artifacts/hardwareai/`).
5. **Provision Vercel Sandbox access** in the Fabware Vercel project (the `vercel:vercel-sandbox` skill / `@vercel/sandbox` SDK; obtain `VERCEL_API_TOKEN` for the deployment).
6. **Add Python build123d image** for the sandbox: pin `build123d==0.7.0`, `numpy>=1.26` to `artifacts/hardwareai/scripts/sandbox/requirements.txt`.

If Phase 0 work needs structuring, write a short separate plan for it. Phase 1 below assumes a green main and a dedicated worktree.

---

## Spec Correction (one item)

Spec §11 Phase 1 says "Single tool: `add_feature`". This plan ships **two tools** in Phase 1: `set_parameter` and `add_feature`. Reason: an agent literally cannot build a parametric part without setting parameters first, and adding parameter values inline inside `add_feature` would violate the patch grammar. Phase 2 expands to the full set.

---

## File Structure

All paths are relative to the repo root.

```
artifacts/hardwareai/convex/cad/
├── ir/
│   ├── types.ts                       # all CAD IR TS types (no Zod)
│   ├── schema.ts                      # Zod schema + Zod-derived parser
│   ├── empty.ts                       # emptyIr() factory
│   └── __tests__/schema.test.ts
├── expression/
│   ├── parser.ts                      # tiny expression tokenizer + parser
│   ├── evaluator.ts                   # evaluate parameter graph (DAG, units)
│   └── __tests__/{parser,evaluator}.test.ts
├── resolve/
│   ├── resolveIr.ts                   # IR → ResolvedIR
│   └── __tests__/resolveIr.test.ts
├── validate/
│   ├── schemaTier.ts                  # Tier 1
│   ├── manufacturingTier.ts           # Tier 4 (one rule in Phase 1)
│   ├── geometryTier.ts                # Tier 3 — reads exec.log + entities.json
│   └── __tests__/...
├── codegen/
│   ├── compileToBuild123d.ts          # entry point
│   ├── emitParameters.ts
│   ├── emitFeature.ts                 # dispatch by feature kind
│   ├── features/
│   │   ├── extrude.ts
│   │   ├── cutExtrude.ts
│   │   ├── fillet.ts
│   │   ├── chamfer.ts
│   │   ├── hole.ts
│   │   └── pattern.ts
│   └── __tests__/...
├── patch/
│   ├── types.ts                       # Patch discriminated union
│   ├── apply.ts                       # applyPatch — pure
│   ├── tools.ts                       # AgentTool[] — set_parameter, add_feature
│   └── __tests__/...
├── executor/
│   ├── runSandbox.ts                  # "use node" — boots @vercel/sandbox
│   ├── entitiesParser.ts
│   └── __tests__/entitiesParser.test.ts
├── revisions/
│   ├── hash.ts                        # canonicalize + sha256
│   └── __tests__/hash.test.ts
├── plugin.ts                          # cadIrPlugin: ProcessPlugin<CadIr>
├── prompts.ts                         # systemPromptFragment
├── plugin.test.ts                     # plugin shape contract test
└── README.md                          # short module map

artifacts/hardwareai/convex/specialists/
├── cadIr.ts                           # "use node" specialist action
└── cadIrInternals.ts                  # internalQuery/internalMutation split

artifacts/hardwareai/convex/projects/
└── projectMutations.ts                # MODIFY — add setUseCadIr

artifacts/hardwareai/convex/plugins/
└── index.ts                           # MODIFY — register cadIrPlugin

artifacts/hardwareai/convex/orchestrator/
└── tick.ts                            # MODIFY — dispatch cad_ir specialist

artifacts/hardwareai/convex/schema.ts  # MODIFY — new tables + parts.useCadIr/headRevisionHash

artifacts/hardwareai/scripts/sandbox/
├── build123d-runner.py                # Python entry; reads /in/script.py, runs, writes /out
├── report_helpers.py                  # report_entities() + write_entities_json()
└── requirements.txt                   # pinned Python deps

artifacts/hardwareai/src/components/
└── CadPreview.tsx                     # NEW — three.js glTF viewer for sandbox output
```

**Existing files modified:** `convex/schema.ts`, `convex/plugins/index.ts`, `convex/orchestrator/tick.ts`, `convex/projects/projectMutations.ts`. **Existing files unchanged:** the entire sheet-metal plugin, all specialists/sheetMetal\*, all archetypes, all orchestrator non-tick files, all PartDsl code.

---

## Task 1: CAD IR types

**Files:**
- Create: `artifacts/hardwareai/convex/cad/ir/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// artifacts/hardwareai/convex/cad/ir/types.ts
//
// All CAD IR TypeScript types. Intent layer only — no kernel-internal types here.

export type Units = "mm" | "in";

export type ParamId   = string; // ^[a-z][a-z0-9_]{0,31}$
export type SketchId  = string;
export type FeatureId = string;
export type PartId    = string;
export type JointId   = string;

export type FaceId    = string; // kernel-assigned: <featureId>.<tag>
export type EdgeId    = string;
export type VertexId  = string;

export type ParamRef = ParamId | number; // expression-string handled by evaluator

export interface ParameterDef {
  id: ParamId;
  value: number | string;          // string = expression
  unit?: "mm" | "in" | "deg" | "rad";
  description?: string;
  bounds?: { min?: number; max?: number };
}

export type PlaneRef =
  | "XY" | "XZ" | "YZ"
  | { face: FaceId };

export type Point2D = { x: ParamRef; y: ParamRef };

export type SketchEntity =
  | { kind: "rect"; id: string; center: Point2D; width: ParamRef; height: ParamRef; cornerRadius?: ParamRef }
  | { kind: "circle"; id: string; center: Point2D; radius: ParamRef }
  | { kind: "line"; id: string; p1: Point2D; p2: Point2D };

export interface SketchDef {
  id: SketchId;
  plane: PlaneRef;
  geometry: SketchEntity[];
}

export type FaceRef = { feature: FeatureId; tag: string };
export type EdgeQuery = "all" | "top_loop" | "bottom_loop" | { tag: string };
export type EdgeRef = { feature: FeatureId; query: EdgeQuery };

export interface BaseFeature {
  id: FeatureId;
  suppressed?: boolean;
  description?: string;
}

export interface ExtrudeFeature extends BaseFeature {
  kind: "extrude";
  profile: SketchId;
  distance: ParamRef;
  operation: "new_body" | "add" | "cut" | "intersect";
  direction?: "forward" | "reverse" | "symmetric";
}

export interface CutExtrudeFeature extends BaseFeature {
  kind: "cut_extrude";
  profile: SketchId;
  distance: ParamRef;
  through?: boolean;
}

export interface FilletFeature extends BaseFeature {
  kind: "fillet";
  edges: EdgeRef[];
  radius: ParamRef;
}

export interface ChamferFeature extends BaseFeature {
  kind: "chamfer";
  edges: EdgeRef[];
  distance: ParamRef;
}

export interface HoleFeature extends BaseFeature {
  kind: "hole";
  face: FaceRef;
  positions: Point2D[];
  diameter: ParamRef;
  depth?: ParamRef;
  type: "simple"; // countersink/counterbore/threaded come in Phase 3
}

export interface PatternFeature extends BaseFeature {
  kind: "pattern";
  source: FeatureId;            // feature to replicate
  axis: "x" | "y" | "z";
  count: number;
  spacing: ParamRef;
}

export type Feature =
  | ExtrudeFeature | CutExtrudeFeature
  | FilletFeature | ChamferFeature
  | HoleFeature | PatternFeature;

export interface EntityRegistry {
  faces:    Record<FaceId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  edges:    Record<EdgeId,   { feature: FeatureId; tag: string; topologyHash: string }>;
  vertices: Record<VertexId, { feature: FeatureId; tag: string }>;
}

export interface CadIr {
  schemaVersion: 1;
  units: Units;
  parameters: Record<ParamId, ParameterDef>;
  sketches:   Record<SketchId, SketchDef>;
  features:   Feature[];
  entities?: EntityRegistry;
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/ir/types.ts
git commit -m "feat(cad-ir): TypeScript types for CAD IR (Phase 1 surface)"
```

---

## Task 2: CAD IR Zod schema

**Files:**
- Create: `artifacts/hardwareai/convex/cad/ir/schema.ts`
- Create: `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

describe("CadIrSchema", () => {
  it("accepts a minimal valid IR", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { length: { id: "length", value: 120, unit: "mm" } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects camelCase parameter ids", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { holeSpacing: { id: "holeSpacing", value: 90 } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow(/snake_case/);
  });

  it("rejects unknown feature kinds", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [{ kind: "loft", id: "x", profiles: [] }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/ir/__tests__/schema.test.ts`
Expected: FAIL — `CadIrSchema` not exported.

- [ ] **Step 2: Implement schema**

```ts
// artifacts/hardwareai/convex/cad/ir/schema.ts
import { z } from "zod/v4";

const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const Snake = z.string().regex(NAME_RE, "must be snake_case (a-z, 0-9, _) ≤32 chars");

const ParamRef = z.union([Snake, z.number()]);
const Point2D = z.object({ x: ParamRef, y: ParamRef });

const ParameterDef = z.object({
  id: Snake,
  value: z.union([z.number(), z.string()]),
  unit: z.enum(["mm", "in", "deg", "rad"]).optional(),
  description: z.string().max(200).optional(),
  bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
});

const PlaneRef = z.union([
  z.enum(["XY", "XZ", "YZ"]),
  z.object({ face: z.string() }),
]);

const SketchEntity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"),   id: Snake, center: Point2D, width: ParamRef, height: ParamRef, cornerRadius: ParamRef.optional() }),
  z.object({ kind: z.literal("circle"), id: Snake, center: Point2D, radius: ParamRef }),
  z.object({ kind: z.literal("line"),   id: Snake, p1: Point2D, p2: Point2D }),
]);

const SketchDef = z.object({
  id: Snake,
  plane: PlaneRef,
  geometry: z.array(SketchEntity),
});

const FaceRef = z.object({ feature: Snake, tag: z.string().max(32) });
const EdgeQuery = z.union([
  z.literal("all"),
  z.literal("top_loop"),
  z.literal("bottom_loop"),
  z.object({ tag: z.string().max(32) }),
]);
const EdgeRef = z.object({ feature: Snake, query: EdgeQuery });

const Base = { id: Snake, suppressed: z.boolean().optional(), description: z.string().max(200).optional() };

const ExtrudeFeature = z.object({
  ...Base,
  kind: z.literal("extrude"),
  profile: Snake,
  distance: ParamRef,
  operation: z.enum(["new_body", "add", "cut", "intersect"]),
  direction: z.enum(["forward", "reverse", "symmetric"]).optional(),
});

const CutExtrudeFeature = z.object({
  ...Base,
  kind: z.literal("cut_extrude"),
  profile: Snake,
  distance: ParamRef,
  through: z.boolean().optional(),
});

const FilletFeature = z.object({
  ...Base, kind: z.literal("fillet"), edges: z.array(EdgeRef).min(1), radius: ParamRef,
});
const ChamferFeature = z.object({
  ...Base, kind: z.literal("chamfer"), edges: z.array(EdgeRef).min(1), distance: ParamRef,
});
const HoleFeature = z.object({
  ...Base, kind: z.literal("hole"),
  face: FaceRef,
  positions: z.array(Point2D).min(1),
  diameter: ParamRef,
  depth: ParamRef.optional(),
  type: z.literal("simple"),
});
const PatternFeature = z.object({
  ...Base, kind: z.literal("pattern"),
  source: Snake,
  axis: z.enum(["x", "y", "z"]),
  count: z.number().int().min(2).max(64),
  spacing: ParamRef,
});

export const FeatureSchema = z.discriminatedUnion("kind", [
  ExtrudeFeature, CutExtrudeFeature,
  FilletFeature, ChamferFeature,
  HoleFeature, PatternFeature,
]);

export const CadIrSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.enum(["mm", "in"]),
  parameters: z.record(Snake, ParameterDef),
  sketches: z.record(Snake, SketchDef),
  features: z.array(FeatureSchema),
  entities: z.object({
    faces: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    edges: z.record(z.string(), z.object({ feature: Snake, tag: z.string(), topologyHash: z.string() })),
    vertices: z.record(z.string(), z.object({ feature: Snake, tag: z.string() })),
  }).optional(),
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/ir/__tests__/schema.test.ts`
Expected: PASS (3/3).

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/ir/schema.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): Zod schema for CadIr with feature discrim union"
```

---

## Task 3: emptyIr() factory

**Files:**
- Create: `artifacts/hardwareai/convex/cad/ir/empty.ts`

- [ ] **Step 1: Append failing test to schema.test.ts**

```ts
import { emptyIr } from "../empty";

describe("emptyIr", () => {
  it("returns a valid IR that round-trips through CadIrSchema", () => {
    const ir = emptyIr("mm");
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
    expect(ir.schemaVersion).toBe(1);
    expect(ir.units).toBe("mm");
    expect(ir.features).toEqual([]);
  });
});
```

Run: same vitest path. Expected: FAIL — `emptyIr` not defined.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/ir/empty.ts
import type { CadIr, Units } from "./types";

export function emptyIr(units: Units = "mm"): CadIr {
  return {
    schemaVersion: 1,
    units,
    parameters: {},
    sketches: {},
    features: [],
  };
}
```

Run: same. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/ir/empty.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): emptyIr factory"
```

---

## Task 4: Expression parser

**Files:**
- Create: `artifacts/hardwareai/convex/cad/expression/parser.ts`
- Create: `artifacts/hardwareai/convex/cad/expression/__tests__/parser.test.ts`

The parser handles a deliberately tiny grammar: identifiers, numeric literals, `+ - * /`, parentheses, unary minus.

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/expression/__tests__/parser.test.ts
import { describe, expect, it } from "vitest";
import { parseExpression } from "../parser";

describe("parseExpression", () => {
  it("parses a number", () => {
    expect(parseExpression("42")).toEqual({ kind: "num", value: 42 });
  });
  it("parses an identifier", () => {
    expect(parseExpression("length")).toEqual({ kind: "ref", name: "length" });
  });
  it("parses arithmetic with precedence", () => {
    expect(parseExpression("a + b * 2")).toEqual({
      kind: "bin", op: "+",
      lhs: { kind: "ref", name: "a" },
      rhs: { kind: "bin", op: "*", lhs: { kind: "ref", name: "b" }, rhs: { kind: "num", value: 2 } },
    });
  });
  it("respects parentheses", () => {
    const tree = parseExpression("(a + b) * 2");
    expect(tree).toEqual({
      kind: "bin", op: "*",
      lhs: { kind: "bin", op: "+", lhs: { kind: "ref", name: "a" }, rhs: { kind: "ref", name: "b" } },
      rhs: { kind: "num", value: 2 },
    });
  });
  it("parses unary minus", () => {
    expect(parseExpression("-x")).toEqual({ kind: "neg", inner: { kind: "ref", name: "x" } });
  });
  it("rejects unknown tokens", () => {
    expect(() => parseExpression("a $ b")).toThrow();
  });
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/expression/__tests__/parser.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement parser**

```ts
// artifacts/hardwareai/convex/cad/expression/parser.ts
//
// Tiny precedence-climbing parser for parameter expressions.
// Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/') unary)*
//   unary  := '-' unary | atom
//   atom   := number | ident | '(' expr ')'

export type ExprNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "neg"; inner: ExprNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; lhs: ExprNode; rhs: ExprNode };

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" } | { t: "rp" } | { t: "eof" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { out.push({ t: "lp" }); i++; continue; }
    if (c === ")") { out.push({ t: "rp" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ t: "op", v: c }); i++; continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number.parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (/[a-z_]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z0-9_]/i.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    throw new Error(`unexpected char '${c}' at ${i} in expression "${src}"`);
  }
  out.push({ t: "eof" });
  return out;
}

export function parseExpression(src: string): ExprNode {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t: Tok["t"]) => {
    const tk = toks[p];
    if (tk.t !== t) throw new Error(`expected ${t}, got ${tk.t}`);
    p++; return tk;
  };

  function parseAtom(): ExprNode {
    const tk = peek();
    if (tk.t === "num") { p++; return { kind: "num", value: tk.v }; }
    if (tk.t === "id")  { p++; return { kind: "ref", name: tk.v }; }
    if (tk.t === "lp")  { p++; const e = parseExpr(); eat("rp"); return e; }
    throw new Error(`unexpected token ${tk.t}`);
  }
  function parseUnary(): ExprNode {
    const tk = peek();
    if (tk.t === "op" && tk.v === "-") { p++; return { kind: "neg", inner: parseUnary() }; }
    return parseAtom();
  }
  function parseTerm(): ExprNode {
    let lhs = parseUnary();
    while (true) {
      const tk = peek();
      if (tk.t === "op" && (tk.v === "*" || tk.v === "/")) {
        p++;
        lhs = { kind: "bin", op: tk.v, lhs, rhs: parseUnary() };
      } else return lhs;
    }
  }
  function parseExpr(): ExprNode {
    let lhs = parseTerm();
    while (true) {
      const tk = peek();
      if (tk.t === "op" && (tk.v === "+" || tk.v === "-")) {
        p++;
        lhs = { kind: "bin", op: tk.v, lhs, rhs: parseTerm() };
      } else return lhs;
    }
  }

  const tree = parseExpr();
  if (peek().t !== "eof") throw new Error(`trailing tokens in "${src}"`);
  return tree;
}
```

Run: same. Expected: PASS (6/6).

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/expression/parser.ts artifacts/hardwareai/convex/cad/expression/__tests__/parser.test.ts
git commit -m "feat(cad-ir): tiny expression parser (no deps)"
```

---

## Task 5: Expression evaluator

**Files:**
- Create: `artifacts/hardwareai/convex/cad/expression/evaluator.ts`
- Create: `artifacts/hardwareai/convex/cad/expression/__tests__/evaluator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/expression/__tests__/evaluator.test.ts
import { describe, expect, it } from "vitest";
import { evaluateParameters, EvaluationError } from "../evaluator";
import type { ParameterDef } from "../../ir/types";

const params = (defs: ParameterDef[]): Record<string, ParameterDef> =>
  Object.fromEntries(defs.map(d => [d.id, d]));

describe("evaluateParameters", () => {
  it("evaluates literal values", () => {
    const out = evaluateParameters(params([{ id: "x", value: 12 }]));
    expect(out).toEqual({ x: 12 });
  });
  it("evaluates a reference chain", () => {
    const out = evaluateParameters(params([
      { id: "a", value: 10 },
      { id: "b", value: "a + 5" },
      { id: "c", value: "b * 2" },
    ]));
    expect(out).toEqual({ a: 10, b: 15, c: 30 });
  });
  it("detects cycles", () => {
    expect(() => evaluateParameters(params([
      { id: "a", value: "b + 1" },
      { id: "b", value: "a + 1" },
    ]))).toThrow(EvaluationError);
  });
  it("rejects unknown references", () => {
    expect(() => evaluateParameters(params([{ id: "a", value: "missing + 1" }])))
      .toThrow(/missing/);
  });
  it("enforces bounds", () => {
    expect(() => evaluateParameters(params([
      { id: "x", value: -5, bounds: { min: 0 } },
    ]))).toThrow(/bounds/);
  });
  it("rejects division by zero", () => {
    expect(() => evaluateParameters(params([{ id: "y", value: "1 / 0" }])))
      .toThrow(/division/i);
  });
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/expression/__tests__/evaluator.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/expression/evaluator.ts
import type { ParameterDef } from "../ir/types";
import { parseExpression, type ExprNode } from "./parser";

export class EvaluationError extends Error {}

export function evaluateParameters(
  defs: Record<string, ParameterDef>,
): Record<string, number> {
  const trees: Record<string, ExprNode> = {};
  for (const [id, def] of Object.entries(defs)) {
    trees[id] = typeof def.value === "number"
      ? { kind: "num", value: def.value }
      : parseExpression(def.value);
  }

  const resolved: Record<string, number> = {};
  const visiting = new Set<string>();

  function eval_(id: string): number {
    if (id in resolved) return resolved[id];
    if (visiting.has(id)) {
      throw new EvaluationError(`cycle detected involving parameter "${id}"`);
    }
    if (!(id in trees)) {
      throw new EvaluationError(`unknown reference "${id}"`);
    }
    visiting.add(id);
    const v = walk(trees[id]);
    visiting.delete(id);
    resolved[id] = v;
    const def = defs[id];
    if (def?.bounds) {
      if (def.bounds.min !== undefined && v < def.bounds.min) {
        throw new EvaluationError(`parameter "${id}" = ${v} below bounds.min ${def.bounds.min}`);
      }
      if (def.bounds.max !== undefined && v > def.bounds.max) {
        throw new EvaluationError(`parameter "${id}" = ${v} above bounds.max ${def.bounds.max}`);
      }
    }
    return v;
  }

  function walk(n: ExprNode): number {
    switch (n.kind) {
      case "num": return n.value;
      case "ref": return eval_(n.name);
      case "neg": return -walk(n.inner);
      case "bin": {
        const l = walk(n.lhs), r = walk(n.rhs);
        switch (n.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/":
            if (r === 0) throw new EvaluationError("division by zero");
            return l / r;
        }
      }
    }
  }

  for (const id of Object.keys(defs)) eval_(id);
  return resolved;
}
```

Run: same. Expected: PASS (6/6).

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/expression/evaluator.ts artifacts/hardwareai/convex/cad/expression/__tests__/evaluator.test.ts
git commit -m "feat(cad-ir): expression evaluator with cycle/bounds/divzero checks"
```

---

## Task 6: Schema-tier validator

**Files:**
- Create: `artifacts/hardwareai/convex/cad/validate/schemaTier.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/validate/__tests__/schemaTier.test.ts
import { describe, expect, it } from "vitest";
import { validateSchemaTier } from "../schemaTier";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr { return { ...emptyIr("mm"), ...extra }; }

describe("validateSchemaTier", () => {
  it("returns no violations for an empty IR", () => {
    expect(validateSchemaTier(emptyIr("mm"))).toEqual([]);
  });

  it("detects unresolved profile reference", () => {
    const v = validateSchemaTier(ir({
      features: [{ kind: "extrude", id: "ex", profile: "missing", distance: 3, operation: "new_body" }],
    }));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("schema.unresolved-sketch-ref");
  });

  it("detects duplicate feature ids", () => {
    const v = validateSchemaTier(ir({
      sketches: { s1: { id: "s1", plane: "XY", geometry: [] } },
      features: [
        { kind: "extrude", id: "dup", profile: "s1", distance: 3, operation: "new_body" },
        { kind: "extrude", id: "dup", profile: "s1", distance: 3, operation: "new_body" },
      ],
    }));
    expect(v.some(x => x.ruleId === "schema.duplicate-feature-id")).toBe(true);
  });

  it("detects unresolved face reference in hole", () => {
    const v = validateSchemaTier(ir({
      features: [{
        kind: "hole", id: "h", type: "simple",
        face: { feature: "missing_feat", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
      }],
    }));
    expect(v.some(x => x.ruleId === "schema.unresolved-feature-ref")).toBe(true);
  });

  it("detects feature referring to a later feature", () => {
    const v = validateSchemaTier(ir({
      sketches: { s: { id: "s", plane: "XY", geometry: [] } },
      features: [
        { kind: "fillet", id: "f", edges: [{ feature: "later", query: "all" }], radius: 1 },
        { kind: "extrude", id: "later", profile: "s", distance: 3, operation: "new_body" },
      ],
    }));
    expect(v.some(x => x.ruleId === "schema.forward-feature-ref")).toBe(true);
  });
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/validate/__tests__/schemaTier.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/validate/schemaTier.ts
import type { CadIr, Feature } from "../ir/types";
import type { Violation } from "../../plugins/types";

function v(ruleId: string, message: string, agent: string, location?: Violation["location"]): Violation {
  return { ruleId, severity: "error", message, agentMessage: agent, location };
}

export function validateSchemaTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];
  const seenFeatureIds = new Set<string>();
  const featureIndexById = new Map<string, number>();

  for (let i = 0; i < ir.features.length; i++) {
    const f = ir.features[i];
    if (seenFeatureIds.has(f.id)) {
      out.push(v(
        "schema.duplicate-feature-id",
        `Feature id "${f.id}" is duplicated`,
        `Rename one of the features with id "${f.id}".`,
        { kind: "feature", id: f.id },
      ));
    }
    seenFeatureIds.add(f.id);
    featureIndexById.set(f.id, i);
  }

  function refsToFeatureIds(f: Feature): string[] {
    switch (f.kind) {
      case "fillet":
      case "chamfer":
        return f.edges.map(e => e.feature);
      case "hole":
        return [f.face.feature];
      case "pattern":
        return [f.source];
      default:
        return [];
    }
  }

  for (let i = 0; i < ir.features.length; i++) {
    const f = ir.features[i];
    if (f.kind === "extrude" || f.kind === "cut_extrude") {
      if (!ir.sketches[f.profile]) {
        out.push(v(
          "schema.unresolved-sketch-ref",
          `Feature "${f.id}" references missing sketch "${f.profile}"`,
          `Add a sketch with id "${f.profile}" before feature "${f.id}", or change the profile reference.`,
          { kind: "feature", id: f.id },
        ));
      }
    }
    for (const ref of refsToFeatureIds(f)) {
      const idx = featureIndexById.get(ref);
      if (idx === undefined) {
        out.push(v(
          "schema.unresolved-feature-ref",
          `Feature "${f.id}" references missing feature "${ref}"`,
          `Either add feature "${ref}" before "${f.id}" or change the reference.`,
          { kind: "feature", id: f.id },
        ));
      } else if (idx > i) {
        out.push(v(
          "schema.forward-feature-ref",
          `Feature "${f.id}" references later feature "${ref}"`,
          `Reorder so "${ref}" comes before "${f.id}".`,
          { kind: "feature", id: f.id },
        ));
      }
    }
  }

  return out;
}
```

Run: same. Expected: PASS (5/5).

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/validate/
git commit -m "feat(cad-ir): tier-1 schema validator (refs, dups, forward refs)"
```

---

## Task 7: ResolvedIR + resolver

**Files:**
- Create: `artifacts/hardwareai/convex/cad/resolve/resolveIr.ts`
- Create: `artifacts/hardwareai/convex/cad/resolve/__tests__/resolveIr.test.ts`

Resolver evaluates parameters and replaces every `ParamRef` in features/sketches with concrete numbers.

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/resolve/__tests__/resolveIr.test.ts
import { describe, expect, it } from "vitest";
import { resolveIr } from "../resolveIr";
import { emptyIr } from "../../ir/empty";

describe("resolveIr", () => {
  it("resolves a parameter referenced in an extrude distance", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [] } },
      features: [{
        kind: "extrude" as const, id: "e",
        profile: "s", distance: "thickness",
        operation: "new_body" as const,
      }],
    };
    const out = resolveIr(ir);
    expect((out.features[0] as { distance: number }).distance).toBe(3);
  });

  it("resolves expressions inside positions", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { spacing: { id: "spacing", value: 90 } },
      sketches: {},
      features: [{
        kind: "hole" as const, id: "h", type: "simple" as const,
        face: { feature: "any", tag: "top" },
        positions: [{ x: "spacing / 2", y: 0 }],
        diameter: 6,
      }],
    };
    const out = resolveIr(ir);
    expect((out.features[0] as { positions: Array<{ x: number; y: number }> }).positions[0].x).toBe(45);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/resolve/resolveIr.ts
import type { CadIr, ParamRef, Point2D, Feature } from "../ir/types";
import { evaluateParameters } from "../expression/evaluator";
import { parseExpression, type ExprNode } from "../expression/parser";

export type ResolvedIr = Omit<CadIr, "parameters" | "features" | "sketches"> & {
  resolvedParameters: Record<string, number>;
  features: ResolvedFeature[];
  sketches: Record<string, ResolvedSketch>;
};

type ResolvedSketch = {
  id: string;
  plane: CadIr["sketches"][string]["plane"];
  geometry: ResolvedSketchEntity[];
};
type ResolvedSketchEntity =
  | { kind: "rect"; id: string; center: { x: number; y: number }; width: number; height: number; cornerRadius?: number }
  | { kind: "circle"; id: string; center: { x: number; y: number }; radius: number }
  | { kind: "line"; id: string; p1: { x: number; y: number }; p2: { x: number; y: number } };
type ResolvedFeature = Feature & { __resolved: true } extends infer X
  ? X extends { distance: ParamRef } ? Omit<X, "distance"> & { distance: number } : X
  : never;

export function resolveIr(ir: CadIr): ResolvedIr {
  const params = evaluateParameters(ir.parameters);

  const evalRef = (ref: ParamRef): number => {
    if (typeof ref === "number") return ref;
    if (ref in params) return params[ref];
    return walk(parseExpression(ref));
    function walk(n: ExprNode): number {
      switch (n.kind) {
        case "num": return n.value;
        case "ref":
          if (!(n.name in params)) throw new Error(`unknown parameter "${n.name}" in expression "${ref as string}"`);
          return params[n.name];
        case "neg": return -walk(n.inner);
        case "bin": {
          const l = walk(n.lhs), r = walk(n.rhs);
          switch (n.op) {
            case "+": return l + r;
            case "-": return l - r;
            case "*": return l * r;
            case "/": if (r === 0) throw new Error("division by zero"); return l / r;
          }
        }
      }
    }
  };

  const evalP = (p: Point2D) => ({ x: evalRef(p.x), y: evalRef(p.y) });

  const sketches: Record<string, ResolvedSketch> = {};
  for (const [id, s] of Object.entries(ir.sketches)) {
    sketches[id] = {
      id: s.id, plane: s.plane,
      geometry: s.geometry.map((g): ResolvedSketchEntity => {
        switch (g.kind) {
          case "rect":
            return {
              kind: "rect", id: g.id, center: evalP(g.center),
              width: evalRef(g.width), height: evalRef(g.height),
              cornerRadius: g.cornerRadius !== undefined ? evalRef(g.cornerRadius) : undefined,
            };
          case "circle":
            return { kind: "circle", id: g.id, center: evalP(g.center), radius: evalRef(g.radius) };
          case "line":
            return { kind: "line", id: g.id, p1: evalP(g.p1), p2: evalP(g.p2) };
        }
      }),
    };
  }

  const features = ir.features.map((f): ResolvedFeature => {
    switch (f.kind) {
      case "extrude":
      case "cut_extrude":
        return { ...f, distance: evalRef(f.distance) } as ResolvedFeature;
      case "fillet":
        return { ...f, radius: evalRef(f.radius) } as ResolvedFeature;
      case "chamfer":
        return { ...f, distance: evalRef(f.distance) } as ResolvedFeature;
      case "hole":
        return {
          ...f,
          diameter: evalRef(f.diameter),
          depth: f.depth !== undefined ? evalRef(f.depth) : undefined,
          positions: f.positions.map(evalP),
        } as ResolvedFeature;
      case "pattern":
        return { ...f, spacing: evalRef(f.spacing) } as ResolvedFeature;
    }
  });

  return {
    schemaVersion: ir.schemaVersion,
    units: ir.units,
    resolvedParameters: params,
    sketches,
    features,
    entities: ir.entities,
  };
}
```

Run: same. Expected: PASS (2/2).

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/resolve/
git commit -m "feat(cad-ir): resolveIr — params evaluated, refs concretized"
```

---

## Task 8: Codegen skeleton + extrude

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/compileToBuild123d.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/emitParameters.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/features/extrude.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-extrude.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-extrude.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — extrude", () => {
  it("emits a build123d script for a rectangular extrude", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: {
        length: { id: "length", value: 120 },
        width: { id: "width", value: 40 },
        thickness: { id: "thickness", value: 3 },
      },
      sketches: {
        base_profile: {
          id: "base_profile", plane: "XY" as const,
          geometry: [{ kind: "rect" as const, id: "outer", center: { x: 0, y: 0 }, width: "length", height: "width" }],
        },
      },
      features: [{
        kind: "extrude" as const, id: "extrude_base",
        profile: "base_profile", distance: "thickness",
        operation: "new_body" as const,
      }],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("from build123d import *");
    expect(py).toContain("length = 120");
    expect(py).toContain("with BuildPart() as extrude_base:");
    expect(py).toContain("Rectangle(length, width)");
    expect(py).toContain("extrude(amount=thickness)");
    expect(py).toContain('report_entities("extrude_base", extrude_base)');
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/codegen/compileToBuild123d.ts
import type { ResolvedIr } from "../resolve/resolveIr";
import { emitParameters } from "./emitParameters";
import { emitFeature } from "./emitFeature";

export function compileToBuild123d(ir: ResolvedIr): string {
  const lines: string[] = [];
  lines.push("# generated by compileToBuild123d - do not edit");
  lines.push("from build123d import *");
  lines.push("from report_helpers import report_entities, write_entities_json, apply_pattern");
  lines.push("");
  lines.push(...emitParameters(ir));
  lines.push("");
  let ctx = { parentBodyId: null as string | null };
  for (const f of ir.features) {
    if (f.suppressed) { lines.push(`# feature ${f.id} suppressed`); lines.push(""); continue; }
    lines.push(`# feature: ${f.id}`);
    const { lines: fl, ctxOut } = emitFeature(f, ir, ctx);
    lines.push(...fl);
    ctx = ctxOut;
    lines.push("");
  }
  if (ctx.parentBodyId) {
    lines.push(`export_step(${ctx.parentBodyId}.part, "/out/part.step")`);
    lines.push(`export_stl(${ctx.parentBodyId}.part, "/out/part.stl")`);
    lines.push(`from build123d import export_gltf`);
    lines.push(`export_gltf(${ctx.parentBodyId}.part, "/out/preview.glb")`);
  }
  lines.push(`write_entities_json("/out/entities.json")`);
  return lines.join("\n") + "\n";
}
```

```ts
// artifacts/hardwareai/convex/cad/codegen/emitParameters.ts
import type { ResolvedIr } from "../resolve/resolveIr";
export function emitParameters(ir: ResolvedIr): string[] {
  return Object.entries(ir.resolvedParameters).map(([id, v]) => `${id} = ${v}`);
}
```

```ts
// artifacts/hardwareai/convex/cad/codegen/emitFeature.ts
import type { ResolvedIr } from "../resolve/resolveIr";
import { emitExtrude } from "./features/extrude";

export interface EmitContext {
  parentBodyId: string | null;
}

export function emitFeature(
  f: ResolvedIr["features"][number],
  ir: ResolvedIr,
  ctx: EmitContext,
): { lines: string[]; ctxOut: EmitContext } {
  switch (f.kind) {
    case "extrude":
      return { lines: emitExtrude(f, ir), ctxOut: { parentBodyId: f.id } };
    case "cut_extrude":
    case "fillet":
    case "chamfer":
    case "hole":
    case "pattern":
      return { lines: [`# TODO: emit ${f.kind}`], ctxOut: ctx };
  }
}
```

```ts
// artifacts/hardwareai/convex/cad/codegen/features/extrude.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitExtrude(
  f: Extract<ResolvedIr["features"][number], { kind: "extrude" }>,
  ir: ResolvedIr,
): string[] {
  const sketch = ir.sketches[f.profile];
  if (!sketch) return [`# error: missing sketch ${f.profile}`];
  const lines = [`with BuildPart() as ${f.id}:`];
  lines.push(`    with BuildSketch():`);
  for (const g of sketch.geometry) {
    if (g.kind === "rect") {
      if (g.cornerRadius !== undefined) {
        lines.push(`        RectangleRounded(${refOrLit(g.width, ir)}, ${refOrLit(g.height, ir)}, ${refOrLit(g.cornerRadius, ir)})`);
      } else {
        lines.push(`        Rectangle(${refOrLit(g.width, ir)}, ${refOrLit(g.height, ir)})`);
      }
    } else if (g.kind === "circle") {
      lines.push(`        Circle(${refOrLit(g.radius, ir)})`);
    } else if (g.kind === "line") {
      lines.push(`        Line(${pt(g.p1)}, ${pt(g.p2)})`);
    }
  }
  lines.push(`    extrude(amount=${refOrLit(f.distance, ir)})`);
  lines.push(`report_entities("${f.id}", ${f.id})`);
  return lines;
}

function pt(p: { x: number; y: number }): string {
  return `(${p.x}, ${p.y})`;
}

function refOrLit(v: number, ir: ResolvedIr): string {
  for (const [name, val] of Object.entries(ir.resolvedParameters)) {
    if (val === v) return name;
  }
  return `${v}`;
}
```

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): codegen skeleton + extrude emit"
```

---

## Task 9: cut_extrude emit

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/features/cutExtrude.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-cutExtrude.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-cutExtrude.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — cut_extrude", () => {
  it("emits an extrude(mode=Mode.SUBTRACT) call inside the parent part", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 }, slot_width: { id: "slot_width", value: 6 } },
      sketches: {
        base: { id: "base", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 40 }] },
        slot: { id: "slot", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "s", center: { x: 0, y: 0 }, width: "slot_width", height: "slot_width" }] },
      },
      features: [
        { kind: "extrude" as const, id: "base_body", profile: "base", distance: "thickness", operation: "new_body" as const },
        { kind: "cut_extrude" as const, id: "slot_cut", profile: "slot", distance: "thickness", through: true },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("with base_body:");
    expect(py).toContain("Rectangle(slot_width, slot_width)");
    expect(py).toMatch(/extrude\(amount=thickness, mode=Mode\.SUBTRACT\)/);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement and wire dispatch**

```ts
// artifacts/hardwareai/convex/cad/codegen/features/cutExtrude.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitCutExtrude(
  f: Extract<ResolvedIr["features"][number], { kind: "cut_extrude" }>,
  ir: ResolvedIr,
  parentBodyId: string,
): string[] {
  const sketch = ir.sketches[f.profile];
  if (!sketch) return [`# error: missing sketch ${f.profile}`];
  const lines = [`with ${parentBodyId}:`];
  lines.push(`    with BuildSketch():`);
  for (const g of sketch.geometry) {
    if (g.kind === "rect") {
      if (g.cornerRadius !== undefined) {
        lines.push(`        RectangleRounded(${refOrLit(g.width, ir)}, ${refOrLit(g.height, ir)}, ${refOrLit(g.cornerRadius, ir)})`);
      } else {
        lines.push(`        Rectangle(${refOrLit(g.width, ir)}, ${refOrLit(g.height, ir)})`);
      }
    } else if (g.kind === "circle") {
      lines.push(`        Circle(${refOrLit(g.radius, ir)})`);
    }
  }
  lines.push(`    extrude(amount=${refOrLit(f.distance, ir)}, mode=Mode.SUBTRACT)`);
  lines.push(`report_entities("${f.id}", ${parentBodyId})`);
  return lines;
}

function refOrLit(v: number, ir: ResolvedIr): string {
  for (const [name, val] of Object.entries(ir.resolvedParameters)) {
    if (val === v) return name;
  }
  return `${v}`;
}
```

Update `emitFeature.ts`:

```ts
case "cut_extrude":
  if (!ctx.parentBodyId) return { lines: [`# error: cut_extrude ${f.id} has no parent body`], ctxOut: ctx };
  return { lines: emitCutExtrude(f, ir, ctx.parentBodyId), ctxOut: ctx };
```

(Add `import { emitCutExtrude } from "./features/cutExtrude";` at the top.)

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): cut_extrude emit with parent-body context"
```

---

## Task 10: fillet emit

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/features/fillet.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-fillet.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-fillet.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — fillet", () => {
  it("emits fillet() against the source feature's edges", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 }, r: { id: "r", value: 4 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 50, height: 30 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        { kind: "fillet" as const, id: "round_corners", edges: [{ feature: "base", query: "all" as const }], radius: "r" },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toMatch(/fillet\([^)]*radius=r[^)]*\)/);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/codegen/features/fillet.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitFillet(
  f: Extract<ResolvedIr["features"][number], { kind: "fillet" }>,
  ir: ResolvedIr,
): string[] {
  const lines: string[] = [];
  for (const e of f.edges) {
    if (e.query === "all") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    fillet(${e.feature}.edges(), radius=${refOrLit(f.radius, ir)})`);
    } else if (e.query === "top_loop") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    fillet(${e.feature}.faces().sort_by(Axis.Z)[-1].edges(), radius=${refOrLit(f.radius, ir)})`);
    } else if (e.query === "bottom_loop") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    fillet(${e.feature}.faces().sort_by(Axis.Z)[0].edges(), radius=${refOrLit(f.radius, ir)})`);
    } else {
      lines.push(`# TODO: tagged-edge fillet "${e.query.tag}" — Phase 3`);
    }
  }
  lines.push(`report_entities("${f.id}", ${f.edges[0].feature})`);
  return lines;
}

function refOrLit(v: number, ir: ResolvedIr): string {
  for (const [name, val] of Object.entries(ir.resolvedParameters)) {
    if (val === v) return name;
  }
  return `${v}`;
}
```

Update emitFeature switch:

```ts
case "fillet":
  return { lines: emitFillet(f, ir), ctxOut: ctx };
```

(Add `import { emitFillet } from "./features/fillet";`.)

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): fillet emit (all/top_loop/bottom_loop queries)"
```

---

## Task 11: chamfer emit

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/features/chamfer.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-chamfer.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-chamfer.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — chamfer", () => {
  it("emits chamfer() with length", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 }, c: { id: "c", value: 0.5 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 50, height: 30 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        { kind: "chamfer" as const, id: "ch", edges: [{ feature: "base", query: "top_loop" as const }], distance: "c" },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toMatch(/chamfer\([^)]*length=c[^)]*\)/);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/codegen/features/chamfer.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitChamfer(
  f: Extract<ResolvedIr["features"][number], { kind: "chamfer" }>,
  ir: ResolvedIr,
): string[] {
  const lines: string[] = [];
  for (const e of f.edges) {
    if (e.query === "all") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    chamfer(${e.feature}.edges(), length=${refOrLit(f.distance, ir)})`);
    } else if (e.query === "top_loop") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    chamfer(${e.feature}.faces().sort_by(Axis.Z)[-1].edges(), length=${refOrLit(f.distance, ir)})`);
    } else if (e.query === "bottom_loop") {
      lines.push(`with ${e.feature}:`);
      lines.push(`    chamfer(${e.feature}.faces().sort_by(Axis.Z)[0].edges(), length=${refOrLit(f.distance, ir)})`);
    }
  }
  lines.push(`report_entities("${f.id}", ${f.edges[0].feature})`);
  return lines;
}

function refOrLit(v: number, ir: ResolvedIr): string {
  for (const [name, val] of Object.entries(ir.resolvedParameters)) {
    if (val === v) return name;
  }
  return `${v}`;
}
```

Update emitFeature switch case `"chamfer"` → `emitChamfer`. Add the import. Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): chamfer emit"
```

---

## Task 12: hole emit (simple)

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/features/hole.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — hole", () => {
  it("emits Locations + Hole inside parent body context", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 }, hole_d: { id: "hole_d", value: 6 }, sp: { id: "sp", value: 90 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 120, height: 40 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        {
          kind: "hole" as const, id: "mounting_holes", type: "simple" as const,
          face: { feature: "base", tag: "top" },
          positions: [{ x: "-sp / 2", y: 0 }, { x: "sp / 2", y: 0 }],
          diameter: "hole_d",
        },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("with base:");
    expect(py).toMatch(/with Locations\(\(-45, 0\), \(45, 0\)\)/);
    expect(py).toMatch(/Hole\(radius=hole_d \/ 2/);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/codegen/features/hole.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitHole(
  f: Extract<ResolvedIr["features"][number], { kind: "hole" }>,
  ir: ResolvedIr,
): string[] {
  const lines: string[] = [];
  const positions = f.positions.map(p => `(${p.x}, ${p.y})`).join(", ");
  const radiusExpr = (() => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === f.diameter) return `${name} / 2`;
    }
    return `${f.diameter / 2}`;
  })();
  const depthExpr = f.depth !== undefined
    ? (() => {
        for (const [name, val] of Object.entries(ir.resolvedParameters)) {
          if (val === f.depth) return name;
        }
        return `${f.depth}`;
      })()
    : `1e6`; // through; build123d will treat large depth as effectively through
  lines.push(`with ${f.face.feature}:`);
  lines.push(`    with Locations(${positions}):`);
  lines.push(`        Hole(radius=${radiusExpr}, depth=${depthExpr})`);
  lines.push(`report_entities("${f.id}", ${f.face.feature})`);
  return lines;
}
```

Update `emitFeature.ts` switch case `"hole"` → `emitHole`. Add the import. Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): simple-hole emit (positions + diameter)"
```

---

## Task 13: pattern emit

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/features/pattern.ts`
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-pattern.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/emitFeature.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-pattern.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — pattern", () => {
  it("emits a comment block describing the linear pattern", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { thickness: { id: "thickness", value: 3 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 40 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        { kind: "pattern" as const, id: "rib_array", source: "base", axis: "x" as const, count: 3, spacing: 20 },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toContain("# pattern rib_array: source=base axis=x count=3 spacing=20");
    expect(py).toMatch(/with base:/);
    expect(py).toMatch(/locs = \[Location\(\(.*, 0, 0\)\) for _i in range\(3\)\]/);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/codegen/features/pattern.ts
import type { ResolvedIr } from "../../resolve/resolveIr";

export function emitPattern(
  f: Extract<ResolvedIr["features"][number], { kind: "pattern" }>,
  ir: ResolvedIr,
): string[] {
  const tup = (xExpr: string) =>
    f.axis === "x" ? `(${xExpr}, 0, 0)` :
    f.axis === "y" ? `(0, ${xExpr}, 0)` :
                     `(0, 0, ${xExpr})`;
  const spacingSym = (() => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === f.spacing) return name;
    }
    return `${f.spacing}`;
  })();
  const lines: string[] = [];
  lines.push(`# pattern ${f.id}: source=${f.source} axis=${f.axis} count=${f.count} spacing=${f.spacing}`);
  lines.push(`with ${f.source}:`);
  lines.push(`    locs = [Location(${tup(`${spacingSym} * (_i - (${f.count}-1)/2)`)}) for _i in range(${f.count})]`);
  lines.push(`    apply_pattern(${f.source}, locs)`);
  lines.push(`report_entities("${f.id}", ${f.source})`);
  return lines;
}
```

Note: `apply_pattern` is a Python helper in `report_helpers.py` (Task 14). It re-applies the source feature at each location.

Update `emitFeature.ts` switch case `"pattern"` → `emitPattern`. Add the import. Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/
git commit -m "feat(cad-ir): pattern emit (linear axis array)"
```

---

## Task 14: Sandbox runner Python

**Files:**
- Create: `artifacts/hardwareai/scripts/sandbox/build123d-runner.py`
- Create: `artifacts/hardwareai/scripts/sandbox/report_helpers.py`
- Create: `artifacts/hardwareai/scripts/sandbox/requirements.txt`

This runs inside Vercel Sandbox. It receives the generated script via `/in/script.py`, executes it under a controlled globals dict, captures per-feature status, and writes outputs to `/out/`.

- [ ] **Step 1: Pin deps**

```
# artifacts/hardwareai/scripts/sandbox/requirements.txt
build123d==0.7.0
numpy>=1.26
```

- [ ] **Step 2: Implement report_helpers**

```python
# artifacts/hardwareai/scripts/sandbox/report_helpers.py
"""Helpers used by code-generated build123d scripts. Tracks per-feature
entity counts and writes /out/entities.json at the end.
"""
import json
import hashlib
from build123d import Part, Location

_ENTITIES = {"faces": {}, "edges": {}, "vertices": {}}

def _topology_hash(obj) -> str:
    h = hashlib.sha256()
    h.update(repr(obj).encode())
    return h.hexdigest()[:12]

def report_entities(feature_id: str, body_ctx) -> None:
    """Record named faces/edges produced by a feature."""
    part: Part = body_ctx.part if hasattr(body_ctx, "part") else body_ctx
    faces = part.faces()
    if not faces:
        return
    by_z = sorted(faces, key=lambda f: f.center().Z)
    if by_z:
        _ENTITIES["faces"][f"{feature_id}.bottom"] = {
            "feature": feature_id, "tag": "bottom",
            "topologyHash": _topology_hash(by_z[0]),
        }
        _ENTITIES["faces"][f"{feature_id}.top"] = {
            "feature": feature_id, "tag": "top",
            "topologyHash": _topology_hash(by_z[-1]),
        }
    for f in faces:
        n = f.normal_at(f.center())
        if abs(n.Z) < 0.1:
            tag = None
            if abs(n.X) > 0.9 and n.X > 0:
                tag = "east"
            elif abs(n.X) > 0.9 and n.X < 0:
                tag = "west"
            elif abs(n.Y) > 0.9 and n.Y > 0:
                tag = "north"
            elif abs(n.Y) > 0.9 and n.Y < 0:
                tag = "south"
            if tag:
                _ENTITIES["faces"][f"{feature_id}.{tag}"] = {
                    "feature": feature_id, "tag": tag,
                    "topologyHash": _topology_hash(f),
                }

def apply_pattern(source_part, locations) -> None:
    """Re-apply the source part at each Location. Phase 1 = union of translated copies."""
    base = source_part.part
    for loc in locations:
        copy = base.moved(loc)
        source_part.part = source_part.part + copy

def write_entities_json(path: str) -> None:
    with open(path, "w") as f:
        json.dump(_ENTITIES, f, indent=2)
```

- [ ] **Step 3: Implement runner**

```python
# artifacts/hardwareai/scripts/sandbox/build123d-runner.py
"""Vercel Sandbox entrypoint. Reads /in/script.py, executes it under a
controlled globals dict, captures errors, and writes /out/exec.log alongside
artifacts."""
import builtins
import json
import os
import sys
import traceback

OUT = "/out"
os.makedirs(OUT, exist_ok=True)

log = {"features": {}, "fatal": None}

# Make report_helpers importable
sys.path.insert(0, os.path.dirname(__file__))

run_compiled = builtins.exec  # bound reference to Python's built-in code runner

try:
    with open("/in/script.py") as src:
        code = src.read()
    g = {"__name__": "__sandbox__"}
    compiled = compile(code, "<generated>", "exec")
    run_compiled(compiled, g)
except Exception:
    log["fatal"] = traceback.format_exc()

with open(os.path.join(OUT, "exec.log"), "w") as f:
    json.dump(log, f, indent=2)

if not os.path.exists(os.path.join(OUT, "entities.json")):
    with open(os.path.join(OUT, "entities.json"), "w") as f:
        json.dump({"faces": {}, "edges": {}, "vertices": {}}, f)

sys.exit(0 if log["fatal"] is None else 1)
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/scripts/sandbox/
git commit -m "feat(cad-ir): sandbox python runner + report_helpers"
```

---

## Task 15: Sandbox executor TS wrapper

**Files:**
- Create: `artifacts/hardwareai/convex/cad/executor/runSandbox.ts`

- [ ] **Step 1: Add @vercel/sandbox dependency**

```bash
cd artifacts/hardwareai && pnpm add @vercel/sandbox
git add ../../package.json ../../pnpm-lock.yaml
git commit -m "deps: @vercel/sandbox for cad-ir executor"
```

- [ ] **Step 2: Write the executor**

```ts
// artifacts/hardwareai/convex/cad/executor/runSandbox.ts
"use node";

import { Sandbox } from "@vercel/sandbox";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SandboxRunResult {
  exitCode: number;
  artifacts: {
    step?: ArrayBuffer;
    stl?: ArrayBuffer;
    glb?: ArrayBuffer;
    entities: { faces: Record<string, unknown>; edges: Record<string, unknown>; vertices: Record<string, unknown> };
    log: { features: Record<string, unknown>; fatal: string | null };
  };
}

export async function runSandbox(scriptPython: string): Promise<SandboxRunResult> {
  const helpersDir = path.resolve(__dirname, "../../../scripts/sandbox");
  const runnerPy = await fs.readFile(path.join(helpersDir, "build123d-runner.py"), "utf8");
  const helpersPy = await fs.readFile(path.join(helpersDir, "report_helpers.py"), "utf8");

  const sb = await Sandbox.create({
    image: "python:3.11-slim",
    timeout: 60_000,
  });
  try {
    await sb.exec({ cmd: ["pip", "install", "build123d==0.7.0", "numpy"] });
    await sb.writeFile("/in/script.py", scriptPython);
    await sb.writeFile("/sandbox/build123d-runner.py", runnerPy);
    await sb.writeFile("/sandbox/report_helpers.py", helpersPy);
    const result = await sb.exec({ cmd: ["python", "/sandbox/build123d-runner.py"] });

    const tryRead = async (p: string): Promise<ArrayBuffer | undefined> => {
      try { return (await sb.readFile(p)).buffer; } catch { return undefined; }
    };
    const stepBuf = await tryRead("/out/part.step");
    const stlBuf  = await tryRead("/out/part.stl");
    const glbBuf  = await tryRead("/out/preview.glb");
    const entitiesText = await sb.readFile("/out/entities.json").then(b => new TextDecoder().decode(b));
    const logText      = await sb.readFile("/out/exec.log").then(b => new TextDecoder().decode(b));

    return {
      exitCode: result.exitCode,
      artifacts: {
        step: stepBuf,
        stl: stlBuf,
        glb: glbBuf,
        entities: JSON.parse(entitiesText),
        log: JSON.parse(logText),
      },
    };
  } finally {
    await sb.terminate();
  }
}
```

(Exact `@vercel/sandbox` API names may vary — when running this task, check the SDK's current methods and adjust `writeFile`/`readFile`/`exec` accordingly.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/executor/runSandbox.ts
git commit -m "feat(cad-ir): Vercel Sandbox executor (use node action)"
```

---

## Task 16: Entities parser + geometry-tier validator

**Files:**
- Create: `artifacts/hardwareai/convex/cad/executor/entitiesParser.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/geometryTier.ts`
- Create: `artifacts/hardwareai/convex/cad/executor/__tests__/entitiesParser.test.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/__tests__/geometryTier.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// artifacts/hardwareai/convex/cad/executor/__tests__/entitiesParser.test.ts
import { describe, expect, it } from "vitest";
import { parseEntities } from "../entitiesParser";

describe("parseEntities", () => {
  it("converts /out/entities.json into an EntityRegistry", () => {
    const json = {
      faces: { "extrude_base.top": { feature: "extrude_base", tag: "top", topologyHash: "abcd" } },
      edges: {},
      vertices: {},
    };
    const reg = parseEntities(json);
    expect(reg.faces["extrude_base.top"]).toEqual({
      feature: "extrude_base", tag: "top", topologyHash: "abcd",
    });
  });
});
```

```ts
// artifacts/hardwareai/convex/cad/validate/__tests__/geometryTier.test.ts
import { describe, expect, it } from "vitest";
import { validateGeometryTier } from "../geometryTier";

describe("validateGeometryTier", () => {
  it("returns no violations for a clean run", () => {
    expect(validateGeometryTier({
      log: { features: { extrude_base: { ok: true } }, fatal: null },
      requestedFaceTags: [{ feature: "extrude_base", tag: "top" }],
      entities: { faces: { "extrude_base.top": { feature: "extrude_base", tag: "top", topologyHash: "x" } }, edges: {}, vertices: {} },
    })).toEqual([]);
  });

  it("flags a missing requested face tag", () => {
    const v = validateGeometryTier({
      log: { features: {}, fatal: null },
      requestedFaceTags: [{ feature: "extrude_base", tag: "top" }],
      entities: { faces: {}, edges: {}, vertices: {} },
    });
    expect(v.some(x => x.ruleId === "geometry.entity-tag-missing")).toBe(true);
  });

  it("flags a fatal execution error", () => {
    const v = validateGeometryTier({
      log: { features: {}, fatal: "Traceback ..." },
      requestedFaceTags: [],
      entities: { faces: {}, edges: {}, vertices: {} },
    });
    expect(v.some(x => x.ruleId === "geometry.execution-failed")).toBe(true);
  });
});
```

Run: vitest both. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/executor/entitiesParser.ts
import type { EntityRegistry } from "../ir/types";

export function parseEntities(raw: unknown): EntityRegistry {
  const r = raw as EntityRegistry;
  return {
    faces: r.faces ?? {},
    edges: r.edges ?? {},
    vertices: r.vertices ?? {},
  };
}
```

```ts
// artifacts/hardwareai/convex/cad/validate/geometryTier.ts
import type { Violation } from "../../plugins/types";
import type { EntityRegistry } from "../ir/types";

export interface GeometryTierInput {
  log: { features: Record<string, { ok?: boolean; error?: string }>; fatal: string | null };
  requestedFaceTags: Array<{ feature: string; tag: string }>;
  entities: EntityRegistry;
}

export function validateGeometryTier(inp: GeometryTierInput): Violation[] {
  const out: Violation[] = [];
  if (inp.log.fatal) {
    out.push({
      ruleId: "geometry.execution-failed",
      severity: "error",
      message: "Geometry execution failed.",
      agentMessage: `The build123d script crashed:\n${inp.log.fatal}\nDiagnose the failed feature and propose a minimal patch.`,
    });
  }
  for (const [fid, status] of Object.entries(inp.log.features)) {
    if (status.ok === false) {
      out.push({
        ruleId: "geometry.feature-failed",
        severity: "error",
        message: `Feature "${fid}" failed during execution.`,
        agentMessage: `Feature "${fid}" failed: ${status.error ?? "unknown"}. Propose a patch to fix.`,
        location: { kind: "feature", id: fid },
      });
    }
  }
  for (const req of inp.requestedFaceTags) {
    const key = `${req.feature}.${req.tag}`;
    if (!inp.entities.faces[key]) {
      out.push({
        ruleId: "geometry.entity-tag-missing",
        severity: "error",
        message: `No face matched query (feature="${req.feature}", tag="${req.tag}").`,
        agentMessage: `Feature "${req.feature}" did not produce a face tagged "${req.tag}". Either reference a different tag or change feature ${req.feature} so the face exists.`,
        location: { kind: "face", id: key },
      });
    }
  }
  return out;
}
```

Run: vitest both. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/executor/entitiesParser.ts artifacts/hardwareai/convex/cad/validate/geometryTier.ts artifacts/hardwareai/convex/cad/executor/__tests__/ artifacts/hardwareai/convex/cad/validate/__tests__/geometryTier.test.ts
git commit -m "feat(cad-ir): tier-3 geometry validator + entities parser"
```

---

## Task 17: Revision hashing

**Files:**
- Create: `artifacts/hardwareai/convex/cad/revisions/hash.ts`
- Create: `artifacts/hardwareai/convex/cad/revisions/__tests__/hash.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/revisions/__tests__/hash.test.ts
import { describe, expect, it } from "vitest";
import { hashIr } from "../hash";
import { emptyIr } from "../../ir/empty";

describe("hashIr", () => {
  it("is deterministic", () => {
    const ir = emptyIr("mm");
    expect(hashIr(ir)).toBe(hashIr(ir));
  });
  it("differs when content differs", () => {
    const a = { ...emptyIr("mm"), parameters: { x: { id: "x", value: 1 } } };
    const b = { ...emptyIr("mm"), parameters: { x: { id: "x", value: 2 } } };
    expect(hashIr(a)).not.toBe(hashIr(b));
  });
  it("is order-insensitive in record fields", () => {
    const a = { ...emptyIr("mm"), parameters: { a: { id: "a", value: 1 }, b: { id: "b", value: 2 } } };
    const b = { ...emptyIr("mm"), parameters: { b: { id: "b", value: 2 }, a: { id: "a", value: 1 } } };
    expect(hashIr(a)).toBe(hashIr(b));
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/revisions/hash.ts
import type { CadIr } from "../ir/types";
import { createHash } from "node:crypto";

function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize(obj[k]);
      return acc;
    }, {});
  }
  return v;
}

export function hashIr(ir: CadIr): string {
  const canon = JSON.stringify(canonicalize(ir));
  return createHash("sha256").update(canon).digest("hex");
}
```

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/revisions/
git commit -m "feat(cad-ir): canonicalized SHA-256 revision hashing"
```

---

## Task 18: Convex schema additions

**Files:**
- Modify: `artifacts/hardwareai/convex/schema.ts`

- [ ] **Step 1: Read current schema** to locate the `defineSchema({...})` and `parts` table.

- [ ] **Step 2: Add CAD IR tables and parts fields**

Inside `defineSchema({...})`:

```ts
cad_revisions: defineTable({
  partId: v.id("parts"),
  hash: v.string(),
  parent: v.union(v.string(), v.null()),
  patch: v.optional(v.any()),
  ir: v.any(),
  author: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
  agentTurn: v.optional(v.object({
    sessionId: v.string(),
    turn: v.number(),
    toolName: v.string(),
  })),
  createdAt: v.number(),
  executionStatus: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("cached"),
  ),
  artifactsRefId: v.optional(v.id("cad_revision_artifacts")),
  violations: v.array(v.any()),
})
  .index("by_part", ["partId"])
  .index("by_part_hash", ["partId", "hash"])
  .index("by_part_createdAt", ["partId", "createdAt"]),

cad_revision_artifacts: defineTable({
  revisionHash: v.string(),
  stepStorageId: v.optional(v.id("_storage")),
  stlStorageId: v.optional(v.id("_storage")),
  glbStorageId: v.optional(v.id("_storage")),
  dxfStorageId: v.optional(v.id("_storage")),
  entitiesStorageId: v.optional(v.id("_storage")),
  logStorageId: v.optional(v.id("_storage")),
}).index("by_hash", ["revisionHash"]),
```

In existing `parts` table, add:

```ts
useCadIr: v.optional(v.boolean()),
headRevisionHash: v.optional(v.string()),
```

- [ ] **Step 3: Push schema**

Run: `cd artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`
Expected: clean push.

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/schema.ts
git commit -m "feat(cad-ir): cad_revisions + cad_revision_artifacts tables; parts.useCadIr/headRevisionHash"
```

---

## Task 19: Patch types

**Files:**
- Create: `artifacts/hardwareai/convex/cad/patch/types.ts`

- [ ] **Step 1: Implement**

```ts
// artifacts/hardwareai/convex/cad/patch/types.ts
import type { Feature, ParameterDef } from "../ir/types";

export interface SetParameterPatch {
  kind: "set_parameter";
  param: ParameterDef;
}

export interface AddFeaturePatch {
  kind: "add_feature";
  feature: Feature;
}

// Reserved for Phase 2+; included so tests don't break when added.
export interface ModifyFeaturePatch {
  kind: "modify_feature";
  featureId: string;
  changes: Partial<Feature>;
}
export interface SuppressPatch { kind: "suppress" | "unsuppress"; featureId: string; }
export interface ReorderFeaturePatch { kind: "reorder_feature"; featureId: string; beforeFeatureId?: string; afterFeatureId?: string; }
export interface RemovePatch { kind: "remove"; entityType: "parameter" | "sketch" | "feature"; id: string; }

export type Patch =
  | SetParameterPatch
  | AddFeaturePatch
  | ModifyFeaturePatch
  | SuppressPatch
  | ReorderFeaturePatch
  | RemovePatch;
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/types.ts
git commit -m "feat(cad-ir): patch type discriminated union (Phase 1: set_parameter, add_feature)"
```

---

## Task 20: Patch applier

**Files:**
- Create: `artifacts/hardwareai/convex/cad/patch/apply.ts`
- Create: `artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/patch/__tests__/apply.test.ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../apply";
import { emptyIr } from "../../ir/empty";

describe("applyPatch", () => {
  it("set_parameter adds a new parameter", () => {
    const r = applyPatch(emptyIr("mm"), { kind: "set_parameter", param: { id: "length", value: 120 } });
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.parameters.length.value).toBe(120);
  });

  it("set_parameter updates an existing parameter", () => {
    const r = applyPatch(
      { ...emptyIr("mm"), parameters: { length: { id: "length", value: 100 } } },
      { kind: "set_parameter", param: { id: "length", value: 120 } },
    );
    expect(r.ir.parameters.length.value).toBe(120);
  });

  it("add_feature appends a feature", () => {
    const r = applyPatch(
      { ...emptyIr("mm"), sketches: { s: { id: "s", plane: "XY", geometry: [] } } },
      { kind: "add_feature", feature: { kind: "extrude", id: "e", profile: "s", distance: 3, operation: "new_body" } },
    );
    expect(r.schemaViolations).toEqual([]);
    expect(r.ir.features).toHaveLength(1);
  });

  it("rejects an add_feature whose schema-tier validation fails", () => {
    const r = applyPatch(
      emptyIr("mm"),
      { kind: "add_feature", feature: { kind: "extrude", id: "e", profile: "missing_sketch", distance: 3, operation: "new_body" } },
    );
    expect(r.schemaViolations.length).toBeGreaterThan(0);
    expect(r.ir.features).toHaveLength(0);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/patch/apply.ts
import type { CadIr } from "../ir/types";
import type { Patch } from "./types";
import { validateSchemaTier } from "../validate/schemaTier";
import type { Violation } from "../../plugins/types";

export interface ApplyResult {
  ir: CadIr;
  schemaViolations: Violation[];
}

export function applyPatch(parent: CadIr, patch: Patch): ApplyResult {
  const candidate = applyToCandidate(parent, patch);
  const violations = validateSchemaTier(candidate);
  if (violations.length > 0) {
    return { ir: parent, schemaViolations: violations };
  }
  return { ir: candidate, schemaViolations: [] };
}

function applyToCandidate(parent: CadIr, patch: Patch): CadIr {
  switch (patch.kind) {
    case "set_parameter":
      return { ...parent, parameters: { ...parent.parameters, [patch.param.id]: patch.param } };
    case "add_feature":
      return { ...parent, features: [...parent.features, patch.feature] };
    case "modify_feature":
    case "suppress":
    case "unsuppress":
    case "reorder_feature":
    case "remove":
      throw new Error(`patch kind "${patch.kind}" not implemented in Phase 1`);
  }
}
```

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/
git commit -m "feat(cad-ir): patch applier — set_parameter, add_feature; tier-1 gating"
```

---

## Task 21: Patch agent tools

**Files:**
- Create: `artifacts/hardwareai/convex/cad/patch/tools.ts`
- Create: `artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
import { describe, expect, it } from "vitest";
import { CAD_IR_TOOLS } from "../tools";

describe("CAD_IR_TOOLS", () => {
  it("exports set_parameter and add_feature as Anthropic tools", () => {
    const names = CAD_IR_TOOLS.map(t => t.name).sort();
    expect(names).toEqual(["add_feature", "set_parameter"]);
  });

  it("set_parameter requires id and value", () => {
    const t = CAD_IR_TOOLS.find(t => t.name === "set_parameter")!;
    const props = (t.input_schema as { properties: Record<string, unknown>; required: string[] });
    expect(props.required).toEqual(expect.arrayContaining(["id", "value"]));
  });

  it("add_feature schema covers all six feature kinds", () => {
    const t = CAD_IR_TOOLS.find(t => t.name === "add_feature")!;
    const text = JSON.stringify(t.input_schema);
    for (const kind of ["extrude", "cut_extrude", "fillet", "chamfer", "hole", "pattern"]) {
      expect(text).toContain(kind);
    }
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/patch/tools.ts
import type { AgentTool } from "../../plugins/types";

const SNAKE_PATTERN = "^[a-z][a-z0-9_]{0,31}$";

const setParameter: AgentTool = {
  name: "set_parameter",
  description:
    "Add or update one parameter in the CAD IR. Value may be a literal number or an expression string (e.g. \"length / 2\"). Use snake_case ids.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", pattern: SNAKE_PATTERN, description: "snake_case parameter id" },
      value: { oneOf: [{ type: "number" }, { type: "string" }], description: "literal or expression" },
      unit: { type: "string", enum: ["mm", "in", "deg", "rad"] },
      description: { type: "string", maxLength: 200 },
      bounds: {
        type: "object",
        properties: { min: { type: "number" }, max: { type: "number" } },
      },
    },
    required: ["id", "value"],
  },
};

const addFeature: AgentTool = {
  name: "add_feature",
  description:
    "Append a typed feature to the timeline. Each feature kind has its own required fields. Reference sketches/features by their snake_case id.",
  input_schema: {
    type: "object",
    properties: {
      feature: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "extrude" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
              operation: { enum: ["new_body", "add", "cut", "intersect"] },
            },
            required: ["kind", "id", "profile", "distance", "operation"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "cut_extrude" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
              through: { type: "boolean" },
            },
            required: ["kind", "id", "profile", "distance"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "fillet" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              edges: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    feature: { type: "string", pattern: SNAKE_PATTERN },
                    query: {
                      oneOf: [
                        { enum: ["all", "top_loop", "bottom_loop"] },
                        { type: "object", properties: { tag: { type: "string" } }, required: ["tag"] },
                      ],
                    },
                  },
                  required: ["feature", "query"],
                },
              },
              radius: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "edges", "radius"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "chamfer" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              edges: { type: "array", items: { type: "object" }, minItems: 1 },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "edges", "distance"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "hole" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              type: { const: "simple" },
              face: {
                type: "object",
                properties: { feature: { type: "string", pattern: SNAKE_PATTERN }, tag: { type: "string" } },
                required: ["feature", "tag"],
              },
              positions: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    x: { oneOf: [{ type: "number" }, { type: "string" }] },
                    y: { oneOf: [{ type: "number" }, { type: "string" }] },
                  },
                  required: ["x", "y"],
                },
              },
              diameter: { oneOf: [{ type: "number" }, { type: "string" }] },
              depth: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "type", "face", "positions", "diameter"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "pattern" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              source: { type: "string", pattern: SNAKE_PATTERN },
              axis: { enum: ["x", "y", "z"] },
              count: { type: "integer", minimum: 2, maximum: 64 },
              spacing: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "source", "axis", "count", "spacing"],
          },
        ],
      },
    },
    required: ["feature"],
  },
};

export const CAD_IR_TOOLS: AgentTool[] = [setParameter, addFeature];
```

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
git commit -m "feat(cad-ir): Anthropic tool defs for set_parameter, add_feature"
```

---

## Task 22: System prompt

**Files:**
- Create: `artifacts/hardwareai/convex/cad/prompts.ts`

- [ ] **Step 1: Implement**

```ts
// artifacts/hardwareai/convex/cad/prompts.ts
export const cadIrSystemPromptFragment = `
You are designing a parametric mechanical part using a structured CAD IR.

You MUST work through the patch tools \`set_parameter\` and \`add_feature\`. Never emit
JSON directly; always call a tool.

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
to fix it. Prefer set_parameter over rewriting features.
`;
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/prompts.ts
git commit -m "feat(cad-ir): system prompt fragment"
```

---

## Task 23: Manufacturing-rule port (one rule)

**Files:**
- Create: `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/__tests__/manufacturingTier.test.ts`

Phase 1 ports a single representative rule: **min hole edge distance**.

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/validate/__tests__/manufacturingTier.test.ts
import { describe, expect, it } from "vitest";
import { validateManufacturingTier } from "../manufacturingTier";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("validateManufacturingTier — hole edge distance", () => {
  it("flags a hole too close to the part edge", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: {
        length: { id: "length", value: 50 }, width: { id: "width", value: 30 },
        thickness: { id: "thickness", value: 3 }, hole_d: { id: "hole_d", value: 6 },
      },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: "length", height: "width" }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        { kind: "hole" as const, id: "h", type: "simple" as const, face: { feature: "base", tag: "top" }, positions: [{ x: 24, y: 0 }], diameter: "hole_d" },
      ],
    };
    const v = validateManufacturingTier(resolveIr(ir));
    expect(v.some(x => x.ruleId === "mfg.hole-edge-distance")).toBe(true);
  });

  it("passes when hole is well within the part", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { length: { id: "length", value: 50 }, width: { id: "width", value: 30 }, thickness: { id: "thickness", value: 3 } },
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: "length", height: "width" }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
        { kind: "hole" as const, id: "h", type: "simple" as const, face: { feature: "base", tag: "top" }, positions: [{ x: 0, y: 0 }], diameter: 6 },
      ],
    };
    const v = validateManufacturingTier(resolveIr(ir));
    expect(v.find(x => x.ruleId === "mfg.hole-edge-distance")).toBeUndefined();
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts
import type { ResolvedIr } from "../resolve/resolveIr";
import type { Violation } from "../../plugins/types";

export function validateManufacturingTier(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];

  const partBboxByFeature = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  for (const f of ir.features) {
    if (f.kind === "extrude") {
      const sk = ir.sketches[f.profile];
      if (!sk) continue;
      const rect = sk.geometry.find(g => g.kind === "rect");
      if (!rect || rect.kind !== "rect") continue;
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      partBboxByFeature.set(f.id, {
        minX: rect.center.x - halfW, maxX: rect.center.x + halfW,
        minY: rect.center.y - halfH, maxY: rect.center.y + halfH,
      });
    }
  }

  for (const f of ir.features) {
    if (f.kind !== "hole") continue;
    const bbox = partBboxByFeature.get(f.face.feature);
    if (!bbox) continue;
    const minEdgeDist = 1.5 * f.diameter;
    for (let i = 0; i < f.positions.length; i++) {
      const p = f.positions[i];
      const distToEdge = Math.min(
        p.x - bbox.minX, bbox.maxX - p.x,
        p.y - bbox.minY, bbox.maxY - p.y,
      );
      const requiredEdgeDist = minEdgeDist + f.diameter / 2;
      if (distToEdge < requiredEdgeDist) {
        out.push({
          ruleId: "mfg.hole-edge-distance",
          severity: "error",
          message: `Hole "${f.id}" position #${i + 1} is ${distToEdge.toFixed(2)}mm from edge; ${requiredEdgeDist.toFixed(2)}mm required (1.5× diameter + radius).`,
          agentMessage: `Hole "${f.id}" position #${i + 1} is too close to the part edge. Either move the hole inward, increase the part dimensions, or reduce the hole diameter.`,
          location: { kind: "hole", id: f.id },
        });
      }
    }
  }
  return out;
}
```

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts artifacts/hardwareai/convex/cad/validate/__tests__/manufacturingTier.test.ts
git commit -m "feat(cad-ir): tier-4 manufacturing rule — hole edge distance"
```

---

## Task 24: CAD IR plugin object

**Files:**
- Create: `artifacts/hardwareai/convex/cad/plugin.ts`
- Create: `artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts`
- Modify: `artifacts/hardwareai/convex/plugins/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts
import { describe, expect, it } from "vitest";
import { cadIrPlugin } from "../plugin";

describe("cadIrPlugin", () => {
  it("registers under sheet_metal kind for Phase 1 dispatch", () => {
    expect(cadIrPlugin.kind).toBe("sheet_metal");
  });
  it("exposes both patch tools", () => {
    expect(cadIrPlugin.tools.map(t => t.name).sort()).toEqual(["add_feature", "set_parameter"]);
  });
  it("validate returns [] on an empty IR", () => {
    expect(cadIrPlugin.validate({ schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] }, { scope: null, peerParts: [] })).toEqual([]);
  });
});
```

Run: vitest. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// artifacts/hardwareai/convex/cad/plugin.ts
import type { ProcessPlugin } from "../plugins/types";
import type { CadIr } from "./ir/types";
import { CadIrSchema } from "./ir/schema";
import { CAD_IR_TOOLS } from "./patch/tools";
import { cadIrSystemPromptFragment } from "./prompts";
import { validateSchemaTier } from "./validate/schemaTier";
import { validateManufacturingTier } from "./validate/manufacturingTier";
import { resolveIr } from "./resolve/resolveIr";

export const cadIrPlugin: ProcessPlugin<CadIr> = {
  kind: "sheet_metal",
  dslSchema: CadIrSchema,
  tools: CAD_IR_TOOLS,
  systemPromptFragment: cadIrSystemPromptFragment,
  defaultModel: { model: "claude-sonnet-4-6", effort: "med" },
  rules: [],
  validate: (ir) => {
    const t1 = validateSchemaTier(ir);
    if (t1.length > 0) return t1;
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
  autoRepair: () => null,
  renderPreview: () => ({ meshes: [] }),
  export: () => [],
  estimateCost: () => ({ totalUsd: 0, breakdown: [] }),
  supportedInterfaces: [],
};
```

(Inspect the existing `convex/plugins/index.ts` and decide whether to add a registry entry or rely on specialist-level dispatch. This plan recommends specialist-level dispatch via `parts.useCadIr`; see Task 25.)

Run: vitest. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/cad/plugin.ts artifacts/hardwareai/convex/cad/__tests__/plugin.test.ts
git commit -m "feat(cad-ir): cadIrPlugin — ProcessPlugin<CadIr> with tier-1+4 validate"
```

---

## Task 25: CAD IR specialist action

**Files:**
- Create: `artifacts/hardwareai/convex/specialists/cadIr.ts`
- Create: `artifacts/hardwareai/convex/specialists/cadIrInternals.ts`
- Modify: `artifacts/hardwareai/convex/orchestrator/tick.ts`

- [ ] **Step 1: Implement internals**

```ts
// artifacts/hardwareai/convex/specialists/cadIrInternals.ts
import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

export const _loadPartAndProject = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) throw new Error(`part ${partId} not found`);
    const project = await ctx.db.get(part.projectId);
    return { part, project };
  },
});

export const _getHeadRevision = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part?.headRevisionHash) return null;
    return await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", q => q.eq("partId", partId).eq("hash", part.headRevisionHash!))
      .first();
  },
});

export const _writeRevision = internalMutation({
  args: {
    partId: v.id("parts"),
    hash: v.string(),
    parent: v.union(v.string(), v.null()),
    patch: v.optional(v.any()),
    ir: v.any(),
    author: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    agentTurn: v.optional(v.object({ sessionId: v.string(), turn: v.number(), toolName: v.string() })),
    executionStatus: v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("failed"), v.literal("cached")),
    violations: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cad_revisions", { ...args, createdAt: Date.now() });
    await ctx.db.patch(args.partId, { headRevisionHash: args.hash });
    return args.hash;
  },
});

export const _updateRevisionAfterExecution = internalMutation({
  args: {
    partId: v.id("parts"),
    hash: v.string(),
    executionStatus: v.union(v.literal("succeeded"), v.literal("failed")),
    violations: v.array(v.any()),
    artifactsRefId: v.optional(v.id("cad_revision_artifacts")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("cad_revisions")
      .withIndex("by_part_hash", q => q.eq("partId", args.partId).eq("hash", args.hash))
      .first();
    if (row) await ctx.db.patch(row._id, {
      executionStatus: args.executionStatus,
      violations: args.violations,
      artifactsRefId: args.artifactsRefId,
    });
  },
});
```

- [ ] **Step 2: Implement specialist action**

```ts
// artifacts/hardwareai/convex/specialists/cadIr.ts
"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { cadIrPlugin } from "../cad/plugin";
import { applyPatch } from "../cad/patch/apply";
import { hashIr } from "../cad/revisions/hash";
import { compileToBuild123d } from "../cad/codegen/compileToBuild123d";
import { resolveIr } from "../cad/resolve/resolveIr";
import { runSandbox } from "../cad/executor/runSandbox";
import { validateGeometryTier } from "../cad/validate/geometryTier";
import { runAgentTurn } from "../lib/anthropicClient";
import type { CadIr } from "../cad/ir/types";
import type { Patch } from "../cad/patch/types";
import type { Violation } from "../plugins/types";

const TURN_BUDGET = 3;

export const run = internalAction({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const { part, project } = await ctx.runQuery(internal.specialists.cadIrInternals._loadPartAndProject, { partId });
    if (!part.useCadIr) {
      await ctx.runAction(internal.specialists.sheetMetal.run, { partId });
      return;
    }

    let head = await ctx.runQuery(internal.specialists.cadIrInternals._getHeadRevision, { partId });
    let ir: CadIr = head?.ir ?? { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] };

    let violations: Violation[] = cadIrPlugin.validate(ir, { scope: project?.scope ?? null, peerParts: [] });

    for (let turn = 0; turn < TURN_BUDGET; turn++) {
      if (violations.length === 0) {
        const resolved = resolveIr(ir);
        const py = compileToBuild123d(resolved);
        const sandbox = await runSandbox(py);
        const geomViolations = validateGeometryTier({
          log: sandbox.artifacts.log,
          requestedFaceTags: extractRequestedFaceTags(ir),
          entities: sandbox.artifacts.entities,
        });
        if (geomViolations.length === 0) {
          const hash = hashIr(ir);
          await ctx.runMutation(internal.specialists.cadIrInternals._updateRevisionAfterExecution, {
            partId, hash, executionStatus: "succeeded", violations: [],
          });
          return;
        }
        violations = geomViolations;
      }

      const response = await runAgentTurn({
        model: cadIrPlugin.defaultModel?.model ?? "claude-sonnet-4-6",
        effort: cadIrPlugin.defaultModel?.effort ?? "med",
        systemPrompt: cadIrPlugin.systemPromptFragment,
        tools: cadIrPlugin.tools,
        userMessage: buildRepairPrompt(ir, violations),
      });

      let applied = false;
      for (const tool of response.toolCalls ?? []) {
        const patch = toolCallToPatch(tool);
        if (!patch) continue;
        const result = applyPatch(ir, patch);
        if (result.schemaViolations.length > 0) {
          violations = result.schemaViolations;
          continue;
        }
        ir = result.ir;
        applied = true;
        const hash = hashIr(ir);
        await ctx.runMutation(internal.specialists.cadIrInternals._writeRevision, {
          partId, hash, parent: head?.hash ?? null, patch, ir,
          author: "agent",
          agentTurn: { sessionId: response.sessionId, turn, toolName: tool.name },
          executionStatus: "pending", violations: [],
        });
        head = { ...(head ?? {}), hash, ir } as { hash: string; ir: CadIr };
      }
      if (!applied) break;

      violations = cadIrPlugin.validate(ir, { scope: project?.scope ?? null, peerParts: [] });
    }
    // exhausted budget — surface escalations via existing escalations table (see sheetMetal.ts pattern)
  },
});

function buildRepairPrompt(ir: CadIr, violations: Violation[]): string {
  const summary = `Current IR has ${ir.features.length} features and ${Object.keys(ir.parameters).length} parameters.`;
  const issues = violations.map((v, i) => `${i + 1}. [${v.ruleId}] ${v.agentMessage}`).join("\n");
  return `${summary}\n\nValidation issues:\n${issues}\n\nEmit one patch tool call to fix the most impactful issue.`;
}

function toolCallToPatch(tool: { name: string; input: Record<string, unknown> }): Patch | null {
  if (tool.name === "set_parameter") {
    return { kind: "set_parameter", param: tool.input as Patch & { kind: "set_parameter" }["param"] } as Patch;
  }
  if (tool.name === "add_feature") {
    return { kind: "add_feature", feature: (tool.input as { feature: unknown }).feature as Patch & { kind: "add_feature" }["feature"] } as Patch;
  }
  return null;
}

function extractRequestedFaceTags(ir: CadIr): Array<{ feature: string; tag: string }> {
  const out: Array<{ feature: string; tag: string }> = [];
  for (const f of ir.features) {
    if (f.kind === "hole") out.push({ feature: f.face.feature, tag: f.face.tag });
  }
  return out;
}
```

- [ ] **Step 3: Wire dispatch in tick.ts**

In `convex/orchestrator/tick.ts`, find the `designPart` case (search for `internal.specialists.sheetMetal.run`). Update:

```ts
if (part.useCadIr) {
  await ctx.runAction(internal.specialists.cadIr.run, { partId: part._id });
} else {
  await ctx.runAction(internal.specialists.sheetMetal.run, { partId: part._id });
}
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/specialists/cadIr.ts artifacts/hardwareai/convex/specialists/cadIrInternals.ts artifacts/hardwareai/convex/orchestrator/tick.ts
git commit -m "feat(cad-ir): specialist action wiring patch+execute repair loop"
```

---

## Task 26: setUseCadIr mutation

**Files:**
- Modify: `artifacts/hardwareai/convex/projects/projectMutations.ts`

- [ ] **Step 1: Add mutation**

Locate `setUseNewHarness` and add alongside:

```ts
export const setUseCadIr = mutation({
  args: { partId: v.id("parts"), enabled: v.boolean() },
  handler: async (ctx, { partId, enabled }) => {
    const part = await ctx.db.get(partId);
    if (!part) throw new Error("part not found");
    await ctx.db.patch(partId, { useCadIr: enabled });
    if (enabled) {
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: part.projectId });
    }
  },
});
```

- [ ] **Step 2: Push schema + verify exposed**

Run: `cd artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once`
Expected: clean push.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/projects/projectMutations.ts
git commit -m "feat(cad-ir): setUseCadIr part-level toggle"
```

---

## Task 27: End-to-end mock repair-loop integration test

**Files:**
- Create: `artifacts/hardwareai/convex/cad/__tests__/repair-loop-mock.test.ts`

- [ ] **Step 1: Write the test**

```ts
// artifacts/hardwareai/convex/cad/__tests__/repair-loop-mock.test.ts
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch/apply";
import { resolveIr } from "../resolve/resolveIr";
import { validateSchemaTier } from "../validate/schemaTier";
import { validateManufacturingTier } from "../validate/manufacturingTier";
import { emptyIr } from "../ir/empty";
import type { CadIr } from "../ir/types";
import type { Patch } from "../patch/types";

function fakeAgent(violations: { ruleId: string }[]): Patch[] {
  if (violations.some(v => v.ruleId === "mfg.hole-edge-distance")) {
    return [{ kind: "set_parameter", param: { id: "length", value: 130 } }];
  }
  return [];
}

describe("CAD IR mock repair loop", () => {
  it("converges on a deliberately-broken IR within 3 turns", () => {
    let ir: CadIr = {
      ...emptyIr("mm"),
      parameters: {
        length: { id: "length", value: 50 },
        width: { id: "width", value: 30 },
        thickness: { id: "thickness", value: 3 },
        hole_d: { id: "hole_d", value: 6 },
      },
      sketches: { s: { id: "s", plane: "XY", geometry: [{ kind: "rect", id: "o", center: { x: 0, y: 0 }, width: "length", height: "width" }] } },
      features: [
        { kind: "extrude", id: "base", profile: "s", distance: "thickness", operation: "new_body" },
        { kind: "hole", id: "h", type: "simple", face: { feature: "base", tag: "top" }, positions: [{ x: 24, y: 0 }], diameter: "hole_d" },
      ],
    };

    let violations = [...validateSchemaTier(ir), ...validateManufacturingTier(resolveIr(ir))];
    expect(violations.some(v => v.ruleId === "mfg.hole-edge-distance")).toBe(true);

    for (let turn = 0; turn < 3 && violations.length > 0; turn++) {
      for (const patch of fakeAgent(violations)) {
        const r = applyPatch(ir, patch);
        if (r.schemaViolations.length === 0) ir = r.ir;
      }
      violations = [...validateSchemaTier(ir), ...validateManufacturingTier(resolveIr(ir))];
    }

    expect(violations).toEqual([]);
    expect(ir.parameters.length.value).toBe(130);
  });
});
```

Run: `cd artifacts/hardwareai && npx vitest run convex/cad/__tests__/repair-loop-mock.test.ts`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/__tests__/repair-loop-mock.test.ts
git commit -m "test(cad-ir): mock repair loop converges on hole-edge violation"
```

---

## Task 28: Full bracket golden snapshot

**Files:**
- Create: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-bracket-golden.test.ts`

- [ ] **Step 1: Write the test**

```ts
// artifacts/hardwareai/convex/cad/codegen/__tests__/compile-bracket-golden.test.ts
import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";

describe("compileToBuild123d — bracket golden", () => {
  it("emits a deterministic Python script for the canonical bracket", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: {
        length: { id: "length", value: 120 },
        width: { id: "width", value: 40 },
        thickness: { id: "thickness", value: 3 },
        hole_d: { id: "hole_d", value: 6.5 },
        hole_spacing: { id: "hole_spacing", value: 90 },
        corner_r: { id: "corner_r", value: 4 },
      },
      sketches: {
        base: {
          id: "base", plane: "XY" as const,
          geometry: [{ kind: "rect" as const, id: "outer", center: { x: 0, y: 0 }, width: "length", height: "width", cornerRadius: "corner_r" }],
        },
      },
      features: [
        { kind: "extrude" as const, id: "extrude_base", profile: "base", distance: "thickness", operation: "new_body" as const },
        {
          kind: "hole" as const, id: "mounting_holes", type: "simple" as const,
          face: { feature: "extrude_base", tag: "top" },
          positions: [{ x: "-hole_spacing / 2", y: 0 }, { x: "hole_spacing / 2", y: 0 }],
          diameter: "hole_d",
        },
      ],
    };
    const py = compileToBuild123d(resolveIr(ir));
    expect(py).toMatchSnapshot();
  });
});
```

Run: `npx vitest run convex/cad/codegen/__tests__/compile-bracket-golden.test.ts -u` to create the snapshot. Inspect it. Re-run without `-u` to verify stability.

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/codegen/__tests__/compile-bracket-golden.test.ts artifacts/hardwareai/convex/cad/codegen/__tests__/__snapshots__/
git commit -m "test(cad-ir): bracket golden snapshot for codegen stability"
```

---

## Task 29: Frontend preview component

**Files:**
- Create: `artifacts/hardwareai/src/components/CadPreview.tsx`

- [ ] **Step 1: Implement**

```tsx
// artifacts/hardwareai/src/components/CadPreview.tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface Props { glbUrl: string | undefined; }

export function CadPreview({ glbUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !glbUrl) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, ref.current.clientWidth / ref.current.clientHeight, 0.1, 5000);
    camera.position.set(150, 150, 150);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(ref.current.clientWidth, ref.current.clientHeight);
    ref.current.innerHTML = "";
    ref.current.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(100, 100, 100);
    scene.add(dir);
    new GLTFLoader().load(glbUrl, (gltf) => {
      scene.add(gltf.scene);
      renderer.render(scene, camera);
    });
    return () => {
      renderer.dispose();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [glbUrl]);

  return <div ref={ref} style={{ width: "100%", height: "400px" }} />;
}
```

(Wiring to a part-aware query is a small follow-up; for Phase 1 it suffices to have the viewer compile and render against a known glb URL.)

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/src/components/CadPreview.tsx
git commit -m "feat(cad-ir): CadPreview three.js component for glb artifacts"
```

---

## Task 30: Module README

**Files:**
- Create: `artifacts/hardwareai/convex/cad/README.md`

- [ ] **Step 1: Write README**

```markdown
# convex/cad — CAD IR module

The CAD IR is the agent's source of truth for parametric parts. See the spec at
`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`.

## Module layout

- `ir/` — types, Zod schema, empty factory
- `expression/` — parameter parser + evaluator (DAG, cycles, bounds)
- `resolve/` — IR → ResolvedIR (params concretized)
- `validate/` — five validation tiers (Phase 1: schema, manufacturing, geometry)
- `codegen/` — ResolvedIR → build123d Python
- `executor/` — Vercel Sandbox driver + entities parser
- `revisions/` — content-addressed hashing
- `patch/` — patch types + applier + agent tools
- `plugin.ts` — `cadIrPlugin: ProcessPlugin<CadIr>`

## Phase 1 scope

- Two patch tools: `set_parameter`, `add_feature`
- Six features: `extrude`, `cut_extrude`, `fillet`, `chamfer`, `hole(simple)`, `pattern`
- Three validation tiers: 1 (schema), 3 (geometry), 4 (manufacturing — one rule)
- Single executor: build123d in Vercel Sandbox

## Phase 2+ adds

- More patch tools (modify_feature, suppress, reorder, set_constraint)
- Tier 2 sketch/expression solver, Tier 5 assembly validation
- Hardware features (countersink, threaded, bend-flange)
- URDF/MJCF compiler, FEA, BOM, cost
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): module README"
```

---

## Final verification

- [ ] **Step 1: Full test suite passes**

Run:
```bash
cd artifacts/hardwareai && pnpm test --run
```
Expected:
- All previous 100 tests still pass
- All new tests (target: ≥ 30) pass
- Total: ≥ 130 tests

- [ ] **Step 2: TypeScript baseline maintained**

Run:
```bash
cd artifacts/hardwareai && pnpm tsc --noEmit 2>&1 | grep "error TS" | wc -l
```
Expected: ≤ 38.

- [ ] **Step 3: Convex schema valid**

Run:
```bash
cd artifacts/hardwareai && CONVEX_DEPLOYMENT=dev:amiable-emu-84 npx convex dev --once
```
Expected: clean push.

- [ ] **Step 4: Live e2e (optional, env-gated)**

If `VERCEL_API_TOKEN` is set:
- Create a project with `useCadIr=true`
- Manually feed an initial IR with parameters + sketches + extrude
- Trigger orchestrator tick
- Verify a `cad_revisions` row lands with `executionStatus=succeeded` and a `glb` artifact downloads via `CadPreview`

- [ ] **Step 5: Branch summary**

```bash
git log --oneline feat/cad-ir-phase-1 ^main | wc -l
git diff --stat main..feat/cad-ir-phase-1 | tail -1
```

Open a PR titled `feat(cad-ir): Phase 1 — foundation, executor, first repair loop`.

---

## Phase 1 success criteria (from the spec)

| Criterion | How verified |
|---|---|
| Project with `useCadIr=true` produces parametric bracket end-to-end | Task 27 mock + Task "Step 4" live test |
| Agent emits ≥ 5 patches and STEP downloadable | Task 27 turn count + STEP artifact in Step 4 |
| Geometry-tier violations identified, repair loop converges in ≤ 3 turns | Task 27 mock + Task 25 implementation |
| All 100 existing tests pass | Final verification Step 1 |
| New modules add ≥ 30 tests | Tasks 2–23 each add ≥ 1; total ~35–40 |
| TS error baseline ≤ 38 | Final verification Step 2 |

---

## Out of scope for Phase 1 (deferred)

- More patch tools (Phase 2): `modify_feature`, `suppress`, `reorder`, sketch edits
- Sketch constraint solver (Phase 2)
- Constraint solving for assemblies (Phase 4)
- Other manufacturing rules (Phase 2 — port the rest of `lib/scsRules.ts`)
- Hardware features: countersink, counterbore, threaded, bend-flange, weld-tab (Phase 3)
- Assembly graph + URDF/MJCF (Phase 4)
- FEA / cost / BOM compilers (Phase 5)
- Frontend revision/timeline UI (Phase 5)
- Multi-revision branching (Phase 5)
- DXF export (sheet-metal flat patterns; needs bend-flange — Phase 3)
