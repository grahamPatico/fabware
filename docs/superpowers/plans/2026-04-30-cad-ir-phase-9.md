# CAD IR Phase 9 — External part references + BOM compiler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Let the agent reference off-the-shelf parts (e.g., McMaster-Carr fasteners, motors, bearings) as sub-parts of an assembly without inlining a CAD IR for each. Add a third compile target: BOM (Bill of Materials), which walks the assembly tree and emits a flat parts list — the artifact a manufacturer or fabricator needs.

**Why this slice:** Fabware's product model includes a McMaster-Carr partnership for off-the-shelf assembly parts (see project memory). The existing legacy `PartDsl` had an `assemblyRefs` field for this; the new CAD IR has dropped it. Phase 9 brings it back, properly typed, and adds the BOM emitter that consumes it. Together these turn an assembly IR into something a fabricator can quote and build.

**Architecture:** `PartRef` becomes a discriminated union over `kind: "inline" | "external"`. An external part has a `vendor` + `partNumber` and an optional declared `boundingBox` (for AABB interference; if absent, interference checks skip the external part). The BOM compiler walks the part tree and aggregates externals.

**Builds on:** Phase 8 tip `12f8eac`. Worktree at `~/fabware-cad-ir-phase-9/` on branch `feat/cad-ir-phase-9`.

---

## Prerequisites

- Phase 8 complete (291/291 tests).
- Worktree at `~/fabware-cad-ir-phase-9/` off Phase 8 tip.

---

## File Structure

```
convex/cad/ir/
├── types.ts          # MODIFY — PartRef becomes a union
└── schema.ts         # MODIFY — PartRefSchema as discriminated union

convex/cad/validate/
├── schemaTier.ts     # MODIFY — external parts don't need an ir field
└── rules/partsInterfere.ts  # MODIFY — skip externals without boundingBox

convex/cad/compile/
├── bom.ts            # NEW — compileBom(ir): BomEntry[]
└── __tests__/bom.test.ts

convex/cad/patch/
├── tools.ts          # MODIFY — add_part input_schema accepts external variant
└── __tests__/

convex/specialists/cadIr.ts  # already routes add_part — no change

convex/cad/prompts.ts      # MODIFY
convex/cad/README.md       # MODIFY
```

---

## Task 1: Extend PartRef into discriminated union

**Files:** `convex/cad/ir/types.ts`

- [ ] **Step 1**: Replace the `PartRef` interface:

```ts
/** A part is either an inline IR or a reference to an off-the-shelf component. */
export type PartRef =
  | InlinePartRef
  | ExternalPartRef;

export interface InlinePartRef {
  id: PartId;
  kind?: "inline";  // optional discriminator for backward compat — defaults to "inline"
  ir: CadIr;
  origin?: { x: ParamRef; y: ParamRef; z: ParamRef };
  rotation?: { rx: ParamRef; ry: ParamRef; rz: ParamRef };
}

export interface ExternalPartRef {
  id: PartId;
  kind: "external";
  vendor: string;        // e.g. "McMaster-Carr", "Misumi", "DigiKey"
  partNumber: string;    // vendor-specific SKU
  description?: string;  // human-readable label
  origin?: { x: ParamRef; y: ParamRef; z: ParamRef };
  rotation?: { rx: ParamRef; ry: ParamRef; rz: ParamRef };
  /** Declared bounding box for AABB interference. If absent, interference skips this part. */
  boundingBox?: { width: ParamRef; height: ParamRef; depth: ParamRef };
}
```

(The `kind?: "inline"` on the inline form preserves backward compat: existing IRs without a `kind` field stay valid.)

- [ ] **Step 2**: Verify TS:
```bash
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "convex/cad/ir/types" | head
```

- [ ] **Step 3**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/types.ts
git commit -m "feat(cad-ir): PartRef as union — inline + external (vendor/partNumber)"
```

---

## Task 2: Zod schema update

**Files:** `convex/cad/ir/schema.ts`, `__tests__/schema.test.ts`

- [ ] **Step 1**: Failing tests:

```ts
describe("PartRef external variant", () => {
  it("accepts an external part with vendor + partNumber", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: {
        screw: {
          id: "screw", kind: "external" as const,
          vendor: "McMaster-Carr", partNumber: "91290A115",
          description: "M6 x 20 SHCS", origin: { x: 0, y: 0, z: 0 },
          boundingBox: { width: 6, height: 6, depth: 20 },
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an external part without boundingBox", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: { fastener: { id: "fastener", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" } },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an inline part with explicit kind:inline", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: { body: { id: "body", kind: "inline", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } } },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an inline part WITHOUT explicit kind (backward compat)", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: { body: { id: "body", ir: { schemaVersion: 1, units: "mm", parameters: {}, sketches: {}, features: [] } } },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects external part missing vendor", () => {
    const ir = {
      schemaVersion: 1 as const, units: "mm" as const, parameters: {}, sketches: {}, features: [],
      parts: { x: { id: "x", kind: "external", partNumber: "abc" } },
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
```

- [ ] **Step 2**: Update `PartRef` schema. The current schema is `z.object({ id: Snake, ir: CadIrSchema, origin?, rotation? })`. Replace with a discriminated union:

```ts
const InlinePartRef: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: Snake,
    kind: z.literal("inline").optional(),
    ir: CadIrSchema,
    origin: Origin.optional(),
    rotation: Rotation.optional(),
  })
);

const ExternalPartRef = z.object({
  id: Snake,
  kind: z.literal("external"),
  vendor: z.string().min(1).max(100),
  partNumber: z.string().min(1).max(100),
  description: z.string().max(200).optional(),
  origin: Origin.optional(),
  rotation: Rotation.optional(),
  boundingBox: z.object({
    width: ParamRef, height: ParamRef, depth: ParamRef,
  }).optional(),
});

const PartRef: z.ZodType<unknown> = z.union([InlinePartRef, ExternalPartRef]);
```

(z.union — not discriminatedUnion — because the inline form has an optional `kind` field. Zod's `discriminatedUnion` requires the discriminator be required.)

- [ ] **Step 3**: Run vitest. Expect 5/5 new + existing schema tests pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/ir/schema.ts artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
git commit -m "feat(cad-ir): Zod schema for inline | external PartRef union"
```

---

## Task 3: Schema-tier — external parts skip ir field check

**Files:** `convex/cad/validate/schemaTier.ts`

The existing `validateSchemaTier` doesn't iterate into `parts[*].ir` (sub-IRs aren't recursively validated; that's a future feature). It only checks joint/connection refs against `Object.keys(ir.parts ?? {})`. So no schema-tier changes needed for Task 3; the union resolves uniformly via the part id. Skip this task — but verify by running the existing schemaTier tests.

- [ ] **Step 1**: Run `npx vitest run convex/cad/validate/__tests__/schemaTier.test.ts`. Expect existing pass.

- [ ] **Step 2**: No commit needed. Move to Task 4.

---

## Task 4: AABB interference skips externals without bbox; uses declared bbox if present

**Files:** `convex/cad/validate/rules/partsInterfere.ts`, `__tests__/rules-partsInterfere.test.ts`

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { partsInterfere } from "../rules/partsInterfere";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function makeBoxIr(w: number, h: number, d: number): CadIr {
  return {
    ...emptyIr("mm"),
    sketches: { p: { id: "p", plane: "XY", geometry: [{ kind: "rect", id: "o", center: { x: 0, y: 0 }, width: w, height: h }] } },
    features: [{ kind: "extrude", id: "b", profile: "p", distance: d, operation: "new_body" }],
  };
}

describe("partsInterfere — externals", () => {
  it("ignores external parts without a declared boundingBox", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: makeBoxIr(40, 40, 10), origin: { x: 0, y: 0, z: 0 } },
        screw: { id: "screw", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115", origin: { x: 0, y: 0, z: 5 } },
      },
    };
    expect(partsInterfere(ir)).toEqual([]);
  });

  it("checks an external part if its boundingBox is declared and overlaps", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        body: { id: "body", ir: makeBoxIr(40, 40, 10), origin: { x: 0, y: 0, z: 0 } },
        screw: {
          id: "screw", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115",
          origin: { x: 10, y: 10, z: 0 },
          boundingBox: { width: 6, height: 6, depth: 20 },
        },
      },
    };
    const v = partsInterfere(ir);
    expect(v.some(x => x.ruleId === "assembly.parts-interfere")).toBe(true);
  });
});
```

- [ ] **Step 2**: Update `partsInterfere.ts`:

```ts
// Modify the existing partBboxes-collection loop to handle external parts
for (const [id, part] of Object.entries(ir.parts)) {
  let local: AABB | null;
  if ("kind" in part && part.kind === "external") {
    if (!part.boundingBox) continue; // external without declared bbox — skip
    const bb = part.boundingBox as { width: number; height: number; depth: number };
    local = {
      minX: -bb.width / 2, maxX: bb.width / 2,
      minY: -bb.height / 2, maxY: bb.height / 2,
      minZ: 0, maxZ: bb.depth,
    };
  } else {
    // Inline part — use computePartBbox
    local = computePartBbox((part as { ir: CadIr }).ir);
  }
  if (!local) continue;
  // ... existing transform + push code
}
```

- [ ] **Step 3**: Run vitest, expect both new tests pass + existing tests pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/rules/partsInterfere.ts artifacts/hardwareai/convex/cad/validate/__tests__/rules-partsInterfere.test.ts
git commit -m "feat(cad-ir): AABB interference handles external parts (skip if no bbox; check if declared)"
```

---

## Task 5: BOM compiler

**Files:** `convex/cad/compile/bom.ts`, `__tests__/bom.test.ts`

The BOM walks the assembly tree (recursing through inline parts' sub-assemblies) and aggregates externals by vendor + partNumber. Quantity is the count of references.

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { compileBom } from "../bom";
import type { CadIr } from "../../ir/types";
import { emptyIr } from "../../ir/empty";

describe("compileBom", () => {
  it("returns empty BOM for an IR with no parts", () => {
    expect(compileBom(emptyIr("mm"))).toEqual([]);
  });

  it("collects externals as quantity=1 entries", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        screw1: { id: "screw1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115", description: "M6 x 20 SHCS" },
        screw2: { id: "screw2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
        bearing: { id: "bearing", kind: "external", vendor: "Misumi", partNumber: "B-6800ZZ" },
      },
    };
    const bom = compileBom(ir);
    expect(bom).toHaveLength(2);
    const screw = bom.find(b => b.partNumber === "91290A115");
    expect(screw?.quantity).toBe(2);
    expect(screw?.vendor).toBe("McMaster-Carr");
    const bearing = bom.find(b => b.partNumber === "B-6800ZZ");
    expect(bearing?.quantity).toBe(1);
  });

  it("recurses into inline sub-assemblies", () => {
    const subIr: CadIr = {
      ...emptyIr("mm"),
      parts: {
        screw: { id: "screw", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      },
    };
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        sub: { id: "sub", ir: subIr },
        sub2: { id: "sub2", ir: subIr },
      },
    };
    const bom = compileBom(ir);
    expect(bom).toHaveLength(1);
    expect(bom[0].quantity).toBe(2); // one screw per sub-assembly × 2 sub-assemblies
  });

  it("aggregates by vendor + partNumber across nested levels", () => {
    const subIr: CadIr = {
      ...emptyIr("mm"),
      parts: {
        bolt: { id: "bolt", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      },
    };
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        sub: { id: "sub", ir: subIr },
        topScrew: { id: "topScrew", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      },
    };
    const bom = compileBom(ir);
    expect(bom).toHaveLength(1);
    expect(bom[0].quantity).toBe(2);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/compile/bom.ts
import type { CadIr } from "../ir/types";

export interface BomEntry {
  vendor: string;
  partNumber: string;
  description?: string;
  quantity: number;
}

export function compileBom(ir: CadIr): BomEntry[] {
  const counts = new Map<string, BomEntry>();
  function visit(node: CadIr): void {
    if (!node.parts) return;
    for (const part of Object.values(node.parts)) {
      if ("kind" in part && part.kind === "external") {
        const key = `${part.vendor}::${part.partNumber}`;
        const existing = counts.get(key);
        if (existing) {
          existing.quantity += 1;
          if (!existing.description && part.description) existing.description = part.description;
        } else {
          counts.set(key, {
            vendor: part.vendor,
            partNumber: part.partNumber,
            description: part.description,
            quantity: 1,
          });
        }
      } else {
        // Inline part — recurse
        visit((part as { ir: CadIr }).ir);
      }
    }
  }
  visit(ir);
  return Array.from(counts.values()).sort((a, b) =>
    a.vendor === b.vendor ? a.partNumber.localeCompare(b.partNumber) : a.vendor.localeCompare(b.vendor)
  );
}
```

- [ ] **Step 3**: Run vitest. Expect 4/4 pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/compile/bom.ts artifacts/hardwareai/convex/cad/compile/__tests__/bom.test.ts
git commit -m "feat(cad-ir): BOM compiler — recursive aggregation by vendor+partNumber"
```

---

## Task 6: Update `add_part` tool schema

**Files:** `convex/cad/patch/tools.ts`, `__tests__/tools.test.ts`

The current `add_part` tool's `part` input_schema only accepts the inline form. Update to accept either inline or external.

- [ ] **Step 1**: Replace the `addPart.input_schema.properties.part` with a `oneOf` two-variant union:

```ts
part: {
  oneOf: [
    {
      type: "object",
      description: "Inline part — provide its CAD IR.",
      properties: {
        id: { type: "string", pattern: SNAKE_PATTERN },
        kind: { const: "inline" },  // optional but recommended for clarity
        ir: { type: "object" },
        origin: { /* same as before */ },
        rotation: { /* same as before */ },
      },
      required: ["id", "ir"],
    },
    {
      type: "object",
      description: "External part — vendor + partNumber for off-the-shelf components (McMaster-Carr fasteners, motors, bearings, etc.).",
      properties: {
        id: { type: "string", pattern: SNAKE_PATTERN },
        kind: { const: "external" },
        vendor: { type: "string", minLength: 1 },
        partNumber: { type: "string", minLength: 1 },
        description: { type: "string", maxLength: 200 },
        origin: { /* same as before */ },
        rotation: { /* same as before */ },
        boundingBox: {
          type: "object",
          properties: {
            width: { oneOf: [{ type: "number" }, { type: "string" }] },
            height: { oneOf: [{ type: "number" }, { type: "string" }] },
            depth: { oneOf: [{ type: "number" }, { type: "string" }] },
          },
          required: ["width", "height", "depth"],
        },
      },
      required: ["id", "kind", "vendor", "partNumber"],
    },
  ],
},
```

- [ ] **Step 2**: Add a tools test:

```ts
it("add_part schema accepts both inline and external variants", () => {
  const t = CAD_IR_TOOLS.find(t => t.name === "add_part")!;
  const text = JSON.stringify(t.input_schema);
  expect(text).toContain("inline");
  expect(text).toContain("external");
  expect(text).toContain("vendor");
  expect(text).toContain("partNumber");
});
```

- [ ] **Step 3**: Run vitest. Expect existing tools tests + 1 new pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/patch/tools.ts artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts
git commit -m "feat(cad-ir): add_part tool schema accepts inline | external variants"
```

---

## Task 7: Specialist `toolCallToPatch` handles external part

**Files:** `convex/specialists/cadIr.ts`

The existing `add_part` case in `toolCallToPatch`:

```ts
if (tool.name === "add_part") {
  if (!inp?.part || typeof inp.part !== "object") return null;
  return { kind: "add_part", part: inp.part as PartRef };
}
```

The `inp.part as PartRef` cast is sufficient — the union resolves at runtime via the schema. No changes needed.

- [ ] **Step 1**: Sanity-check that `PartRef` import already covers the union (it does after Task 1).

- [ ] **Step 2**: No commit needed.

---

## Task 8: Prompts + README + final sweep

- [ ] **Step 1**: Update `convex/cad/prompts.ts` with an external-part section:

```
External parts (off-the-shelf components):
- Use add_part with kind: "external" for fasteners, bearings, motors, electronics, etc.
- Provide vendor (e.g. "McMaster-Carr") and partNumber (the vendor's SKU).
- Include description to help the BOM reader.
- Optionally provide boundingBox so AABB interference can check placement.

Example:
  add_part {
    part: {
      id: "trap_screw_1",
      kind: "external",
      vendor: "McMaster-Carr",
      partNumber: "91290A115",
      description: "M6 x 20 SHCS",
      origin: { x: 10, y: 10, z: 0 },
      boundingBox: { width: 6, height: 6, depth: 20 }
    }
  }

The BOM compiler aggregates externals by vendor+partNumber and emits quantities.
```

- [ ] **Step 2**: Add Phase 9 section to `convex/cad/README.md` listing the inline | external union, BOM compiler, and the McMaster-Carr-aligned example.

- [ ] **Step 3**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
git log --oneline 12f8eac..HEAD | wc -l
```

Expect ~302 tests (291 + ~11 new), TS ≤ 38, convex clean, ~7 commits.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/prompts.ts artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 9 — external parts + BOM compiler"
```

---

## Phase 9 success criteria

- `PartRef` is `inline | external` union; both forms parse and round-trip
- AABB interference skips externals without bbox, checks externals with declared bbox
- `compileBom` aggregates externals by vendor+partNumber, recursing into inline sub-assemblies
- `add_part` tool schema teaches the agent both variants
- Backward compat: existing inline parts (without explicit `kind`) keep working
- All Phase 1-8 tests still pass
- TS baseline ≤ 38

---

## Out of scope for Phase 9 (deferred)

- **Real STEP file imports** — `external` declares vendor+partNumber but does not fetch geometry. Future phase: a sandbox-side STEP fetcher + cache.
- **Quote integration with vendor APIs** — McMaster-Carr / Misumi / etc. don't have public APIs for quoting; manual lookup remains.
- **Build123d imports of STEP for externals** — once STEP fetching is in, codegen can reference imported geometry.
- **Cost compiler** — paired with BOM but adds a vendor pricing layer; future phase.
- **Vendor part validation** (does this part number exist?) — defer; the BOM emitter just lists what the agent declares.
