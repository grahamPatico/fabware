# Fabware Platform Vision

**Date:** 2026-04-24
**Status:** Roadmap — not yet scoped for implementation
**Current product:** Chat-driven flat-pattern sheet-metal part designer on Convex. One project = one part. SCS-aware validation, McMaster assembly refs (17-entry seed), DXF export.

---

## The shift

Today Fabware designs **one part at a time**. The user-described north star is a harness that turns an **intent** ("a rental locker for tennis balls, outdoor, commercial grade, 12-inch cube") into a **buildable assembly**: multiple custom parts (sheet metal + 3D print), off-the-shelf parts (McMaster), an honest cost estimate, a bill of materials, and an export bundle that a fabricator can actually execute on.

The jerry-rigged → MVP → commercial-grade spectrum is the product's core organizing dimension: the harness should meet users wherever they are and walk them up the ladder as ambition grows.

---

## Canonical example: the tennis-ball rental locker

Used as the acceptance test for the whole platform. Requirements the harness must extract and satisfy:

- **Scope:** MVP → commercial grade
- **Environment:** outdoor → waterproof / weather-sealed
- **Reference scale:** sized around a regulation tennis ball (Ø ~2.7", ~3 balls per rental)
- **Form factor:** 12" cube (user-specified target, negotiable)
- **Parts:** enclosure body, hinged door, latch/lock, internal divider, fasteners, seal/gasket, hinge hardware, optional: keypad + PCB + battery + LED
- **Manufacturing mix:** sheet-metal body (SCS), 3D-printed bezel for the keypad, McMaster hinges + weather seal + fasteners
- **Outputs:** per-part DXFs, per-part STLs, McMaster cart URL, SCS upload instructions, assembly drawing, BOM with total cost

---

## The subsystems

Originally 8 — expanded 2026-04-24 with joining methods, mixed materials, visual preview, actuators, physical-property analysis, environmental validation, simulation/risk, and tolerance stackup.



Stacked roughly bottom-up — later items depend on earlier ones.

### 1. K-factor-aware bends

**Problem today.** DXF bends are drawn as lines with no bend allowance. SCS's folder needs fold lines the k-factor math has already been applied to, or the hole pattern lands in the wrong place after the bend.

**What's needed.** Per-material k-factor table (SCS publishes these, varies by thickness + bend radius). Bend-allowance math in `dxfGenerator.ts` so the flat pattern is correctly developed. Fold lines annotated so SCS's UI recognizes them as bends, not cuts.

**Blocks:** everything involving >1 bend. Single-part bends work-ish today by luck.

---

### 2. Multi-process parts

**Problem today.** The DSL only describes sheet metal (`partType: bracket | plate | enclosure | …`). 3D-printed parts and off-the-shelf parts are second-class (assembly refs hang off a sheet-metal primary).

**What's needed.** Elevate `part` to a union: `sheet_metal_part | printed_part | purchased_part`. Each kind has its own DSL, its own preview, its own manufacturability rules. A project is a **collection** of parts, not a single primary + refs.

**Blocks:** assemblies (#4), electronics mounting (#7), the full tennis-ball-locker example.

---

### 3. Expanded parts catalog

**Problem today.** 17 hand-curated McMaster entries. Fine for demo, insufficient for real designs (user asks for M4 × 20 mm socket head → we don't have it → agent hallucinates a nearby entry).

**What's needed.** Broader catalog (1-5k entries to start), category + size filters, fuzzy search that understands "M4 × 20 SHCS" ≈ "M4 socket head cap screw 20mm" ≈ "91290A128". Legal constraints: no scraping McMaster; path forward is Part Analytics / CADENAS license, or structured seed data curation.

**Blocks:** BOM quality (#6), any real-world bill of materials.

---

### 4. Assemblies / multi-part projects — **first slice lives here**

**Problem today.** Project = one part. The tennis-ball locker needs ~6-12 parts that have to fit each other.

**What's needed.** A project contains N parts. Parts have **relationships**: "panel A bolts to panel B with four 1/4-20 SHCS; seal sits between." Agent loop becomes compositional: break intent into parts, design each, verify interfaces (bolt pattern matches on both mating parts, enclosure volume fits the internal payload).

Data model: `projects` has many `parts`, `parts` have many `interfaces` (mate / fastener / fit), assembly-level validation rule: "every interface is internally consistent."

**v1 scope decision pending** — see "First slice: sheet-metal assembly" section below.

**Blocks:** everything that requires >1 custom part.

---

### 5. Project scoping wizard

**Problem today.** The chat jumps straight to DSL. No framing of *who this is for, what quality bar, what environment.*

**What's needed.** A 3-4 question opening flow when a new project starts:

| Question | Drives |
|---|---|
| Build tier? (jerry-rigged / MVP / commercial) | Material grade, fastener spec, finish, tolerance |
| Indoor / outdoor? (+ if outdoor: waterproof? UV? freeze?) | Material + finish (galvanized? powder coat? 316 stainless?), seal/gasket needs |
| Target users? (self / small group / paying customers) | Serviceability, anti-tamper, aesthetic finish |
| Reference scale? ("holds 3 tennis balls", "fits a Raspberry Pi", dimension) | Internal volume minimums |

These answers become **project-level constraints** the agent enforces through every downstream design choice. User can revise them at any time; enforcement cascades.

**Blocks:** nothing strictly, but without this the agent over-engineers prototypes and under-engineers products.

---

### 6. Cost estimation + BOM

**Problem today.** No prices. User has no idea if the part they just designed costs $4 or $400.

**What's needed.** Per-part cost estimator:

- **Sheet metal:** SCS pricing = material × area × thickness surcharge × finish surcharge × qty break. SCS publishes the formula; we cache the coefficients.
- **3D print:** volume × material rate (PLA/PETG/Nylon/Resin each different) + machine time estimate.
- **Purchased:** McMaster unit price × qty. Requires #3 catalog expansion to not be fiction.

Roll up into a project-level BOM table: part name | kind | qty | unit cost | extended cost, plus total. Appears in the UI as soon as the part is designed, updates live.

---

### 7. Electronics integration

**Problem today.** Chat can say "I need a keypad" but the DSL has no concept of PCBs, connectors, battery compartments, cable runs, or EMI.

**What's needed.** Electronics as a first-class **part kind** (extends #2):

- PCB refs (user uploads a STEP / DXF outline, or picks from a catalog of common boards: Pi Zero, ESP32 devkit, standard keypad matrices)
- Mounting provisions: standoff holes (matched to PCB hole pattern), snap-fit enclosures, cable pass-throughs with strain relief
- Power: battery compartment sizing (18650, 9V, AA), charging port, solar panel mounting
- Environmental: IP rating downstream from #5 (outdoor → require gasketed enclosure, sealed connectors)
- Manufacturability guidance on the electronics side: recommended connectors, wire gauge, fuse ratings

This is a big subsystem — it likely needs its own decomposition when we get to it.

---

### 9. Joining methods catalog

**What's needed.** First-class model of how parts come together. Each method has its own DSL fragment, its own validation rules, its own McMaster/consumable references:

- **Bolted** — through-hole + nut, or through-hole + tapped hole, clearance math per thread spec (already partially done for single parts)
- **PEM / press-fit inserts** — self-clinching nuts (`92395A*`), studs, standoffs; requires minimum material thickness; installs on one side only (matters for weather sealing)
- **Riveted** — pop rivets, solid rivets; one-sided install; permanent
- **Welded** — spot weld, TIG, MIG; constrains material compatibility (can't weld aluminum to steel without specialty process); SCS doesn't weld today, so welding = user does it themselves or sends to a local shop
- **Hinges** — McMaster-catalog items; consume a row of fasteners on both mating parts; orientation-sensitive (door swings which way)
- **Adhesive / VHB tape** — 3M VHB for enclosures; cheap/fast but low-tier
- **Snap-fit** — typically 3D-printed parts; later subsystem

Each method's DSL captures: method type, fastener/consumable refs, location on the mating parts, access side (for install), permanence (removable vs permanent).

**Blocks:** any real assembly. Without this, "assembly" is just parts floating in the same project.

---

### 10. Mixed materials beyond sheet metal

**What's needed.** Sheet metal is one material kind among many. Add as peers:

- **Acrylic / polycarbonate** — laser-cut like sheet metal; good for viewing windows, poor impact resistance (polycarb better for outdoor/abuse); SCS does cut acrylic
- **Plywood / hardboard** — CNC-cut; cheaper than metal for jerry-rigged/MVP tier; outdoor needs marine-grade or sealing
- **Gasket / foam** — die-cut compressible material for waterproofing; sized from the sheet-metal flange it seals against
- **Mesh / perforated** — drainage, ventilation, anti-tamper viewing
- **3D print** (covered in #2) — for complex geometry, snap-fit, small runs

Material catalog needs per-material properties beyond thickness: transparency, UV tolerance, impact resistance, max service temperature, food-safe, optical clarity, etc. Agent uses these to answer "what should the viewing window be made of?" with reasoned tradeoffs.

**Blocks:** viewing windows, gaskets, and any tier-aware material choice in #5 that isn't sheet metal.

---

### 11. Visual preview generation

**What's needed.** Beyond the 2D flat-pattern SVG, the user wants to **see what the thing looks like** before they order it:

- **Assembled isometric render** — all parts in their final 3D position with fasteners
- **Exploded view** — parts pulled apart along assembly vectors so the user understands sequence
- **Approximate photorealistic render** — for the "commercial grade" presentation (user wants to imagine it on a wall)
- **Annotated cross-section** — where seals sit, where wires run, where the user's hand reaches

Approaches range from cheap (Three.js in-browser from the DSL) to expensive (pass DSL + materials to a render service or image model for a photoreal mockup). Tiering likely: isometric + exploded come free from the DSL; photoreal is a paid / commercial-tier feature.

---

### 12. Actuators and moving parts

**What's needed.** Beyond static hardware, the design may need:

- **Locks** — keyed, keypad, electromagnetic (mag-lock), solenoid latch
- **Hinges** (could live in #9 or here — cross-reference)
- **Gas struts** — for doors that stay open
- **Casters / wheels** — mobility
- **Motors / linear actuators** — if the design is actually driven

Each brings constraints: power (if electric), mounting geometry (lock needs backing plate on the door frame), safety (pinch points), environmental (mag-locks need weather-sealed housings for outdoor). Overlaps with #7 electronics when powered.

---

### 13. Physical property analysis

**What's needed.** Compute and surface:

- **Weight** — per part + total; from material density × volume. Matters for shipping cost, user portability, installation method (single-person vs 2-person lift vs crane).
- **Center of mass** — matters for tipping, wall-mounted installations, doors that want to swing open by gravity.
- **Bounding box** — "does this fit through a standard door / into a trunk / onto a shelf?"
- **Material cost** — feeds into #6 (BOM + cost).

Blocks #6 cost, and any shipping/logistics advice.

---

### 14. Environmental validation (waterproof / IP rating)

**What's needed.** Given a declared environment (from #5: outdoor, waterproof, UV, freeze, food-contact), **check the design actually meets it**:

- No unsealed fastener penetrations on the top or exposed faces
- Gaskets present where panels meet
- Drainage paths if splash-prone
- UV-stable materials on exposed surfaces
- Drainage / breathing paths where condensation would otherwise pool

Map design features → failure modes → required mitigations. Produce an "environmental readiness" checklist on the project summary.

---

### 15. Simulation and risk analysis **(future)**

**What's needed.** Later, when the platform is mature:

- **Static FEA** — will the door sag under its own weight? does the latch plate deflect when slammed?
- **Thermal** — will the enclosure cook the electronics inside?
- **Failure mode analysis** — for each interface, what happens if it fails? (If the latch fails, does the door just open? Or does the whole lid fall off and break the contents?)
- **Drop / vibration** — rented-out-to-public devices get abused

Out of scope until the platform has many real projects to justify the compute cost.

---

### 16. Tolerance stackup **(future-ish)**

**What's needed.** Every manufacturing process has tolerance bands. SCS bends ±1°, laser cut ±0.005", press-fit holes ±0.002". When you stack parts together, errors compound. For example:

- Three panels bolted edge-to-edge around a 12" internal cavity might deliver an 11.95"–12.05" opening — fine for tennis balls, not fine for a precisely-sized electronic device
- Door gasket compression needs nominal ±X mm of squish — if the frame and door tolerance stack the wrong way, the seal fails

Agent should compute worst-case stackup for critical dimensions and flag when it's tight. Builds on #4 assemblies and #13 physical properties.

---

### 8. Export bundle

**Problem today.** One project → one DXF. Good for a single sheet-metal part; useless for a 12-part assembly.

**What's needed.** Export = a zip containing:

- `parts/*.dxf` (one per sheet-metal part, named sensibly)
- `parts/*.stl` (one per printed part)
- `bom.csv` (every part, every qty, every cost)
- `mcmaster-cart.txt` (one-click paste into McMaster's bulk cart)
- `sendcutsend-order.md` (per-DXF: material, thickness, qty, finish — copy/paste into SCS's upload form)
- `assembly.svg` (exploded view showing how the parts fit)
- `README.md` (project metadata, scope answers, assembly sequence)

---

## First slice: sheet-metal assembly (in progress)

**Decided 2026-04-24.** The first implementation slice focuses on **sheet-metal-only assemblies** — multi-part projects where every part is sheet metal, joined by a limited set of methods, with enough intent-capture and visualization to be useful.

**Key architectural commitment — B leads to C.** The v1 entry point is an archetype library (option B). The long-term target is free-form decomposition (option C). This is **not** "ship B then rewrite for C." To guarantee a clean path:

- **Archetypes are data, not code paths.** An archetype is a pure function `(params) → { parts, interfaces }`. Its output is the same `{ parts, interfaces }` shape that a free-form agent would produce from scratch.
- **Everything downstream treats parts + interfaces as primary.** Validation, preview, export, BOM never know or care whether a project came from an archetype or from free-form decomposition.
- **`project.archetypeId` is nullable from day one.** v1 requires it (agent refuses free-form). v2 flips the switch by relaxing that requirement and shipping the `decompose_freeform` tool — no schema migration, no UX rewrite.
- **Agents in v1 already emit parts + interfaces.** The agent tool in v1 is `select_archetype(params)` which returns the starter PartList/InterfaceList. v2 adds `decompose_freeform(intent)` which returns the same shape by a different path.
- **"Break out" is a first-class UX affordance, not a special mode.** Once a user customizes an archetype-generated project enough that they want to diverge, setting `archetypeId = null` treats the project as custom. v1 allows this; the agent just can't regenerate from intent until v2.

### Must-have for first slice

- **Scope wizard entry** (#5, minimal version): tier, indoor/outdoor, use-case summary, reference-scale anchor
- **Multi-part project model** (#4, sheet-metal-only): one project → N sheet-metal parts with interfaces between them
- **Joining methods — starter set** (#9 subset):
  - Bolted (through-hole both sides, or PEM press-fit on one side)
  - McMaster hinges (catalog-driven)
  - Rivets (annotated, user installs)
- **Interface validation**: bolt patterns match across mating parts; hole diameters match fastener clearances
- **Assembled visual preview** (#11, cheap version): Three.js in-browser isometric from the DSL, no photoreal
- **Physical properties — starter set** (#13 subset): total weight, bounding box

### Explicitly deferred for later slices

- Welding (SCS can't do it anyway)
- Mixed materials (acrylic windows, gaskets) — #10
- Electromagnetic locks / actuators — #12
- Waterproof rule validation — #14
- Photoreal renders — #11 richer tier
- FEA / risk analysis — #15
- Tolerance stackup — #16
- Electronics — #7
- Cost / BOM — #6 (likely second slice)

### Expanded user-intent capture

The scope wizard (#5) expands for this slice to include:

- **What is the product for?** (storage / enclosure / mount / fixture / display / other)
- **Who uses it?** (self / small team / paying customers / general public)
- **What's inside?** (reference scale: "3 tennis balls", "a Raspberry Pi", dimensions)
- **How does the user interact?** (open a door / press a button / just look at it)
- **Environment** (indoor / outdoor → if outdoor: waterproof / UV / freeze)
- **Tier** (jerry-rigged / MVP / commercial)
- **Budget ceiling** (optional — constrains material/fastener/finish choices)

These answers become project-level constraints enforced through every subsequent part and interface decision.

---

## Dependency graph

```
    ┌─ #5 Scoping wizard ──────────────────────────┐
    │  (small, high leverage, unblocks tier/env    │
    │   constraints everywhere downstream)         │
    │                                              ▼
#1 K-factor ──► #2 Multi-process ──► #4 Assemblies ──► #8 Export bundle
    │              │                      ▲
    │              ▼                      │
    │          #3 Expanded catalog ───────┤
    │              │                      │
    │              ▼                      │
    └──────► #6 Cost estimation ──────────┘
                                          ▲
                                          │
                                     #7 Electronics
                                     (depends on #2 and #6)
```

Critical path: **#1 → #2 → #4 → #8** is what turns the platform from "one-part designer" into "assembly builder". #5 + #3 + #6 + #7 are parallel enrichments that make each stage more useful.

---

## Tiering as a platform-wide knob

Every subsystem has tier-specific behavior:

| Subsystem | Jerry-rigged | MVP | Commercial |
|---|---|---|---|
| **Materials** | Whatever's cheapest in-catalog | Mild steel / aluminum | Stainless / aluminum, matched finish |
| **Fasteners** | Any hardware-store screw | McMaster standard | McMaster specced + torque rating |
| **Finish** | Bare | Powder coat | Powder coat + sealed gaskets |
| **Bends** | Line-only (user folds by eye) | K-factor computed | K-factor + tolerance callouts |
| **BOM** | Parts list | Parts + cost | Parts + cost + alt-vendor + lead time |
| **Export** | DXF only | DXF + STL + BOM | Full bundle + assembly drawing + README |
| **Electronics** | Breadboard-friendly | Proto-PCB mount | Sealed housing, proper connectors, IP-rated |

The scope wizard (#5) sets the tier, and it propagates through every subsystem as a shared constraint.

---

## Sequencing

**Organizing principle (decided 2026-04-24):** Prioritize accessible, inexpensive manufacturing processes. Sheet-metal laser cutting, hardware assembly (McMaster), and 3D printing are the three most approachable and come first. Welding, CNC machining, and specialty processes come much later.

- **Slice 1 (current):** Sheet-metal assembly — see "First slice" section above. Combines minimal versions of #1 (K-factor), #4 (assemblies), #5 (scope wizard), #9 (joining: bolted/PEM/riveted/hinged), #11 (isometric preview), #13 (weight/bbox).
- **Slice 2 (next):** Add 3D-printed parts as a peer to sheet metal. Elevates `parts.kind` from sheet-metal-only to `sheet_metal | printed`. Each printed part has its own DSL (geometry primitives + features), manufacturability rules (min wall thickness, overhang angles, bridging), and a cost estimate keyed to material volume. Unlocks mixed sheet+print assemblies like the keypad bezel on a sheet-metal locker.
- **Slice 3 (candidate):** Cost estimator + BOM (#6) + starter catalog expansion (#3). Rolls up costs across sheet metal, 3D print, and McMaster purchased parts.
- **Slice 4 (candidate):** Mixed materials beyond metal+print (#10) — acrylic for viewing windows (laser-cuttable like sheet metal; SCS does acrylic), gaskets for seals. Unlocks the waterproof tier.
- **Slice 5 (candidate):** Full export bundle (#8) — per-part DXFs + per-part STLs + BOM + McMaster cart URL + SCS order instructions + assembly drawing.
- **Later:** Electronics (#7), environmental validation (#14), actuators including electromagnetic locks (#12), photoreal previews (#11 tier 2), simulation (#15), tolerance stackup (#16), welding / CNC / specialty processes.

---

## Not in scope for this vision doc

- How the agent actually decomposes intent into parts (that's the agent-loop redesign — a separate planning doc when we pick #4)
- Frontend wizard UX details (mockups come when we scope #5)
- Partner/vendor relationships (SCS, McMaster, 3D-print services, CADENAS) — business side, not design
- Pricing model for Fabware itself (what's free, what's paid)
- Multi-user / team features

---

## Links

- Current Fabware state: `CLAUDE.md` at repo root (Convex backend, Anthropic model+effort picker, flat-pattern part designer)
- Existing plan doc: `docs/PLAN.md`
- SCS scraping notes: `docs/SCS-SCRAPE.md`
