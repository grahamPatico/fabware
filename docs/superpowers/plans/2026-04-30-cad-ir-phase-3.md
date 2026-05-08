# CAD IR Phase 3 — Hardware-spec hole types + bolt clearance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Extend `HoleFeature` from a single `"simple"` type to four real-world hardware types (`simple`, `countersink`, `counterbore`, `threaded`). Add a bolt-clearance manufacturing rule. The agent can now design parts that mate to specific fasteners (M3 / M5 / 1/4-20 etc.) instead of just specifying hole diameters.

**Architecture:** No new modules. Phase 3 extends existing types/schema/codegen/tools/rules with one new sub-rule per hole type. Manufacturing rules grow from 2 (`hole-edge-distance`, `min-wall-thickness`) to 3 with `bolt-clearance`.

**Tech stack:** Same as Phase 2.

**Spec:** [`docs/superpowers/specs/2026-04-29-cad-ir-backbone-design.md`](../specs/2026-04-29-cad-ir-backbone-design.md)
**Builds on:** [Phase 2 plan](2026-04-29-cad-ir-phase-2.md). Worktree should branch off `feat/cad-ir-phase-2` tip.

---

## Prerequisites

- Phase 2 complete on `feat/cad-ir-phase-2` (tip `e2f0e6a`, 183/183 tests).
- New worktree at `~/fabware-cad-ir-phase-3/` on branch `feat/cad-ir-phase-3`.
- `node_modules`, `convex/_generated`, `.env.local` copied over.

---

## File Structure

Mostly modifications:

```
convex/cad/ir/
├── types.ts                          # MODIFY — extend HoleFeature with subtype fields
└── schema.ts                         # MODIFY — Zod refinements per hole type

convex/cad/codegen/features/
├── hole.ts                           # MODIFY — switch on hole.type, emit countersink/counterbore/threaded variants
└── __tests__/compile-hole.test.ts    # MODIFY — add cases for each new type

convex/cad/validate/rules/
└── boltClearance.ts                  # NEW — flag holes too close to bends/edges considering bolt+nut footprint

convex/cad/validate/__tests__/rules-boltClearance.test.ts   # NEW

convex/cad/validate/manufacturingTier.ts   # MODIFY — compose boltClearance

convex/cad/patch/tools.ts             # MODIFY — extend add_feature input_schema for hole subtypes

convex/cad/prompts.ts                 # MODIFY — explain hole subtypes
convex/cad/README.md                  # MODIFY — Phase 3 scope
```

---

## Task 1: Extend `HoleFeature` types

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/ir/types.ts`

- [ ] **Step 1**: Replace the `HoleFeature` interface in `types.ts`:

```ts
export interface HoleFeature extends BaseFeature {
  kind: "hole";
  face: FaceRef;
  positions: Point2D[];
  diameter: ParamRef;
  depth?: ParamRef;
  type: "simple" | "countersink" | "counterbore" | "threaded";
  /** Required when type === "countersink": angle in degrees, typical 82 or 90. */
  countersink?: { diameter: ParamRef; angle: ParamRef };
  /** Required when type === "counterbore": flat-bottom recess for socket-head screws. */
  counterbore?: { diameter: ParamRef; depth: ParamRef };
  /** Required when type === "threaded": fastener spec like "M6" or "1/4-20". */
  thread?: { spec: string; class?: string };
}
```

(`HoleFeature` stays a single interface with optional sub-objects rather than a discriminated union, so existing code that handles all hole features uniformly continues to work without exhaustive switches.)

- [ ] **Step 2**: Verify `npx tsc --noEmit | grep convex/cad/ir/types | wc -l` is 0.

- [ ] **Step 3**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/ir/types.ts
git commit -m "feat(cad-ir): HoleFeature supports countersink/counterbore/threaded subtypes"
```

---

## Task 2: Extend Zod schema with refinements

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/ir/schema.ts`
- Modify: `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts` (add cases)

- [ ] **Step 1**: Add failing tests:

```ts
// append to schema.test.ts
describe("HoleFeature subtypes", () => {
  it("accepts a simple hole (existing behavior)", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "simple",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
      }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a countersink hole with required countersink object", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "countersink",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
        countersink: { diameter: 12, angle: 82 },
      }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a countersink hole missing the countersink object", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "countersink",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
      }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });

  it("accepts a counterbore hole with required counterbore object", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "counterbore",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 4.5,
        counterbore: { diameter: 8, depth: 4 },
      }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a threaded hole with required thread spec", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "threaded",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 5,
        thread: { spec: "M6" },
      }],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a threaded hole with malformed spec", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {},
      features: [{
        kind: "hole", id: "h", type: "threaded",
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 5,
        thread: { spec: "" },
      }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
```

- [ ] **Step 2**: Replace the `HoleFeature` Zod schema in `schema.ts` with type-discriminated refinements:

```ts
const Countersink = z.object({ diameter: ParamRef, angle: ParamRef });
const Counterbore = z.object({ diameter: ParamRef, depth: ParamRef });
const ThreadSpec = z.object({
  spec: z.string().regex(/^(M\d+(\.\d+)?|\d+(\/\d+)?-\d+)$/i, "thread spec must be M-form (e.g. M6) or imperial fractional (e.g. 1/4-20)"),
  class: z.string().max(8).optional(),
});

const HoleFeature = z.object({
  ...Base, kind: z.literal("hole"),
  face: FaceRef,
  positions: z.array(Point2D).min(1),
  diameter: ParamRef,
  depth: ParamRef.optional(),
  type: z.enum(["simple", "countersink", "counterbore", "threaded"]),
  countersink: Countersink.optional(),
  counterbore: Counterbore.optional(),
  thread: ThreadSpec.optional(),
}).superRefine((val, ctx) => {
  if (val.type === "countersink" && !val.countersink) {
    ctx.addIssue({ code: "custom", path: ["countersink"], message: "countersink object required when type=countersink" });
  }
  if (val.type === "counterbore" && !val.counterbore) {
    ctx.addIssue({ code: "custom", path: ["counterbore"], message: "counterbore object required when type=counterbore" });
  }
  if (val.type === "threaded" && !val.thread) {
    ctx.addIssue({ code: "custom", path: ["thread"], message: "thread object required when type=threaded" });
  }
});
```

- [ ] **Step 3**: Run vitest, expect 6/6 new + existing schema tests passing.

- [ ] **Step 4**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/ir/schema.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): Zod refinements for hole subtypes (countersink/counterbore/threaded)"
```

---

## Task 3: Codegen — countersink hole

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/codegen/features/hole.ts`
- Modify: `artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts`

- [ ] **Step 1**: Add failing test:

```ts
it("emits CounterSinkHole for type=countersink", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: { thickness: { id: "thickness", value: 5 }, hole_d: { id: "hole_d", value: 4.5 }, cs_d: { id: "cs_d", value: 9 }, cs_a: { id: "cs_a", value: 82 } },
    sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 80, height: 40 }] } },
    features: [
      { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
      {
        kind: "hole" as const, id: "cs_holes", type: "countersink" as const,
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: "hole_d",
        countersink: { diameter: "cs_d", angle: "cs_a" },
      },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toMatch(/CounterSinkHole\(radius=hole_d \/ 2, counter_sink_radius=cs_d \/ 2, counter_sink_angle=cs_a/);
});
```

- [ ] **Step 2**: Extend `emitHole` in `features/hole.ts` with a switch on `f.type`:

```ts
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

  const refOrLit = (v: number) => {
    for (const [name, val] of Object.entries(ir.resolvedParameters)) {
      if (val === v) return name;
    }
    return `${v}`;
  };

  lines.push(`with ${f.face.feature}:`);
  lines.push(`    with Locations(${positions}):`);

  switch (f.type) {
    case "simple": {
      const depthExpr = f.depth !== undefined ? refOrLit(f.depth as number) : "1e6";
      lines.push(`        Hole(radius=${radiusExpr}, depth=${depthExpr})`);
      break;
    }
    case "countersink": {
      // Spec resolved by Zod refinement: countersink object guaranteed when type==countersink
      const cs = f.countersink!;
      const csR = refOrLit((cs as { diameter: number }).diameter / 2);
      const csA = refOrLit((cs as { angle: number }).angle);
      lines.push(`        CounterSinkHole(radius=${radiusExpr}, counter_sink_radius=${csR}, counter_sink_angle=${csA})`);
      break;
    }
    case "counterbore": {
      const cb = f.counterbore!;
      const cbR = refOrLit((cb as { diameter: number }).diameter / 2);
      const cbD = refOrLit((cb as { depth: number }).depth);
      lines.push(`        CounterBoreHole(radius=${radiusExpr}, counter_bore_radius=${cbR}, counter_bore_depth=${cbD})`);
      break;
    }
    case "threaded": {
      // build123d does not have a first-class threaded hole; we emit a Hole with diameter
      // matching the tap-drill plus a comment. Real threading in OCCT is non-trivial.
      lines.push(`        # threaded hole: spec=${f.thread?.spec ?? "?"}`);
      lines.push(`        Hole(radius=${radiusExpr})`);
      break;
    }
  }
  lines.push(`report_entities("${f.id}", ${f.face.feature})`);
  return lines;
}
```

Note the `(cs as { diameter: number }).diameter / 2` casts — `ResolvedIr` types are still `Feature[]` (the resolver swaps ParamRefs for numbers at runtime but TS doesn't narrow); cast as needed, matching the pattern in `holeEdgeDistance.ts`.

- [ ] **Step 3**: Run vitest, expect new countersink test pass + existing simple-hole test still pass.

- [ ] **Step 4**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/codegen/features/hole.ts artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts
git commit -m "feat(cad-ir): codegen for countersink holes (CounterSinkHole)"
```

---

## Task 4: Codegen — counterbore hole

- [ ] **Step 1**: Add failing test (mirroring countersink test, with type=counterbore + counterbore object):

```ts
it("emits CounterBoreHole for type=counterbore", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: { thickness: { id: "thickness", value: 8 }, hole_d: { id: "hole_d", value: 5 }, cb_d: { id: "cb_d", value: 8 }, cb_depth: { id: "cb_depth", value: 4 } },
    sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 80, height: 40 }] } },
    features: [
      { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
      {
        kind: "hole" as const, id: "cb_holes", type: "counterbore" as const,
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: "hole_d",
        counterbore: { diameter: "cb_d", depth: "cb_depth" },
      },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toMatch(/CounterBoreHole\(radius=hole_d \/ 2, counter_bore_radius=cb_d \/ 2, counter_bore_depth=cb_depth/);
});
```

The implementation in Task 3 already handles `counterbore`. So this test should pass immediately upon adding the test (no implementation change needed).

- [ ] **Step 2**: Run vitest, expect pass.

- [ ] **Step 3**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts
git commit -m "test(cad-ir): codegen counterbore hole verified by case in compile-hole"
```

---

## Task 5: Codegen — threaded hole

- [ ] **Step 1**: Add failing test:

```ts
it("emits a comment + Hole for threaded type with spec", () => {
  const ir = {
    ...emptyIr("mm"),
    parameters: { thickness: { id: "thickness", value: 8 }, hole_d: { id: "hole_d", value: 5 } },
    sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 80, height: 40 }] } },
    features: [
      { kind: "extrude" as const, id: "base", profile: "s", distance: "thickness", operation: "new_body" as const },
      {
        kind: "hole" as const, id: "tap", type: "threaded" as const,
        face: { feature: "base", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: "hole_d",
        thread: { spec: "M6" },
      },
    ],
  };
  const py = compileToBuild123d(resolveIr(ir));
  expect(py).toContain("# threaded hole: spec=M6");
  expect(py).toMatch(/Hole\(radius=hole_d \/ 2\)/);
});
```

The implementation in Task 3 already covers this case.

- [ ] **Step 2**: Run vitest. Expect pass.

- [ ] **Step 3**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/codegen/__tests__/compile-hole.test.ts
git commit -m "test(cad-ir): codegen threaded hole emits spec comment + Hole"
```

---

## Task 6: Bolt-clearance manufacturing rule

When a hole is `countersink`, `counterbore`, or `threaded`, the agent is signaling a fastener will pass through. Bolt clearance requires the *fastener head* (countersink_diameter / counterbore_diameter / nominal-thread + 2× washer) clear from any nearby edges, not just the through-hole.

**Files:**
- Create: `artifacts/hardwareai/convex/cad/validate/rules/boltClearance.ts`
- Create: `artifacts/hardwareai/convex/cad/validate/__tests__/rules-boltClearance.test.ts`
- Modify: `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts`

- [ ] **Step 1**: Failing test:

```ts
// artifacts/hardwareai/convex/cad/validate/__tests__/rules-boltClearance.test.ts
import { describe, expect, it } from "vitest";
import { resolveIr } from "../../resolve/resolveIr";
import { emptyIr } from "../../ir/empty";
import { boltClearance } from "../rules/boltClearance";

describe("boltClearance", () => {
  it("flags a countersink whose head footprint extends past the part edge", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 30, height: 30 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: 4, operation: "new_body" as const },
        {
          kind: "hole" as const, id: "cs", type: "countersink" as const,
          face: { feature: "base", tag: "top" },
          positions: [{ x: 12, y: 0 }], // 3mm from right edge
          diameter: 4,
          countersink: { diameter: 10, angle: 82 }, // 10mm head footprint — clearly hangs off the part
        },
      ],
    };
    const v = boltClearance(resolveIr(ir));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("mfg.bolt-clearance");
  });

  it("passes for a centered countersink with full clearance", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 60, height: 60 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: 4, operation: "new_body" as const },
        {
          kind: "hole" as const, id: "cs", type: "countersink" as const,
          face: { feature: "base", tag: "top" },
          positions: [{ x: 0, y: 0 }],
          diameter: 4,
          countersink: { diameter: 10, angle: 82 },
        },
      ],
    };
    expect(boltClearance(resolveIr(ir))).toEqual([]);
  });

  it("passes for simple holes (rule only applies to fastener-spec holes)", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { s: { id: "s", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 30, height: 30 }] } },
      features: [
        { kind: "extrude" as const, id: "base", profile: "s", distance: 4, operation: "new_body" as const },
        { kind: "hole" as const, id: "h", type: "simple" as const, face: { feature: "base", tag: "top" }, positions: [{ x: 12, y: 0 }], diameter: 4 },
      ],
    };
    expect(boltClearance(resolveIr(ir))).toEqual([]);
  });
});
```

Run, confirm 3 failures (module not found).

- [ ] **Step 2**: Implement:

```ts
// artifacts/hardwareai/convex/cad/validate/rules/boltClearance.ts
import type { ResolvedIr } from "../../resolve/resolveIr";
import type { Violation } from "../../../plugins/types";

// Default washer/wrench access ring around a fastener head, beyond the head's diameter.
const ACCESS_RING = 1.0; // mm

export function boltClearance(ir: ResolvedIr): Violation[] {
  const out: Violation[] = [];

  const partBboxByFeature = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();
  for (const f of ir.features) {
    if (f.kind === "extrude") {
      const sk = ir.sketches[f.profile];
      if (!sk) continue;
      const rect = sk.geometry.find(g => g.kind === "rect");
      if (!rect || rect.kind !== "rect") continue;
      partBboxByFeature.set(f.id, {
        minX: rect.center.x - rect.width / 2, maxX: rect.center.x + rect.width / 2,
        minY: rect.center.y - rect.height / 2, maxY: rect.center.y + rect.height / 2,
      });
    }
  }

  for (const f of ir.features) {
    if (f.kind !== "hole") continue;
    if (f.type === "simple") continue; // covered by hole-edge-distance
    const bbox = partBboxByFeature.get(f.face.feature);
    if (!bbox) continue;

    let headDiameter: number | undefined;
    if (f.type === "countersink" && f.countersink) headDiameter = (f.countersink as { diameter: number }).diameter;
    if (f.type === "counterbore" && f.counterbore) headDiameter = (f.counterbore as { diameter: number }).diameter;
    if (f.type === "threaded") headDiameter = (f.diameter as number) * 2.5; // approx wrench/washer footprint

    if (headDiameter === undefined) continue;
    const requiredHalfFootprint = headDiameter / 2 + ACCESS_RING;

    for (let i = 0; i < f.positions.length; i++) {
      const p = f.positions[i];
      const distToEdge = Math.min(
        p.x - bbox.minX, bbox.maxX - p.x,
        p.y - bbox.minY, bbox.maxY - p.y,
      );
      if (distToEdge < requiredHalfFootprint) {
        out.push({
          ruleId: "mfg.bolt-clearance",
          severity: "error",
          message: `Hole "${f.id}" position #${i + 1} (${f.type}): ${distToEdge.toFixed(2)}mm to nearest edge, but the head footprint plus access ring requires ${requiredHalfFootprint.toFixed(2)}mm.`,
          agentMessage: `The fastener head/wrench footprint for "${f.id}" doesn't fit. Either move the hole inward, increase the part dimensions, or downsize the fastener.`,
          location: { kind: "hole", id: f.id },
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 3**: Compose in `manufacturingTier.ts`:

```ts
import { boltClearance } from "./rules/boltClearance";

export function validateManufacturingTier(ir: ResolvedIr): Violation[] {
  return [
    ...holeEdgeDistance(ir),
    ...minWallThickness(ir),
    ...boltClearance(ir),
  ];
}
```

Run vitest. All 3 new + 4 existing manufacturing tests should pass.

- [ ] **Step 4**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/validate/
git commit -m "feat(cad-ir): mfg rule — bolt-clearance for countersink/counterbore/threaded"
```

---

## Task 7: Update Anthropic tool defs

**Files:**
- Modify: `artifacts/hardwareai/convex/cad/patch/tools.ts`

- [ ] **Step 1**: In the `addFeature` tool's hole sub-schema, replace the existing `type: { const: "simple" }` with the four-way enum and add the conditional sub-objects.

The relevant block (currently in tools.ts) looks like:
```ts
{
  type: "object",
  properties: {
    kind: { const: "hole" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    type: { const: "simple" },
    // ...
```

Replace with:
```ts
{
  type: "object",
  properties: {
    kind: { const: "hole" },
    id: { type: "string", pattern: SNAKE_PATTERN },
    type: { enum: ["simple", "countersink", "counterbore", "threaded"] },
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
    countersink: {
      type: "object",
      properties: {
        diameter: { oneOf: [{ type: "number" }, { type: "string" }] },
        angle: { oneOf: [{ type: "number" }, { type: "string" }] },
      },
      required: ["diameter", "angle"],
      description: "Required when type=countersink. Angle in degrees (typical 82 or 90).",
    },
    counterbore: {
      type: "object",
      properties: {
        diameter: { oneOf: [{ type: "number" }, { type: "string" }] },
        depth: { oneOf: [{ type: "number" }, { type: "string" }] },
      },
      required: ["diameter", "depth"],
      description: "Required when type=counterbore. Flat-bottomed recess for socket-head screws.",
    },
    thread: {
      type: "object",
      properties: {
        spec: { type: "string", description: "Thread spec like M6 or 1/4-20." },
        class: { type: "string" },
      },
      required: ["spec"],
      description: "Required when type=threaded.",
    },
  },
  required: ["kind", "id", "type", "face", "positions", "diameter"],
},
```

- [ ] **Step 2**: Update the existing `tools.test.ts` to test that the schema text contains all four hole types:

```ts
it("add_feature schema accepts all hole subtypes", () => {
  const t = CAD_IR_TOOLS.find(t => t.name === "add_feature")!;
  const text = JSON.stringify(t.input_schema);
  for (const ty of ["simple", "countersink", "counterbore", "threaded"]) {
    expect(text).toContain(ty);
  }
});
```

- [ ] **Step 3**: Run vitest. Expect existing tools tests still pass + new test passes.

- [ ] **Step 4**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
git commit -m "feat(cad-ir): add_feature tool schema includes all hole subtypes"
```

---

## Task 8: Update system prompt to teach the new hole subtypes

- [ ] **Step 1**: Replace the holes section of the prompt in `convex/cad/prompts.ts`. Add:

```
Hole types (use the 'type' field and the corresponding sub-object):
- type: "simple" — through hole or blind hole, no recess
- type: "countersink" — for flat-head screws; needs countersink: { diameter, angle (82° or 90°) }
- type: "counterbore" — for socket-head cap screws; needs counterbore: { diameter, depth }
- type: "threaded" — tapped hole; needs thread: { spec: "M6" or "1/4-20" }; emit the tap-drill diameter

When a fastener will be installed, prefer "countersink" / "counterbore" / "threaded" over "simple"
so the manufacturing checker can verify the head footprint fits.
```

- [ ] **Step 2**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/prompts.ts
git commit -m "feat(cad-ir): prompt teaches hole subtypes and fastener guidance"
```

---

## Task 9: Plugin test refresh + README + final sweep

- [ ] **Step 1**: Confirm the existing `plugin.test.ts` doesn't assert the OLD hole-type literal `"simple"`. If it does, update.

- [ ] **Step 2**: Add a Phase 3 section to `convex/cad/README.md` listing the new hole subtypes, the bolt-clearance rule, and the prompt update. Note that bend-flange and weld-tab are still deferred.

- [ ] **Step 3**: Run final sweep:

```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
```

Expect:
- Tests: 183 (Phase 2) + 6 (schema subtype tests) + 1 (countersink emit) + 1 (counterbore emit) + 1 (threaded emit) + 3 (boltClearance) + 1 (tools subtype) = 196. Report actual.
- TS errors ≤ 38
- Convex push clean

- [ ] **Step 4**: Commit:

```bash
git add artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 3 — hardware hole subtypes + bolt clearance"
```

---

## Phase 3 success criteria

| Criterion | How verified |
|---|---|
| `HoleFeature` accepts 4 type values with type-correct sub-objects | Tasks 1+2 |
| Zod refinements reject malformed combinations | Task 2 tests |
| Codegen emits build123d's CounterSinkHole / CounterBoreHole correctly | Tasks 3+4 |
| Threaded holes emit a comment + nominal hole | Task 5 |
| Bolt-clearance rule fires on too-close countersink/counterbore/threaded | Task 6 |
| Agent tool schema lists all subtypes | Task 7 |
| Prompt teaches subtype usage | Task 8 |
| All Phase 1+2 tests still pass | Task 9 |
| TS error baseline ≤ 38 | Task 9 |

---

## Out of scope for Phase 3 (deferred)

- Bend-flange feature for sheet-metal forming (Phase 4)
- Weld-tab feature (Phase 4)
- Sketch constraint solver / Tier 2 validation (Phase 4)
- Real OCCT thread modeling (deferred indefinitely — needs custom geometry, not standard build123d)
- Imperial unit support beyond the thread-spec regex (Phase 5+)
- McMaster-aware fastener lookup (would let the agent ask "which screw fits?" — Phase 5)
