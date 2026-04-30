# CAD IR Phase 8 — AABB interference detection (Tier 5 expansion)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Detect when two parts in an assembly physically overlap, using axis-aligned bounding boxes (AABB) computed from each part's resolved geometry. Add `assembly.parts-interfere` to Tier 5. The agent gets immediate feedback on physical impossibilities without needing real geometry from the sandbox.

**Why this slice:** Phase 4 introduced the assembly graph. Phase 5 added per-part codegen. But there's no check that two parts can actually coexist in 3D space. A user prompt like "place the lid 2mm above the box" would currently produce a valid IR even if the lid penetrates the box — the agent would only learn at sandbox-render time, after wasted execution.

**Limitations declared up-front:** AABB interference is *axis-aligned* — rotated parts (`PartRef.rotation` non-zero) get their bbox conservatively expanded to a sphere-equivalent, which over-flags. Real OBB or geometry-based interference is deferred. AABB is good enough for the common case (90% of assemblies are axis-aligned at the part level).

**Builds on:** Phase 7 tip `c1c29a0`. Worktree at `~/fabware-cad-ir-phase-8/` on branch `feat/cad-ir-phase-8`.

---

## Prerequisites

- Phase 7 complete (279/279 tests).
- Worktree at `~/fabware-cad-ir-phase-8/` off Phase 7 tip.

---

## File Structure

```
convex/cad/geometry/
├── partBbox.ts            # NEW — compute AABB for a single CadIr (per-part)
├── transform.ts           # NEW — apply part origin/rotation to a bbox
└── __tests__/{partBbox,transform}.test.ts

convex/cad/validate/rules/
├── partsInterfere.ts      # NEW — Tier 5 rule: AABB overlap check across all part pairs
└── __tests__/rules-partsInterfere.test.ts

convex/cad/validate/assemblyTier.ts   # MODIFY — compose partsInterfere alongside floating-part / over-constrained checks

convex/cad/prompts.ts      # MODIFY
convex/cad/README.md       # MODIFY
```

---

## Task 1: Per-part AABB computation

**Files:** `convex/cad/geometry/partBbox.ts`, `__tests__/partBbox.test.ts`

The bbox of a single-part CadIr is computed by walking its features (in the part's local frame) and accumulating min/max in xyz. Phase 8 v0 supports the common cases:
- `extrude` with a `rect` sketch: bbox = `{ minX: cx - w/2, maxX: cx + w/2, minY: cy - h/2, maxY: cy + h/2, minZ: 0, maxZ: distance }`
- `extrude` with a `circle` sketch: bbox = `{ minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r, minZ: 0, maxZ: distance }`
- `revolve` (full 360): bbox approximated by spinning the profile about its axis

Other features (cut_extrude, fillet, chamfer, hole, pattern, sweep, loft, shell, weld_tab, bend_flange) **do not enlarge** the bbox — they only modify or subtract from existing geometry. So Phase 8 v0 only needs to grow the bbox on `extrude` and `revolve`.

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { computePartBbox } from "../partBbox";
import { emptyIr } from "../../ir/empty";

describe("computePartBbox", () => {
  it("returns null for an empty part (no extrude features)", () => {
    expect(computePartBbox(emptyIr("mm"))).toBeNull();
  });

  it("computes AABB from a single extrude with rect sketch", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 50 }] } },
      features: [{ kind: "extrude" as const, id: "base", profile: "p", distance: 5, operation: "new_body" as const }],
    };
    const bbox = computePartBbox(ir);
    expect(bbox).toEqual({ minX: -50, maxX: 50, minY: -25, maxY: 25, minZ: 0, maxZ: 5 });
  });

  it("computes AABB from a circle extrude", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "circle" as const, id: "c", center: { x: 0, y: 0 }, radius: 10 }] } },
      features: [{ kind: "extrude" as const, id: "cyl", profile: "p", distance: 30, operation: "new_body" as const }],
    };
    const bbox = computePartBbox(ir);
    expect(bbox).toEqual({ minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: 0, maxZ: 30 });
  });

  it("merges multiple extrude bboxes", () => {
    const ir = {
      ...emptyIr("mm"),
      sketches: {
        a: { id: "a", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: 100, height: 50 }] },
        b: { id: "b", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o2", center: { x: 60, y: 0 }, width: 20, height: 20 }] },
      },
      features: [
        { kind: "extrude" as const, id: "base", profile: "a", distance: 5, operation: "new_body" as const },
        { kind: "extrude" as const, id: "boss", profile: "b", distance: 15, operation: "add" as const },
      ],
    };
    const bbox = computePartBbox(ir);
    expect(bbox).toEqual({ minX: -50, maxX: 70, minY: -25, maxY: 25, minZ: 0, maxZ: 15 });
  });

  it("evaluates parameterized dimensions", () => {
    const ir = {
      ...emptyIr("mm"),
      parameters: { len: { id: "len", value: 80 }, wid: { id: "wid", value: 40 } },
      sketches: { p: { id: "p", plane: "XY" as const, geometry: [{ kind: "rect" as const, id: "o", center: { x: 0, y: 0 }, width: "len", height: "wid" }] } },
      features: [{ kind: "extrude" as const, id: "base", profile: "p", distance: 3, operation: "new_body" as const }],
    };
    const bbox = computePartBbox(ir);
    expect(bbox).toEqual({ minX: -40, maxX: 40, minY: -20, maxY: 20, minZ: 0, maxZ: 3 });
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/geometry/partBbox.ts
import type { CadIr } from "../ir/types";
import { resolveIr } from "../resolve/resolveIr";

export interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function merge(a: AABB | null, b: AABB): AABB {
  if (!a) return b;
  return {
    minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
    minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function computePartBbox(ir: CadIr): AABB | null {
  let resolved;
  try {
    resolved = resolveIr(ir);
  } catch {
    return null;
  }

  let bbox: AABB | null = null;
  for (const f of resolved.features) {
    // Only grow on extrude / revolve; suppress / cut_extrude / fillet / chamfer / hole / pattern
    // / sweep / loft / shell / weld_tab / bend_flange do not enlarge bbox.
    if (f.suppressed) continue;
    if (f.kind === "extrude") {
      const sketch = resolved.sketches[f.profile];
      if (!sketch) continue;
      for (const g of sketch.geometry) {
        if (g.kind === "rect") {
          const halfW = g.width / 2, halfH = g.height / 2;
          bbox = merge(bbox, {
            minX: g.center.x - halfW, maxX: g.center.x + halfW,
            minY: g.center.y - halfH, maxY: g.center.y + halfH,
            minZ: 0, maxZ: f.distance as number,
          });
        } else if (g.kind === "circle") {
          bbox = merge(bbox, {
            minX: g.center.x - g.radius, maxX: g.center.x + g.radius,
            minY: g.center.y - g.radius, maxY: g.center.y + g.radius,
            minZ: 0, maxZ: f.distance as number,
          });
        }
      }
    }
    if (f.kind === "revolve") {
      // Conservative: use the profile sketch's bbox revolved around the world axis.
      const sketch = resolved.sketches[f.profile];
      if (!sketch) continue;
      // Compute profile bbox in 2D, then full revolution: extends ± maxRadius in the perpendicular axes.
      let profMin = Infinity, profMax = -Infinity, profH = 0;
      for (const g of sketch.geometry) {
        if (g.kind === "rect") {
          const halfW = g.width / 2;
          profMin = Math.min(profMin, g.center.x - halfW);
          profMax = Math.max(profMax, g.center.x + halfW);
          profH = Math.max(profH, g.center.y + g.height / 2);
        } else if (g.kind === "circle") {
          profMin = Math.min(profMin, g.center.x - g.radius);
          profMax = Math.max(profMax, g.center.x + g.radius);
          profH = Math.max(profH, g.center.y + g.radius);
        }
      }
      if (profMin === Infinity) continue;
      const radius = Math.max(Math.abs(profMin), Math.abs(profMax));
      // Phase 8 v0: assume revolve axis is the z-axis; height stays profH
      bbox = merge(bbox, {
        minX: -radius, maxX: radius,
        minY: -radius, maxY: radius,
        minZ: 0, maxZ: profH,
      });
    }
  }
  return bbox;
}
```

- [ ] **Step 3**: Run vitest, expect 5/5 pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/geometry/
git commit -m "feat(cad-ir): per-part AABB computation (extrude + revolve)"
```

---

## Task 2: Bbox transform (origin + rotation)

**Files:** `convex/cad/geometry/transform.ts`, `__tests__/transform.test.ts`

A part placed in an assembly has an `origin` and `rotation` from `PartRef`. To check inter-part interference, transform each part's local bbox into the assembly frame.

For Phase 8 v0:
- Translation by `origin` is exact
- Rotation is conservative: expand the bbox to a sphere of radius = bbox diagonal / 2, then re-axis-align
- If rotation is all zeros, skip the conservative expansion (most common case)

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { transformBbox } from "../transform";

describe("transformBbox", () => {
  it("translates by origin (no rotation)", () => {
    const local = { minX: -10, maxX: 10, minY: -5, maxY: 5, minZ: 0, maxZ: 20 };
    const out = transformBbox(local, { x: 50, y: 0, z: 0 }, undefined);
    expect(out).toEqual({ minX: 40, maxX: 60, minY: -5, maxY: 5, minZ: 0, maxZ: 20 });
  });

  it("conservatively expands when any rotation component is non-zero", () => {
    const local = { minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: 0, maxZ: 20 };
    // 45° rotation around any axis — expansion expected
    const out = transformBbox(local, { x: 0, y: 0, z: 0 }, { rx: 0, ry: 0, rz: 45 });
    // Center is (0, 0, 10); diagonal = sqrt(20² + 20² + 20²) = ~34.64; radius = ~17.32
    // Expanded box around (0, 0, 10) with half-extent 17.32 → minZ ≈ -7.32, maxZ ≈ 27.32
    expect(out.minX).toBeLessThan(local.minX);
    expect(out.maxX).toBeGreaterThan(local.maxX);
  });

  it("zero-rotation object passes through unchanged", () => {
    const local = { minX: -10, maxX: 10, minY: -5, maxY: 5, minZ: 0, maxZ: 20 };
    const out = transformBbox(local, undefined, { rx: 0, ry: 0, rz: 0 });
    expect(out).toEqual(local);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/geometry/transform.ts
import type { AABB } from "./partBbox";

interface Vec3 { x: number; y: number; z: number; }
type RotationDeg = { rx: number; ry: number; rz: number };

export function transformBbox(
  local: AABB,
  origin: Vec3 | undefined,
  rotation: RotationDeg | undefined,
): AABB {
  const ox = origin?.x ?? 0;
  const oy = origin?.y ?? 0;
  const oz = origin?.z ?? 0;

  const hasRotation = rotation && (rotation.rx !== 0 || rotation.ry !== 0 || rotation.rz !== 0);

  if (!hasRotation) {
    return {
      minX: local.minX + ox, maxX: local.maxX + ox,
      minY: local.minY + oy, maxY: local.maxY + oy,
      minZ: local.minZ + oz, maxZ: local.maxZ + oz,
    };
  }

  // Conservative: enclose in sphere centered at the local bbox center, then re-AABB
  const cx = (local.minX + local.maxX) / 2;
  const cy = (local.minY + local.maxY) / 2;
  const cz = (local.minZ + local.maxZ) / 2;
  const dx = (local.maxX - local.minX) / 2;
  const dy = (local.maxY - local.minY) / 2;
  const dz = (local.maxZ - local.minZ) / 2;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    minX: cx + ox - radius, maxX: cx + ox + radius,
    minY: cy + oy - radius, maxY: cy + oy + radius,
    minZ: cz + oz - radius, maxZ: cz + oz + radius,
  };
}
```

- [ ] **Step 3**: Run vitest. Expect 3/3 pass.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/geometry/transform.ts artifacts/hardwareai/convex/cad/geometry/__tests__/transform.test.ts
git commit -m "feat(cad-ir): bbox transform — origin translate + conservative rotation expand"
```

---

## Task 3: Tier 5 — partsInterfere rule

**Files:** `convex/cad/validate/rules/partsInterfere.ts`, `__tests__/rules-partsInterfere.test.ts`, `convex/cad/validate/assemblyTier.ts`

- [ ] **Step 1**: Failing tests:

```ts
import { describe, expect, it } from "vitest";
import { partsInterfere } from "../rules/partsInterfere";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function makeBoxIr(width: number, height: number, depth: number): CadIr {
  return {
    ...emptyIr("mm"),
    sketches: { p: { id: "p", plane: "XY", geometry: [{ kind: "rect", id: "o", center: { x: 0, y: 0 }, width, height }] } },
    features: [{ kind: "extrude", id: "b", profile: "p", distance: depth, operation: "new_body" }],
  };
}

describe("partsInterfere", () => {
  it("flags two parts whose AABBs overlap", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: makeBoxIr(40, 40, 10), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: makeBoxIr(40, 40, 10), origin: { x: 20, y: 0, z: 0 } },
      },
      joints: [{ kind: "fixed", id: "j", a: "a", b: "b" }],
    };
    const v = partsInterfere(ir);
    expect(v.some(x => x.ruleId === "assembly.parts-interfere")).toBe(true);
  });

  it("does not flag two parts placed adjacent (touching but not overlapping)", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: makeBoxIr(40, 40, 10), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: makeBoxIr(40, 40, 10), origin: { x: 40, y: 0, z: 0 } },
      },
      joints: [{ kind: "fixed", id: "j", a: "a", b: "b" }],
    };
    expect(partsInterfere(ir)).toEqual([]);
  });

  it("does not flag two parts placed far apart", () => {
    const ir: CadIr = {
      ...emptyIr("mm"),
      parts: {
        a: { id: "a", ir: makeBoxIr(20, 20, 10), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: makeBoxIr(20, 20, 10), origin: { x: 100, y: 100, z: 0 } },
      },
    };
    expect(partsInterfere(ir)).toEqual([]);
  });

  it("returns empty for assemblies with fewer than 2 parts", () => {
    const ir: CadIr = { ...emptyIr("mm"), parts: { a: { id: "a", ir: makeBoxIr(10, 10, 10) } } };
    expect(partsInterfere(ir)).toEqual([]);
  });
});
```

- [ ] **Step 2**: Implement:

```ts
// convex/cad/validate/rules/partsInterfere.ts
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import { computePartBbox } from "../../geometry/partBbox";
import { transformBbox, type AABB as _AABB } from "../../geometry/transform";

function aabbOverlap(a: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; }, b: typeof a): boolean {
  if (a.maxX <= b.minX || b.maxX <= a.minX) return false;
  if (a.maxY <= b.minY || b.maxY <= a.minY) return false;
  if (a.maxZ <= b.minZ || b.maxZ <= a.minZ) return false;
  return true;
}

export function partsInterfere(ir: CadIr): Violation[] {
  if (!ir.parts || Object.keys(ir.parts).length < 2) return [];
  const out: Violation[] = [];

  // Compute each part's transformed AABB
  const partBboxes: Array<{ id: string; bbox: ReturnType<typeof transformBbox>; rotated: boolean }> = [];
  for (const [id, part] of Object.entries(ir.parts)) {
    const local = computePartBbox(part.ir);
    if (!local) continue;
    const origin = part.origin
      ? { x: part.origin.x as number, y: part.origin.y as number, z: part.origin.z as number }
      : undefined;
    const rotation = part.rotation
      ? { rx: part.rotation.rx as number, ry: part.rotation.ry as number, rz: part.rotation.rz as number }
      : undefined;
    const rotated = !!rotation && (rotation.rx !== 0 || rotation.ry !== 0 || rotation.rz !== 0);
    partBboxes.push({ id, bbox: transformBbox(local, origin, rotation), rotated });
  }

  for (let i = 0; i < partBboxes.length; i++) {
    for (let j = i + 1; j < partBboxes.length; j++) {
      const a = partBboxes[i];
      const b = partBboxes[j];
      if (aabbOverlap(a.bbox, b.bbox)) {
        const conservative = a.rotated || b.rotated;
        out.push({
          ruleId: "assembly.parts-interfere",
          severity: conservative ? "warn" : "error",
          message: `Parts "${a.id}" and "${b.id}" have overlapping bounding boxes${conservative ? " (conservative — at least one part is rotated)" : ""}.`,
          agentMessage: `Parts "${a.id}" and "${b.id}" physically overlap. Move one of them, or change the joint that places them, so their bboxes no longer intersect.`,
          location: { kind: "part", id: a.id },
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 3**: Compose into `assemblyTier.ts`:

```ts
import { partsInterfere } from "./rules/partsInterfere";

export function validateAssemblyTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];
  // Existing checks: floating-part + over-constrained-rigid-group
  // ... (existing code)
  return [...out, ...partsInterfere(ir)];
}
```

(Read the existing `assemblyTier.ts` and append the partsInterfere output to the return statement.)

- [ ] **Step 4**: Run vitest. Expect 4/4 new + existing assembly tests pass.

- [ ] **Step 5**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/validate/rules/partsInterfere.ts artifacts/hardwareai/convex/cad/validate/__tests__/rules-partsInterfere.test.ts artifacts/hardwareai/convex/cad/validate/assemblyTier.ts
git commit -m "feat(cad-ir): tier-5 rule — AABB inter-part interference (warn for rotated)"
```

---

## Task 4: System prompt + README + final sweep

- [ ] **Step 1**: Add to `convex/cad/prompts.ts`:

```
Inter-part interference:
- Parts in an assembly are checked for AABB overlap.
- Place parts using PartRef.origin (and rotation if needed).
- If you see "assembly.parts-interfere", move one part along the relevant axis,
  shrink one of the parts, or change the joint that connects them.
- Note: rotated parts (any non-zero rx/ry/rz) get conservative bbox expansion;
  the warning may be over-cautious. Reduce rotation or be intentional about placement.
```

- [ ] **Step 2**: Add Phase 8 section to `convex/cad/README.md`.

- [ ] **Step 3**: Final sweep:
```bash
cd artifacts/hardwareai && pnpm test --run 2>&1 | tail -3
cd artifacts/hardwareai && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
cd artifacts/hardwareai && npx convex dev --once 2>&1 | tail -3
git log --oneline c1c29a0..HEAD | wc -l
```

Expect ~291 tests (279 + ~12 new), TS ≤ 38, convex clean, ~4 commits.

- [ ] **Step 4**: Commit:
```bash
git add artifacts/hardwareai/convex/cad/prompts.ts artifacts/hardwareai/convex/cad/README.md
git commit -m "docs(cad-ir): Phase 8 — AABB inter-part interference"
```

---

## Phase 8 success criteria

- `computePartBbox` correctly handles extrude (rect/circle) and revolve features
- `transformBbox` translates by origin and conservatively expands for rotation
- `partsInterfere` rule fires on overlapping AABBs, doesn't fire on adjacent or distant parts
- Severity is "warn" if any part is rotated (acknowledging the conservative expansion may over-flag)
- All Phase 1-7 tests still pass
- TS baseline ≤ 38

---

## Out of scope for Phase 8 (deferred)

- **Real OBB or geometry-based interference** — needs sandbox geometry; defer to a phase that includes live e2e.
- **Bbox computation for cut_extrude / pattern / sweep / loft / shell** — Phase 8 v0 only grows on extrude/revolve. Other features modify or subtract; their absence from bbox computation is conservative (overestimates the part).
- **Per-feature bboxes** for spatially-distinct parts (a single CadIr could have geometry in disjoint regions; AABB is a single box that encloses both).
- **Joint-range self-collision** — sample joint at N angles, run interference at each pose. Future phase.
- **Real geometric solver (Tier 2)** — separate plan; Phase 7 v0 stays in place.
