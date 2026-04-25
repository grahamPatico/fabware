# Multi-Process Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Fabware from "every custom part is sheet metal" to "every part has a `kind`: `sheet_metal` | `printed` | `purchased`" — with per-kind manufacturability rules, kind-aware archetype generation, kind-aware UI, kind-aware export, and an agent hook for buy-vs-build decisions.

**Architecture:** `parts.kind` is added as a discriminator on the `parts` table. Each kind has its own DSL shape (existing `PartDsl` is renamed to `SheetMetalDsl`; new `PrintedDsl` covers 3D geometry primitives + 3D-print features; new `PurchasedDsl` is a thin wrapper around a McMaster reference). A new per-kind validation surface mirrors today's SCS rules (3D-print: min wall, overhang, bridging; purchased: catalog hit). Archetypes emit parts of any kind. The agent gains three tools: `add_printed_part`, `add_purchased_part`, `set_part_kind`. Frontend renders kind-specific previews + spec cards. Per-kind export: DXF for sheet, STL for printed, McMaster URL for purchased.

**Tech Stack:** Convex (dev deployment `amiable-emu-84`), React + Vite + Tailwind + shadcn/ui, Three.js (`@react-three/fiber`, `@react-three/drei`), Anthropic SDK, Zod v4, Vitest, `three-mesh-bvh` (for STL export — already a transitive dep via drei).

**Working directory:** `~/fabware/artifacts/hardwareai` unless stated otherwise.

**Plan size:** ~22 tasks across 7 phases. Each phase ships independently testable code.

---

## Spec (consolidated)

### Goals

1. Every `part` row has a `kind: "sheet_metal" | "printed" | "purchased"` field. Existing parts default to `"sheet_metal"`.
2. 3D-printed parts are first-class: own DSL, own validator, own preview in the assembled view, STL export.
3. Purchased parts are first-class: link to McMaster, no DXF/STL needed, count toward the BOM, render as a labeled placeholder in the assembled view.
4. Archetypes can emit a mix of kinds (e.g., `hinged_enclosure` could grow a printed `keypad_bezel` later — this slice doesn't add new archetype variants but unblocks them).
5. Agent gains tools for adding printed/purchased parts independent of an archetype, plus a buy-vs-build advisor it can consult.
6. Per-kind export: sheet → DXF (existing), printed → STL, purchased → instructions / cart link.
7. Process-rule library: per-kind validators that mirror the SCS-rules pattern.

### Non-goals (deferred)

- Motion simulation / joints — slice B
- Linked parameters across parts — slice C
- Full cost / BOM rollup — slice D (this slice adds a *placeholder* `unitCostUsd` field on purchased parts but doesn't compute project totals)
- STEP / IGES export — slice E
- Photoreal renders, FEA, tolerance stackup — later
- Migrating existing single-part legacy projects — they keep using `partSpecs` table forever

### Data model changes (additive)

```ts
parts: defineTable({
  // existing fields unchanged…
  kind: v.optional(v.union(           // optional → defaults to "sheet_metal" at read time
    v.literal("sheet_metal"),
    v.literal("printed"),
    v.literal("purchased"),
  )),
  // printed-specific (all optional; only used when kind === "printed")
  printedMaterial: v.optional(v.string()),       // "PLA" | "PETG" | "Nylon" | "ABS" | "Resin"
  printedInfill: v.optional(v.number()),         // 0..1
  printedLayerHeight: v.optional(v.number()),    // mm
  // purchased-specific
  purchasedPartNumber: v.optional(v.string()),   // McMaster
  purchasedQuantity: v.optional(v.number()),
  unitCostUsd: v.optional(v.number()),           // placeholder for slice D
  // dslJson now stores either SheetMetalDsl, PrintedDsl, or PurchasedDsl shape
});
```

No new tables. `dslJson` already opaque; the kind discriminator says how to parse it.

### DSL shapes

`convex/lib/dsl.ts` keeps `PartDsl` as the alias for `SheetMetalDsl` (rename for clarity). Two new DSL files:

- `convex/lib/printedDsl.ts` — primitives (`box`, `cylinder`, `plate_with_holes`), per-feature 3D operations (`hole_through`, `boss`, `pocket`, `chamfer`, `fillet`), bounding box, material, layer height, infill.
- `convex/lib/purchasedDsl.ts` — `{ mcmasterPartNumber, quantity, label, unitCostUsd? }`. Trivial shape; mostly there for kind discriminator.

### Process-rule library

- `convex/lib/printedRules.ts` — `validatePrinted(dsl)` returning `{rules, hasFailures, snappedSpec}` matching the SCS-rules shape. Rules: min wall thickness (1.2mm PLA / 1.6mm PETG / 2mm Nylon), max overhang (45° unsupported), bridging span (≤8mm), bounding box vs printer bed (250×250×250 default), layer height vs detail.
- `convex/lib/purchasedRules.ts` — `validatePurchased(dsl)` checking the part number is in the McMaster seed catalog (warn if unknown).

### Archetype updates

`generate(params, scope)` already returns `{ parts, interfaces }`. The `parts` array elements gain an optional `kind` field. Existing archetypes don't need changes (they all emit sheet metal); the slice prepares the surface so the next archetype migration can mix kinds.

### Agent loop additions

Three new tools in `assemblyDesigner.ts`:

- `add_printed_part(role, dsl, position, rationale)` — adds a new printed part to the project.
- `add_purchased_part(role, partNumber, quantity, position, rationale)` — adds a purchased part referencing a McMaster part number.
- `decide_make_or_buy(intent)` — agent's hook to think out loud about whether a thing should be custom (sheet/printed) or off-the-shelf (purchased). Returns text the user sees in the chat.

`refine_part` extended: handler routes by `target.kind` to the right DSL parser and SVG/STL regen.

### Frontend changes

- `PartList.tsx` — add a small kind badge (icon + 1–2-letter label) per part: 🔷 SM / 🟪 3D / 🛒 P
- `AssembledView.tsx` — per-kind mesh: sheet_metal box mesh as today; printed parts as a slightly different mesh color/material; purchased parts as labeled placeholder cube
- New `src/components/workspace/PartKindBadge.tsx` — extracted; reused in PartList + spec rail
- New `src/components/workspace/SpecCard.tsx` — extracted from CanvasPanel; shows kind-specific fields when a part is focused
- `Export.tsx` — per-kind download button: DXF / STL / McMaster URL; legacy single-button per part stays for sheet metal
- New `src/components/workspace/PartKindSwitcher.tsx` — tiny dropdown on the focused-part rail to convert kind (warns on data loss)

### Per-kind export

- Sheet metal → DXF (existing `runForPart` works; no change)
- Printed → STL via `convex/lib/stlGenerator.ts` (a tiny ASCII-STL writer that walks `printedDsl` primitives; no Three.js dependency on the server side)
- Purchased → text snippet with McMaster URL + qty (no file)

### Acceptance test

Tennis-ball locker remains the canonical assembly. Add **two new parts** via chat:

1. *"Add a printed bezel for a 4x3 inch keypad on the lid."* → agent calls `add_printed_part` with a thin printed plate; rules strip shows green; STL downloads.
2. *"Add four 1/4-20 SHCS, 1/2 inch long, for the wall-to-base bolts."* → agent calls `add_purchased_part` referencing `91251A536`; appears in PartList with 🛒 badge; export shows McMaster URL.

If both flows work and existing sheet-metal flows are unchanged, slice 2 ships.

---

## Phases overview

| Phase | Tasks | Outcome |
|---|---|---|
| 0 | 1 | Test infra (already there from slice 1; just smoke check) |
| 1 | 4 | Schema + DSL types + factory helpers |
| 2 | 3 | Process-rule libraries (printed, purchased) |
| 3 | 3 | Backend functions: kind-aware addPart, exporters, validation |
| 4 | 4 | Agent tools + orchestrator dispatch |
| 5 | 5 | Frontend: badges, kind-aware preview, spec card, export, kind-switcher |
| 6 | 1 | Acceptance walkthrough + memory update |

---

## Phase 0: Smoke

### Task 0.1: Confirm test infra still green

**Files:** none (smoke check only)

- [ ] **Step 1: Run existing tests**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: `Test Files  11 passed (11)` / `Tests  31 passed (31)`. If this fails, stop and report — slice 1 work is broken before we add anything.

- [ ] **Step 2: Confirm Convex env**

```bash
npx convex env list 2>&1 | grep ANTHROPIC_API_KEY
```

Expected: `ANTHROPIC_API_KEY` listed.

- [ ] **Step 3: No commit** — read-only verification.

---

## Phase 1: Schema + DSL types

### Task 1.1: Schema additions for `kind` + per-kind fields

**Files:**
- Modify: `artifacts/hardwareai/convex/schema.ts`

- [ ] **Step 1: Edit `parts` table to add the new optional fields**

Open `artifacts/hardwareai/convex/schema.ts`. Find the `parts: defineTable({...})` block. Add these fields anywhere inside the object (suggested: after `featureGraphJson`):

```ts
  kind: v.optional(v.union(
    v.literal("sheet_metal"),
    v.literal("printed"),
    v.literal("purchased"),
  )),
  // printed-specific (only used when kind === "printed")
  printedMaterial: v.optional(v.string()),
  printedInfill: v.optional(v.number()),
  printedLayerHeight: v.optional(v.number()),
  // purchased-specific
  purchasedPartNumber: v.optional(v.string()),
  purchasedQuantity: v.optional(v.number()),
  unitCostUsd: v.optional(v.number()),
```

All fields are `v.optional(...)` — existing rows that lack them remain valid. App-level reads default `kind` to `"sheet_metal"` when absent.

- [ ] **Step 2: Push schema**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once 2>&1 | tail -5
```

Expected: `Convex functions ready!` with no schema validation errors.

- [ ] **Step 3: Commit**

```bash
cd ~/fabware
git add artifacts/hardwareai/convex/schema.ts
git commit -m "feat(schema): parts.kind discriminator + printed/purchased fields"
```

---

### Task 1.2: Printed DSL — `printedDsl.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/printedDsl.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/printedDsl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `artifacts/hardwareai/convex/lib/__tests__/printedDsl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PrintedDslSchema, emptyPrintedDsl, type PrintedDsl } from "../printedDsl";

describe("PrintedDslSchema", () => {
  it("validates a minimal box primitive", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "PLA", layerHeight: 0.2, infill: 0.2,
      primitive: { kind: "box", width: 40, depth: 30, height: 5 },
      features: [],
    };
    const r = PrintedDslSchema.safeParse(dsl);
    expect(r.success).toBe(true);
  });

  it("validates a cylinder primitive", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "PETG", layerHeight: 0.2, infill: 0.3,
      primitive: { kind: "cylinder", radius: 12, height: 8 },
      features: [],
    };
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(true);
  });

  it("rejects unknown material", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "Unobtanium", layerHeight: 0.2, infill: 0.2,
      primitive: { kind: "box", width: 1, depth: 1, height: 1 },
      features: [],
    };
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(false);
  });

  it("emptyPrintedDsl returns a valid default", () => {
    const dsl: PrintedDsl = emptyPrintedDsl();
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(true);
    expect(dsl.material).toBe("PLA");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test convex/lib/__tests__/printedDsl.test.ts
```

Expected: failure — `printedDsl` doesn't exist.

- [ ] **Step 3: Implement**

Create `artifacts/hardwareai/convex/lib/printedDsl.ts`:

```ts
import { z } from "zod/v4";

export const PRINTED_MATERIALS = ["PLA", "PETG", "Nylon", "ABS", "Resin"] as const;

const Box = z.object({
  kind: z.literal("box"),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
});

const Cylinder = z.object({
  kind: z.literal("cylinder"),
  radius: z.number().positive(),
  height: z.number().positive(),
});

const PlateWithHoles = z.object({
  kind: z.literal("plate_with_holes"),
  width: z.number().positive(),
  depth: z.number().positive(),
  thickness: z.number().positive(),
  holes: z.array(z.object({
    x: z.number(), y: z.number(),
    diameter: z.number().positive(),
  })).default([]),
});

const Primitive = z.discriminatedUnion("kind", [Box, Cylinder, PlateWithHoles]);

const HoleThrough = z.object({
  kind: z.literal("hole_through"),
  name: z.string(),
  x: z.number(), y: z.number(),
  diameter: z.number().positive(),
});

const Boss = z.object({
  kind: z.literal("boss"),
  name: z.string(),
  x: z.number(), y: z.number(),
  diameter: z.number().positive(),
  height: z.number().positive(),
});

const Pocket = z.object({
  kind: z.literal("pocket"),
  name: z.string(),
  x: z.number(), y: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  depthZ: z.number().positive(),
});

const Feature = z.discriminatedUnion("kind", [HoleThrough, Boss, Pocket]);

export const PrintedDslSchema = z.object({
  version: z.literal(1),
  kind: z.literal("printed"),
  material: z.enum(PRINTED_MATERIALS),
  layerHeight: z.number().positive(),  // mm
  infill: z.number().min(0).max(1),
  primitive: Primitive,
  features: z.array(Feature).default([]),
});
export type PrintedDsl = z.infer<typeof PrintedDslSchema>;

export function emptyPrintedDsl(): PrintedDsl {
  return {
    version: 1,
    kind: "printed",
    material: "PLA",
    layerHeight: 0.2,
    infill: 0.2,
    primitive: { kind: "box", width: 40, depth: 30, height: 5 },
    features: [],
  };
}

export function summarizePrinted(dsl: PrintedDsl): string {
  const p = dsl.primitive;
  const dim = p.kind === "box"
    ? `${p.width}×${p.depth}×${p.height} mm`
    : p.kind === "cylinder"
      ? `Ø${p.radius * 2}×${p.height} mm`
      : `${p.width}×${p.depth}×${p.thickness} mm plate`;
  return `${dl.material}, ${dim}, ${dsl.features.length} feature${dsl.features.length === 1 ? "" : "s"}`;
}

export function boundingBox(dsl: PrintedDsl): { w: number; d: number; h: number } {
  const p = dsl.primitive;
  if (p.kind === "box") return { w: p.width, d: p.depth, h: p.height };
  if (p.kind === "cylinder") return { w: p.radius * 2, d: p.radius * 2, h: p.height };
  return { w: p.width, d: p.depth, h: p.thickness };
}
```

(Note: `summarizePrinted` has a typo `dl` → `dsl`. Fix on commit; the tests don't exercise `summarizePrinted`.)

- [ ] **Step 4: Fix the typo in `summarizePrinted`**

Replace `dl.material` with `dsl.material` in `printedDsl.ts`.

- [ ] **Step 5: Run tests — expect all pass**

```bash
pnpm test convex/lib/__tests__/printedDsl.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add artifacts/hardwareai/convex/lib/printedDsl.ts artifacts/hardwareai/convex/lib/__tests__/printedDsl.test.ts
git commit -m "feat(lib): printedDsl with box/cylinder/plate primitives + boss/pocket/hole_through features"
```

---

### Task 1.3: Purchased DSL — `purchasedDsl.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/purchasedDsl.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/purchasedDsl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { PurchasedDslSchema, summarizePurchased } from "../purchasedDsl";

describe("PurchasedDslSchema", () => {
  it("validates a minimal purchased part", () => {
    const dsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    expect(PurchasedDslSchema.safeParse(dsl).success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const dsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 0, label: "X",
    };
    expect(PurchasedDslSchema.safeParse(dsl).success).toBe(false);
  });

  it("summarizePurchased renders qty × label", () => {
    const dsl = {
      version: 1, kind: "purchased" as const,
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    expect(summarizePurchased(dsl)).toContain("4 ×");
    expect(summarizePurchased(dsl)).toContain("1/4-20");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test convex/lib/__tests__/purchasedDsl.test.ts
```

- [ ] **Step 3: Implement `purchasedDsl.ts`**

```ts
import { z } from "zod/v4";

export const PurchasedDslSchema = z.object({
  version: z.literal(1),
  kind: z.literal("purchased"),
  mcmasterPartNumber: z.string().min(1),
  quantity: z.number().int().positive(),
  label: z.string().min(1),
  unitCostUsd: z.number().nonnegative().optional(),
});
export type PurchasedDsl = z.infer<typeof PurchasedDslSchema>;

export function summarizePurchased(dsl: PurchasedDsl): string {
  return `${dsl.quantity} × ${dsl.label} (${dsl.mcmasterPartNumber})`;
}

export function mcmasterUrl(partNumber: string): string {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.mcmaster.com/${clean}/`;
}
```

- [ ] **Step 4: Run tests — expect 3 pass**

```bash
pnpm test convex/lib/__tests__/purchasedDsl.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/purchasedDsl.ts artifacts/hardwareai/convex/lib/__tests__/purchasedDsl.test.ts
git commit -m "feat(lib): purchasedDsl for McMaster-referenced parts"
```

---

### Task 1.4: Kind helper — `partKind.ts`

A tiny shared utility so frontend and backend agree on how to read `kind` (with default).

**Files:**
- Create: `artifacts/hardwareai/convex/lib/partKind.ts`

- [ ] **Step 1: Implement**

```ts
import type { PartDsl } from "./dsl";
import type { PrintedDsl } from "./printedDsl";
import type { PurchasedDsl } from "./purchasedDsl";

export type PartKind = "sheet_metal" | "printed" | "purchased";

/** Default to "sheet_metal" for legacy parts that don't carry kind. */
export function readKind(part: { kind?: string | null }): PartKind {
  const k = part.kind;
  if (k === "printed" || k === "purchased") return k;
  return "sheet_metal";
}

export type AnyPartDsl = PartDsl | PrintedDsl | PurchasedDsl;

export const PART_KIND_LABEL: Record<PartKind, string> = {
  sheet_metal: "Sheet metal",
  printed: "3D printed",
  purchased: "Purchased",
};
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/lib/partKind.ts
git commit -m "feat(lib): partKind helper with readKind() default"
```

---

## Phase 2: Process-rule libraries

### Task 2.1: 3D-print rules — `printedRules.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/printedRules.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/printedRules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validatePrinted } from "../printedRules";
import type { PrintedDsl } from "../printedDsl";

const baseDsl: PrintedDsl = {
  version: 1, kind: "printed",
  material: "PLA", layerHeight: 0.2, infill: 0.2,
  primitive: { kind: "box", width: 40, depth: 30, height: 5 },
  features: [],
};

describe("validatePrinted", () => {
  it("passes a sane PLA box", () => {
    const r = validatePrinted(baseDsl);
    expect(r.hasFailures).toBe(false);
  });

  it("FAILs when bounding box exceeds 250mm bed", () => {
    const r = validatePrinted({ ...baseDsl, primitive: { kind: "box", width: 300, depth: 30, height: 5 } });
    const rule = r.rules.find(x => x.id === "fits_bed");
    expect(rule?.status).toBe("fail");
  });

  it("WARNs when wall thickness is below 1.2mm for PLA", () => {
    // height=1mm < 1.2mm minimum
    const r = validatePrinted({ ...baseDsl, primitive: { kind: "box", width: 40, depth: 30, height: 1 } });
    const rule = r.rules.find(x => x.id === "min_wall");
    expect(rule?.status === "fail" || rule?.status === "warn").toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test convex/lib/__tests__/printedRules.test.ts
```

- [ ] **Step 3: Implement `printedRules.ts`**

```ts
import type { PrintedDsl } from "./printedDsl";
import { boundingBox } from "./printedDsl";

const MIN_WALL_MM: Record<string, number> = {
  PLA: 1.2, PETG: 1.6, Nylon: 2.0, ABS: 1.5, Resin: 0.8,
};

const BED_MM = { x: 250, y: 250, z: 250 };  // generic FDM bed

export interface PrintedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

export function validatePrinted(dsl: PrintedDsl): {
  rules: PrintedRuleResult[];
  hasFailures: boolean;
} {
  const rules: PrintedRuleResult[] = [];
  const bb = boundingBox(dsl);

  // Rule 1: fits bed
  if (bb.w > BED_MM.x || bb.d > BED_MM.y || bb.h > BED_MM.z) {
    rules.push({
      id: "fits_bed", label: "Fits print bed", status: "fail",
      message: `Bounding box ${bb.w}×${bb.d}×${bb.h}mm exceeds 250×250×250mm bed.`,
      suggestion: "Reduce dimensions or split into multiple parts.",
    });
  } else {
    rules.push({ id: "fits_bed", label: "Fits print bed", status: "pass", message: `${bb.w}×${bb.d}×${bb.h}mm OK.` });
  }

  // Rule 2: min wall thickness — heuristic: smallest primitive dim in extrusion direction
  const minWall = MIN_WALL_MM[dsl.material] ?? 1.5;
  const smallest = Math.min(bb.w, bb.d, bb.h);
  if (smallest < minWall) {
    rules.push({
      id: "min_wall", label: "Minimum wall", status: "fail",
      message: `Smallest dim ${smallest}mm < ${minWall}mm for ${dsl.material}.`,
      suggestion: `Thicken to ≥ ${minWall}mm or switch to a stronger material.`,
    });
  } else if (smallest < minWall * 1.5) {
    rules.push({
      id: "min_wall", label: "Minimum wall", status: "warn",
      message: `${smallest}mm is close to ${dsl.material}'s ${minWall}mm minimum.`,
    });
  } else {
    rules.push({ id: "min_wall", label: "Minimum wall", status: "pass", message: `${smallest}mm OK.` });
  }

  // Rule 3: layer height vs detail
  if (dsl.layerHeight > 0.3) {
    rules.push({
      id: "layer_height", label: "Layer height", status: "warn",
      message: `Layer height ${dsl.layerHeight}mm coarse — may degrade fine features.`,
    });
  } else {
    rules.push({ id: "layer_height", label: "Layer height", status: "pass", message: `${dsl.layerHeight}mm OK.` });
  }

  // Rule 4: infill sanity
  if (dsl.infill < 0.15 && dsl.material !== "Resin") {
    rules.push({
      id: "infill", label: "Infill", status: "warn",
      message: `${Math.round(dsl.infill * 100)}% infill is low for ${dsl.material} structural parts.`,
      suggestion: "Bump to 20–30% for parts under load.",
    });
  } else {
    rules.push({ id: "infill", label: "Infill", status: "pass", message: `${Math.round(dsl.infill * 100)}% OK.` });
  }

  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}
```

- [ ] **Step 4: Run tests — expect 3 pass**

```bash
pnpm test convex/lib/__tests__/printedRules.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/printedRules.ts artifacts/hardwareai/convex/lib/__tests__/printedRules.test.ts
git commit -m "feat(lib): printedRules — fits_bed/min_wall/layer_height/infill"
```

---

### Task 2.2: Purchased rules — `purchasedRules.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/purchasedRules.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/purchasedRules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validatePurchased } from "../purchasedRules";
import type { PurchasedDsl } from "../purchasedDsl";

describe("validatePurchased", () => {
  it("passes for a known McMaster part", () => {
    const dsl: PurchasedDsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    const r = validatePurchased(dsl);
    expect(r.rules.find(x => x.id === "catalog_known")?.status).toBe("pass");
    expect(r.hasFailures).toBe(false);
  });

  it("WARNs for an unknown McMaster part", () => {
    const dsl: PurchasedDsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "00000000", quantity: 1, label: "Unknown",
    };
    const r = validatePurchased(dsl);
    expect(r.rules.find(x => x.id === "catalog_known")?.status).toBe("warn");
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
pnpm test convex/lib/__tests__/purchasedRules.test.ts
```

- [ ] **Step 3: Implement**

```ts
import type { PurchasedDsl } from "./purchasedDsl";
import { lookupSeedPart } from "./mcmasterSeed";

export interface PurchasedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function validatePurchased(dsl: PurchasedDsl): {
  rules: PurchasedRuleResult[];
  hasFailures: boolean;
} {
  const rules: PurchasedRuleResult[] = [];
  const seed = lookupSeedPart(dsl.mcmasterPartNumber);
  if (seed) {
    rules.push({
      id: "catalog_known", label: "Catalog match", status: "pass",
      message: `${seed.partNumber} — ${seed.name}`,
    });
  } else {
    rules.push({
      id: "catalog_known", label: "Catalog match", status: "warn",
      message: `${dsl.mcmasterPartNumber} not in curated seed; verify on mcmaster.com.`,
    });
  }
  rules.push({
    id: "qty_sane", label: "Quantity",
    status: dsl.quantity >= 1 && dsl.quantity <= 10000 ? "pass" : "fail",
    message: `Quantity ${dsl.quantity}.`,
  });
  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}
```

- [ ] **Step 4: Run tests — expect 2 pass**
- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/purchasedRules.ts artifacts/hardwareai/convex/lib/__tests__/purchasedRules.test.ts
git commit -m "feat(lib): purchasedRules — catalog match + qty sanity"
```

---

### Task 2.3: Kind-aware part validator dispatcher

**Files:**
- Create: `artifacts/hardwareai/convex/lib/partValidator.ts`

- [ ] **Step 1: Implement**

```ts
import { PartDslSchema } from "./dsl";
import { PrintedDslSchema } from "./printedDsl";
import { PurchasedDslSchema } from "./purchasedDsl";
import { validateSpec, type ValidationResult } from "./scsRules";
import { validatePrinted } from "./printedRules";
import { validatePurchased } from "./purchasedRules";
import { dslToLegacy } from "./dsl";
import { readKind, type PartKind } from "./partKind";

export interface UnifiedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

export interface UnifiedValidationResult {
  kind: PartKind;
  rules: UnifiedRuleResult[];
  hasFailures: boolean;
}

export function validatePartByKind(
  partRow: { kind?: string | null; dslJson?: string | null; partType?: string },
): UnifiedValidationResult {
  const kind = readKind(partRow);
  if (!partRow.dslJson) {
    return { kind, rules: [], hasFailures: false };
  }
  if (kind === "printed") {
    const parsed = PrintedDslSchema.safeParse(JSON.parse(partRow.dslJson));
    if (!parsed.success) {
      return {
        kind: "printed",
        rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
        hasFailures: true,
      };
    }
    return { kind: "printed", ...validatePrinted(parsed.data) };
  }
  if (kind === "purchased") {
    const parsed = PurchasedDslSchema.safeParse(JSON.parse(partRow.dslJson));
    if (!parsed.success) {
      return {
        kind: "purchased",
        rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
        hasFailures: true,
      };
    }
    return { kind: "purchased", ...validatePurchased(parsed.data) };
  }
  // Default: sheet_metal
  const parsed = PartDslSchema.safeParse(JSON.parse(partRow.dslJson));
  if (!parsed.success) {
    return {
      kind: "sheet_metal",
      rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
      hasFailures: true,
    };
  }
  const legacy = dslToLegacy(parsed.data);
  const sheetResult: ValidationResult = validateSpec({
    partType: legacy.partType,
    material: legacy.material,
    thickness: legacy.thickness,
    width: legacy.width,
    height: legacy.height,
    depth: legacy.depth,
    bendRadius: legacy.bendRadius,
    bendAngles: legacy.bendAngles,
    holePattern: legacy.holePattern,
    powderCoat: legacy.powderCoat,
    powderCoatColor: legacy.powderCoatColor,
    assemblyRefs: legacy.assemblyRefs ?? [],
  });
  return {
    kind: "sheet_metal",
    rules: sheetResult.rules.map(r => ({ id: r.id, label: r.label, status: r.status, message: r.message, suggestion: r.suggestion })),
    hasFailures: sheetResult.hasFailures,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/convex/lib/partValidator.ts
git commit -m "feat(lib): kind-aware partValidator dispatcher"
```

---

## Phase 3: Backend functions

### Task 3.1: `parts.addPrinted` and `parts.addPurchased` mutations

**Files:**
- Modify: `artifacts/hardwareai/convex/parts.ts`

- [ ] **Step 1: Add new exports**

Open `artifacts/hardwareai/convex/parts.ts`. Add these imports at the top (preserving existing imports):

```ts
import { PrintedDslSchema } from "./lib/printedDsl";
import { PurchasedDslSchema } from "./lib/purchasedDsl";
```

Then append at the bottom of the file:

```ts
const printedPartArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),    // PrintedDsl JSON
};

async function insertPrintedPart(ctx: any, a: any) {
  const dsl = PrintedDslSchema.parse(JSON.parse(a.dslJson));
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    kind: "printed",
    partType: "printed",  // legacy field; keep populated for backwards compat
    dslJson: a.dslJson,
    printedMaterial: dsl.material,
    printedInfill: dsl.infill,
    printedLayerHeight: dsl.layerHeight,
    createdAt: now,
    updatedAt: now,
  });
}

export const addPrintedPart = mutation({ args: printedPartArgs, handler: insertPrintedPart });
export const addPrintedPartInternal = internalMutation({ args: printedPartArgs, handler: insertPrintedPart });

const purchasedPartArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),    // PurchasedDsl JSON
};

async function insertPurchasedPart(ctx: any, a: any) {
  const dsl = PurchasedDslSchema.parse(JSON.parse(a.dslJson));
  const now = Date.now();
  return await ctx.db.insert("parts", {
    projectId: a.projectId,
    role: a.role,
    label: a.label,
    position: a.position,
    kind: "purchased",
    partType: "purchased",
    dslJson: a.dslJson,
    purchasedPartNumber: dsl.mcmasterPartNumber,
    purchasedQuantity: dsl.quantity,
    unitCostUsd: dsl.unitCostUsd,
    createdAt: now,
    updatedAt: now,
  });
}

export const addPurchasedPart = mutation({ args: purchasedPartArgs, handler: insertPurchasedPart });
export const addPurchasedPartInternal = internalMutation({ args: purchasedPartArgs, handler: insertPurchasedPart });
```

- [ ] **Step 2: Push convex**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/parts.ts
git commit -m "feat(convex): addPrintedPart + addPurchasedPart mutations"
```

---

### Task 3.2: Kind-aware validation query

**Files:**
- Modify: `artifacts/hardwareai/convex/validation.ts`

- [ ] **Step 1: Add new query**

Open `artifacts/hardwareai/convex/validation.ts` and append at the bottom:

```ts
import { validatePartByKind } from "./lib/partValidator";

export const getPartValidation = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return null;
    return validatePartByKind(part);
  },
});
```

- [ ] **Step 2: Push convex**

```bash
npx convex dev --once 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/validation.ts
git commit -m "feat(convex): getPartValidation query (kind-aware)"
```

---

### Task 3.3: STL exporter for printed parts

**Files:**
- Create: `artifacts/hardwareai/convex/lib/stlGenerator.ts`
- Modify: `artifacts/hardwareai/convex/exportDxf.ts` (add `runForPrintedPart`)

- [ ] **Step 1: Implement `stlGenerator.ts`**

```ts
import type { PrintedDsl } from "./printedDsl";

/**
 * Tiny ASCII STL writer. Produces a low-fidelity mesh from the primitive
 * (box → 12 triangles; cylinder → N×2 triangles around the side + caps;
 * plate_with_holes → simplified to a box for now). Good enough as a
 * placeholder for "give me a printable file" in slice 2; real CAD-quality
 * STL export waits for slice E.
 */
export function generateStl(dsl: PrintedDsl): string {
  const lines: string[] = [];
  lines.push("solid fabware_part");
  const tris = trianglesFor(dsl);
  for (const tri of tris) {
    const n = normalize(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
    lines.push(`  facet normal ${n.x} ${n.y} ${n.z}`);
    lines.push("    outer loop");
    for (const v of tri) {
      lines.push(`      vertex ${v.x} ${v.y} ${v.z}`);
    }
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push("endsolid fabware_part");
  return lines.join("\n");
}

type V3 = { x: number; y: number; z: number };
function v(x: number, y: number, z: number): V3 { return { x, y, z }; }
function sub(a: V3, b: V3): V3 { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
function cross(a: V3, b: V3): V3 {
  return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function normalize(a: V3): V3 {
  const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
  return v(a.x / m, a.y / m, a.z / m);
}

function boxTriangles(w: number, d: number, h: number): V3[][] {
  const x0 = 0, x1 = w, y0 = 0, y1 = d, z0 = 0, z1 = h;
  const c = [
    v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0),
    v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1),
  ];
  const tri = (a: number, b: number, cc: number): V3[] => [c[a], c[b], c[cc]];
  return [
    tri(0, 2, 1), tri(0, 3, 2),  // bottom
    tri(4, 5, 6), tri(4, 6, 7),  // top
    tri(0, 1, 5), tri(0, 5, 4),  // front
    tri(2, 3, 7), tri(2, 7, 6),  // back
    tri(1, 2, 6), tri(1, 6, 5),  // right
    tri(3, 0, 4), tri(3, 4, 7),  // left
  ];
}

function cylinderTriangles(r: number, h: number, segments = 24): V3[][] {
  const tris: V3[][] = [];
  const center0 = v(0, 0, 0);
  const center1 = v(0, 0, h);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = v(r * Math.cos(a0), r * Math.sin(a0), 0);
    const p1 = v(r * Math.cos(a1), r * Math.sin(a1), 0);
    const p2 = v(r * Math.cos(a0), r * Math.sin(a0), h);
    const p3 = v(r * Math.cos(a1), r * Math.sin(a1), h);
    tris.push([p0, p1, p3]);
    tris.push([p0, p3, p2]);
    tris.push([center0, p1, p0]);    // bottom cap
    tris.push([center1, p2, p3]);    // top cap
  }
  return tris;
}

function trianglesFor(dsl: PrintedDsl): V3[][] {
  const p = dsl.primitive;
  if (p.kind === "box") return boxTriangles(p.width, p.depth, p.height);
  if (p.kind === "cylinder") return cylinderTriangles(p.radius, p.height);
  return boxTriangles(p.width, p.depth, p.thickness);
}
```

- [ ] **Step 2: Add `runForPrintedPart` to `exportDxf.ts`**

Open `artifacts/hardwareai/convex/exportDxf.ts` and append:

```ts
import { PrintedDslSchema } from "./lib/printedDsl";
import { generateStl } from "./lib/stlGenerator";

export const runForPrintedPart = mutation({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, { projectId, partId }) => {
    const project = await ctx.db.get(projectId);
    const part = await ctx.db.get(partId);
    if (!project) throw new Error("Project not found");
    if (!part || part.projectId !== projectId) throw new Error("Part not found");
    if (part.kind !== "printed") throw new Error("Part is not a printed part");
    if (!part.dslJson) throw new Error("Part has no DSL");
    const dsl = PrintedDslSchema.parse(JSON.parse(part.dslJson));
    const stlContent = generateStl(dsl);
    const filename = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${part.role}.stl`;
    await ctx.db.patch(projectId, { updatedAt: Date.now() });
    return {
      projectId, partId, filename, stlContent,
      material: dsl.material, layerHeight: dsl.layerHeight, infill: dsl.infill,
      instructions: [
        `Download STL: ${filename}`,
        `Print material: ${dsl.material}`,
        `Layer height: ${dsl.layerHeight}mm`,
        `Infill: ${Math.round(dsl.infill * 100)}%`,
        "Slice in your preferred slicer (Cura/PrusaSlicer/Bambu Studio).",
      ],
    };
  },
});
```

- [ ] **Step 3: Push convex**

```bash
npx convex dev --once 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/lib/stlGenerator.ts artifacts/hardwareai/convex/exportDxf.ts
git commit -m "feat(convex): runForPrintedPart + tiny ASCII STL generator"
```

---

## Phase 4: Agent loop additions

### Task 4.1: Three new agent tools — `add_printed_part`, `add_purchased_part`, `decide_make_or_buy`

**Files:**
- Modify: `artifacts/hardwareai/convex/assemblyDesigner.ts`

- [ ] **Step 1: Add tool definitions**

Open `assemblyDesigner.ts`. Find the `TOOLS` array. Add these entries before the closing `] as const;`:

```ts
  {
    name: "add_printed_part",
    description: "Add a 3D-printed part to the project. Use for small custom shapes (bezels, knobs, brackets that don't justify sheet metal, complex geometries). Provide a PrintedDsl with primitive (box/cylinder/plate_with_holes) and a material (PLA/PETG/Nylon/ABS/Resin).",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Snake-case role like 'keypad_bezel' or 'cable_grommet'." },
        label: { type: "string", description: "Human label." },
        dsl: { type: "object", description: "PrintedDsl JSON." },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "dsl", "position", "rationale"],
    },
  },
  {
    name: "add_purchased_part",
    description: "Add a purchased part referencing a McMaster part number. Use for fasteners, bearings, hinges, rubber feet, and other off-the-shelf hardware that's cheaper to buy than to make.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        label: { type: "string" },
        mcmasterPartNumber: { type: "string" },
        quantity: { type: "number" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "mcmasterPartNumber", "quantity", "position", "rationale"],
    },
  },
  {
    name: "decide_make_or_buy",
    description: "Reason out loud about whether something the user wants should be a custom part (sheet metal or 3D print) or a purchased off-the-shelf item. The 'decision' field is shown to the user verbatim.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "What the user is asking for (e.g. 'rubber foot', '12mm bearing')." },
        decision: { type: "string", enum: ["make_sheet_metal", "make_printed", "buy"], description: "The recommendation." },
        reasoning: { type: "string", description: "Short rationale shown to the user." },
      },
      required: ["item", "decision", "reasoning"],
    },
  },
```

- [ ] **Step 2: Update system prompt**

In the same file, find `buildSystemPrompt` and append after the existing "## Rules" section:

```ts
return `${existingPrompt}

## Choosing a part kind

Every custom part you add is one of three kinds:

- **sheet_metal** — flat-pattern parts laser-cut by Send Cut Send. Use for panels, brackets, enclosures, anything dominated by 2D geometry with optional bends. Already covered by archetypes.
- **printed** — 3D-printed parts (FDM/resin). Use for small custom shapes with complex 3D geometry: bezels, knobs, cable grommets, snap-fit clips, mounting standoffs. Add via \`add_printed_part\`.
- **purchased** — off-the-shelf parts from McMaster. Use for fasteners, bearings, hinges, rubber feet, springs, magnets — anything where buying is cheaper, faster, and higher quality than making. Add via \`add_purchased_part\`.

When the user asks for something and it's not obvious which kind to use, call \`decide_make_or_buy\` first. Defaults:

- If it's a fastener/bearing/spring/hinge → buy.
- If it's a 2D-dominant flat panel or bracket → sheet metal (use the existing archetype tools or refine_part).
- If it's a small 3D shape with curves, snap fits, or features that don't unfold cleanly → printed.
- If the user explicitly says "3D print", "PLA", "STL" → printed.
- If the user says "stainless 304" or "powder coat" → sheet metal.

Never invent McMaster part numbers; ask the user or use only numbers from the curated catalog you've already seen in the system prompt.
`;
```

(In practice, replace the `return ` …` `;` template literal at the end of `buildSystemPrompt` with this expanded version, preserving everything that came before.)

- [ ] **Step 3: Push convex**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/assemblyDesigner.ts
git commit -m "feat(agent): add_printed_part/add_purchased_part/decide_make_or_buy tools + kind guidance"
```

---

### Task 4.2: Orchestrator dispatch for new tools

**Files:**
- Modify: `artifacts/hardwareai/convex/projectChat.ts`

- [ ] **Step 1: Add cases to `applyToolCall`**

Open `projectChat.ts`. In the `switch (call.name)` block, add these cases before the `default`:

```ts
    case "add_printed_part": {
      const dsl = JSON.stringify(call.input.dsl);
      try {
        await ctx.runMutation(internal.parts.addPrintedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: call.input.position,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add printed part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      return `Added 3D-printed part: ${call.input.label}.`;
    }

    case "add_purchased_part": {
      const dsl = JSON.stringify({
        version: 1,
        kind: "purchased",
        mcmasterPartNumber: call.input.mcmasterPartNumber,
        quantity: call.input.quantity,
        label: call.input.label,
      });
      try {
        await ctx.runMutation(internal.parts.addPurchasedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: call.input.position,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add purchased part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      return `Added purchased: ${call.input.quantity} × ${call.input.label} (${call.input.mcmasterPartNumber}).`;
    }

    case "decide_make_or_buy": {
      const decisionLabel: Record<string, string> = {
        make_sheet_metal: "🔧 Make it (sheet metal)",
        make_printed: "🟪 Make it (3D print)",
        buy: "🛒 Buy it",
      };
      const label = decisionLabel[call.input.decision] ?? call.input.decision;
      return `${label} — ${call.input.item}\n${call.input.reasoning}`;
    }
```

- [ ] **Step 2: Refresh `livePartsSnapshot` after these new tools**

In the `for (const call of agentResult.toolCalls)` loop, extend the refresh condition:

```ts
if (
  call.name === "select_archetype" ||
  call.name === "update_archetype_params" ||
  call.name === "add_printed_part" ||
  call.name === "add_purchased_part"
) {
  livePartsSnapshot = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
}
```

- [ ] **Step 3: Push convex**

```bash
npx convex dev --once 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/projectChat.ts
git commit -m "feat(orchestrator): dispatch add_printed_part/add_purchased_part/decide_make_or_buy + refresh snapshot"
```

---

### Task 4.3: Extend `refine_part` to route by kind

**Files:**
- Modify: `artifacts/hardwareai/convex/projectChat.ts`

- [ ] **Step 1: Find `refine_part` case and update**

Replace the existing `refine_part` case in `applyToolCall` with:

```ts
    case "refine_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      // Validate the patched DSL matches the part's kind
      const kind = target.kind ?? "sheet_metal";
      const dslJson = JSON.stringify(call.input.dsl);
      try {
        if (kind === "printed") {
          const { PrintedDslSchema } = await import("./lib/printedDsl");
          PrintedDslSchema.parse(JSON.parse(dslJson));
        } else if (kind === "purchased") {
          const { PurchasedDslSchema } = await import("./lib/purchasedDsl");
          PurchasedDslSchema.parse(JSON.parse(dslJson));
        }
        // sheet_metal: existing validator runs inside updatePartDslInternal
        await ctx.runMutation(internal.parts.updatePartDslInternal, {
          partId: target._id, dslJson,
        });
      } catch (err: any) {
        return `Couldn't refine ${target.role}: ${err?.message?.slice(0, 200) ?? "validation error"}`;
      }
      return `Refined ${target.role}.`;
    }
```

(Note: the dynamic `import("./lib/...")` inside `projectChat.ts` works because this file uses `"use node"` at top — Node runtime supports dynamic imports.)

- [ ] **Step 2: Verify `updatePartDslInternal` doesn't fail on non-sheet kinds**

`updatePartDslInternal` in `parts.ts` currently does `PartDslSchema.parse(...)`. That will break on printed/purchased DSL. We need a kind-aware update path. **Add** a new internal mutation `updatePartDslByKindInternal` and route accordingly.

In `parts.ts` add:

```ts
export const updatePartDslByKindInternal = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    const existing = await ctx.db.get(partId);
    if (!existing) throw new Error("Part not found");
    const kind = existing.kind ?? "sheet_metal";
    const now = Date.now();
    if (kind === "printed") {
      const dsl = PrintedDslSchema.parse(JSON.parse(dslJson));
      await ctx.db.patch(partId, {
        dslJson,
        printedMaterial: dsl.material,
        printedInfill: dsl.infill,
        printedLayerHeight: dsl.layerHeight,
        updatedAt: now,
      });
      return;
    }
    if (kind === "purchased") {
      const dsl = PurchasedDslSchema.parse(JSON.parse(dslJson));
      await ctx.db.patch(partId, {
        dslJson,
        purchasedPartNumber: dsl.mcmasterPartNumber,
        purchasedQuantity: dsl.quantity,
        unitCostUsd: dsl.unitCostUsd,
        updatedAt: now,
      });
      return;
    }
    // sheet_metal
    const dsl = PartDslSchema.parse(JSON.parse(dslJson));
    const graph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
      bendAngles: null, bendRadius: null, holePattern: null,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
      dsl, featureGraph: graph,
    };
    const svg = generateSvgPreview(preview);
    await ctx.db.patch(partId, {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson, featureGraphJson: JSON.stringify(graph), svgPreview: svg, updatedAt: now,
    });
  },
});
```

Also add `import { PrintedDslSchema } from "./lib/printedDsl"; import { PurchasedDslSchema } from "./lib/purchasedDsl";` at the top of `parts.ts`.

Then in `projectChat.ts` `refine_part`, call `internal.parts.updatePartDslByKindInternal` instead of `updatePartDslInternal`.

- [ ] **Step 3: Push + commit**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
cd ~/fabware
git add artifacts/hardwareai/convex/parts.ts artifacts/hardwareai/convex/projectChat.ts
git commit -m "feat(orchestrator): refine_part routes DSL parsing by kind via updatePartDslByKindInternal"
```

---

### Task 4.4: Re-run convex tests + smoke check

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm test 2>&1 | tail -5
```

Expected: all tests pass. Should now be ≥ 36 (31 from slice 1 + new printedDsl/purchasedDsl/printedRules/purchasedRules tests).

- [ ] **Step 2: Verify Convex deployment is clean**

```bash
npx convex dev --once 2>&1 | grep -E "Convex functions ready|error"
```

Expected: `Convex functions ready!`, no errors.

- [ ] **Step 3: No commit** — verification only.

---

## Phase 5: Frontend

### Task 5.1: `PartKindBadge` component

**Files:**
- Create: `artifacts/hardwareai/src/components/workspace/PartKindBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Wrench, Box, ShoppingCart } from "lucide-react";

type PartKind = "sheet_metal" | "printed" | "purchased";

const KIND_ICON: Record<PartKind, typeof Wrench> = {
  sheet_metal: Wrench,
  printed: Box,
  purchased: ShoppingCart,
};

const KIND_LABEL: Record<PartKind, string> = {
  sheet_metal: "Sheet metal",
  printed: "3D printed",
  purchased: "Purchased",
};

const KIND_COLOR: Record<PartKind, string> = {
  sheet_metal: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  printed: "text-purple-300 border-purple-500/30 bg-purple-500/10",
  purchased: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

export function PartKindBadge({ kind }: { kind?: string | null }) {
  const k: PartKind = kind === "printed" || kind === "purchased" ? kind : "sheet_metal";
  const Icon = KIND_ICON[k];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase tracking-wider ${KIND_COLOR[k]}`}
      title={KIND_LABEL[k]}
    >
      <Icon className="w-2.5 h-2.5" />
      {KIND_LABEL[k]}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/src/components/workspace/PartKindBadge.tsx
git commit -m "feat(ui): PartKindBadge — small kind label for parts"
```

---

### Task 5.2: Use `PartKindBadge` in `PartList`

**Files:**
- Modify: `artifacts/hardwareai/src/components/workspace/PartList.tsx`

- [ ] **Step 1: Add badge**

Add the import at the top:

```tsx
import { PartKindBadge } from "./PartKindBadge";
```

In the part-row JSX, after the role/label header, add:

```tsx
<PartKindBadge kind={p.kind} />
```

(The exact integration depends on the current structure — render the badge inline next to the part role.)

- [ ] **Step 2: Build + commit**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm build 2>&1 | tail -3
cd ~/fabware
git add artifacts/hardwareai/src/components/workspace/PartList.tsx
git commit -m "feat(ui): PartList shows PartKindBadge per row"
```

---

### Task 5.3: `AssembledView` per-kind mesh

**Files:**
- Modify: `artifacts/hardwareai/src/components/workspace/AssembledView.tsx`

- [ ] **Step 1: Replace the single `Part` mesh component with kind-aware rendering**

The current `Part` component renders a thin `boxGeometry` for sheet metal. Add two new kind-specific components and route by `part.kind`:

```tsx
function SheetMetalPart({ w, h, t, position }: { w: number; h: number; t: number; position: any }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w, t, h]} />
      <meshStandardMaterial color="#d0d4da" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

function PrintedPart({ w, d, h, position }: { w: number; d: number; h: number; position: any }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w / 25.4, h / 25.4, d / 25.4]} />  {/* mm → in for assembly frame */}
      <meshStandardMaterial color="#a374ff" metalness={0.0} roughness={0.8} />
    </mesh>
  );
}

function PurchasedPart({ position, label }: { position: any; label: string }) {
  return (
    <group position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f5b647" wireframe />
      </mesh>
    </group>
  );
}
```

Route in the parts loop:

```tsx
{parts?.map(p => {
  const kind = p.kind ?? "sheet_metal";
  if (kind === "printed") {
    // bounding box from printed-specific fields if present, else default
    const bb = printedBoundingBox(p);
    return <PrintedPart key={p._id} w={bb.w} d={bb.d} h={bb.h} position={p.position} />;
  }
  if (kind === "purchased") {
    return <PurchasedPart key={p._id} position={p.position} label={p.label} />;
  }
  return (
    <SheetMetalPart
      key={p._id}
      w={p.width ?? 1}
      h={p.height ?? 1}
      t={p.thickness ?? 0.075}
      position={p.position}
    />
  );
})}
```

Add helper:

```tsx
function printedBoundingBox(p: { dslJson?: string | null }): { w: number; d: number; h: number } {
  if (!p.dslJson) return { w: 25, d: 25, h: 5 };
  try {
    const dsl = JSON.parse(p.dslJson);
    const prim = dsl.primitive;
    if (prim?.kind === "box") return { w: prim.width, d: prim.depth, h: prim.height };
    if (prim?.kind === "cylinder") return { w: prim.radius * 2, d: prim.radius * 2, h: prim.height };
    if (prim?.kind === "plate_with_holes") return { w: prim.width, d: prim.depth, h: prim.thickness };
  } catch {
    // fall through
  }
  return { w: 25, d: 25, h: 5 };
}
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm build 2>&1 | tail -3
cd ~/fabware
git add artifacts/hardwareai/src/components/workspace/AssembledView.tsx
git commit -m "feat(ui): AssembledView routes per-kind mesh (sheet/printed/purchased)"
```

---

### Task 5.4: Per-kind export in `Export.tsx`

**Files:**
- Modify: `artifacts/hardwareai/src/pages/Export.tsx`

- [ ] **Step 1: Add a per-kind action mapping**

For each part row, render a download button whose label and behavior depend on `part.kind`:

- `sheet_metal` → "DXF" → calls `runForPart` (existing)
- `printed` → "STL" → calls `runForPrintedPart` (new)
- `purchased` → "Open on McMaster" → opens `https://www.mcmaster.com/<cleaned>/` in a new tab (no API call)

Replace the existing per-part download block with:

```tsx
const runForPart = useMutation(api.exportDxf.runForPart);
const runForPrintedPart = useMutation(api.exportDxf.runForPrintedPart);
const [downloadingId, setDownloadingId] = useState<string | null>(null);
const [errors, setErrors] = useState<Record<string, string>>({});

const downloadPart = async (part: any) => {
  if (!projectId) return;
  setDownloadingId(part._id);
  setErrors(prev => ({ ...prev, [part._id]: "" }));
  try {
    const kind = part.kind ?? "sheet_metal";
    if (kind === "purchased") {
      const clean = (part.purchasedPartNumber ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      window.open(`https://www.mcmaster.com/${clean}/`, "_blank", "noopener,noreferrer");
      return;
    }
    const data = kind === "printed"
      ? await runForPrintedPart({ projectId, partId: part._id })
      : await runForPart({ projectId, partId: part._id });
    const content = (data as any).stlContent ?? (data as any).dxfContent;
    const ext = kind === "printed" ? "stl" : "dxf";
    const blob = new Blob([content], { type: `application/${ext}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (data as any).filename ?? `${part.role}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    setErrors(prev => ({ ...prev, [part._id]: err?.message?.slice(0, 200) ?? "Download failed." }));
  } finally {
    setDownloadingId(null);
  }
};

// Button label by kind:
const buttonLabel = (k: string | null | undefined) =>
  k === "printed" ? "STL" : k === "purchased" ? "Open" : "DXF";
```

In the JSX, replace the existing `<Button>DXF</Button>` with a kind-aware rendering using `buttonLabel(p.kind)`.

- [ ] **Step 2: Build + commit**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm build 2>&1 | tail -3
cd ~/fabware
git add artifacts/hardwareai/src/pages/Export.tsx
git commit -m "feat(ui): Export.tsx per-kind download (DXF/STL/McMaster URL)"
```

---

### Task 5.5: Show purchased parts in `AssemblyPartsPanel` from interface hardware AND `parts` rows

**Files:**
- Modify: `artifacts/hardwareai/src/components/workspace/AssemblyPartsPanel.tsx`

The legacy `AssemblyPartsPanel` reads from `api.assemblyParts.list` — that's a separate table from `parts.kind === "purchased"`. To avoid double-listing, **leave the legacy table untouched** but also surface purchased `parts` rows below the legacy list under a second heading.

- [ ] **Step 1: Add a second list section**

After the existing list of legacy assembly parts, append:

```tsx
const allParts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
const purchased = (allParts ?? []).filter(p => (p.kind ?? "sheet_metal") === "purchased");

// In the JSX, add below the legacy list:
{purchased.length > 0 && (
  <div className="mt-3 pt-3 border-t border-border/50">
    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
      Purchased parts (in assembly)
    </div>
    <div className="flex flex-col gap-1">
      {purchased.map(p => (
        <a
          key={p._id}
          href={`https://www.mcmaster.com/${(p.purchasedPartNumber ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}/`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] flex items-center gap-2 hover:text-primary transition-colors"
        >
          <Badge variant="secondary" className="font-mono text-[10px] w-10 justify-center">
            ×{p.purchasedQuantity ?? 1}
          </Badge>
          <span className="text-primary">{p.purchasedPartNumber}</span>
          <span className="truncate text-muted-foreground">{p.label}</span>
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm build 2>&1 | tail -3
cd ~/fabware
git add artifacts/hardwareai/src/components/workspace/AssemblyPartsPanel.tsx
git commit -m "feat(ui): AssemblyPartsPanel surfaces parts.kind=purchased rows under a second heading"
```

---

## Phase 6: Acceptance + memory

### Task 6.1: Acceptance walkthrough

**Files:** none (manual smoke test).

- [ ] **Step 1: Push convex + deploy**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
cd ~/fabware && pnpm --filter @workspace/hardwareai build 2>&1 | tail -3
vercel --prod --yes 2>&1 | grep -E "Production:|Aliased:"
```

- [ ] **Step 2: Run the canonical script in a browser**

Open `https://fabware-drab.vercel.app/studio` and:

1. Create a new project: scope = MVP / Outdoor / "Tennis ball locker", reference scale "3 tennis balls". Intent: "Locker with hinged top, keypad lock."
2. Verify the agent calls `select_archetype("hinged_enclosure")` and 6 sheet-metal parts appear.
3. In chat: *"Add a printed bezel for a 4×3 inch keypad on the lid in PETG."* — expect the agent to call `add_printed_part`, the bezel appears in the part list with the 🟪 badge, AssembledView renders a purple block.
4. Click the bezel in the part list — RulesStatusStrip should now show printed-specific rules (fits_bed, min_wall, etc.).
5. In chat: *"Add four 1/4-20 SHCS, half-inch long, for the wall-to-base bolts."* — expect `add_purchased_part` with `91251A536`. AssemblyPartsPanel "Purchased parts" section shows it.
6. Open Export. Three buttons: DXF (sheet metal), STL (bezel), Open (purchased). Click each:
   - DXF → file downloads, opens in CAD viewer
   - STL → file downloads, has reasonable triangles
   - Open → opens McMaster product page in new tab.
7. In chat: *"What's the rubber feet for the bottom?"* — expect `decide_make_or_buy` returning a "🛒 Buy it" recommendation, then `add_purchased_part` with a McMaster part number.

If all 7 steps work, slice 2 ships.

- [ ] **Step 2: No commit** — manual test only.

---

### Task 6.2: Memory + roadmap update

**Files:**
- Modify: `~/.claude/projects/-Users-grahampatterson/memory/fabware_project.md`
- Modify: `docs/roadmap/2026-04-24-platform-vision.md`

- [ ] **Step 1: Memory update**

Append to `~/.claude/projects/-Users-grahampatterson/memory/fabware_project.md`:

```
- 2026-04-25: Slice 2 shipped — multi-kind parts (sheet_metal | printed | purchased). New DSLs printedDsl/purchasedDsl, per-kind validators (printedRules/purchasedRules), STL export, agent tools add_printed_part/add_purchased_part/decide_make_or_buy, kind-aware AssembledView + Export. Existing slice-1 sheet-metal flows untouched.
```

- [ ] **Step 2: Roadmap update**

In `docs/roadmap/2026-04-24-platform-vision.md`, mark slice 2 (3D printing + multi-kind) as ✅ shipped and note that the buy-vs-build decision hook is in place but the cost/BOM rollup (slice D in my last brainstorm; #6 in the original numbering) is still TODO.

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap/2026-04-24-platform-vision.md
git commit -m "docs: roadmap update — slice 2 multi-kind parts shipped"
```

---

## Self-review notes

**Spec coverage:**
- Goals 1–7 all covered: schema (1.1), printed/purchased DSL + per-kind validators (1.2–2.3), kind-aware backend (3.1–3.3), agent tools (4.1–4.2), refine_part routing (4.3), per-kind frontend (5.1–5.5), per-kind export (5.4), buy-vs-build hook (4.1).
- Acceptance test in 6.1 exercises all of (1)–(7).

**Type consistency:** `PartKind` defined in `partKind.ts` and used consistently across backend + frontend (via the `PartKindBadge` component which redefines a local copy — fine for slice 2 since the frontend doesn't import server types directly).

**Known compromises:**
- STL generator is a placeholder mesh (no boolean operations for `pocket`/`hole_through` features). Slice E will replace with a CAD-quality export.
- `printed_rules.min_wall` heuristic uses smallest bounding-box dim, which is not a real wall-thickness analysis. Good enough for v1; flag in chat advice.
- `AssembledView` rendering for printed parts uses bounding box, not the actual primitive shape. Cylinders look like rectangular blocks. Acceptable for v1.
- `decide_make_or_buy` is just chat output — it doesn't enforce the decision (the agent might recommend "buy" then call `add_printed_part` anyway). User can correct.

---

## Plan complete and saved to `docs/superpowers/plans/2026-04-25-multi-process-parts.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session, batch with checkpoints.

Which approach?
