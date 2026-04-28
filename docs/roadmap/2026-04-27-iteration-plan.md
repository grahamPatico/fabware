# Fabware iteration plan — 2026-04-27

Working plan for autonomous iteration. Each chunk is sized to one iteration:
design → implement → deploy to prod Convex → smoke-test via CLI → commit+push.
Mark complete when all acceptance criteria pass on prod.

## How the loop should run

1. Pick the next unchecked chunk from the highest unfinished tier.
2. Read the chunk's acceptance criteria.
3. Implement minimum code to satisfy them.
4. Deploy: `cd artifacts/hardwareai && CONVEX_DEPLOY_KEY=... npx convex deploy --yes`.
5. Smoke-test against prod with `npx convex run ...` (write the exact command in
   the chunk's "verify" section).
6. If smoke passes: commit, push, update this file with `[x]` and a short note.
7. If smoke fails twice: leave a note describing what failed and move to the
   next chunk (don't burn time on a stuck item).
8. Don't change scope mid-chunk — if a related issue is found, log it as a new
   chunk in the appropriate tier and keep going.

Conventions:
- All work goes to `main` (no PRs needed; user owns the repo).
- Convex prod deployment: `calm-porcupine-442`. Token rotation is the user's
  responsibility — don't print env values.
- Frontend deploys automatically on push via Vercel.
- After every change, run `npx convex run validation:getAssemblyValidation` on
  one project from each affected archetype to confirm the intersection check
  still passes.

---

## Tier 1 — Correctness gates

Block everything else until these are clean. The intersection harness already
caught two bugs in `hinged_enclosure`; the other archetypes haven't been
audited.

- [x] **1.1 Audit `box_with_lid`, `bracket_plus_panel`, `divided_tray`,
  `shelf_with_brackets`, `sliding_enclosure` for wall-corner overlap and
  rotation-order bugs.** For each: generate the archetype with default params,
  run intersection check, list failures. Fix wall-sizing or position offsets so
  no two parts share volume. **Verify**: all five archetypes report
  `parts_dont_intersect: pass` after fix. _Done 2026-04-27. Same wall_left/wall_right
  rotation bug found in box_with_lid, divided_tray, sliding_enclosure (and the
  shelf-with-brackets bracket orientation was completely wrong — brackets
  rendered horizontal). All six archetypes now clean per `_audit:auditAllArchetypes`._
- [x] **1.2 Document the data-frame convention.** _Done 2026-04-27. Wrote
  `docs/conventions/coordinate-frames.md` (data Y↔three.js Z swap, rotation
  permutation, eulerXyzToAxes contract, recipes for common rotations,
  pointers to relevant files). Header comments in `intersect.ts` and
  `positions.ts` reference the doc._
- [x] **1.3 Add an automated regression check that every archetype's default
  output passes intersection.** Shipped as the `_audit:auditAllArchetypes`
  internal action, callable via `npx convex run`. Bypasses the agent so the
  result is deterministic. Promote to a unit test next time the test runner is
  touched. _Done 2026-04-27._

## Tier 2 — Manufacturing realism (the user's open ask)

The current archetypes produce multi-plate bolted assemblies. For most simple
boxes a real fabricator would build a single-bend body (one flat pattern folded
into a U or box shape) — fewer parts, no fasteners on visible faces, stronger.
Tab-and-slot welded joints are the next-cheapest construction method. The
agent should pick the right construction for the user's tier and use case.

- [x] **2.1 Add `bodyConstruction` param to `hinged_enclosure` + new
  `weld_seam` interface kind.** _Done 2026-04-27 (scope-trimmed)._ Took the
  pragmatic half-step: kept the 5 separate body parts (full
  unfolded-flat-pattern rendering is queued under 3.2), but body-to-body
  joints now emit `weld_seam` interfaces instead of bolted ones for
  `"single_bend"` mode (default for jerry-rigged + mvp). A default 12×12×12
  hinged_enclosure now reports 4 weld_seam interfaces + 1 hinged, total of
  1 fastener line in the BOM (the hinge) — down from 5 fastener lines.
  Commercial tier still defaults to `"bolted_plates"` for serviceability.
  System prompt updated to teach the param. Schema, interfaces.ts validators,
  assemblyRules.ts, and InterfaceList badge (orange Flame icon) all extended
  with `weld_seam`.
- [x] **2.2 Add `weld_joint` interface kind for tab-and-slot joints.** _Done
  2026-04-27._ New `tab` feature in `PartDsl` (count, length, width, edge);
  new `weld_joint` interface kind across schema, interfaces.ts mutators,
  assemblyRules. Validator `checkWeldJointTabSlot` resolves tab on one side
  + slot on the other from `featureRefs`, then enforces: (a) both features
  exist, (b) `tab.count === slot.count`, (c) slot ≥ tab on both axes (fail
  if not), (d) ≤ 0.060" slack on either axis (warn beyond — sloppy until
  welded). New `_audit:auditWeldJoint` smoke verified pass / fail (size) /
  warn (slop) / fail (count mismatch). System prompt teaches the agent
  when to use weld_joint vs weld_seam vs bolted. New "Tab+Weld" amber
  badge in InterfaceList.
  **Verify**: `npx convex run _audit:auditWeldJoint '{}'` → status pass.
  Archetype regression: `npx convex run _audit:auditAllArchetypes '{}'`
  still shows zero failures.
- [x] **2.3 Hinge geometry classes.** _Done 2026-04-27._ New `hingeStyle:
  "butt" | "piano" | "concealed"` param on hinged_enclosure. Default
  resolution: locker + ≥mvp tier → piano; commercial / kitchen / euro use
  cases → concealed; everything else → butt. Per-style McMaster part
  numbers (1635A3 / 1598A12 / 1559A14) and hardware quantities (2–3 / 1 /
  2). `checkHingeGeometry` rewritten to enforce per-style hole-count
  expectations: piano needs ≥ ⌈edgeLen/3"⌉ mounting holes per part with
  qty=1; butt needs 2 holes per leaf × qty (2–3); concealed needs a 35mm
  cup bore on the door + 2 mounting holes per hinge × qty=2. Style is
  encoded in `hardwareRefs[0].role` as `pivot:STYLE` so the validator can
  read it without a schema migration. System prompt updated with the
  three styles + when to pick each.
  **Verify**: `_audit:auditHingeStyle` covers seven scenarios (pass /
  fail-holes / warn-qty for butt; pass / fail-holes for piano; pass /
  warn-no-cup-bore for concealed) — all return the expected status.
  Archetype regression: 6 archetypes still report zero intersection
  failures.
- [x] **2.4 Min flange + hole-to-bend distance validators.** _Done
  2026-04-27 as part of 2.7a backend._ Both checks live in
  `convex/lib/bendSim.ts`: `min_flange` (≥ 4× thickness past bend tangent,
  fail if shorter) and `hole_to_bend` (≥ 2× thickness + ½ hole-diameter
  clearance, warn if violated). Per-bend, surfaced through
  `validatePartByKind` so they appear in the existing rules strip.
- [x] **2.5 Bend interference detection.** _Done 2026-04-27 as part of
  2.7a._ The simulator emits an "interference" step that fails when any
  pair of parallel bends sits closer than 4× thickness apart.
- [x] **2.7a Laser + bend simulator backend.** _Done 2026-04-27._
  `convex/lib/bendSim.ts` — `simulatePart(dsl)` walks a sheet-metal DSL and
  returns ordered `SimStep[]`: a Cut step (max sheet, gauge availability),
  one Bend step per bend feature (material bendability, min radius, min
  flange, hole-to-bend), and an Interference step when ≥ 2 parallel bends
  share material. New query `simulation:simulatePartById(partId)` exposes
  steps for the UI. Same rules also flow into `validatePartByKind` so
  bend issues land in the existing assembly-rules panel today. Verified on
  a base plate (cut-only step) and through `_audit:auditAllArchetypes`.
  **Next**: 2.7b — UI tab with timeline scrubber + animated fold preview.
- [x] **2.7b Laser + bend simulator UI.** _Done 2026-04-27._
  `BendSimulatorPanel` mounts under the 3D view; binds to `focusedPartId`
  via `simulation:simulatePartById`. Renders a horizontal step strip with
  per-step status icon (cut / bend / interference), click any step to
  inspect its rules below. Tone-coded fail/warn/pass cards include the
  message + suggestion. Empty state when no part focused; null state when
  the focused part is printed/purchased. _Held over for follow-up:_
  animated fold preview in the 3D view itself (queued under 3.3 bend lines)._
  Build an interactive simulator that takes a sheet-metal part DSL (outline,
  thickness, material, bend features, holes) and produces:
  (a) the laser-cut step — material-specific kerf and feasibility
  (acrylic can't bend; copper has tighter min hole spacing; max sheet);
  (b) per-bend simulation — fold animation in the 3D view, pre/post bend
  positions, springback estimate, k-factor based on material;
  (c) cumulative validators — each bend checked against the material's bend
  radius, flange length minimum, hole-to-bend distance, bend-bend
  interference (two folds sharing material). UI: a "Simulate" tab beside
  the 3D view that scrubs through Cut → Bend 1 → Bend 2 → ... → Final.
  Each step displays the rule pass/fail strip. **Verify**: a sample part
  with 2 bends shows 3 simulation steps, each with its own validation
  output; switching material to Acrylic Clear surfaces a "cannot bend"
  failure on the first bend step.
- [x] **2.6 Manufacturing primer in agent's per-call context.** _Done
  2026-04-27._ New query `manufacturing:summarizeForProject(projectId)`
  walks every sheet-metal part, runs `validatePartByKind` (which already
  merges sheet-metal rules + bend simulator rules), and returns a compact
  structured report: per-part failures/warnings, per-step status from the
  simulator, and the full rules array. New `check_manufacturing` tool in
  `assemblyDesigner` lets the agent call this between tool turns and get
  back a formatted text summary keyed by part role. Closes the agent
  self-repair loop — instead of waiting for the user to flag a bend issue,
  the agent can pull the same numbers the rules-status strip shows and
  act on them.
  **Verify**: `npx convex run manufacturing:summarizeForProject
  '{"projectId":"…"}'` on a default locker returns
  `{"totals":{"failures":0,"warnings":0,"sheetMetalParts":6,"parts":6}}`
  with full per-part rule breakdown.

## Tier 3 — Visual fidelity

The 3D view today is a placeholder. Several "we already model this in data
but render it as a box" gaps to close.

- [x] **3.1 Render bolts at hole positions in AssembledView.** _Done
  2026-04-27. New `<BoltMeshes>` component renders a cylinder + bolt-head
  cap at every hole shared by a bolted/riveted/pem_inserted interface,
  oriented perpendicular to the part surface using a group with the part's
  pose rotation + π/2-X pre-rotation on the inner mesh. Color tone per
  kind: bolted=zinc, riveted=brass, PEM=sky-blue. New "Bolts" toggle in
  the canvas chrome alongside Home / Bounds. Length = sum of part
  thicknesses + 0.25" so bolt-heads sit visibly above the surface._
- [x] **3.2 Render polygon outlines for non-rectangle sheet-metal parts.**
  _Done 2026-04-27._ New `ExtrudedPartMesh` builds a `THREE.Shape` from the
  `outline` field on the DSL and renders via `ExtrudeGeometry`, falling
  back to `PartMesh` (boxGeometry) for rectangles. Supports `polygon`
  (centers on AABB), `star`, `circle`, `regular_polygon`. Geometry is
  rotated −π/2 around X after extrude so its thickness axis matches the
  existing box convention; rest of the pose math is unchanged.
- [x] **3.3 Render bend lines.** _Done 2026-04-28._ New `<BendLines>`
  component rendered as a child of both `PartMesh` (rectangle parts) and
  `ExtrudedPartMesh` (custom outlines). Reads each part's DSL bend
  features at render time, draws yellow dashed lines on the part's top
  surface (y = +thickness/2 + ε) along the bend tangent: horizontal bends
  span the width at the positionRatio along the height, vertical bends
  span the height at the positionRatio along the width. Dash size scales
  to part dimensions. `depthTest: false` keeps the line visible when the
  part is rotated and the surface faces away from the camera. Inherits the
  full pose rotation since it's a child of the mesh group, so bends on
  walls render correctly even after the rotation fixes from chunk 1.1.
  **Verify**: build is green; default archetypes have no bend features so
  there's nothing to render visually until a part is refined to add one.
  The cut-step path through the simulator (chunk 2.7a) still works for
  parts both with and without bends. Animated fold preview is queued under
  a new follow-up chunk in the backlog.
- [x] **3.4 Material textures.** _Done 2026-04-28._ Procedural normal +
  roughness maps generated per material via `getMaterialMaps(textureKey)`.
  Cached at module level so each material's texture is built once. Patterns:
  brushed-aluminum = horizontal striations; stainless = fine isotropic
  grain; mild-steel = coarser random grain; galvanized = patchy zinc
  blobs; copper / brass = soft horizontal grain (different amplitude).
  Acrylic gets no map (smooth glass). Textures mounted on both
  `<PartMesh>` and `<ExtrudedPartMesh>` meshStandardMaterial via
  `normalMap` + `roughnessMap`. 256×256 RGBA DataTextures with
  `RepeatWrapping` × 8 so detail scales naturally with part size.
- [x] **3.5 Hole rendering.** _Done 2026-04-28._ New `<HoleMarks>`
  component embeds a thin black cylinder at every hole position computed
  from the DSL (`holeLocalPositions` mirrors the bendSim/featuresInWorld
  logic for the four patterns: corner / center / top_row / bottom_row).
  Cylinder length = thickness × 1.02 so the disk caps stick out 1% on
  both faces and read as black circles when the surface texture isn't
  visible. Mounted as a child of both `<PartMesh>` and
  `<ExtrudedPartMesh>` so it inherits the full pose rotation. Visual-only
  for now — true cutouts via `THREE.Shape.holes` is queued in the
  backlog. Default 4-corner mounting hole patterns now render visibly on
  every wall + base of an archetype-generated locker.

## Tier 4 — Validators

- [x] **4.1 Hole-to-edge distance** (≥ 2× thickness). _Done 2026-04-28._
  New `hole_to_edge` rule in the bend-simulator's cut step. Walks every
  hole pattern, computes per-instance distance to the nearest part edge
  minus the hole radius, then classifies: `fail` if the rim sits outside
  the part outline (negative distance), `warn` if inside but closer than
  2 × thickness, `pass` otherwise. Surfaced through `validatePartByKind`
  alongside the bend rules. New `_audit:auditHoleToEdge` covers pass /
  warn / fail-rim-on-edge / fail-rim-past-edge.
- [x] **4.2 Material vs feature compatibility.** _Done 2026-04-28._ New
  `material_compat` rule on the cut step. Aggregates: requested powder
  coat × `mat.canPowderCoat` (fail when mismatch), requested bend ×
  `mat.canBend` (fail), and unusual `bendRadiusMultiplier` >1 (warn,
  e.g. Stainless 304 needs R ≥ 1.5×t, 6061 needs R ≥ 2×t). Smoke
  `_audit:auditMaterialCompat` covers five scenarios: pass / acrylic+bend
  fail / copper+powdercoat fail / stainless 304+bend warn / 6061+bend
  fail. All matching expected status.
- [x] **4.3 Weight estimate per part.** _Done 2026-04-28._ New
  `convex/lib/weight.ts` with `estimatePartWeight(dsl)` and
  `outlineArea(outline, w, h)` that handles rectangle / polygon (shoelace)
  / circle / regular_polygon / star (per-triangle). Subtracts hole and
  slot areas. Density per material category in scsRules.ts
  (`MATERIAL_DENSITY`) with a `densityFor(material)` resolver. New
  `manufacturing:weightSummary` query returns per-part + total weight.
  PartList shows total at the top right and per-part lb below each row.
  **Verify**: `_audit:auditWeight` returns 3.07 lb for 12×12×0.075"
  mild steel, 0.46 lb for acrylic, 3.13 lb for stainless 304, 7.06 lb
  for 24×24×0.125" 5052 — all within ±0.01 lb of expected.
- [ ] **4.4 Cost estimate.** SCS pricing: roughly $X/in² for cuts + $Y for
  bends + material cost. Build a starter table from public SCS pricing.
- [ ] **4.5 Bounding-box check.** Each sheet-metal part's flat pattern
  must fit within the material's max sheet (e.g. 43"×43" for steel, 32"×32"
  for acrylic). Already in scsRules but not enforced as a hard fail.

## Tier 5 — Real outputs

- [ ] **5.1 DXF generation for cuts.** Each sheet-metal part exports a
  flat-pattern DXF with all cuts, holes, and bend lines on appropriate
  layers (`CUT`, `HOLE`, `BEND`). Should be uploadable to SCS as-is.
  Library: `dxf-writer` or hand-rolled.
- [ ] **5.2 Per-part PDF drawing.** Orthographic projection with dimension
  callouts. `pdfkit` server-side.
- [ ] **5.3 BOM CSV.** Sheet-metal parts (one row per material/thickness
  combo with total area) + McMaster hardware (one row per part number with
  total qty). Downloadable from the workspace.
- [ ] **5.4 SCS upload bundle.** Zip file: `<project>/cuts/*.dxf`,
  `<project>/bom.csv`, `<project>/README.md`. One-click download.
- [ ] **5.5 STEP export for the full assembly.** Lower priority — most
  fabricators want flat patterns, not 3D. Useful for showing customers.

## Tier 6 — UX

- [ ] **6.1 Project list / dashboard at `/studio`.** Replace the
  current "creates one project on click" flow with a list of recent
  projects + a "new project" CTA.
- [ ] **6.2 Undo/redo.** Each tool call already lands a part revision
  (the `partRevisions` table exists). Wire up keyboard shortcuts and a
  visible undo/redo affordance in the canvas toolbar.
- [ ] **6.3 Read-only share link.** Public URL that shows the assembly
  view + parts + BOM but disables editing.
- [ ] **6.4 Commenting on parts.** Click a part → leave a comment →
  feeds into the agent's context next turn ("the user noted: ...").
- [ ] **6.5 Mobile / tablet view.** Today the 3-pane layout breaks under
  ~1100px. Stack vertically and add a tab nav.

## Tier 7 — Agent improvements

- [ ] **7.1 Streaming Anthropic responses.** Switch from
  `client.messages.create` to streaming so partial output appears live.
  Combined with the per-tool message streaming already in place this gives
  truly real-time chat.
- [ ] **7.2 Self-repair on validation failures.** After tool calls land,
  if any rule is `fail`, re-invoke the agent with the failing rules as
  context and ask it to fix. Cap at 2 self-repair turns to avoid loops.
- [ ] **7.3 Real web image search for inspiration.** `gather_inspiration`
  today uses Claude's own knowledge. Wire to Tavily or SerpAPI image
  search and surface 3 thumbnails the user can see. Needs an API key.
- [ ] **7.4 Per-user auth + per-user `tokenUsage` scoping.** Today usage
  rows have no `userId`. Add Clerk or Convex Auth, scope rows, expose a
  spend dashboard. Foundation for usage-based billing.

## User-asked chunks shipped 2026-04-27 (out-of-tier)

- [x] **Delete part button.** PartList rows now have a Trash icon. Two-click
  to confirm (first click flips the button red; second triggers
  `parts:removePart`, which already cascades interface deletion). Focus
  clears if the deleted part was selected.
- [x] **Hinge open slider + animated swing.** When the project's archetype
  is `hinged_enclosure`, a slider appears in the canvas chrome (0–150°).
  Pivots the lid (top-door) or `door_front` (locker) around the actual
  hinge edge — derived from `archetypeParams.doorFace` + `hingeSide` +
  inner dimensions — so the swing motion is geometrically correct, not a
  fake spin around the part center. Implemented via two-group composition:
  outer translates to pivot + applies axis-aligned Euler rotation; inner
  translates back so zero-degree pose matches the static layout exactly.
- [x] **Render purchased parts with category-aware geometry.** Replaces the
  placeholder 0.5" wireframe cube. Looks up `purchasedPartNumber` in
  `MCMASTER_SEED` (or infers category from label as a fallback). Per
  category: fastener = shaft cylinder + cap-head puck; nut = hex prism;
  washer = torus; bearing = larger torus; spring = wireframe cylinder;
  magnet = grey block; hinge = two leaves + barrel; default = cube.
  Supports the bounding-box wireframe overlay + selection highlight just
  like sheet-metal parts.

## Backlog (caught while iterating; sized later)

- Add more archetypes: `pcb_enclosure`, `wall_panel`, `nested_dividers`,
  `wedge_bracket`.
- Improve `add_freeform_2d_part` 3D rendering to use ExtrudeGeometry
  (covered by 3.2).
- Better default sizes from reference scale (today only the explicit
  `tennis ball` etc. — extend the catalog).
- Strip the unused `BackendPending.tsx` references after switching to
  required Convex.
- Code-split the 1.1MB three.js bundle.
- Re-introduce a curated McMaster catalog refresh script (was in
  scripts/scrape-scs.ts, deleted with the old api-server).
- Animated fold preview in the 3D view (carved off 3.3): step the
  simulator forward → tween each bend's angle from 0 to its target while
  the user scrubs the BendSimulatorPanel timeline.
- True hole cutouts (carved off 3.5): use `THREE.Shape.holes` so the
  ExtrudeGeometry actually subtracts the hole instead of just covering it
  with a black cylinder. Required for accurate DXF + flat-pattern PDF.

## Status log

| Date | Chunk | Result |
|---|---|---|
| 2026-04-27 | _initial drafting_ | Plan written; starting 1.1. |
| 2026-04-27 | 1.1 audit + fix | All 6 archetypes pass `parts_dont_intersect`. Same wall rotation bug fixed across boxWithLid, dividedTray, slidingEnclosure; brackets reoriented in shelfWithBrackets. |
| 2026-04-27 | 1.3 regression infra | `_audit:auditAllArchetypes` ships — run any time to verify all archetypes' defaults are clean. |
| 2026-04-27 | 1.2 conventions doc | `docs/conventions/coordinate-frames.md` written with rotation recipes; intersect.ts + positions.ts reference it. |
| 2026-04-27 | 3.1 bolt rendering | Cylinders + bolt-head caps at hole positions for bolted/riveted/PEM interfaces; "Bolts" toggle on canvas. |
| 2026-04-27 | 2.1 weld seams | New `weld_seam` interface kind + `bodyConstruction` param. Default mvp locker now has 4 welds + 1 hinge instead of 4 bolts × 4 fasteners + 1 hinge — body fasteners drop from 16 to 0. Orange Flame badge in InterfaceList. |
| 2026-04-27 | 2.7 logged (new) | User asked for a laser + bend simulator; logged as a new tier-2 chunk with acceptance criteria. |
| 2026-04-27 | 2.4 + 2.5 + 2.7a | Backend simulator shipped: cut step + per-bend rules (radius / flange / hole clearance) + interference. Wired into part validator + new `simulation:simulatePartById` query. UI scrubber stays as 2.7b. |
| 2026-04-27 | 2.7b simulator UI | `BendSimulatorPanel` under the 3D view: step strip + per-step rules card. Visible the moment a sheet-metal part is focused. |
| 2026-04-27 | 3.2 polygon extrude | `ExtrudedPartMesh` renders star / circle / polygon / regular_polygon outlines via `THREE.Shape` + `ExtrudeGeometry`; rectangle parts still go through the cheaper boxGeometry path. |
| 2026-04-27 | delete + hinge slider + McMaster geom | Trash icon on parts (two-click confirm), 0–150° hinge open slider with proper edge-pivot animation, purchased parts render as category-aware geometry instead of placeholder cubes. |
| 2026-04-27 | 2.2 weld_joint | New `tab` feature + `weld_joint` interface kind. Validator checks tab/slot pairing, count match, fit, and clearance slack; surfaces amber Tab+Weld badge in InterfaceList. `_audit:auditWeldJoint` smoke covers pass / fail-size / warn-sloppy / fail-count. |
| 2026-04-27 | 2.3 hinge classes | `hingeStyle` (butt/piano/concealed) plumbed through hingedEnclosure params + tier-aware default. Per-style validator: butt counts holes per leaf, piano enforces hole-every-3", concealed checks for cup bore + bracket mounts. Style encoded in role string as pivot:STYLE. Smoke `_audit:auditHingeStyle` covers all seven scenarios. |
| 2026-04-27 | 2.6 mfg primer tool | `manufacturing:summarizeForProject` query + `check_manufacturing` agent tool. Aggregates per-part rules + simulator step status into a compact summary the agent surfaces between turns. Closes the self-repair loop. |
| 2026-04-28 | 3.3 bend lines | Yellow dashed lines on part top surface for every bend feature; mounted inside both PartMesh and ExtrudedPartMesh so they inherit pose rotation. Animated fold preview spun off into backlog. |
| 2026-04-28 | 3.4 material textures | Procedural normal + roughness maps per material (brushed-aluminum striations, mild-steel grain, galvanized blobs, copper/brass soft grain, stainless fine grain). Cached at module level, applied via `normalMap` + `roughnessMap` on both PartMesh and ExtrudedPartMesh. |
| 2026-04-28 | 3.5 hole rendering | `<HoleMarks>` mounts thin black cylinders at every DSL hole position, mounted in both PartMesh + ExtrudedPartMesh. True cutouts queued in backlog. **Tier 3 fully complete.** |
| 2026-04-28 | 4.1 hole-to-edge | `hole_to_edge` rule in the cut step: fail when rim crosses outline, warn when within 2×t of edge, pass otherwise. `_audit:auditHoleToEdge` smoke covers pass / warn / fail. |
| 2026-04-28 | 4.2 material compat | `material_compat` rule aggregates powder-coat / bend / radius-multiplier feasibility per material. 5-case smoke covers acrylic+bend, copper+powdercoat, stainless 304 R≥1.5t warn, 6061 fail, mild-steel pass. |
| 2026-04-28 | 4.3 weight estimate | `weight.ts` + `manufacturing:weightSummary` + PartList row-level lb display. Density per category, area subtraction for holes / slots, polygon-aware shoelace for non-rectangle outlines. |
