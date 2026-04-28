# Coordinate frames in Fabware

This is the doc you wish you had read before debugging your first archetype.

## TL;DR for archetype authors

When you write `position: { x, y, z, rotX, rotY, rotZ }` for a part, those
fields are in the **data frame**. The 3D viewer applies a Y↔Z swap *and* a
rotation-component reorder before rendering. If you copy-paste a Three.js
example or use a Three.js debugger to figure out a rotation, you will end up
in the wrong frame and your part will look right in the viewer but the
intersection check will report a phantom collision (or vice versa).

**Empirical recipe for a vertical wall on the left side of a box:**

```ts
{
  role: "wall_left",
  // width = the dimension along the cavity depth (data y-axis)
  // height = the wall's vertical extent (data z-axis)
  // thickness comes from `params`.
  dsl: makePlate("wall_left", innerDepth, innerH, params, hole(...)),
  position: {
    x: -t / 2,           // hugs the left side of the cavity
    y: cy,               // centered front-to-back
    z: cz,               // centered vertically
    rotX: Math.PI / 2,   // rotate flat plate 90° around data-x to make it vertical
    rotY: Math.PI / 2,   // and 90° around data-y to face left
    rotZ: 0,
  },
}
```

If you change the rotation order, the wall flips into a horizontal slab
floating in mid-air and the intersection check will catch it. Run
`npx convex run _audit:auditAllArchetypes '{}'` after any archetype edit.

## Two frames, one swap

There are two coordinate frames in this codebase:

1. **Data frame** — what's stored in the `parts.position` field on the Convex
   `parts` table. X is left-right, Y is front-back (depth), Z is up-down
   (vertical). Right-handed.
2. **Three.js frame** — what `<Canvas>` renders. X is left-right, Y is
   up-down (vertical), Z is front-back (depth). Right-handed.

The viewer (`src/components/workspace/AssembledView.tsx`) bridges them with
a single permutation:

```tsx
<mesh
  position={[position.x, position.z, position.y]}        // data → three.js
  rotation={[position.rotX, position.rotZ, position.rotY]}// data → three.js
>
  <boxGeometry args={[width, thickness, height]} />        // three.js dims
</mesh>
```

So **data Y maps to Three.js Z** and **data Z maps to Three.js Y**. The
rotation tuple gets the same permutation: data `rotZ` becomes the Three.js
Y-axis rotation in the Euler XYZ stack, and data `rotY` becomes the Three.js
Z-axis rotation.

This is *not* a sign flip — both frames are right-handed. It is *only* a
permutation of which axis is "up". Pick a frame and stay there for any
calculation; never mix.

## Why the box dimensions look swapped

`<boxGeometry args={[width, thickness, height]}>` defines the box's local
extents along the three.js (x, y, z) axes. Combined with the position swap
above, this means at zero rotation:

- a sheet-metal plate's `width` extends along **data X**
- a sheet-metal plate's `thickness` extends along **data Z** (vertical)
- a sheet-metal plate's `height` extends along **data Y**

That's why a base plate (`rotX = rotY = rotZ = 0`) renders as a horizontal
floor, not a vertical wall. Its `thickness` is its smallest dimension and
points up, exactly like a real flat plate lying on the ground.

## Rotation order

Three.js Euler with order `'XYZ'` (the default) is *intrinsic*: rotate around
the body's current X, then around the body's new Y, then around the body's
new Z. Order matters once two rotations are non-zero.

Because of the `[rotX, rotZ, rotY]` swap in the renderer, applying a data
rotation `(α, β, γ)` produces this effective sequence in three.js:

1. rotate around three.js X by α (= data rotX)
2. rotate around three.js Y by β (= data rotZ)
3. rotate around three.js Z by γ (= data rotY)

`convex/lib/intersect.ts:eulerXyzToAxes` mirrors three.js's
`Matrix4.makeRotationFromEuler('XYZ')` exactly so the SAT collision check
operates in the same frame the renderer uses. **If you change the renderer's
permutation, you must change `eulerXyzToAxes` to match.** Otherwise the
viewer and the validator silently disagree.

## Recipes

| Goal | Data rotation `(rotX, rotY, rotZ)` |
|---|---|
| Flat plate, lying horizontal (default) | `(0, 0, 0)` |
| Front/back wall (perpendicular to data Y, vertical) | `(π/2, 0, 0)` |
| Left/right wall (perpendicular to data X, vertical) | `(π/2, π/2, 0)` |
| Top lid (parallel to base, raised vertically) | `(0, 0, 0)` (only translate Z) |
| Vertical bracket flank (perpendicular to data X) | `(π/2, π/2, 0)` |

Use `npx convex run _audit:auditAllArchetypes '{}'` to confirm the geometry is
intersect-free after any change.

## Why the viewer permutes axes at all

Three.js's default camera and lighting assume Y is up. Mechanical-engineering
files (STEP, DXF, IGES, this codebase's positions) assume Z is up. Rather
than re-aim the camera and rotate every light source, the renderer permutes
the data into Three.js's convention at the leaf. This is a one-line fix in
`AssembledView` — but it has bitten us multiple times because the same
permutation must be applied to (a) part positions, (b) part rotations, and
(c) the SAT collision-check matrix. Anywhere that does Three.js math from
data values must apply the same permutation, or it will be *consistently
wrong* with the renderer disagreeing.

## Pointers

- `convex/lib/positions.ts` — pure math for transforming local feature
  positions (e.g. hole centers) into world coordinates. Operates entirely in
  the data frame.
- `convex/lib/intersect.ts` — OBB SAT in the renderer (three.js) frame. The
  `eulerXyzToAxes` matrix must mirror three.js's `Matrix4.makeRotationFromEuler`
  for order `'XYZ'`. The `poseObb` constructor swaps Y/Z to land in the
  renderer frame.
- `convex/_audit.ts` — `auditAllArchetypes` runs every archetype's defaults
  through the intersection check. Use as a regression after any archetype or
  geometry change.
- `src/components/workspace/AssembledView.tsx` — the renderer. The
  `position={[x, z, y]}` / `rotation={[rotX, rotZ, rotY]}` lines are the
  canonical statement of the convention.
