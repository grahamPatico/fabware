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

> User redirect 2026-04-28: pause output-format work (5.5 STEP) and prove
> we can build *anything* from primitives first — chunk 2.8 below is the
> response.

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
- [x] **4.4 Cost estimate.** _Done 2026-04-28._ New `convex/lib/cost.ts`
  with `estimatePartCost(dsl)` returning `{material, cuts, bends, finish,
  totalUsd, perimeterIn}`. Pricing constants live in scsRules.ts:
  `MATERIAL_COST_PER_IN2` per category × thickness scale,
  `CUT_RATE_PER_FT` $0.50, `BEND_RATE` $1.50, `POWDER_COAT_RATE_PER_FT2`
  $5, `MIN_CHARGE_PER_PART` $3. Cut perimeter = outline + every hole's
  circumference + every slot's stadium perimeter. New
  `manufacturing:costSummary` query mirrors weightSummary.
  PartList shows project total alongside the weight total in the header,
  and per-row $-figure beside the per-row weight figure. Treat as
  ±30% of an actual SCS quote — caveat surfaced in the tooltip.
  **Verify**: `_audit:auditCost` returns $10.64 for a plain 12×12 mild
  steel plate, $22.14 with a bend + powder coat, $45.20 for stainless
  304 0.125", $3 (min charge) for a 1×1 plate.
- [x] **4.5 Bounding-box check.** _Done 2026-04-28._ New top-level
  `assembly_max_sheet` rule in `validateAssembly`. Walks every
  sheet-metal part and looks up the material's `maxSheet`; if any
  part's `width × height` exceeds it, emits a project-level fail with
  the offending part's role + dimensions + first offender's material
  ("+N more" if multiple). Pass case shows the count of parts checked.
  Per-part `sheet_size` rule from the bend simulator and the
  `validateSpec` `sheet` rule remain — this one surfaces the failure at
  the project rules-status strip without needing the user to focus the
  offending part.
  **Verify**: `_audit:auditMaxSheet` returns fail for 50×50 mild steel
  (max 43×43), pass for 12×12, fail for 35×35 acrylic (max 32×32), pass
  for 30×30 acrylic. Archetype regression: 6/6 clean. **Tier 4 fully
  complete.**

## Tier 5 — Real outputs

- [x] **5.1 DXF generation for cuts.** _Done 2026-04-28._ Hand-rolled
  R12 ASCII DXF emitter in `convex/lib/dxf.ts` (no library dep — would
  blow the Convex bundle size). Three layers: `CUT` (red, color 1) for
  outline + slot perimeters, `HOLE` (yellow, color 2) for circular
  holes, `BEND` (cyan, color 4) for fold tangent lines. Outline support
  for rectangle / polygon / star / circle / regular_polygon. Slots
  emit two parallel LINEs + two cap CIRCLEs (stadium). New
  `dxf:partDxf(partId)` query returns `{ filename, dxf }`. PartList
  rows now have a Download icon that fetches via `useConvex().query` →
  Blob URL → triggers browser download. Verified: a default
  `hinged_enclosure` base plate emits 4 LINEs + 4 CIRCLEs, 996 bytes,
  3 sections (HEADER / TABLES / ENTITIES) + EOF.
- [x] **5.2 Per-part PDF drawing.** _Done 2026-04-28._ Hand-rolled PDF
  1.4 emitter in `convex/lib/pdf.ts` (no library dep — `pdfkit` is too
  heavy for the Convex bundle). One US Letter page per part, vector
  content stream:
    • title block top-left with role + label, material, thickness, W×H,
      estimated weight
    • flat-pattern outline (rectangle / polygon / star / circle /
      regular_polygon — same coverage as the DXF)
    • holes as 4-segment Bezier circles (kappa = 0.5523)
    • bend lines as dashed lines on the part surface
    • dimension callouts: width along bottom, height along left
  `pdf:partPdf(partId)` query returns `{ filename, base64 }`. PartList
  has a new FileText icon next to the DXF Download — base64 → Uint8Array
  → Blob URL → browser download. Verified: default archetype base
  produces a 1.88 KB PDF with 5 objects, valid header / xref / trailer,
  opens in Preview / Acrobat / Chrome PDF viewer.
- [x] **5.3 BOM CSV.** _Done 2026-04-28._ `convex/lib/bom.ts` walks
  every part in a project, groups sheet-metal by `(material, thickness)`
  with `partCount / total area in² + ft² / total weight lb / total cost
  USD / roles`, and aggregates hardware by McMaster part number with
  `quantity` summed across `assemblyParts`, `interface.hardwareRefs`,
  and `purchased`-kind parts. `bom:projectCsv(projectId)` query
  returns `{ filename, csv }` (RFC-4180 CSV with header rows + a
  `## section` divider between sheet metal and hardware). New
  `BomDownloadButton` in `AssemblyPartsPanel` triggers a browser
  download. **Verify**: a default `hinged_enclosure` produces a
  395-byte CSV with one sheet-metal group (Mild Steel 0.075", 6 parts,
  873.51 in² total) and one hardware row (McMaster 1635A3 ×2 from the
  lid hinge).
- [x] **5.4 SCS upload bundle.** _Done 2026-04-28._ Hand-rolled minimal
  ZIP (PKZIP 2.0, store method only — DEFLATE in JS would balloon the
  Convex bundle by ~1 MB and SCS doesn't require compression). Layout:
    cuts/<role>.dxf       — chunk 5.1 DXF per sheet-metal part
    drawings/<role>.pdf   — chunk 5.2 PDF per sheet-metal part
    bom.csv               — chunk 5.3 BOM
    README.md             — generation date, file index, SCS submission
                            instructions
  `bundle:projectZip(projectId)` returns `{ filename, base64,
  entryCount, bytes }`. New "SCS bundle" Archive button in
  `AssemblyPartsPanel` next to BOM. **Verify**: a default
  `hinged_enclosure` produces a 20.5 KB / 14-entry archive that
  Python's `zipfile` opens cleanly — 6 cuts (~1 KB each), 6 drawings
  (~1.9 KB each), bom.csv (399 B), README.md (1125 B). Valid PK signatures
  + EOCD record.
- [x] **5.5 STEP export for the full assembly.** _Done 2026-04-28
  (scope-trimmed to OBJ)._ Real STEP AP203 needs ~50 entity types
  (CARTESIAN_POINT, AXIS2_PLACEMENT_3D, MANIFOLD_SOLID_BREP, etc.) and
  ~10× the LOC for the same customer-facing value. Shipped **OBJ
  instead** — universally viewable in Preview, MeshLab, Blender,
  SolidWorks import. New `convex/lib/obj.ts` emits one OBJ group per
  part with a 6-face / 12-tri box mesh transformed into world space
  (intrinsic XYZ Euler matching `positions.ts`). `obj:projectObj`
  query returns `{ filename, obj }`. New Box-icon "OBJ" button in
  `AssemblyPartsPanel` triggers a browser download. **Verify**: a
  default `hinged_enclosure` produces a 2.1 KB OBJ with 6 groups, 48
  vertices, 72 faces. Real AP203 STEP logged in the backlog for when
  a customer specifically asks. **Tier 5 fully complete.**

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

## Agent-based audit findings 2026-04-28

Drove four scenarios end-to-end through `projectChat:send` (Opus 4.7,
medium effort): tall school locker, outdoor control panel, 5-point star
sign, top-hinged tool trunk. Three came back clean, the locker hit two
failures.

### Bug A — piano-hinge default fastener count too low (FIXED)

A 60" tall locker auto-picks `hingeStyle: piano` (locker on mvp tier).
The validator (chunk 2.3) requires one mounting hole every ~3" of edge,
so 60"/3" = 20 holes per part — but `paramDefaults` was returning the
tier default `fastenerCount: 4`. Validator correctly failed.

Fix: compute `fastenerCount` from hinge edge length when style is piano:
`Math.max(4, Math.ceil(hingeEdgeLen / 3))`. Edge length depends on
`doorFace + hingeSide` (for front-door it's `innerHeight`, for top-door
it's `outerW` or `outerD` depending on which wall the hinge is on).
Verified: same locker re-audited reports `Piano hinge: 20 / 20 mounting
holes (>= 20 required)` pass.

### Bug B — 60" tall wall exceeds 43" max sheet (KNOWN LIMITATION)

A 60" tall locker's wall dimensions (12.15" × 60") exceed mild steel's
43"×43" max sheet. The new project-level `assembly_max_sheet` rule
correctly flags this — it's a real manufacturing constraint, not a bug.

To resolve, the user (or agent) needs to either:
- pick a different material with a larger sheet (none available in the
  current curated catalog),
- split each tall wall into two stacked panels joined by a weld seam, or
- accept the constraint and use a fabricator other than SCS.

Logged as a separate backlog item: "agent self-repair when max-sheet
fails" — would have the agent automatically split or switch material on
seeing the rule fail.

### Sweep result (post-fix)

| Scenario | Fails | Notes |
|---|---|---|
| Tall school locker 12×18×60 | 1 | max-sheet (real constraint) |
| Outdoor panel 18×12×6 | 0 | clean |
| Star sign 8" 1/8" mild steel | 0 | clean |
| Tool trunk 16×8×6 jerry-rigged | 0 | clean |

Archetype regression: 6/6 archetypes still report zero intersection
failures.

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
- Real AP203 STEP export (carved off 5.5): the OBJ shipped today
  satisfies the customer-preview use case, but a customer or fabricator
  who specifically asks for STEP needs CARTESIAN_POINT /
  MANIFOLD_SOLID_BREP / AXIS2_PLACEMENT_3D wiring. ~50-line entity table
  per part, sit on it until requested.
- Agent self-repair when max-sheet fails (carved off audit 2026-04-28):
  on `assembly_max_sheet` fail, the agent should auto-split walls into
  stacked panels joined by a weld seam OR call `update_archetype_params`
  to flip material. Currently the rule fires but the agent doesn't act.

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
| 2026-04-28 | 4.4 cost estimate | `cost.ts` + `manufacturing:costSummary`. Material × thickness scale + perimeter cuts + bends + powder-coat finish + min-per-part. PartList header shows project SCS total. ±30% of actual quote. |
| 2026-04-28 | 4.5 max sheet hard fail | Project-level `assembly_max_sheet` rule in validateAssembly flags any part exceeding its material's max sheet. **Tier 4 fully complete.** |
| 2026-04-28 | Agent audit + Bug A fix | 4-scenario sweep on prod surfaced piano-hinge fastener-count bug (default 4 < required 20 for tall lockers). Fixed paramDefaults to compute fastenerCount from hinge edge length when style is piano. Locker hinge rule now passes. |
| 2026-04-28 | 5.1 DXF generation | `dxf:partDxf` query + Download button per part. Hand-rolled R12 ASCII emitter on CUT/HOLE/BEND layers with outline support for all 5 outline kinds. SCS-uploadable. |
| 2026-04-28 | 5.2 PDF drawing | `pdf:partPdf` query + FileText button per part. Hand-rolled PDF 1.4 emitter, US Letter, title block + outline + Bezier holes + dashed bends + dimension callouts. ~2 KB per default part. |
| 2026-04-28 | 5.3 BOM CSV | `bom:projectCsv` query + Download BOM button on the AssemblyPartsPanel. Sheet-metal groups by (material, thickness) with area/weight/cost, hardware rolls up across assemblyParts + interfaces + purchased parts. |
| 2026-04-28 | 5.4 SCS bundle zip | Hand-rolled PKZIP-2.0 emitter (no compression); `bundle:projectZip` returns base64 zip with cuts/, drawings/, bom.csv, README.md. SCS bundle Archive button next to BOM. Python zipfile extracts the artifact cleanly. |
| 2026-04-28 | 2.8 generic build (user pivot) | New tools `add_sheet_metal_part` / `add_interface` / `remove_part` let the agent compose any assembly from primitives — no archetype required. Verified by building a 3-part soldering-iron stand end-to-end on prod with zero validation failures. |
| 2026-04-28 | 5.5 OBJ (in lieu of STEP) | `obj:projectObj` query + Download OBJ button on AssemblyPartsPanel. Hand-rolled OBJ emitter — one group per part, world-space box mesh. **Tier 5 fully complete.** Real AP203 STEP logged as a backlog item. |
