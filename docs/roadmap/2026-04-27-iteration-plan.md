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

- [ ] **2.1 Add `body_construction` param to `hinged_enclosure`.** Values:
  `"bolted_plates"` (current) | `"single_bend"` (one bent plate forming
  base + 2 walls or base + 4 walls + welded seam). For `single_bend`, emit ONE
  sheet-metal part with a flat-pattern unfold and bend lines defined; the
  3D viewer should render it as a folded box. Default: `"single_bend"` for
  jerry-rigged + mvp tiers, `"bolted_plates"` for commercial.
  **Verify**: a 12×12×12 box with `body_construction: "single_bend"` produces
  1 body part + 1 lid + 1 hinge interface; intersection passes; AssembledView
  renders the folded geometry (not 5 floating plates).
- [ ] **2.2 Add `weld_joint` interface kind for tab-and-slot joints.** Used
  when two sheet-metal parts join via spot-weld at tabs that slot through
  rectangular cutouts. Update `assemblyRules.ts` to validate that tab/slot
  features align across the joint. Update system prompt to teach the agent
  when to prefer welded joints over bolted (high-volume, sealed enclosures,
  non-serviceable assemblies).
- [ ] **2.3 Hinge geometry classes.** Today every hinge is a generic
  `1635A3`. Real options: piano (continuous, full edge length), butt
  (discrete, 2–3 hinges spaced along edge), concealed (cup-and-bracket,
  fully hidden). Each has its own hole pattern. Add `hingeStyle` param to
  hinged_enclosure. Update `checkHingeGeometry` to validate that the named
  pattern is feasible at the chosen edge.
- [ ] **2.4 Min flange + hole-to-bend distance validators.** From the
  manufacturing primer in the system prompt: min flange ≈ 4× thickness past
  the bend tangent, holes must be ≥ 2× thickness from a bend's tangent
  line. Add `flange_min_length`, `hole_to_bend_clearance` rules to
  `assemblyRules.ts` for any part that has bends. Surface failures in the
  validation panel like the existing rules.
- [ ] **2.5 Bend interference detection.** Two folds in a part can't share
  material. After unfolding, check that bend regions don't overlap. Add a
  `bend_geometry_feasible` rule per part with bends.
- [ ] **2.6 Manufacturing primer in agent's per-call context.** Currently
  the primer is in the system prompt (static). Add a tool
  `check_manufacturing` the agent can call to get a tailored summary of
  rules that apply to the current parts (their materials, thicknesses,
  bends). Result is the active validator output filtered to manufacturing
  rules — closes the feedback loop.

## Tier 3 — Visual fidelity

The 3D view today is a placeholder. Several "we already model this in data
but render it as a box" gaps to close.

- [ ] **3.1 Render bolts at hole positions in AssembledView.** For each
  `bolted` / `riveted` / `pem_inserted` interface, draw a small cylinder at
  each shared hole's world position, axis along the part normal. Color by
  fastener (zinc grey for steel screws, sky blue for stainless, gold for
  brass). Tooltip shows McMaster part number + interface role on hover.
  **Verify**: a default `hinged_enclosure` with `fastenerCount: 4` shows 16
  bolts (4 per wall, 4 walls bolted to base).
- [ ] **3.2 Render polygon outlines for non-rectangle sheet-metal parts.**
  Today `add_freeform_2d_part` produces parts with `outline:
  {kind: "star"|"polygon"|...}` but AssembledView still renders the AABB.
  Switch to `THREE.Shape` + `ExtrudeGeometry` so a 5-pointed star part
  actually looks like a star.
- [ ] **3.3 Render bend lines.** Each `bend` feature should appear as a
  dashed line on the part surface in the unfolded preview AND show as the
  fold edge in the assembled view. Currently bends are invisible.
- [ ] **3.4 Material textures.** Subtle PBR maps so brushed aluminum
  doesn't look identical to mild steel. Use single-channel normal maps
  generated procedurally — no external assets needed.
- [ ] **3.5 Hole rendering.** Current parts are solid rectangular boxes;
  the holes (which exist in the DSL) aren't visible. Render them as black
  circles on the surface (texture or actual subtraction). Even just a flat
  texture indicating hole positions would be a huge readability win.

## Tier 4 — Validators

- [ ] **4.1 Hole-to-edge distance** (≥ 2× thickness). Already partly
  computed in featuresInWorld; add as an explicit rule.
- [ ] **4.2 Material vs feature compatibility.** E.g. acrylic can't bend,
  6061 has minimum bend radius 2× thickness. Already in scsRules.ts but not
  surfaced as a top-level rule.
- [ ] **4.3 Weight estimate per part.** `area × thickness × density`.
  Surface in part list and as a project total.
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

## Status log

| Date | Chunk | Result |
|---|---|---|
| 2026-04-27 | _initial drafting_ | Plan written; starting 1.1. |
| 2026-04-27 | 1.1 audit + fix | All 6 archetypes pass `parts_dont_intersect`. Same wall rotation bug fixed across boxWithLid, dividedTray, slidingEnclosure; brackets reoriented in shelfWithBrackets. |
| 2026-04-27 | 1.3 regression infra | `_audit:auditAllArchetypes` ships — run any time to verify all archetypes' defaults are clean. |
| 2026-04-27 | 1.2 conventions doc | `docs/conventions/coordinate-frames.md` written with rotation recipes; intersect.ts + positions.ts reference it. |
