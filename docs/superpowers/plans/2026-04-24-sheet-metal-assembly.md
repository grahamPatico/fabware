# Sheet-metal Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Fabware from "one sheet-metal part per project" into "multi-part sheet-metal assemblies with intent capture, archetype-driven generation, typed interfaces, and assembled preview."

**Architecture:** Convex schema gains `parts` and `interfaces` tables as peers to (not replacements for) today's `partSpecs`. A library of 6 parametric archetypes (pure TypeScript functions) generates starter `{ parts, interfaces, positions }` tuples from scope + params. The agent loop grows 7 new tools but preserves today's `validate_dsl` + `lookup_mcmaster`. Frontend grows a part-list rail, a Three.js assembled view, a hidden-by-default archetype info chip (option 2c), and a 2-page new-project wizard.

**Tech Stack:** Convex (dev deployment `amiable-emu-84`), React + Vite + Tailwind + shadcn/ui, Three.js via `@react-three/fiber` and `@react-three/drei`, Anthropic SDK (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 selectable), Zod v4 for schemas, Vitest for unit tests (new).

**Working directory:** `~/fabware/artifacts/hardwareai` unless stated otherwise.

**Spec reference:** `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md`

**Roadmap reference:** `docs/roadmap/2026-04-24-platform-vision.md`

---

## Phase 0: Test infrastructure

### Task 0.1: Add Vitest to the hardwareai package

**Files:**
- Modify: `artifacts/hardwareai/package.json`
- Create: `artifacts/hardwareai/vitest.config.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Add vitest deps**

Edit `package.json` devDependencies to add:

```json
"vitest": "^2.1.0",
"@vitest/ui": "^2.1.0",
"jsdom": "^25.0.0"
```

Add script:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Install**

```bash
cd ~/fabware/artifacts/hardwareai && pnpm install
```

Expected: exits 0; vitest visible in `node_modules/.bin/vitest`.

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["convex/lib/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 4: Write smoke test**

Create `convex/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
pnpm --filter @workspace/hardwareai test
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/hardwareai/package.json artifacts/hardwareai/vitest.config.ts artifacts/hardwareai/convex/lib/__tests__/smoke.test.ts artifacts/hardwareai/pnpm-lock.yaml
git commit -m "chore: add vitest for unit testing pure convex libs"
```

---

## Phase 1: Schema + pure foundations

### Task 1.1: Extend schema with parts, interfaces, and project additions

**Files:**
- Modify: `artifacts/hardwareai/convex/schema.ts`

- [ ] **Step 1: Edit schema.ts**

Add to the `defineSchema({...})` call. The existing tables stay; add these three and modify `projects`:

```ts
// Replace the existing `projects` table definition with:
projects: defineTable({
  name: v.string(),
  description: v.optional(v.string()),
  status: v.string(),
  scope: v.optional(v.object({
    tier: v.union(v.literal("jerry-rigged"), v.literal("mvp"), v.literal("commercial")),
    environment: v.object({
      location: v.union(v.literal("indoor"), v.literal("outdoor")),
      waterproof: v.optional(v.boolean()),
      uv: v.optional(v.boolean()),
      freeze: v.optional(v.boolean()),
    }),
    useCase: v.string(),
    userInteraction: v.optional(v.string()),
    referenceScale: v.optional(v.object({
      kind: v.string(),
      dimensions: v.optional(v.object({ w: v.number(), d: v.number(), h: v.number() })),
      quantity: v.optional(v.number()),
    })),
    budgetCeiling: v.optional(v.number()),
  })),
  archetypeId: v.optional(v.union(
    v.literal("hinged_enclosure"),
    v.literal("sliding_enclosure"),
    v.literal("bracket_plus_panel"),
    v.literal("divided_tray"),
    v.literal("shelf_with_brackets"),
    v.literal("box_with_lid"),
    v.null(),
  )),
  archetypeParams: v.optional(v.any()),
  isMultiPart: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_updated", ["updatedAt"]),

// Add these new tables (anywhere in defineSchema):
parts: defineTable({
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: v.object({
    x: v.number(), y: v.number(), z: v.number(),
    rotX: v.number(), rotY: v.number(), rotZ: v.number(),
  }),
  partType: v.string(),
  material: v.optional(v.string()),
  thickness: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  depth: v.optional(v.number()),
  bendRadius: v.optional(v.number()),
  bendAngles: v.optional(v.string()),
  holePattern: v.optional(v.string()),
  powderCoat: v.optional(v.boolean()),
  powderCoatColor: v.optional(v.string()),
  notes: v.optional(v.string()),
  svgPreview: v.optional(v.string()),
  dslJson: v.optional(v.string()),
  featureGraphJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_project", ["projectId"]),

interfaces: defineTable({
  projectId: v.id("projects"),
  kind: v.union(
    v.literal("bolted"),
    v.literal("pem_inserted"),
    v.literal("riveted"),
    v.literal("hinged"),
  ),
  partA: v.id("parts"),
  partB: v.id("parts"),
  featureRefs: v.array(v.object({
    partId: v.id("parts"),
    featureName: v.string(),
  })),
  hardwareRefs: v.array(v.object({
    mcmasterPartNumber: v.string(),
    quantity: v.number(),
    role: v.optional(v.string()),
  })),
  accessSide: v.optional(v.union(
    v.literal("A-to-B"),
    v.literal("B-to-A"),
    v.literal("either"),
  )),
  createdAt: v.number(),
}).index("by_project", ["projectId"]),
```

Keep `partRevisions` as-is; we'll extend `snapshot` shape in Task 5.3 (via adding fields, not breaking old shape).

- [ ] **Step 2: Push schema**

```bash
cd ~/fabware/artifacts/hardwareai && npx convex dev --once
```

Expected: "Schema updated: added tables [parts, interfaces]" + index additions. No breaking errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/schema.ts
git commit -m "feat(schema): add parts, interfaces tables + scope/archetype fields on projects"
```

---

### Task 1.2: Assembly-frame math — `positions.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/positions.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/positions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// positions.test.ts
import { describe, it, expect } from "vitest";
import { transformPoint, computeMatingFrame, type Pose, type LocalPoint } from "../positions";

describe("transformPoint", () => {
  it("returns the local point when pose is identity", () => {
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const p: LocalPoint = { x: 1, y: 2, z: 3 };
    expect(transformPoint(p, pose)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("applies translation", () => {
    const pose: Pose = { x: 10, y: 20, z: 30, rotX: 0, rotY: 0, rotZ: 0 };
    const p: LocalPoint = { x: 1, y: 2, z: 3 };
    expect(transformPoint(p, pose)).toEqual({ x: 11, y: 22, z: 33 });
  });

  it("applies Z rotation (90°)", () => {
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: Math.PI / 2 };
    const p: LocalPoint = { x: 1, y: 0, z: 0 };
    const r = transformPoint(p, pose);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(1, 5);
    expect(r.z).toBeCloseTo(0, 5);
  });
});

describe("computeMatingFrame", () => {
  it("places a hole at the expected world position for a translated panel", () => {
    const pose: Pose = { x: 100, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    // A panel 10x10, hole at 2,2 locally (local origin = lower-left corner)
    const holeLocal: LocalPoint = { x: 2, y: 2, z: 0 };
    const frame = computeMatingFrame(holeLocal, pose);
    expect(frame).toEqual({ x: 102, y: 2, z: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/positions.test.ts
```

Expected: failure — `positions.ts` doesn't exist yet.

- [ ] **Step 3: Write implementation**

Create `convex/lib/positions.ts`:

```ts
// Assembly-frame math. The assembly frame's origin is (0,0,0); each part has
// a 6-DOF `position` in that frame. Feature positions are local to the part's
// own frame. This file gives us the conversion both ways, and exposes a
// small API the interface validation rules use.

export interface Pose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export interface LocalPoint {
  x: number;
  y: number;
  z: number;
}

export type WorldPoint = LocalPoint;

function rotateAroundX(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotateAroundY(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotateAroundZ(p: LocalPoint, a: number): LocalPoint {
  const s = Math.sin(a), c = Math.cos(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

/**
 * Transform a point from a part's local frame into world (assembly) space.
 * Rotation order: X then Y then Z (consistent with Three.js Euler default).
 */
export function transformPoint(local: LocalPoint, pose: Pose): WorldPoint {
  let p = local;
  p = rotateAroundX(p, pose.rotX);
  p = rotateAroundY(p, pose.rotY);
  p = rotateAroundZ(p, pose.rotZ);
  return { x: p.x + pose.x, y: p.y + pose.y, z: p.z + pose.z };
}

/**
 * For a hole at `holeLocal` (relative to the part's local origin), compute
 * its position in the world frame given the part's pose.
 */
export function computeMatingFrame(holeLocal: LocalPoint, pose: Pose): WorldPoint {
  return transformPoint(holeLocal, pose);
}

/** Euclidean distance in 3D. */
export function distance(a: WorldPoint, b: WorldPoint): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/positions.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/positions.ts artifacts/hardwareai/convex/lib/__tests__/positions.test.ts
git commit -m "feat(lib): add positions.ts for assembly-frame math (transformPoint, computeMatingFrame)"
```

---

### Task 1.3: Assembly feature extraction — `featuresInWorld.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/featuresInWorld.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/featuresInWorld.test.ts`

Utility: given a part (PartDsl + pose), return the world-space positions of its named hole features. Used by `hole_pattern_match` validation.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { holeWorldPositions } from "../featuresInWorld";
import type { PartDsl } from "../dsl";
import type { Pose } from "../positions";

describe("holeWorldPositions", () => {
  it("returns an empty array when a part has no hole features", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    expect(holeWorldPositions(dsl, pose)).toEqual([]);
  });

  it("computes corner hole positions for a 4x3 plate with 0.375 inset, pose at origin", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [{
        kind: "hole", name: "mounting_hole", count: 4,
        diameter: 0.266, pattern: "corner", inset: 0.375,
      }],
      finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const holes = holeWorldPositions(dsl, pose);
    expect(holes).toHaveLength(4);
    // Expected corners: (0.375, 0.375), (3.625, 0.375), (0.375, 2.625), (3.625, 2.625)
    const sorted = holes.map(h => `${h.worldPoint.x.toFixed(3)},${h.worldPoint.y.toFixed(3)}`).sort();
    expect(sorted).toEqual(["0.375,0.375", "0.375,2.625", "3.625,0.375", "3.625,2.625"]);
  });

  it("translates hole positions when the part is offset", () => {
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)",
      thickness: 0.075, width: 4, height: 3, depth: null,
      features: [{
        kind: "hole", name: "mounting_hole", count: 4,
        diameter: 0.266, pattern: "corner", inset: 0.375,
      }],
      finish: null, assemblyRefs: [],
    };
    const pose: Pose = { x: 10, y: 20, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    const holes = holeWorldPositions(dsl, pose);
    expect(holes.map(h => h.worldPoint.x).sort()).toEqual([10.375, 10.375, 13.625, 13.625]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/featuresInWorld.test.ts
```

- [ ] **Step 3: Write implementation**

Create `convex/lib/featuresInWorld.ts`:

```ts
import type { PartDsl, HoleFeature } from "./dsl";
import { transformPoint, type Pose, type WorldPoint } from "./positions";

export interface HoleInstance {
  featureName: string;
  diameter: number;
  // Position in the part's local frame
  local: { x: number; y: number; z: number };
  // Position in the world (assembly) frame
  worldPoint: WorldPoint;
}

/**
 * Local positions of a named hole feature on a sheet-metal part, with the
 * part's local origin at the lower-left corner of the flat pattern (x: 0..width,
 * y: 0..height). Returns one entry per instance of the hole (count).
 */
function holeLocalPositions(hole: HoleFeature, width: number, height: number): Array<{ x: number; y: number; z: number }> {
  const inset = hole.inset ?? 0.375;
  const positions: Array<{ x: number; y: number; z: number }> = [];
  switch (hole.pattern) {
    case "corner": {
      // 4 corners regardless of count; count must be ≥4 to fill all corners
      const n = Math.min(hole.count, 4);
      const corners = [
        { x: inset,         y: inset         },
        { x: width - inset, y: inset         },
        { x: inset,         y: height - inset },
        { x: width - inset, y: height - inset },
      ];
      for (let i = 0; i < n; i++) positions.push({ ...corners[i], z: 0 });
      // If count > 4, additional holes fall on the centers of each edge
      if (hole.count > 4) {
        const edges = [
          { x: width / 2, y: inset          },
          { x: width / 2, y: height - inset },
          { x: inset,     y: height / 2     },
          { x: width - inset, y: height / 2 },
        ];
        for (let i = 0; i < hole.count - 4; i++) positions.push({ ...edges[i % 4], z: 0 });
      }
      break;
    }
    case "center":
      positions.push({ x: width / 2, y: height / 2, z: 0 });
      break;
    case "top_row": {
      const y = height - inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) positions.push({ x: inset + i * step, y, z: 0 });
      break;
    }
    case "bottom_row": {
      const y = inset;
      const step = (width - 2 * inset) / Math.max(hole.count - 1, 1);
      for (let i = 0; i < hole.count; i++) positions.push({ x: inset + i * step, y, z: 0 });
      break;
    }
  }
  return positions;
}

export function holeWorldPositions(dsl: PartDsl, pose: Pose): HoleInstance[] {
  const instances: HoleInstance[] = [];
  for (const feat of dsl.features) {
    if (feat.kind !== "hole") continue;
    const locals = holeLocalPositions(feat, dsl.width, dsl.height);
    for (const local of locals) {
      instances.push({
        featureName: feat.name,
        diameter: feat.diameter,
        local,
        worldPoint: transformPoint(local, pose),
      });
    }
  }
  return instances;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/featuresInWorld.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/featuresInWorld.ts artifacts/hardwareai/convex/lib/__tests__/featuresInWorld.test.ts
git commit -m "feat(lib): holeWorldPositions for computing world-space hole positions"
```

---

### Task 1.4: Assembly validation rules — `assemblyRules.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/lib/assemblyRules.ts`
- Create: `artifacts/hardwareai/convex/lib/__tests__/assemblyRules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateAssembly, type AssemblyInput } from "../assemblyRules";
import type { PartDsl } from "../dsl";

function platePartDsl(width: number, height: number, holeCount = 0, holeDiameter = 0.266): PartDsl {
  return {
    version: 1, partType: "plate", material: "Mild Steel (CRS)",
    thickness: 0.075, width, height, depth: null,
    features: holeCount > 0
      ? [{ kind: "hole", name: "mounting_hole", count: holeCount, diameter: holeDiameter, pattern: "corner", inset: 0.375 }]
      : [],
    finish: null, assemblyRefs: [],
  };
}

describe("validateAssembly", () => {
  it("passes trivially for a project with zero interfaces", () => {
    const input: AssemblyInput = {
      parts: [],
      interfaces: [],
      scope: null,
    };
    const result = validateAssembly(input);
    expect(result.rules).toEqual([]);
    expect(result.hasFailures).toBe(false);
  });

  it("fires hole_pattern_match FAIL when two bolted parts have mismatched hole counts", () => {
    const input: AssemblyInput = {
      parts: [
        { id: "a", role: "plate_a", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3, 4) },
        { id: "b", role: "plate_b", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3, 2) },
      ],
      interfaces: [{
        kind: "bolted",
        partA: "a", partB: "b",
        featureRefs: [
          { partId: "a", featureName: "mounting_hole" },
          { partId: "b", featureName: "mounting_hole" },
        ],
        hardwareRefs: [{ mcmasterPartNumber: "91251A540", quantity: 4 }],
      }],
      scope: null,
    };
    const result = validateAssembly(input);
    const rule = result.rules.find(r => r.id === "hole_pattern_match");
    expect(rule?.status).toBe("fail");
    expect(rule?.message).toContain("count");
  });

  it("fires scope_material_match WARN for outdoor MVP with bare CRS", () => {
    const input: AssemblyInput = {
      parts: [
        { id: "a", role: "base", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3) },
      ],
      interfaces: [],
      scope: { tier: "mvp", environment: { location: "outdoor" }, useCase: "test" },
    };
    const result = validateAssembly(input);
    const rule = result.rules.find(r => r.id === "scope_material_match");
    expect(rule?.status).toBe("warn");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/assemblyRules.test.ts
```

- [ ] **Step 3: Write implementation**

Create `convex/lib/assemblyRules.ts`:

```ts
import type { PartDsl } from "./dsl";
import type { Pose } from "./positions";
import { holeWorldPositions, type HoleInstance } from "./featuresInWorld";
import { distance } from "./positions";
import { threadFromPartNumber } from "./fastenerSpecs";

export interface AssemblyInput {
  parts: Array<{ id: string; role: string; pose: Pose; dsl: PartDsl }>;
  interfaces: Array<{
    kind: "bolted" | "pem_inserted" | "riveted" | "hinged";
    partA: string; partB: string;
    featureRefs: Array<{ partId: string; featureName: string }>;
    hardwareRefs: Array<{ mcmasterPartNumber: string; quantity: number; role?: string }>;
    accessSide?: "A-to-B" | "B-to-A" | "either";
  }>;
  scope: null | {
    tier: "jerry-rigged" | "mvp" | "commercial";
    environment: { location: "indoor" | "outdoor"; waterproof?: boolean };
    useCase: string;
  };
}

export interface RuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

const WEATHER_OK_MATERIALS = [
  "Stainless Steel 304",
  "Stainless Steel 316",
  "Galvanized Steel",
  "Aluminum 5052",
  "Aluminum 6061",
];

const POSITION_TOLERANCE = 0.020; // inches — 20 thousandths

export function validateAssembly(input: AssemblyInput): { rules: RuleResult[]; hasFailures: boolean } {
  const rules: RuleResult[] = [];
  const partsById = new Map(input.parts.map(p => [p.id, p]));

  for (const iface of input.interfaces) {
    if (iface.kind === "bolted" || iface.kind === "riveted" || iface.kind === "pem_inserted") {
      rules.push(checkHolePatternMatch(iface, partsById));
      rules.push(checkFastenerClearance(iface, partsById));
    }
    if (iface.kind === "hinged") {
      rules.push(checkHingeGeometry(iface, partsById));
    }
    if (iface.kind === "pem_inserted") {
      rules.push(checkPemInstallSide(iface));
    }
  }

  if (input.scope) {
    rules.push(checkScopeMaterial(input));
    rules.push(checkScopeTierFastener(input));
  }

  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}

function partHoles(part: { dsl: PartDsl; pose: Pose }, featureName: string): HoleInstance[] {
  return holeWorldPositions(part.dsl, part.pose).filter(h => h.featureName === featureName);
}

function checkHolePatternMatch(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const a = parts.get(iface.partA);
  const b = parts.get(iface.partB);
  if (!a || !b) {
    return {
      id: "hole_pattern_match",
      label: "Hole pattern match",
      status: "fail",
      message: `Interface references missing part(s): partA=${iface.partA} partB=${iface.partB}`,
    };
  }
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const refB = iface.featureRefs.find(r => r.partId === iface.partB)?.featureName;
  if (!refA || !refB) {
    return {
      id: "hole_pattern_match",
      label: "Hole pattern match",
      status: "fail",
      message: "Interface is missing featureRefs for one or both parts.",
    };
  }
  const holesA = partHoles(a, refA);
  const holesB = partHoles(b, refB);
  if (holesA.length !== holesB.length) {
    return {
      id: "hole_pattern_match",
      label: "Hole pattern match",
      status: "fail",
      message: `Hole count mismatch: ${a.role}.${refA} has ${holesA.length}, ${b.role}.${refB} has ${holesB.length}`,
      suggestion: "Make the two hole features have the same count.",
    };
  }
  if (holesA.length === 0) {
    return {
      id: "hole_pattern_match",
      label: "Hole pattern match",
      status: "warn",
      message: `No holes found for ${a.role}.${refA} or ${b.role}.${refB}.`,
    };
  }
  const unmatched = holesA.filter(ha => !holesB.some(hb => distance(ha.worldPoint, hb.worldPoint) <= POSITION_TOLERANCE));
  if (unmatched.length > 0) {
    return {
      id: "hole_pattern_match",
      label: "Hole pattern match",
      status: "fail",
      message: `${unmatched.length} hole(s) on ${a.role} don't have a match on ${b.role} within ±${POSITION_TOLERANCE}".`,
      suggestion: "Adjust part positions or hole insets so the patterns line up.",
    };
  }
  return {
    id: "hole_pattern_match",
    label: "Hole pattern match",
    status: "pass",
    message: `${holesA.length} holes aligned.`,
  };
}

function checkFastenerClearance(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const a = parts.get(iface.partA);
  if (!a || !refA) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: "Can't check — missing part or featureRef." };
  }
  const holes = partHoles(a, refA);
  if (holes.length === 0) return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: "No holes to check." };
  const firstFastener = iface.hardwareRefs[0];
  if (!firstFastener) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "fail", message: "No hardware specified for this interface." };
  }
  const spec = threadFromPartNumber(firstFastener.mcmasterPartNumber);
  if (!spec) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: `Thread spec unknown for ${firstFastener.mcmasterPartNumber}.` };
  }
  const holeD = holes[0].diameter;
  if (holeD + 0.003 < spec.clearanceIn) {
    return {
      id: "fastener_clearance_ok",
      label: "Fastener clearance",
      status: "fail",
      message: `Hole Ø${holeD}" is too small for ${spec.label} (needs ≥Ø${spec.clearanceIn}").`,
      suggestion: `Open the holes to Ø${spec.clearanceIn}".`,
    };
  }
  return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "pass", message: `Ø${holeD}" clears ${spec.label}.` };
}

function checkHingeGeometry(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  // Reuse hole-pattern-match — a hinge is "two leaves with matching mounting holes."
  return { ...checkHolePatternMatch(iface, parts), id: "hinge_geometry_ok", label: "Hinge geometry" };
}

function checkPemInstallSide(iface: AssemblyInput["interfaces"][number]): RuleResult {
  if (!iface.accessSide || iface.accessSide === "either") {
    return { id: "pem_install_side_ok", label: "PEM install side", status: "warn", message: "PEM install side unspecified — assuming either is fine." };
  }
  return { id: "pem_install_side_ok", label: "PEM install side", status: "pass", message: `PEM installs from ${iface.accessSide}.` };
}

function checkScopeMaterial(input: AssemblyInput): RuleResult {
  if (!input.scope) return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "" };
  const outdoor = input.scope.environment.location === "outdoor";
  if (!outdoor) return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "Indoor — any material OK." };
  const bare = input.parts.filter(p => p.dsl.material === "Mild Steel (CRS)" && !p.dsl.finish);
  if (bare.length > 0) {
    return {
      id: "scope_material_match",
      label: "Material vs environment",
      status: "warn",
      message: `${bare.length} part(s) are bare mild steel but project is outdoor.`,
      suggestion: "Switch to galvanized/stainless/aluminum, or add a powder-coat finish.",
    };
  }
  return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "Materials OK for outdoor use." };
}

function checkScopeTierFastener(input: AssemblyInput): RuleResult {
  if (!input.scope || input.scope.tier !== "commercial") {
    return { id: "scope_tier_fastener_match", label: "Fastener tier", status: "pass", message: "" };
  }
  // Simple heuristic: commercial wants stainless or zinc fasteners — every hardware ref should be in an allowlist.
  const problematic = input.interfaces.flatMap(i => i.hardwareRefs).filter(h => {
    // For starter seed: alloy steel (91251A*) is fine (black-oxide). Specifics expand later.
    return false;
  });
  return { id: "scope_tier_fastener_match", label: "Fastener tier", status: "pass", message: "Commercial-tier fasteners check (starter rule: all OK)." };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @workspace/hardwareai test convex/lib/__tests__/assemblyRules.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/lib/assemblyRules.ts artifacts/hardwareai/convex/lib/__tests__/assemblyRules.test.ts
git commit -m "feat(lib): validateAssembly with hole-pattern-match, clearance, hinge, pem, scope rules"
```

---

## Phase 2: Archetype library

### Task 2.1: Archetype interface + registry skeleton

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/types.ts`
- Create: `artifacts/hardwareai/convex/archetypes/index.ts`

- [ ] **Step 1: Create types.ts**

```ts
// convex/archetypes/types.ts
import { z } from "zod/v4";
import type { PartDsl } from "../lib/dsl";
import type { Pose } from "../lib/positions";

export const ScopeSchema = z.object({
  tier: z.enum(["jerry-rigged", "mvp", "commercial"]),
  environment: z.object({
    location: z.enum(["indoor", "outdoor"]),
    waterproof: z.boolean().optional(),
    uv: z.boolean().optional(),
    freeze: z.boolean().optional(),
  }),
  useCase: z.string(),
  userInteraction: z.string().optional(),
  referenceScale: z.object({
    kind: z.string(),
    dimensions: z.object({ w: z.number(), d: z.number(), h: z.number() }).optional(),
    quantity: z.number().optional(),
  }).optional(),
  budgetCeiling: z.number().optional(),
});
export type ProjectScope = z.infer<typeof ScopeSchema>;

export type Tier = "jerry-rigged" | "mvp" | "commercial";

export interface InterfaceSpec {
  kind: "bolted" | "pem_inserted" | "riveted" | "hinged";
  roleA: string;              // role of part A in this archetype's output
  roleB: string;              // role of part B
  featureA: string;           // feature name on part A
  featureB: string;           // feature name on part B
  hardwareRefs: Array<{ mcmasterPartNumber: string; quantity: number; role?: string }>;
  accessSide?: "A-to-B" | "B-to-A" | "either";
}

export interface GeneratedPart {
  role: string;
  label: string;
  dsl: PartDsl;
  position: Pose;
}

export interface Archetype<P> {
  id: string;
  label: string;
  description: string;
  tags: string[];
  paramSchema: z.ZodType<P>;
  paramDefaults(scope: ProjectScope): P;
  tierDefaults?: Partial<Record<Tier, Partial<P>>>;
  generate(params: P, scope: ProjectScope): {
    parts: GeneratedPart[];
    interfaces: InterfaceSpec[];
  };
  thumbnailSvg: string;
}
```

- [ ] **Step 2: Create index.ts (empty registry for now)**

```ts
// convex/archetypes/index.ts
import type { Archetype } from "./types";

// Archetypes register themselves here. Import order = display order.
const registry: Array<Archetype<any>> = [];

export function registerArchetype<P>(a: Archetype<P>): Archetype<P> {
  if (registry.find(x => x.id === a.id)) throw new Error(`Duplicate archetype id: ${a.id}`);
  registry.push(a);
  return a;
}

export function listArchetypes(): Array<Archetype<any>> {
  return [...registry];
}

export function getArchetype(id: string): Archetype<any> | undefined {
  return registry.find(a => a.id === id);
}
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/archetypes/
git commit -m "feat(archetypes): interface + registry scaffold"
```

---

### Task 2.2: First archetype — `hinged_enclosure`

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/hingedEnclosure.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/hingedEnclosure.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// hingedEnclosure.test.ts
import { describe, it, expect } from "vitest";
import { hingedEnclosure } from "../hingedEnclosure";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = {
  tier: "mvp",
  environment: { location: "indoor" },
  useCase: "test",
};

describe("hingedEnclosure", () => {
  it("exports id=hinged_enclosure", () => {
    expect(hingedEnclosure.id).toBe("hinged_enclosure");
  });

  it("generates exactly 6 parts (base + 4 walls + lid)", () => {
    const params = hingedEnclosure.paramDefaults(baseScope);
    const { parts } = hingedEnclosure.generate(params, baseScope);
    expect(parts).toHaveLength(6);
    const roles = parts.map(p => p.role).sort();
    expect(roles).toEqual(["base", "lid", "wall_back", "wall_front", "wall_left", "wall_right"]);
  });

  it("generates 5 interfaces (4 wall-to-base bolted + 1 lid hinged)", () => {
    const params = hingedEnclosure.paramDefaults(baseScope);
    const { interfaces } = hingedEnclosure.generate(params, baseScope);
    expect(interfaces).toHaveLength(5);
    expect(interfaces.filter(i => i.kind === "bolted")).toHaveLength(4);
    expect(interfaces.filter(i => i.kind === "hinged")).toHaveLength(1);
  });

  it("defaults to stainless + powder coat for outdoor commercial", () => {
    const scope: ProjectScope = {
      tier: "commercial",
      environment: { location: "outdoor", waterproof: true },
      useCase: "test",
    };
    const params = hingedEnclosure.paramDefaults(scope);
    expect(params.material).toMatch(/Stainless/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @workspace/hardwareai test convex/archetypes/__tests__/hingedEnclosure.test.ts
```

- [ ] **Step 3: Write implementation**

Create `convex/archetypes/hingedEnclosure.ts`:

```ts
import { z } from "zod/v4";
import type { Archetype, ProjectScope, Tier } from "./types";
import { registerArchetype } from ".";
import type { PartDsl } from "../lib/dsl";

const paramSchema = z.object({
  innerWidth: z.number().positive(),
  innerDepth: z.number().positive(),
  innerHeight: z.number().positive(),
  material: z.string(),
  thickness: z.number().positive(),
  hingeSide: z.enum(["back", "front", "left", "right"]),
  powderCoat: z.boolean(),
  powderCoatColor: z.string(),
  fastenerPartNumber: z.string(),   // the bolt used at wall-to-base interfaces
  hingePartNumber: z.string(),      // the hinge used at the lid
  fastenerCount: z.number().int().positive(),    // per wall-to-base interface
});
type Params = z.infer<typeof paramSchema>;

const TIER_DEFAULTS: Record<Tier, Partial<Params>> = {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)", powderCoat: false, powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
  "mvp":          { thickness: 0.075, material: "Mild Steel (CRS)", powderCoat: true,  powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
  "commercial":   { thickness: 0.090, material: "Stainless Steel 304", powderCoat: true, powderCoatColor: "Black", fastenerPartNumber: "91251A540", hingePartNumber: "1635A3", fastenerCount: 4 },
};

function paramDefaults(scope: ProjectScope): Params {
  const tier = TIER_DEFAULTS[scope.tier];
  // Outdoor override: bump to weather-OK material if tier defaults to bare CRS
  let material = tier.material!;
  if (scope.environment.location === "outdoor" && material === "Mild Steel (CRS)") {
    material = "Aluminum 5052";
  }
  const inner = scope.referenceScale?.dimensions ?? { w: 12, d: 12, h: 12 };
  return {
    innerWidth: inner.w,
    innerDepth: inner.d,
    innerHeight: inner.h,
    material,
    thickness: tier.thickness!,
    hingeSide: "back",
    powderCoat: tier.powderCoat!,
    powderCoatColor: tier.powderCoatColor!,
    fastenerPartNumber: tier.fastenerPartNumber!,
    hingePartNumber: tier.hingePartNumber!,
    fastenerCount: tier.fastenerCount!,
  };
}

function makePlate(name: string, w: number, h: number, p: Params, holeFeature?: PartDsl["features"][number]): PartDsl {
  return {
    version: 1,
    partType: "plate",
    material: p.material,
    thickness: p.thickness,
    width: w,
    height: h,
    depth: null,
    features: holeFeature ? [holeFeature] : [],
    finish: p.powderCoat ? { type: "powder_coat", color: p.powderCoatColor } : null,
    assemblyRefs: [],
  };
}

function generate(params: Params, _scope: ProjectScope) {
  const t = params.thickness;
  const outerW = params.innerWidth + 2 * t;
  const outerD = params.innerDepth + 2 * t;
  const innerH = params.innerHeight;
  const mountingHoleDia = 0.266; // 1/4-20 clearance — TODO: derive from fastenerPartNumber thread spec
  const hole = (count: number) => ({
    kind: "hole" as const, name: "mounting_hole", count, diameter: mountingHoleDia,
    pattern: "bottom_row" as const, inset: 0.375,
  });

  const parts = [
    { role: "base",       label: "Base",       dsl: makePlate("base",       outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "corner" }), position: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 } },
    { role: "wall_front", label: "Wall — Front", dsl: makePlate("wall_front", outerW, innerH, params, hole(params.fastenerCount)), position: { x: 0,                y: -t,            z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_back",  label: "Wall — Back",  dsl: makePlate("wall_back",  outerW, innerH, params, hole(params.fastenerCount)), position: { x: 0,                y: params.innerDepth, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: 0 } },
    { role: "wall_left",  label: "Wall — Left",  dsl: makePlate("wall_left",  outerD, innerH, params, hole(params.fastenerCount)), position: { x: -t,              y: params.innerDepth / 2, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
    { role: "wall_right", label: "Wall — Right", dsl: makePlate("wall_right", outerD, innerH, params, hole(params.fastenerCount)), position: { x: params.innerWidth, y: params.innerDepth / 2, z: innerH / 2, rotX: Math.PI / 2, rotY: 0, rotZ: Math.PI / 2 } },
    { role: "lid",        label: "Lid",        dsl: makePlate("lid",        outerW, outerD, params, { ...hole(params.fastenerCount), pattern: "bottom_row" }), position: { x: 0, y: 0, z: innerH + t, rotX: 0, rotY: 0, rotZ: 0 } },
  ];

  const interfaces = [
    { kind: "bolted" as const, roleA: "base", roleB: "wall_front", featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_back",  featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_left",  featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] },
    { kind: "bolted" as const, roleA: "base", roleB: "wall_right", featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] },
    { kind: "hinged" as const, roleA: "lid",  roleB: `wall_${params.hingeSide}`, featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.hingePartNumber, quantity: 2, role: "pivot" }] },
  ];

  return { parts, interfaces };
}

export const hingedEnclosure: Archetype<Params> = registerArchetype({
  id: "hinged_enclosure",
  label: "Hinged Enclosure",
  description: "Base + 4 walls + hinged lid. Lockers, tool boxes, outdoor cabinets.",
  tags: ["enclosure", "storage", "outdoor-ok", "locker"],
  paramSchema,
  paramDefaults,
  tierDefaults: TIER_DEFAULTS,
  generate,
  thumbnailSvg: `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="10" width="56" height="34" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="4" width="56" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="12" x2="32" y2="44" stroke="currentColor" stroke-dasharray="2,2"/></svg>`,
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @workspace/hardwareai test convex/archetypes/__tests__/hingedEnclosure.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/hardwareai/convex/archetypes/hingedEnclosure.ts artifacts/hardwareai/convex/archetypes/__tests__/hingedEnclosure.test.ts
git commit -m "feat(archetypes): hinged_enclosure — base + 4 walls + lid with hinge + bolted interfaces"
```

---

### Tasks 2.3–2.7: Remaining 5 archetypes

Each archetype follows the **exact file structure** of `hingedEnclosure.ts` from Task 2.2:

1. `paramSchema` (Zod) with the archetype-specific parameters
2. `TIER_DEFAULTS: Record<Tier, Partial<Params>>`
3. `paramDefaults(scope): Params` that merges tier defaults with scope-derived overrides (reference scale → dimensions, outdoor → weather-OK material)
4. `generate(params, scope): { parts, interfaces }`
5. `registerArchetype({ id, label, description, tags, paramSchema, paramDefaults, tierDefaults, generate, thumbnailSvg })`

Corresponding test file asserts part count, interface counts per kind, and at least one scope→param rule.

---

### Task 2.3: `box_with_lid` — 6 parts, 5 bolted interfaces (no hinge)

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/boxWithLid.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/boxWithLid.test.ts`

- [ ] **Step 1: Copy `hingedEnclosure.ts` to `boxWithLid.ts`. Change:**
  - `id: "box_with_lid"`, `label: "Box with removable lid"`, `description: "5-sided box + removable lid. Simplest enclosure. Good for prototypes."`, `tags: ["enclosure", "storage", "indoor"]`
  - Drop `hingeSide` and `hingePartNumber` from `paramSchema` and `TIER_DEFAULTS`; keep everything else identical
  - In `generate`: position the `lid` identical to hinged_enclosure, but replace the final interface in the `interfaces` array with:

    ```ts
    { kind: "bolted" as const, roleA: "lid", roleB: "wall_back",
      featureA: "mounting_hole", featureB: "mounting_hole",
      hardwareRefs: [{ mcmasterPartNumber: params.fastenerPartNumber, quantity: params.fastenerCount, role: "mounting" }] },
    ```
    and add three more like it for `wall_front`, `wall_left`, `wall_right`. Final count: 8 interfaces (4 wall-to-base + 4 lid-to-wall). Adjust test accordingly.

- [ ] **Step 2: Test**

```ts
import { describe, it, expect } from "vitest";
import { boxWithLid } from "../boxWithLid";
import type { ProjectScope } from "../types";

const baseScope: ProjectScope = { tier: "mvp", environment: { location: "indoor" }, useCase: "test" };

describe("boxWithLid", () => {
  it("has id=box_with_lid", () => expect(boxWithLid.id).toBe("box_with_lid"));
  it("generates 6 parts, 8 bolted interfaces", () => {
    const params = boxWithLid.paramDefaults(baseScope);
    const out = boxWithLid.generate(params, baseScope);
    expect(out.parts).toHaveLength(6);
    expect(out.interfaces).toHaveLength(8);
    expect(out.interfaces.every(i => i.kind === "bolted")).toBe(true);
  });
});
```

Run: `pnpm --filter @workspace/hardwareai test convex/archetypes/__tests__/boxWithLid.test.ts` → PASS.

- [ ] **Step 3: Commit** `git commit -am "feat(archetypes): box_with_lid"`

---

### Task 2.4: `bracket_plus_panel` — 2 parts, 1 bolted interface, bracket has a bend

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/bracketPlusPanel.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/bracketPlusPanel.test.ts`

- [ ] **Step 1: Implementation outline**

```ts
// Params
const paramSchema = z.object({
  bracketLength: z.number().positive(),      // inches, total flat-pattern length before bend
  bracketHeight: z.number().positive(),      // inches, both flanges identical in v1
  panelWidth: z.number().positive(),
  panelHeight: z.number().positive(),
  bendAngle: z.number().min(1).max(180),     // typically 90
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(8),
});
```

**`generate(params, scope)`**: emits a `bracket` part (a plate with one `bend` feature at positionRatio 0.5 and a `hole` feature `pattern: "bottom_row"` with `fastenerCount` holes) and a `panel` part (a plate with a matching `hole` feature at the top row). Positions place them so the bracket's bottom flange lies on top of the panel's top edge. Interface: one bolted between `bracket.mounting_hole` and `panel.mounting_hole`.

- [ ] **Step 2: Test**

```ts
describe("bracketPlusPanel", () => {
  it("generates 2 parts + 1 bolted interface", () => {
    const p = bracketPlusPanel.paramDefaults({ tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
    const out = bracketPlusPanel.generate(p, { tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
    expect(out.parts).toHaveLength(2);
    expect(out.interfaces).toHaveLength(1);
    expect(out.interfaces[0].kind).toBe("bolted");
    // Bracket should have a bend feature
    const bracket = out.parts.find(x => x.role === "bracket")!;
    expect(bracket.dsl.features.some(f => f.kind === "bend")).toBe(true);
  });
});
```

- [ ] **Step 3: Commit** `git commit -am "feat(archetypes): bracket_plus_panel"`

---

### Task 2.5: `divided_tray` — 5 + dividerCount parts, bolted-only

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/dividedTray.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/dividedTray.test.ts`

- [ ] **Step 1: Params**

```ts
const paramSchema = z.object({
  innerWidth: z.number().positive(),
  innerDepth: z.number().positive(),
  innerHeight: z.number().positive(),
  dividerCount: z.number().int().min(0).max(10),
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(8),
});
```

**`generate`**: 1 `base` + 4 walls (`wall_front`, `wall_back`, `wall_left`, `wall_right`) + N `divider_1..N`. Each wall-to-base is a bolted interface (4 interfaces). Each divider-to-wall (divider to wall_left and wall_right) is bolted (2 × N interfaces). Total = 4 + 2N interfaces.

Dividers are positioned evenly along the depth axis: `y = innerDepth / (dividerCount + 1) × i`.

- [ ] **Step 2: Test**

```ts
describe("dividedTray", () => {
  it("generates 5 + dividerCount parts", () => {
    const scope = { tier: "mvp" as const, environment: { location: "indoor" as const }, useCase: "t" };
    const p = { ...dividedTray.paramDefaults(scope), dividerCount: 3 };
    const out = dividedTray.generate(p, scope);
    expect(out.parts).toHaveLength(8);      // 5 + 3
    expect(out.interfaces).toHaveLength(10); // 4 + 2×3
  });
});
```

- [ ] **Step 3: Commit** `git commit -am "feat(archetypes): divided_tray"`

---

### Task 2.6: `shelf_with_brackets` — 3 parts, 2 bolted interfaces

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/shelfWithBrackets.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/shelfWithBrackets.test.ts`

- [ ] **Step 1: Implementation outline**

```ts
const paramSchema = z.object({
  shelfWidth: z.number().positive(),
  shelfDepth: z.number().positive(),
  bracketHeight: z.number().positive(),
  material: z.string(),
  thickness: z.number().positive(),
  fastenerPartNumber: z.string(),
  fastenerCount: z.number().int().min(2).max(4),    // per bracket-shelf interface
});
```

Parts: `shelf` (flat plate with two hole-pair features `bracket_left_holes` and `bracket_right_holes` — use two hole features with different names), `bracket_left`, `bracket_right` (both L-brackets, each a plate with a bend + matching holes). Positions: brackets 1" inset from each end of the shelf, flanges down to meet the wall.

Interfaces: 2 bolted — `bracket_left.mounting_hole ↔ shelf.bracket_left_holes` and symmetric for right.

- [ ] **Step 2: Test + commit**

```ts
it("generates 3 parts, 2 bolted interfaces", () => {
  const p = shelfWithBrackets.paramDefaults({ tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
  const out = shelfWithBrackets.generate(p, { tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
  expect(out.parts).toHaveLength(3);
  expect(out.interfaces).toHaveLength(2);
});
```

Commit: `git commit -am "feat(archetypes): shelf_with_brackets"`

---

### Task 2.7: `sliding_enclosure` — 6 parts, 4 bolted + 1 riveted interface

**Files:**
- Create: `artifacts/hardwareai/convex/archetypes/slidingEnclosure.ts`
- Create: `artifacts/hardwareai/convex/archetypes/__tests__/slidingEnclosure.test.ts`

- [ ] **Step 1: Approach**

Treat the outer shell as 5 sheet-metal parts (like `hinged_enclosure` but no lid — the top is open): `base`, `wall_front`, `wall_back`, `wall_left`, `wall_right`. Add a `drawer` part: a 5-sided open-top tray sized to fit the inside of the shell with running clearance (0.050" on each side).

Interfaces: 4 wall-to-base bolted (same as hinged_enclosure) + 1 riveted `drawer_stop` interface on `wall_back` (the drawer has no fasteners to the shell — the riveted interface represents a drawer stop installed on the back wall). v1 models the drawer/shell sliding fit purely geometrically; interface validation gets a "no matching holes, shell slot acts as track" warn status.

Params: same as `hinged_enclosure` minus `hingeSide`/`hingePartNumber`, plus `drawerClearance: number` (default 0.050).

- [ ] **Step 2: Test**

```ts
it("generates 6 parts (5 shell + drawer)", () => {
  const p = slidingEnclosure.paramDefaults({ tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
  const out = slidingEnclosure.generate(p, { tier: "mvp", environment: { location: "indoor" }, useCase: "t" });
  expect(out.parts).toHaveLength(6);
  const roles = out.parts.map(x => x.role).sort();
  expect(roles).toContain("drawer");
});
```

- [ ] **Step 3: Commit** `git commit -am "feat(archetypes): sliding_enclosure"`

---

### Task 2.8: Wire the archetype registry

**Files:**
- Modify: `artifacts/hardwareai/convex/archetypes/index.ts`

- [ ] **Step 1: Add imports**

Add to `convex/archetypes/index.ts` after the existing exports:

```ts
// Import archetypes so they register themselves (side-effecting imports).
import "./hingedEnclosure";
import "./boxWithLid";
import "./bracketPlusPanel";
import "./dividedTray";
import "./shelfWithBrackets";
import "./slidingEnclosure";
```

- [ ] **Step 2: Add a test for the registry**

Create `convex/archetypes/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { listArchetypes } from "..";

describe("archetype registry", () => {
  it("has all 6 archetypes registered", () => {
    const ids = listArchetypes().map(a => a.id).sort();
    expect(ids).toEqual([
      "box_with_lid",
      "bracket_plus_panel",
      "divided_tray",
      "hinged_enclosure",
      "shelf_with_brackets",
      "sliding_enclosure",
    ]);
  });
});
```

- [ ] **Step 3: Run all archetype tests**

```bash
pnpm --filter @workspace/hardwareai test convex/archetypes/
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add artifacts/hardwareai/convex/archetypes/index.ts artifacts/hardwareai/convex/archetypes/__tests__/registry.test.ts
git commit -m "feat(archetypes): register all 6 + registry test"
```

---

## Phase 3: Backend functions for parts + interfaces

### Task 3.1: Parts CRUD — `convex/parts.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/parts.ts`

- [ ] **Step 1: Create parts.ts**

```ts
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { generateSvgPreview, type FlatPreviewSpec } from "./lib/dxfGenerator";
import { buildFeatureGraph } from "./lib/featureGraph";
import { PartDslSchema, legacyToDsl } from "./lib/dsl";

const poseArgs = v.object({
  x: v.number(), y: v.number(), z: v.number(),
  rotX: v.number(), rotY: v.number(), rotZ: v.number(),
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const listForProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const get = query({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => await ctx.db.get(partId),
});

const partInsertArgs = {
  projectId: v.id("projects"),
  role: v.string(),
  label: v.string(),
  position: poseArgs,
  dslJson: v.string(),
};

export const addPart = mutation({
  args: partInsertArgs,
  handler: async (ctx, a) => {
    const dsl = PartDslSchema.parse(JSON.parse(a.dslJson));
    const graph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
      bendAngles: null, bendRadius: null, holePattern: null,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
      dsl, featureGraph: graph,
    };
    const svg = generateSvgPreview(preview);
    const now = Date.now();
    return await ctx.db.insert("parts", {
      projectId: a.projectId,
      role: a.role,
      label: a.label,
      position: a.position,
      partType: dsl.partType,
      material: dsl.material,
      thickness: dsl.thickness,
      width: dsl.width,
      height: dsl.height,
      depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish,
      powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson: a.dslJson,
      featureGraphJson: JSON.stringify(graph),
      svgPreview: svg,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addPartInternal = internalMutation({
  args: partInsertArgs,
  handler: async (ctx, a) => {
    // Same body as addPart above — duplicated here so actions can call it internally.
    const dsl = PartDslSchema.parse(JSON.parse(a.dslJson));
    const graph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
      bendAngles: null, bendRadius: null, holePattern: null,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
      dsl, featureGraph: graph,
    };
    const svg = generateSvgPreview(preview);
    const now = Date.now();
    return await ctx.db.insert("parts", {
      projectId: a.projectId,
      role: a.role,
      label: a.label,
      position: a.position,
      partType: dsl.partType,
      material: dsl.material,
      thickness: dsl.thickness,
      width: dsl.width,
      height: dsl.height,
      depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish,
      powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson: a.dslJson,
      featureGraphJson: JSON.stringify(graph),
      svgPreview: svg,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePartDsl = mutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    const existing = await ctx.db.get(partId);
    if (!existing) throw new Error("Part not found");
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
      partType: dsl.partType,
      material: dsl.material,
      thickness: dsl.thickness,
      width: dsl.width,
      height: dsl.height,
      depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish,
      powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson,
      featureGraphJson: JSON.stringify(graph),
      svgPreview: svg,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(partId);
  },
});

export const updatePartDslInternal = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, args) => {
    // Same body — internal variant.
    const existing = await ctx.db.get(args.partId);
    if (!existing) throw new Error("Part not found");
    const dsl = PartDslSchema.parse(JSON.parse(args.dslJson));
    const graph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
      bendAngles: null, bendRadius: null, holePattern: null,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
      dsl, featureGraph: graph,
    };
    const svg = generateSvgPreview(preview);
    await ctx.db.patch(args.partId, {
      partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
      width: dsl.width, height: dsl.height, depth: dsl.depth ?? undefined,
      powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? undefined,
      dslJson: args.dslJson, featureGraphJson: JSON.stringify(graph),
      svgPreview: svg, updatedAt: Date.now(),
    });
  },
});

export const removePart = mutation({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return;
    // Cascade: delete interfaces that reference this part
    const ifaces = await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", part.projectId))
      .collect();
    for (const iface of ifaces) {
      if (iface.partA === partId || iface.partB === partId) await ctx.db.delete(iface._id);
    }
    await ctx.db.delete(partId);
  },
});
```

- [ ] **Step 2: Push + smoke test**

```bash
cd ~/fabware/artifacts/hardwareai
npx convex dev --once
```

Expected: functions deploy cleanly, no schema errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/parts.ts
git commit -m "feat(convex): parts CRUD — list/get/add/update/remove with svg regen"
```

---

### Task 3.2: Interfaces CRUD — `convex/interfaces.ts`

**Files:**
- Create: `artifacts/hardwareai/convex/interfaces.ts`

- [ ] **Step 1: Create file**

```ts
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

export const listForProjectInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect(),
});

const interfaceInsertArgs = {
  projectId: v.id("projects"),
  kind: v.union(
    v.literal("bolted"), v.literal("pem_inserted"),
    v.literal("riveted"), v.literal("hinged"),
  ),
  partA: v.id("parts"),
  partB: v.id("parts"),
  featureRefs: v.array(v.object({ partId: v.id("parts"), featureName: v.string() })),
  hardwareRefs: v.array(v.object({
    mcmasterPartNumber: v.string(),
    quantity: v.number(),
    role: v.optional(v.string()),
  })),
  accessSide: v.optional(v.union(
    v.literal("A-to-B"), v.literal("B-to-A"), v.literal("either"),
  )),
};

export const addInterface = mutation({
  args: interfaceInsertArgs,
  handler: async (ctx, a) => await ctx.db.insert("interfaces", { ...a, createdAt: Date.now() }),
});

export const addInterfaceInternal = internalMutation({
  args: interfaceInsertArgs,
  handler: async (ctx, a) => await ctx.db.insert("interfaces", { ...a, createdAt: Date.now() }),
});

export const removeInterface = mutation({
  args: { interfaceId: v.id("interfaces") },
  handler: async (ctx, { interfaceId }) => { await ctx.db.delete(interfaceId); },
});
```

- [ ] **Step 2: Push**

```bash
npx convex dev --once
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/interfaces.ts
git commit -m "feat(convex): interfaces CRUD"
```

---

### Task 3.3: Projects updates — scope + archetype

**Files:**
- Modify: `artifacts/hardwareai/convex/projects.ts`

- [ ] **Step 1: Add scope + archetype functions**

Edit `convex/projects.ts` to add at the bottom:

```ts
export const updateScope = mutation({
  args: {
    projectId: v.id("projects"),
    scope: v.object({
      tier: v.union(v.literal("jerry-rigged"), v.literal("mvp"), v.literal("commercial")),
      environment: v.object({
        location: v.union(v.literal("indoor"), v.literal("outdoor")),
        waterproof: v.optional(v.boolean()),
        uv: v.optional(v.boolean()),
        freeze: v.optional(v.boolean()),
      }),
      useCase: v.string(),
      userInteraction: v.optional(v.string()),
      referenceScale: v.optional(v.object({
        kind: v.string(),
        dimensions: v.optional(v.object({ w: v.number(), d: v.number(), h: v.number() })),
        quantity: v.optional(v.number()),
      })),
      budgetCeiling: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { projectId, scope }) => {
    await ctx.db.patch(projectId, { scope, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});

export const setArchetype = mutation({
  args: {
    projectId: v.id("projects"),
    archetypeId: v.union(
      v.literal("hinged_enclosure"), v.literal("sliding_enclosure"),
      v.literal("bracket_plus_panel"), v.literal("divided_tray"),
      v.literal("shelf_with_brackets"), v.literal("box_with_lid"),
      v.null(),
    ),
    archetypeParams: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, archetypeId, archetypeParams }) => {
    await ctx.db.patch(projectId, { archetypeId, archetypeParams, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});

export const setArchetypeInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    archetypeId: v.any(),
    archetypeParams: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, archetypeId, archetypeParams }) => {
    await ctx.db.patch(projectId, { archetypeId, archetypeParams, updatedAt: Date.now() });
  },
});

export const breakOut = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await ctx.db.patch(projectId, { archetypeId: null, archetypeParams: null, updatedAt: Date.now() });
    return await ctx.db.get(projectId);
  },
});
```

Also import `internalMutation` at the top if not already:
```ts
import { mutation, query, internalMutation } from "./_generated/server";
```

- [ ] **Step 2: Push**

```bash
npx convex dev --once
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/projects.ts
git commit -m "feat(convex): projects updateScope/setArchetype/breakOut"
```

---

### Task 3.4: Project-level validation query

**Files:**
- Create: `artifacts/hardwareai/convex/validation.ts`

- [ ] **Step 1: Create file**

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { validateAssembly, type AssemblyInput } from "./lib/assemblyRules";
import { PartDslSchema } from "./lib/dsl";

export const getAssemblyValidation = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    const parts = await ctx.db
      .query("parts")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();
    const ifaces = await ctx.db
      .query("interfaces")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .collect();

    const input: AssemblyInput = {
      parts: parts.map(p => ({
        id: p._id as unknown as string,
        role: p.role,
        pose: p.position,
        dsl: p.dslJson ? PartDslSchema.parse(JSON.parse(p.dslJson)) : {
          version: 1, partType: p.partType as any, material: p.material ?? "Mild Steel (CRS)",
          thickness: p.thickness ?? 0.075, width: p.width ?? 1, height: p.height ?? 1,
          depth: p.depth ?? null, features: [], finish: null, assemblyRefs: [],
        },
      })),
      interfaces: ifaces.map(i => ({
        kind: i.kind,
        partA: i.partA as unknown as string,
        partB: i.partB as unknown as string,
        featureRefs: i.featureRefs.map(r => ({ partId: r.partId as unknown as string, featureName: r.featureName })),
        hardwareRefs: i.hardwareRefs,
        accessSide: i.accessSide,
      })),
      scope: project?.scope ?? null,
    };
    return validateAssembly(input);
  },
});
```

- [ ] **Step 2: Push + commit**

```bash
npx convex dev --once
git add artifacts/hardwareai/convex/validation.ts
git commit -m "feat(convex): assembly validation query"
```

---

## Phase 4: Agent loop rewrite

### Task 4.1: Port designer.ts → assemblyDesigner.ts with new tools

**Files:**
- Create: `artifacts/hardwareai/convex/assemblyDesigner.ts` (NEW)
- Leave: `artifacts/hardwareai/convex/designer.ts` (legacy, for single-part projects)

- [ ] **Step 1: Create `assemblyDesigner.ts`**

Structure (condensed — full agent loop code similar to current `designer.ts` with these tool definitions):

```ts
"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { listArchetypes, getArchetype } from "./archetypes";
import { ScopeSchema } from "./archetypes/types";
import { validateSpec } from "./lib/scsRules";
import { MCMASTER_SEED, lookupSeedPart, findSeedPart } from "./lib/mcmasterSeed";
import { PartDslSchema } from "./lib/dsl";

const TOOLS = [
  {
    name: "capture_scope",
    description: "Store the project's scope (tier, environment, use case, reference scale). Call on new-project creation and whenever the user updates intent.",
    input_schema: { type: "object", properties: { scope: { type: "object" } }, required: ["scope"] },
  },
  {
    name: "select_archetype",
    description: "Pick an archetype from the library and fill its params. Returns the starter PartList + InterfaceList to generate.",
    input_schema: {
      type: "object",
      properties: {
        archetypeId: { type: "string", enum: ["hinged_enclosure", "sliding_enclosure", "bracket_plus_panel", "divided_tray", "shelf_with_brackets", "box_with_lid"] },
        params: { type: "object" },
        rationale: { type: "string" },
      },
      required: ["archetypeId", "params", "rationale"],
    },
  },
  {
    name: "refine_part",
    description: "Apply a patch to one part's DSL (change dimensions, add a feature, remove a feature).",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" }, dsl: { type: "object" }, rationale: { type: "string" } },
      required: ["role", "dsl", "rationale"],
    },
  },
  {
    name: "add_feature_to_part",
    description: "Add a feature (hole/bend/slot/fillet) to the named part without replacing its DSL wholesale.",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" }, feature: { type: "object" }, rationale: { type: "string" } },
      required: ["role", "feature", "rationale"],
    },
  },
  {
    name: "update_archetype_params",
    description: "Adjust the current archetype's params. Regenerates affected parts.",
    input_schema: {
      type: "object",
      properties: { paramPatch: { type: "object" }, rationale: { type: "string" } },
      required: ["paramPatch", "rationale"],
    },
  },
  {
    name: "break_out",
    description: "Detach the project from its archetype. User can then freely add/remove/edit parts but the agent can't regenerate from intent.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "decompose_freeform",
    description: "[STUB — returns unsupported message in v1.] Propose a free-form part breakdown from intent without using an archetype.",
    input_schema: {
      type: "object",
      properties: { intent: { type: "string" } },
      required: ["intent"],
    },
  },
  // Existing tools preserved:
  {
    name: "validate_dsl",
    description: "Validate a single part's DSL against Send Cut Send rules.",
    input_schema: { type: "object", properties: { dsl: { type: "object" } }, required: ["dsl"] },
  },
  {
    name: "lookup_mcmaster",
    description: "Look up a McMaster-Carr part.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
] as const;

// The action takes a projectId + user message + model/effort and returns a plan of operations.
// It does NOT write to the DB directly; the orchestrator (projectChat.ts) dispatches.
export const runAgent = internalAction({
  args: {
    projectId: v.id("projects"),
    userMessage: v.string(),
    focusedRole: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    // history shape: list of { role, content }
    history: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() })),
    // project state snapshot for the system prompt
    projectState: v.object({
      scope: v.any(),
      archetypeId: v.optional(v.any()),
      archetypeParams: v.optional(v.any()),
      parts: v.array(v.object({ role: v.string(), label: v.string(), dslJson: v.optional(v.string()) })),
      interfaces: v.array(v.any()),
    }),
  },
  handler: async (_ctx, args): Promise<{ toolCalls: Array<{ name: string; input: any }>; responseText: string }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const archetypeList = listArchetypes().map(a => ({ id: a.id, label: a.label, description: a.description, tags: a.tags }));
    const system = buildSystemPrompt(archetypeList, args.projectState, args.focusedRole);
    const client = new Anthropic({ apiKey });

    const messages: Anthropic.Messages.MessageParam[] = [
      ...args.history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: args.userMessage },
    ];

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: args.model,
      max_tokens: 8192,
      system,
      tools: TOOLS as unknown as Anthropic.Messages.Tool[],
      messages,
    };
    if ((args.model === "claude-opus-4-7" || args.model === "claude-sonnet-4-6") && args.effort) {
      (params as any).output_config = { effort: args.effort };
    }
    const response = await client.messages.create(params);

    const toolCalls: Array<{ name: string; input: any }> = [];
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "tool_use") toolCalls.push({ name: block.name, input: block.input });
      else if (block.type === "text") responseText += block.text;
    }
    return { toolCalls, responseText };
  },
});

function buildSystemPrompt(
  archetypes: Array<{ id: string; label: string; description: string; tags: string[] }>,
  state: any,
  focusedRole?: string,
): string {
  const archList = archetypes.map(a => `- ${a.id}: ${a.label} — ${a.description} [tags: ${a.tags.join(", ")}]`).join("\n");
  const focusedClause = focusedRole
    ? `The user currently has part "${focusedRole}" focused. Interpret refinement requests as targeting this part unless the message says otherwise.`
    : "No part is focused. Messages apply to the whole project.";
  return `You are Fabware's assembly designer. You design multi-part sheet-metal assemblies from user intent.

## Workflow

1. If the project has no archetype yet and the user is describing a new thing: call \`capture_scope\` first, then \`select_archetype\` with the closest-matching archetype from the library.
2. If the project already has an archetype and the user is refining: call \`refine_part\`, \`add_feature_to_part\`, or \`update_archetype_params\`.
3. If the user asks something you can't do (e.g., "add an electromagnetic lock", "switch to 3D printing"): explain politely what's not yet supported.
4. Never output a final assistant message summarizing what you did — tools carry the rationale. Keep spoken output short.

## Archetype library (pick from these)

${archList}

## Current project state

${JSON.stringify(state, null, 2)}

## Focused part

${focusedClause}

## Rules

- Numbers are in inches, degrees, or dimensionless counts. Never millimeters.
- Call \`validate_dsl\` before submitting any single-part DSL you're not sure about.
- Look up McMaster parts with \`lookup_mcmaster\` before inventing part numbers.
- \`decompose_freeform\` is a stub in this version; if you call it, you'll get back a message to the user to pick an archetype instead.
`;
}
```

- [ ] **Step 2: Push**

```bash
npx convex dev --once
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/convex/assemblyDesigner.ts
git commit -m "feat(convex): assemblyDesigner action with 7 new tools + preserved validate/lookup"
```

---

### Task 4.2: Orchestrator — `projectChat.ts` rewrite for multi-part

**Files:**
- Modify: `artifacts/hardwareai/convex/projectChat.ts`

- [ ] **Step 1: Replace file contents**

```ts
"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getArchetype } from "./archetypes";

const SUPPORTED_MODELS = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"];
const EFFORT_LEVELS = ["low", "medium", "high", "max", "xhigh"];

export const send = action({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    focusedRole: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!SUPPORTED_MODELS.includes(a.model)) throw new Error(`Unsupported model: ${a.model}`);
    if (!EFFORT_LEVELS.includes(a.effort)) throw new Error(`Unsupported effort: ${a.effort}`);

    // Persist user message
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId: a.projectId, role: "user", content: a.content,
      imageData: a.imageData, imageMediaType: a.imageMediaType,
      model: a.model, effort: a.effort,
    });

    // Gather project state
    const project = await ctx.runQuery(api.projects.get, { projectId: a.projectId });
    if (!project) throw new Error("Project not found");
    const parts = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
    const interfaces = await ctx.runQuery(api.interfaces.listForProject, { projectId: a.projectId });
    const history = await ctx.runQuery(internal.messages.listForProjectInternal, { projectId: a.projectId });

    // Build history (drop the just-inserted user message to avoid duplication)
    const last = history[history.length - 1];
    const priorHistory = history
      .filter(m => !(m._id === last?._id && m.role === "user"))
      .map(m => ({ role: m.role, content: m.content }));

    const projectState = {
      scope: project.scope ?? null,
      archetypeId: project.archetypeId ?? null,
      archetypeParams: project.archetypeParams ?? null,
      parts: parts.map(p => ({ role: p.role, label: p.label, dslJson: p.dslJson ?? undefined })),
      interfaces: interfaces.map(i => ({ kind: i.kind, partA: i.partA, partB: i.partB, featureRefs: i.featureRefs, hardwareRefs: i.hardwareRefs })),
    };

    // Run the agent
    const agentResult = await ctx.runAction(internal.assemblyDesigner.runAgent, {
      projectId: a.projectId,
      userMessage: a.content,
      focusedRole: a.focusedRole,
      model: a.model,
      effort: a.effort,
      history: priorHistory,
      projectState,
    });

    // Apply tool calls
    let summaryLines: string[] = [];
    for (const call of agentResult.toolCalls) {
      summaryLines.push(await applyToolCall(ctx, a.projectId, parts, interfaces, call));
    }

    // Persist assistant message
    const assistantText = agentResult.responseText.trim() ||
      summaryLines.filter(Boolean).join("\n") ||
      "Updated.";
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId: a.projectId, role: "assistant", content: assistantText,
      model: a.model, effort: a.effort,
    });

    const validation = await ctx.runQuery(api.validation.getAssemblyValidation, { projectId: a.projectId });
    return { validation };
  },
});

async function applyToolCall(
  ctx: any,
  projectId: any,
  partsSnapshot: any[],
  interfacesSnapshot: any[],
  call: { name: string; input: any },
): Promise<string> {
  switch (call.name) {
    case "capture_scope":
      await ctx.runMutation(api.projects.updateScope, { projectId, scope: call.input.scope });
      return "Scope updated.";

    case "select_archetype": {
      const arch = getArchetype(call.input.archetypeId);
      if (!arch) return `Unknown archetype: ${call.input.archetypeId}`;
      const project = await ctx.runQuery(api.projects.get, { projectId });
      const scope = project?.scope;
      if (!scope) return "Cannot generate archetype without scope. Ask for use case/tier/environment first.";
      const params = arch.paramSchema.parse(call.input.params);
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, scope);

      // Insert all parts
      const roleToId = new Map<string, any>();
      for (const gp of genParts) {
        const partId = await ctx.runMutation(internal.parts.addPartInternal, {
          projectId, role: gp.role, label: gp.label, position: gp.position,
          dslJson: JSON.stringify(gp.dsl),
        });
        roleToId.set(gp.role, partId);
      }
      // Insert all interfaces
      for (const gi of genInterfaces) {
        const partA = roleToId.get(gi.roleA);
        const partB = roleToId.get(gi.roleB);
        if (!partA || !partB) continue;
        await ctx.runMutation(internal.interfaces.addInterfaceInternal, {
          projectId, kind: gi.kind, partA, partB,
          featureRefs: [
            { partId: partA, featureName: gi.featureA },
            { partId: partB, featureName: gi.featureB },
          ],
          hardwareRefs: gi.hardwareRefs,
          accessSide: gi.accessSide,
        });
      }
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId,
        archetypeId: call.input.archetypeId,
        archetypeParams: params,
      });
      return `Generated ${genParts.length} parts and ${genInterfaces.length} interfaces from ${arch.label}.`;
    }

    case "refine_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      await ctx.runMutation(internal.parts.updatePartDslInternal, {
        partId: target._id, dslJson: JSON.stringify(call.input.dsl),
      });
      return `Refined ${target.role}.`;
    }

    case "add_feature_to_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target || !target.dslJson) return `No part with role ${call.input.role}.`;
      const dsl = JSON.parse(target.dslJson);
      dsl.features = [...(dsl.features ?? []), call.input.feature];
      await ctx.runMutation(internal.parts.updatePartDslInternal, {
        partId: target._id, dslJson: JSON.stringify(dsl),
      });
      return `Added feature to ${target.role}.`;
    }

    case "update_archetype_params": {
      // Regenerate parts from new params, overwriting existing parts.
      const project = await ctx.runQuery(api.projects.get, { projectId });
      if (!project?.archetypeId) return "Project has no archetype — can't update params.";
      const arch = getArchetype(project.archetypeId);
      if (!arch) return `Unknown archetype: ${project.archetypeId}`;
      const merged = { ...(project.archetypeParams ?? {}), ...call.input.paramPatch };
      const params = arch.paramSchema.parse(merged);
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, project.scope);

      // Delete existing parts + interfaces and reinsert (simplest approach)
      const existingParts = await ctx.runQuery(internal.parts.listForProjectInternal, { projectId });
      const existingIfaces = await ctx.runQuery(internal.interfaces.listForProjectInternal, { projectId });
      // Note: can't directly delete from an action; use an internal mutation helper.
      // For v1 simplicity, update-in-place by role match.
      // (Implementation detail: write internal.parts.replaceAll + internal.interfaces.replaceAll helpers.)
      await ctx.runMutation(internal.parts.replaceAll, {
        projectId,
        parts: genParts.map(gp => ({ role: gp.role, label: gp.label, position: gp.position, dslJson: JSON.stringify(gp.dsl) })),
      });
      await ctx.runMutation(internal.interfaces.replaceAll, {
        projectId,
        interfaces: genInterfaces,
      });
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId, archetypeId: project.archetypeId, archetypeParams: params,
      });
      return "Archetype params updated.";
    }

    case "break_out":
      await ctx.runMutation(api.projects.breakOut, { projectId });
      return "Broke out of archetype — project is now fully custom.";

    case "decompose_freeform":
      return "Free-form design isn't supported yet in v1. Pick the closest archetype instead (hinged_enclosure, box_with_lid, bracket_plus_panel, divided_tray, shelf_with_brackets, sliding_enclosure).";

    default:
      return `Unknown tool: ${call.name}`;
  }
}
```

Note: `replaceAll` internal mutations referenced above need to be added to `parts.ts` and `interfaces.ts`. Add them:

In `convex/parts.ts`:

```ts
export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    parts: v.array(v.object({
      role: v.string(), label: v.string(), position: poseArgs, dslJson: v.string(),
    })),
  },
  handler: async (ctx, { projectId, parts }) => {
    const existing = await ctx.db
      .query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const p of existing) await ctx.db.delete(p._id);
    for (const p of parts) {
      // Reuse addPartInternal logic — or inline the svg-regen code.
      // For brevity here, reinsert minimally; full version replicates addPartInternal.
      // ...
    }
  },
});
```

(Full body for `replaceAll` mirrors `addPartInternal` — replicate to keep the svg/feature-graph regen. This is Task 4.3.)

- [ ] **Step 2: Commit (incomplete — task 4.3 finishes the replaceAll helpers)**

```bash
git add artifacts/hardwareai/convex/projectChat.ts
git commit -m "feat(convex): projectChat orchestrator — dispatches agent tool calls to schema mutations"
```

---

### Task 4.3: Complete `replaceAll` helpers

**Files:**
- Modify: `artifacts/hardwareai/convex/parts.ts`
- Modify: `artifacts/hardwareai/convex/interfaces.ts`

- [ ] **Step 1: Flesh out parts.replaceAll**

In `convex/parts.ts`:

```ts
export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    parts: v.array(v.object({
      role: v.string(), label: v.string(), position: poseArgs, dslJson: v.string(),
    })),
  },
  handler: async (ctx, { projectId, parts }) => {
    const existing = await ctx.db
      .query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const p of existing) await ctx.db.delete(p._id);
    const now = Date.now();
    for (const p of parts) {
      const dsl = PartDslSchema.parse(JSON.parse(p.dslJson));
      const graph = buildFeatureGraph(dsl);
      const preview: FlatPreviewSpec = {
        partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
        width: dsl.width, height: dsl.height, depth: dsl.depth ?? null,
        bendAngles: null, bendRadius: null, holePattern: null,
        powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? null,
        dsl, featureGraph: graph,
      };
      const svg = generateSvgPreview(preview);
      await ctx.db.insert("parts", {
        projectId, role: p.role, label: p.label, position: p.position,
        partType: dsl.partType, material: dsl.material, thickness: dsl.thickness,
        width: dsl.width, height: dsl.height, depth: dsl.depth ?? undefined,
        powderCoat: !!dsl.finish, powderCoatColor: dsl.finish?.color ?? undefined,
        dslJson: p.dslJson, featureGraphJson: JSON.stringify(graph),
        svgPreview: svg, createdAt: now, updatedAt: now,
      });
    }
  },
});
```

- [ ] **Step 2: Add interfaces.replaceAll**

In `convex/interfaces.ts`:

```ts
export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    interfaces: v.array(v.object({
      kind: v.union(v.literal("bolted"), v.literal("pem_inserted"), v.literal("riveted"), v.literal("hinged")),
      roleA: v.string(), roleB: v.string(),
      featureA: v.string(), featureB: v.string(),
      hardwareRefs: v.array(v.object({
        mcmasterPartNumber: v.string(), quantity: v.number(), role: v.optional(v.string()),
      })),
      accessSide: v.optional(v.union(v.literal("A-to-B"), v.literal("B-to-A"), v.literal("either"))),
    })),
  },
  handler: async (ctx, { projectId, interfaces }) => {
    // Remove existing interfaces
    const existing = await ctx.db
      .query("interfaces").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    for (const i of existing) await ctx.db.delete(i._id);
    // Look up part IDs by role
    const parts = await ctx.db
      .query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    const roleToId = new Map(parts.map(p => [p.role, p._id]));
    const now = Date.now();
    for (const i of interfaces) {
      const a = roleToId.get(i.roleA);
      const b = roleToId.get(i.roleB);
      if (!a || !b) continue;
      await ctx.db.insert("interfaces", {
        projectId, kind: i.kind, partA: a, partB: b,
        featureRefs: [
          { partId: a, featureName: i.featureA },
          { partId: b, featureName: i.featureB },
        ],
        hardwareRefs: i.hardwareRefs,
        accessSide: i.accessSide,
        createdAt: now,
      });
    }
  },
});
```

- [ ] **Step 3: Push + commit**

```bash
npx convex dev --once
git add artifacts/hardwareai/convex/parts.ts artifacts/hardwareai/convex/interfaces.ts
git commit -m "feat(convex): replaceAll helpers for regen from archetype params"
```

---

## Phase 5: Frontend data layer + shell

### Task 5.1: NewProjectWizard component

**Files:**
- Create: `artifacts/hardwareai/src/pages/NewProjectWizard.tsx`
- Modify: `artifacts/hardwareai/src/pages/Home.tsx` (swap inline dialog for this component)

- [ ] **Step 1: Create NewProjectWizard.tsx**

A 2-page modal: scope questions (tier, location, waterproof, use case, reference scale) → intent description textarea. On submit: `createProject` → `updateScope` → `send` (chat message with initial intent so the agent calls `capture_scope` + `select_archetype`). Route the user to `/project/<id>` after generation.

Key behavior: after creation + scope write + initial chat send, the wizard closes. Any agent-generated parts appear in the workspace on arrival.

Implementation skeleton:

```tsx
import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { useLocation } from "wouter";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function NewProjectWizard({ open, onOpenChange }: Props) {
  const [, setLocation] = useLocation();
  const createProject = useMutation(api.projects.create);
  const updateScope = useMutation(api.projects.updateScope);
  const send = useAction(api.projectChat.send);
  const [page, setPage] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  // Page 1 state
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"jerry-rigged" | "mvp" | "commercial">("mvp");
  const [outdoor, setOutdoor] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [useCase, setUseCase] = useState("");
  const [referenceScale, setReferenceScale] = useState("");

  // Page 2 state
  const [intent, setIntent] = useState("");

  const handleNext = () => { if (name.trim() && useCase.trim()) setPage(2); };

  const handleSubmit = async () => {
    if (!intent.trim() || busy) return;
    setBusy(true);
    try {
      const project = await createProject({ name, description: useCase });
      if (!project) throw new Error("Create failed");
      const model = localStorage.getItem("fabware.chat.model") ?? "claude-opus-4-7";
      const effort = localStorage.getItem("fabware.chat.effort") ?? "high";
      await updateScope({
        projectId: project._id,
        scope: {
          tier,
          environment: { location: outdoor ? "outdoor" : "indoor", waterproof: outdoor && waterproof },
          useCase,
          referenceScale: referenceScale ? { kind: referenceScale } : undefined,
        },
      });
      // Kick off the agent so it calls select_archetype
      await send({ projectId: project._id, content: intent, model, effort });
      onOpenChange(false);
      setLocation(`/project/${project._id}`);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary">
            {page === 1 ? "Scope" : "What do you want to build?"}
          </DialogTitle>
        </DialogHeader>
        {page === 1 ? (
          <div className="grid gap-4 py-4">
            <div><Label>Project name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. TENNIS-LOCKER-01" /></div>
            <div>
              <Label>Build tier</Label>
              <RadioGroup value={tier} onValueChange={(v: any) => setTier(v)}>
                <div className="flex items-center gap-2"><RadioGroupItem value="jerry-rigged" id="t1" /><label htmlFor="t1">Jerry-rigged (cheap & fast)</label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="mvp" id="t2" /><label htmlFor="t2">MVP (prototype-worthy)</label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="commercial" id="t3" /><label htmlFor="t3">Commercial (production)</label></div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} /> <Label>Outdoor</Label></div>
            {outdoor && (
              <div className="pl-4 flex items-center gap-2"><input type="checkbox" checked={waterproof} onChange={e => setWaterproof(e.target.checked)} /> <Label>Waterproof</Label></div>
            )}
            <div><Label>What's it for?</Label><Input value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="Outdoor tennis-ball rental lockers" /></div>
            <div><Label>What's inside / reference scale? (optional)</Label><Input value={referenceScale} onChange={e => setReferenceScale(e.target.value)} placeholder="3 tennis balls, ~12x12x12 inches" /></div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <Label>Describe what you want</Label>
            <Textarea value={intent} onChange={e => setIntent(e.target.value)} rows={6} placeholder="Locker with hinged top, keypad lock, stackable..." />
          </div>
        )}
        <DialogFooter>
          {page === 1 ? (
            <Button onClick={handleNext} disabled={!name.trim() || !useCase.trim()} className="w-full">Next</Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setPage(1)} className="flex-1">Back</Button>
              <Button onClick={handleSubmit} disabled={!intent.trim() || busy} className="flex-1">
                {busy ? "Generating..." : "Create & generate"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire in Home.tsx**

Replace the existing Dialog block in `Home.tsx` with:

```tsx
import { NewProjectWizard } from "./NewProjectWizard";
// ...
<Button onClick={() => setIsDialogOpen(true)} className="gap-2 font-mono uppercase tracking-wider text-xs">
  <Plus className="w-4 h-4" /> New Project
</Button>
<NewProjectWizard open={isDialogOpen} onOpenChange={setIsDialogOpen} />
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/src/pages/NewProjectWizard.tsx artifacts/hardwareai/src/pages/Home.tsx
git commit -m "feat(ui): new-project wizard — scope page + intent page; creates, scopes, kicks off agent"
```

---

### Task 5.2: Part list rail — `PartList.tsx` + `InterfaceList.tsx`

**Files:**
- Create: `artifacts/hardwareai/src/components/workspace/PartList.tsx`
- Create: `artifacts/hardwareai/src/components/workspace/InterfaceList.tsx`

- [ ] **Step 1: Create PartList.tsx**

```tsx
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  projectId: Id<"projects">;
  focusedPartId: Id<"parts"> | null;
  onFocusPart: (id: Id<"parts"> | null) => void;
}

export default function PartList({ projectId, focusedPartId, onFocusPart }: Props) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <div className="flex flex-col min-h-0">
      <div className="p-3 border-b border-border">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Parts</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {parts === undefined && <div className="p-3 text-xs font-mono text-muted-foreground">Loading…</div>}
        {parts?.length === 0 && <div className="p-3 text-xs font-mono text-muted-foreground italic">No parts yet.</div>}
        {parts?.map(p => (
          <button
            key={p._id}
            onClick={() => onFocusPart(p._id === focusedPartId ? null : p._id)}
            className={`w-full text-left p-2.5 border-b border-border/40 font-mono text-xs hover:bg-muted/40 transition-colors ${
              p._id === focusedPartId ? "bg-primary/10 border-l-2 border-l-primary" : ""
            }`}
          >
            <div className="font-bold">{p.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {p.partType} · {p.material ?? "—"} · {p.thickness ?? "—"}"
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create InterfaceList.tsx**

```tsx
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export default function InterfaceList({ projectId }: { projectId: Id<"projects"> }) {
  const interfaces = useQuery(api.interfaces.listForProject, projectId ? { projectId } : "skip");
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const partMap = new Map((parts ?? []).map(p => [p._id, p.role]));

  return (
    <div className="border-t border-border">
      <div className="p-3 border-b border-border">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Interfaces {interfaces && `(${interfaces.length})`}
        </h3>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {interfaces?.map(i => (
          <div key={i._id} className="p-2 border-b border-border/40 font-mono text-[11px]">
            {partMap.get(i.partA) ?? "?"} ←{i.kind}×{i.hardwareRefs.reduce((a, h) => a + h.quantity, 0)}→ {partMap.get(i.partB) ?? "?"}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/hardwareai/src/components/workspace/PartList.tsx artifacts/hardwareai/src/components/workspace/InterfaceList.tsx
git commit -m "feat(ui): PartList + InterfaceList rail components"
```

---

### Task 5.3: Assembled view — `AssembledView.tsx`

**Files:**
- Create: `artifacts/hardwareai/src/components/workspace/AssembledView.tsx`

- [ ] **Step 1: Create the Three.js scene**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function Part({ w, h, t, position }: { w: number; h: number; t: number; position: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } }) {
  return (
    <mesh position={[position.x, position.z, position.y]} rotation={[position.rotX, position.rotZ, position.rotY]}>
      <boxGeometry args={[w, t, h]} />
      <meshStandardMaterial color="#d0d4da" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

export default function AssembledView({ projectId }: { projectId: Id<"projects"> }) {
  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  return (
    <Canvas camera={{ position: [20, 20, 20], fov: 35 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
      <Grid args={[40, 40]} cellColor="#333" sectionColor="#555" fadeDistance={30} infiniteGrid />
      <OrbitControls />
      {parts?.map(p => (
        <Part
          key={p._id}
          w={p.width ?? 1}
          h={p.height ?? 1}
          t={p.thickness ?? 0.075}
          position={p.position}
        />
      ))}
    </Canvas>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/src/components/workspace/AssembledView.tsx
git commit -m "feat(ui): AssembledView — Three.js isometric scene rendering parts in their assembly poses"
```

---

### Task 5.4: Archetype info chip — `ArchetypeInfoChip.tsx`

**Files:**
- Create: `artifacts/hardwareai/src/components/workspace/ArchetypeInfoChip.tsx`

Option 2c — hidden by default, small `info` icon in header, popover on click offers "Tweak standard options" (param form as a Sheet) and "Design fully custom instead" (break_out).

- [ ] **Step 1: Create component**

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const ARCHETYPE_LABELS: Record<string, string> = {
  hinged_enclosure: "Hinged Enclosure",
  sliding_enclosure: "Sliding Enclosure",
  bracket_plus_panel: "Bracket + Panel",
  divided_tray: "Divided Tray",
  shelf_with_brackets: "Shelf with Brackets",
  box_with_lid: "Box with Lid",
};

export default function ArchetypeInfoChip({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const breakOut = useMutation(api.projects.breakOut);
  const [confirming, setConfirming] = useState(false);

  if (!project?.archetypeId) return null;

  const label = ARCHETYPE_LABELS[project.archetypeId] ?? project.archetypeId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Template info">
          <Info className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 font-mono text-xs">
        <div className="space-y-3">
          <p>This project was generated from the <strong>{label}</strong> template.</p>
          <Button size="sm" variant="outline" className="w-full" disabled>
            Tweak standard options <span className="ml-1 text-muted-foreground">(soon)</span>
          </Button>
          {confirming ? (
            <div className="space-y-2">
              <p className="text-muted-foreground">You'll lose the ability to regenerate from intent. Continue?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={async () => { await breakOut({ projectId }); setConfirming(false); }}>Confirm</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => setConfirming(true)}>
              Design fully custom instead
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/src/components/workspace/ArchetypeInfoChip.tsx
git commit -m "feat(ui): ArchetypeInfoChip — hidden-by-default template info + break-out confirmation"
```

---

### Task 5.5: Scope editor — `ScopeEditor.tsx`

**Files:**
- Create: `artifacts/hardwareai/src/components/workspace/ScopeEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Tier = "jerry-rigged" | "mvp" | "commercial";

export default function ScopeEditor({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const project = useQuery(api.projects.get, projectId && open ? { projectId } : "skip");
  const updateScope = useMutation(api.projects.updateScope);

  const [tier, setTier] = useState<Tier>("mvp");
  const [outdoor, setOutdoor] = useState(false);
  const [waterproof, setWaterproof] = useState(false);
  const [uv, setUv] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [useCase, setUseCase] = useState("");
  const [referenceKind, setReferenceKind] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project?.scope) return;
    setTier(project.scope.tier);
    setOutdoor(project.scope.environment.location === "outdoor");
    setWaterproof(project.scope.environment.waterproof ?? false);
    setUv(project.scope.environment.uv ?? false);
    setFreeze(project.scope.environment.freeze ?? false);
    setUseCase(project.scope.useCase);
    setReferenceKind(project.scope.referenceScale?.kind ?? "");
  }, [project]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateScope({
        projectId,
        scope: {
          tier,
          environment: {
            location: outdoor ? "outdoor" : "indoor",
            ...(outdoor ? { waterproof, uv, freeze } : {}),
          },
          useCase,
          referenceScale: referenceKind ? { kind: referenceKind } : undefined,
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] bg-card border-l border-border">
        <SheetHeader>
          <SheetTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Project Scope
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-muted-foreground/70">
            Updates cascade to material/fastener/finish suggestions.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-4 font-mono text-xs">
          <div>
            <Label>Build tier</Label>
            <RadioGroup value={tier} onValueChange={(v: Tier) => setTier(v)}>
              <div className="flex items-center gap-2"><RadioGroupItem value="jerry-rigged" id="st1" /><label htmlFor="st1">Jerry-rigged</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="mvp" id="st2" /><label htmlFor="st2">MVP</label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="commercial" id="st3" /><label htmlFor="st3">Commercial</label></div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={outdoor} onChange={e => setOutdoor(e.target.checked)} id="sc-out" />
            <label htmlFor="sc-out">Outdoor</label>
          </div>
          {outdoor && (
            <div className="pl-4 space-y-2">
              <div className="flex items-center gap-2"><input type="checkbox" checked={waterproof} onChange={e => setWaterproof(e.target.checked)} id="sc-wp" /><label htmlFor="sc-wp">Waterproof</label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={uv} onChange={e => setUv(e.target.checked)} id="sc-uv" /><label htmlFor="sc-uv">UV-exposed</label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={freeze} onChange={e => setFreeze(e.target.checked)} id="sc-fr" /><label htmlFor="sc-fr">Freeze cycles</label></div>
            </div>
          )}
          <div>
            <Label>Use case</Label>
            <Input value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="What's this for?" />
          </div>
          <div>
            <Label>Reference scale (optional)</Label>
            <Input value={referenceKind} onChange={e => setReferenceKind(e.target.value)} placeholder="3 tennis balls" />
          </div>
          <Button onClick={handleSave} disabled={saving || !useCase.trim()} className="w-full">
            {saving ? "Saving..." : "Save scope"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add artifacts/hardwareai/src/components/workspace/ScopeEditor.tsx
git commit -m "feat(ui): ScopeEditor sheet — live-edits project.scope"
```

---

### Task 5.6: Update ChatPanel for focused-part awareness

**Files:**
- Modify: `artifacts/hardwareai/src/components/workspace/ChatPanel.tsx`

- [ ] **Step 1: Accept `focusedPartRole` prop and pass it to `send`**

```diff
-interface ChatPanelProps {
-  projectId: Id<"projects">;
-  disabled?: boolean;
-}
+interface ChatPanelProps {
+  projectId: Id<"projects">;
+  focusedPartRole?: string | null;
+  disabled?: boolean;
+}
```

In the `handleSend`:

```diff
  await sendMessage({
    projectId,
    content,
    imageData: image?.data,
    imageMediaType: image?.mediaType,
    model,
    effort,
+   focusedRole: focusedPartRole ?? undefined,
  });
```

Add a subtle badge in the input area header if `focusedPartRole` is set: *"Focused: `{role}`"*.

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(ui): ChatPanel passes focusedRole to the agent"
```

---

### Task 5.7: Workspace.tsx — new layout

**Files:**
- Modify: `artifacts/hardwareai/src/pages/Workspace.tsx`

- [ ] **Step 1: Rewrite layout**

```tsx
import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "convex/react";
import { Settings2, ArrowLeft, History, Sliders } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import AssembledView from "@/components/workspace/AssembledView";
import RulesStatusStrip from "@/components/workspace/RulesStatusStrip";
import HistoryPanel from "@/components/workspace/HistoryPanel";
import AssemblyPartsPanel from "@/components/workspace/AssemblyPartsPanel";
import PartList from "@/components/workspace/PartList";
import InterfaceList from "@/components/workspace/InterfaceList";
import ArchetypeInfoChip from "@/components/workspace/ArchetypeInfoChip";
import ScopeEditor from "@/components/workspace/ScopeEditor";
import { Button } from "@/components/ui/button";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function Workspace() {
  const params = useParams();
  const projectId = (params.id as Id<"projects"> | undefined) ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [focusedPartId, setFocusedPartId] = useState<Id<"parts"> | null>(null);

  const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
  const focusedPart = parts?.find(p => p._id === focusedPartId) ?? null;

  if (!projectId) return <div>Invalid project ID</div>;
  const shortId = projectId.slice(-4).toUpperCase();

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden">
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/studio" className="text-muted-foreground hover:text-primary"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="w-px h-6 bg-border" />
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold">Studio</span>
          <div className="w-px h-6 bg-border" />
          <span className="font-mono text-sm text-muted-foreground">PRJ-{shortId}</span>
          <ArchetypeInfoChip projectId={projectId} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setScopeOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <Sliders className="w-3.5 h-3.5 mr-2" />Scope
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="font-mono text-xs uppercase tracking-widest">
            <History className="w-3.5 h-3.5 mr-2" />History
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left rail: parts + interfaces */}
        <aside className="w-60 border-r border-border flex flex-col">
          <PartList projectId={projectId} focusedPartId={focusedPartId} onFocusPart={setFocusedPartId} />
          <InterfaceList projectId={projectId} />
        </aside>

        {/* Middle: chat */}
        <section className="w-[28rem] border-r border-border flex flex-col">
          <ChatPanel projectId={projectId} focusedPartRole={focusedPart?.role ?? null} />
        </section>

        {/* Right: canvas */}
        <section className="flex-1 flex flex-col bg-[#0a0f18] relative">
          <RulesStatusStrip projectId={projectId} />
          <div className="flex-1 min-h-0 flex flex-col">
            <AssembledView projectId={projectId} />
          </div>
          <div className="max-h-80 shrink-0 flex flex-col min-h-0">
            <AssemblyPartsPanel projectId={projectId} />
          </div>
        </section>
      </div>

      <HistoryPanel
        projectId={projectId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentRevisionId={null}
        previewRevisionId={null}
        onPreviewRevision={() => {}}
      />
      <ScopeEditor projectId={projectId} open={scopeOpen} onOpenChange={setScopeOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(ui): Workspace — part rail + chat + assembled canvas, drops single-part layout"
```

---

### Task 5.8: Update RulesStatusStrip to show assembly rules

**Files:**
- Modify: `artifacts/hardwareai/src/components/workspace/RulesStatusStrip.tsx`

- [ ] **Step 1: Switch to `api.validation.getAssemblyValidation`**

Replace the `useQuery(api.partSpecs.getValidation, ...)` call with:

```tsx
const data = useQuery(api.validation.getAssemblyValidation, projectId ? { projectId } : "skip");
```

The rule shape is already compatible (`{ rules: Array<{id, label, status, message, suggestion?}>, hasFailures }`).

Drop the "Apply Suggestions" button for now (Slice 1 skips auto-fix for assembly rules; bring back later with a proper `applyAssemblySuggestion` mutation).

- [ ] **Step 2: Commit**

```bash
git commit -am "refactor(ui): RulesStatusStrip uses assembly validation"
```

---

### Task 5.9: Update Export page for per-part DXF download

**Files:**
- Modify: `artifacts/hardwareai/src/pages/Export.tsx`

- [ ] **Step 1: List parts, one DXF download button per part**

Query `api.parts.listForProject`; render a list item per part with a `Download` button. Each button calls `exportDxf({ projectId, partId })` — this requires extending the export function.

- [ ] **Step 2: Extend `convex/exportDxf.ts` to take partId**

Add to `convex/exportDxf.ts`:

```ts
import { PartDslSchema, legacyToDsl } from "./lib/dsl";
import { buildFeatureGraph } from "./lib/featureGraph";
import { generateDxf, type FlatPreviewSpec } from "./lib/dxfGenerator";

export const runForPart = mutation({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, { projectId, partId }) => {
    const project = await ctx.db.get(projectId);
    const part = await ctx.db.get(partId);
    if (!project) throw new Error("Project not found");
    if (!part || part.projectId !== projectId) throw new Error("Part not found in this project");

    // Build a FlatPreviewSpec from the part's DSL (preferred) or fall back to legacy fields.
    let dsl;
    if (part.dslJson) {
      const parsed = PartDslSchema.safeParse(JSON.parse(part.dslJson));
      if (!parsed.success) throw new Error("Part DSL is invalid: " + parsed.error.message.slice(0, 200));
      dsl = parsed.data;
    } else {
      dsl = legacyToDsl({
        partType: part.partType,
        material: part.material ?? null,
        thickness: part.thickness ?? null,
        width: part.width ?? null,
        height: part.height ?? null,
        depth: part.depth ?? null,
        bendAngles: part.bendAngles ?? null,
        bendRadius: part.bendRadius ?? null,
        holePattern: part.holePattern ?? null,
        powderCoat: part.powderCoat ?? null,
        powderCoatColor: part.powderCoatColor ?? null,
      });
    }

    const featureGraph = buildFeatureGraph(dsl);
    const preview: FlatPreviewSpec = {
      partType: dsl.partType,
      material: dsl.material,
      thickness: dsl.thickness,
      width: dsl.width,
      height: dsl.height,
      depth: dsl.depth ?? null,
      bendAngles: null,
      bendRadius: null,
      holePattern: null,
      powderCoat: !!dsl.finish,
      powderCoatColor: dsl.finish?.color ?? null,
      dsl,
      featureGraph,
    };

    const dxfContent = generateDxf(preview, {
      projectName: project.name,
      revisionNumber: 1,
    });
    const filename = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${part.role}.dxf`;

    // Mark the project as touched (but don't change status — export is per-part now).
    await ctx.db.patch(projectId, { updatedAt: Date.now() });

    return {
      projectId,
      partId,
      filename,
      dxfContent,
      sendCutSendUploadUrl: "https://sendcutsend.com/upload",
      instructions: [
        `Download DXF: ${filename}`,
        `Material: ${dsl.material} — ${dsl.thickness}" thick`,
        dsl.finish ? `Finish: Powder coat ${dsl.finish.color}` : "Finish: none",
        "Go to https://sendcutsend.com/upload and upload this DXF",
      ],
      estimatedParts: 1,
    };
  },
});
```

Update `src/pages/Export.tsx` to call `runForPart` per part:

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
// ... inside component:
const parts = useQuery(api.parts.listForProject, projectId ? { projectId } : "skip");
const runForPart = useMutation(api.exportDxf.runForPart);

const downloadPart = async (partId: Id<"parts">) => {
  const data = await runForPart({ projectId: projectId!, partId });
  const blob = new Blob([data.dxfContent], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = data.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Render:
{parts?.map(p => (
  <div key={p._id} className="flex items-center justify-between p-3 border border-border rounded">
    <div><div className="font-bold">{p.label}</div><div className="text-xs text-muted-foreground">{p.role} · {p.material ?? "—"}</div></div>
    <Button onClick={() => downloadPart(p._id)} className="gap-2"><Download className="w-4 h-4" /> DXF</Button>
  </div>
))}
```

- [ ] **Step 3: Push + commit**

```bash
npx convex dev --once
git add artifacts/hardwareai/src/pages/Export.tsx artifacts/hardwareai/convex/exportDxf.ts
git commit -m "feat: per-part DXF export in Export page"
```

---

## Phase 6: Integration + acceptance

### Task 6.1: Smoke test — tennis ball locker end-to-end

**No new files.** Run the acceptance test from the spec manually.

- [ ] **Step 1: Ensure Convex env has the Anthropic key**

```bash
npx convex env list
# should show ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Start the frontend**

```bash
cd ~/fabware/artifacts/hardwareai
pnpm dev
```

- [ ] **Step 3: Run through the acceptance script**

In the browser:

1. Open `/studio`, click **New Project**.
2. Fill wizard page 1:
   - Name: `TENNIS-LOCKER-01`
   - Tier: Commercial
   - Outdoor: checked; Waterproof: checked
   - Use case: `Outdoor lockers for a tennis club to store 3 balls per rental`
   - Reference scale: `3 tennis balls, ~12×12×12 inches inside`
3. Page 2 intent: `Locker with hinged top, keypad lock, stackable.`
4. Submit. Expect route → `/project/<id>`.
5. Verify: 6 parts visible in the left rail, assembled isometric renders, rules strip shows passes.
6. In chat: `make the walls taller, 16 inches instead of 12.` Expect all 4 walls regenerate at the new height.
7. Click `lid` in the rail to focus it; chat: `add a 1-inch drain hole in the center of the lid.`. Expect only the lid updates.
8. Click the header `ⓘ` info chip, dismiss popover.
9. Click **Export**. Expect 6 per-part download buttons; clicking each produces a DXF file.

- [ ] **Step 4: Commit any fixes**

Any bug you fixed during the walkthrough should go in a commit:

```bash
git commit -am "fix: <whatever>"
```

---

### Task 6.2: Update CLAUDE.md and memory

**Files:**
- Modify: `~/fabware/CLAUDE.md` (if it exists; otherwise the memory file)
- Modify: `~/.claude/projects/-Users-grahampatterson/memory/fabware_project.md`

- [ ] **Step 1: Update CLAUDE.md section for slice 1**

Add a section noting: "Multi-part sheet-metal assembly slice shipped. Projects have `parts` + `interfaces` tables; archetype library at `convex/archetypes/`; orchestrator at `convex/projectChat.ts`; agent at `convex/assemblyDesigner.ts`."

- [ ] **Step 2: Update memory file with pointer to the roadmap + spec**

```markdown
**Slice 1 delivered (2026-04-24):** multi-part sheet-metal assembly with archetype library (6 starters) + scope wizard + assembled Three.js preview. Spec: `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md`. Plan: `docs/superpowers/plans/2026-04-24-sheet-metal-assembly.md`.
```

- [ ] **Step 3: Commit**

```bash
git commit -am "docs: note slice 1 shipped in project memory"
```

---

## Deferred (explicitly NOT in this plan)

- 3D-printed parts (slice 2)
- Cost + BOM (slice 3)
- Mixed materials: acrylic, gaskets (slice 4)
- Export bundle (slice 5)
- K-factor bend math beyond today's behavior (still on the roadmap but not blocking slice 1 acceptance)
- Electronics mounting, electromagnetic locks, photoreal renders, FEA, tolerance stackup

### Known gaps in this slice (deliberately deferred to a v1.5 follow-up)

- **Revision history for multi-part projects.** `HistoryPanel` is wired but won't show revisions for new multi-part projects — `partRevisions` rows are still part-level from the legacy flow. Workspace.tsx passes `currentRevisionId={null}` in Task 5.7 so the panel stays functional but empty. Proper project-level snapshots (whole `{ scope, archetypeId, parts, interfaces }` blob per revision) are a slice-1.5 task. Expected 1-day effort: extend `revisions.ts` to snapshot the new shape on every `projectChat.send`, update `HistoryPanel` to render those snapshots.
- **AssemblyPartsPanel not yet repurposed.** Today's panel queries `api.assemblyParts.list` (the legacy per-project hardware table). New multi-part projects write hardware onto `interfaces.hardwareRefs` instead, so this panel will appear empty. v1 acceptance doesn't need it — the `InterfaceList` component (Task 5.2) shows the same info via interfaces. Retire the old panel in slice 1.5 or repurpose it to aggregate hardware across all interfaces.
- **GuidedInputPanel** still renders but its messages go through `projectChat.send` which expects structured intent — it'll often resolve to "tweak this part" correctly but may occasionally confuse the agent. Low-priority; consider hiding or rewiring in slice 1.5.
- **`update_archetype_params` overwrites user tweaks.** If a user refined an individual part (e.g., added an extra hole) and then changes an archetype param (e.g., innerWidth), the regeneration wipes the tweak. v1 accepts this — we warn the user in the chat response. A merge strategy (preserve tweaks not conflicting with regen) is a slice-1.5 item.

---

## Rollback

If slice 1 needs to be reverted:

- The old single-part flow is preserved in `partSpecs.ts`, `designer.ts`, and the legacy frontend structure references. Projects created pre-slice-1 don't have `parts`/`interfaces` rows, so they continue to work on the old code path as long as `isMultiPart !== true`.
- Schema additions are additive; no column was removed from `projects`.
- Reverting is mostly a frontend concern: drop `NewProjectWizard`, revert `Workspace.tsx` to its previous layout, hide the new routes. Backend tables can stay (unused data is cheap).
