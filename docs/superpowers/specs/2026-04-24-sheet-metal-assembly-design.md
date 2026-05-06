# Sheet-metal assembly — Slice 1 design

**Date:** 2026-04-24
**Status:** Superseded by [ADR-0001](../../adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md) at the architectural-direction level. The Slice 1 schema (`parts` + `interfaces` + archetypes + `PartDsl`) is **retained on `main` as the live customer surface** until the CAD IR rebuild reaches feature parity behind the `useCadIr` flag. The tennis-ball-locker canonical end-to-end test continues to pass against this schema. See ADR-0001 §"Retained from Sheet-metal Assembly Design (Slice 1)" for full carve-outs.
**Scope:** First implementation slice on the path laid out in `docs/roadmap/2026-04-24-platform-vision.md`. Takes Fabware from "one part per project" to "multi-part sheet-metal assembly with intent capture and assembled preview."
**Decided:** 6 archetypes, option 2c UX (hidden-by-default archetype with discreet reveal chip), frontend rework acceptable.

---

## Goals

1. A Fabware project can have **N sheet-metal parts** with **typed interfaces between them** (bolted / hinged / riveted / PEM-inserted).
2. Users describe intent in plain language (e.g., *"outdoor locker for tennis balls, 12-inch cube, commercial grade"*) and get a starter assembly without picking a template manually.
3. An **assembled isometric preview** renders in the canvas so users see what they're building.
4. The architecture is **B→C ready**: adding free-form decomposition later is a new agent tool, not a schema migration or UX rewrite.
5. The tennis-ball-locker canonical example works end-to-end (scope wizard → generated assembly → user refinement → individual part DXF export).

## Non-goals (explicitly deferred)

- Mixed materials (acrylic, gaskets) — slice 3
- Cost / BOM — slice 2
- Waterproof validation beyond "warn if material is wrong for outdoor" — slice later
- Electronics mounting, actuators, electromagnetic locks — later slices
- Welding (SCS can't do it; user welds themselves)
- FEA / simulation / risk analysis / tolerance stackup
- Photoreal renders (isometric only)
- Full-bundle export — v1 exports per-part DXFs one at a time as today; zip-bundle is slice 4
- Free-form decomposition — the `decompose_freeform` tool is a stub returning "not yet supported; closest match is archetype X"

## Core architectural commitment: B→C via shared output shape

Archetypes in v1 and free-form in v2 produce **exactly the same output**: `{ parts: PartDsl[], interfaces: InterfaceSpec[], positions: Pose[] }`. Everything downstream (validation, preview, export, BOM) consumes only that shape and never knows which path produced it.

v2 ships when `decompose_freeform` is implemented. v1 schema already supports it (`archetypeId` is nullable). No migration, no UX rework.

---

## Data model (Convex schema additions)

Additive; `partSpecs` stays for legacy single-part projects.

```ts
projects: {
  // existing fields unchanged (name, description, status, createdAt, updatedAt)
  scope: v.optional(v.object({
    tier: v.union(v.literal("jerry-rigged"), v.literal("mvp"), v.literal("commercial")),
    environment: v.object({
      location: v.union(v.literal("indoor"), v.literal("outdoor")),
      waterproof: v.optional(v.boolean()),
      uv: v.optional(v.boolean()),
      freeze: v.optional(v.boolean()),
    }),
    useCase: v.string(),                // free-form one-liner
    userInteraction: v.optional(v.string()),   // "open a door", "press a button", etc.
    referenceScale: v.optional(v.object({
      kind: v.string(),                 // "tennis ball", "Raspberry Pi", "custom"
      dimensions: v.optional(v.object({ w: v.number(), d: v.number(), h: v.number() })),
      quantity: v.optional(v.number()),
    })),
    budgetCeiling: v.optional(v.number()),
  })),
  archetypeId: v.optional(v.union(v.literal("hinged_enclosure"), v.literal("sliding_enclosure"),
                                  v.literal("bracket_plus_panel"), v.literal("divided_tray"),
                                  v.literal("shelf_with_brackets"), v.literal("box_with_lid"),
                                  v.null())),   // null = custom (break-out)
  archetypeParams: v.optional(v.any()),         // shape varies per archetype; validated by the archetype's own Zod schema in-app
  isMultiPart: v.boolean(),                     // false = legacy single-part flow via partSpecs
}

parts: {                                // new table
  projectId: v.id("projects"),
  role: v.string(),                     // "base" | "wall_left" | "door" | "custom" | ...  (set by archetype, free text after break-out)
  label: v.string(),                    // human display name
  dsl: v.object({ /* PartDsl — reuse today's shape */ }),
  position: v.object({
    x: v.number(), y: v.number(), z: v.number(),
    rotX: v.number(), rotY: v.number(), rotZ: v.number(),
  }),
  svgPreview: v.optional(v.string()),
  dslJson: v.optional(v.string()),
  featureGraphJson: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}.index("by_project", ["projectId"])

interfaces: {                           // new table
  projectId: v.id("projects"),
  kind: v.union(v.literal("bolted"), v.literal("pem_inserted"), v.literal("riveted"), v.literal("hinged")),
  partA: v.id("parts"),
  partB: v.id("parts"),
  featureRefs: v.array(v.object({
    partId: v.id("parts"),
    featureName: v.string(),            // refers to the named hole/slot feature on that part's DSL
  })),
  hardwareRefs: v.array(v.object({
    mcmasterPartNumber: v.string(),
    quantity: v.number(),
    role: v.optional(v.string()),       // "mounting" | "pivot" | ...
  })),
  accessSide: v.optional(v.union(v.literal("A-to-B"), v.literal("B-to-A"), v.literal("either"))),
  createdAt: v.number(),
}.index("by_project", ["projectId"])

partRevisions: {                        // existing, repurposed for project-level snapshots
  projectId: v.id("projects"),
  revisionNumber: v.number(),
  rationale: v.optional(v.string()),
  snapshot: v.object({                  // full project snapshot, not per-part
    scope: v.optional(v.any()),
    archetypeId: v.optional(v.any()),
    archetypeParams: v.optional(v.any()),
    parts: v.array(v.any()),            // array of Part docs
    interfaces: v.array(v.any()),       // array of Interface docs
  }),
  createdAt: v.number(),
}
```

Existing `partSpecs` table stays for legacy (single-part) projects. New projects always go through the multi-part flow; `isMultiPart: true`.

---

## Archetype library (6 starter templates)

Each archetype is a TypeScript module at `convex/archetypes/<id>.ts`:

```ts
// convex/archetypes/types.ts
export interface Archetype<P> {
  id: string;
  label: string;
  description: string;
  paramSchema: z.ZodType<P>;
  paramDefaults(scope: ProjectScope): P;
  generate(params: P, scope: ProjectScope): {
    parts: Array<{ role: string; label: string; dsl: PartDsl; position: Pose }>;
    interfaces: Array<InterfaceSpec>;
  };
  thumbnailSvg: string;     // static inline SVG for the picker
  tags: string[];           // "enclosure" | "mount" | "storage" | "shelf" — for matching intent
  tierDefaults: Record<Tier, Partial<P>>;   // applied on top of paramDefaults
}
```

**The 6:**

| id | Description | Starter parts | Typical interfaces |
|---|---|---|---|
| `hinged_enclosure` | Base + 4 walls + hinged lid. Canonical tennis-ball-locker shape. | base, wall_left, wall_right, wall_front, wall_back, lid | wall-to-base bolted ×4, lid-to-back hinged, lid-to-front lockable |
| `sliding_enclosure` | Rectangular body with sliding drawer or door. | shell, back, drawer | drawer in shell slot, back bolted to shell |
| `bracket_plus_panel` | L or Z bracket mounted to a flat panel. Common for wall-mounting electronics, signage, shelving. | bracket, panel | bracket bolted to panel |
| `divided_tray` | Open-top tray with internal dividers. Sorting, organizing, multi-slot storage. | base, wall_front, wall_back, wall_left, wall_right, divider_1..N | walls bolted to base, dividers bolted to walls |
| `shelf_with_brackets` | Shelf panel + 2 wall-mount brackets. | shelf, bracket_left, bracket_right | bracket-to-shelf bolted ×2 |
| `box_with_lid` | 5-sided box with removable (non-hinged) top. Simplest enclosure. | base, wall ×4, lid | walls bolted to base, lid friction-fit or latched |

Each archetype's `generate` returns flat PartDsl values that reuse the **existing** `lib/dsl.ts` schema — no DSL changes required for v1.

`tierDefaults` example for `hinged_enclosure`:

```ts
tierDefaults: {
  "jerry-rigged": { thickness: 0.048, material: "Mild Steel (CRS)", powderCoat: false },
  "mvp":         { thickness: 0.075, material: "Mild Steel (CRS)", powderCoat: true, powderCoatColor: "Black" },
  "commercial":  { thickness: 0.090, material: "Stainless Steel 304", powderCoat: true },
}
```

Environment layer: if `scope.environment.location === "outdoor"`, override material to a weather-acceptable choice (galvanized, stainless, aluminum 5052); if `waterproof`, annotate interfaces for future gasket insertion (slice 3).

---

## Agent loop changes

Keep today's `validate_dsl` and `lookup_mcmaster`. Add:

- `capture_scope(patch)` — writes/updates `projects.scope`. Used during the opening wizard and whenever the user changes tier/environment/use case mid-project.
- `select_archetype(archetypeId, params, rationale)` — picks an archetype from the library, fills params, generates starter parts + interfaces. Writes all `parts` and `interfaces` rows. Used on project creation.
- `refine_part(role, dslPatch, rationale)` — applies a patch to one part's DSL (changes dimensions, adds a feature, removes a feature). Re-runs part-level validation.
- `add_feature_to_part(role, feature)` — shorthand for adding a hole/bend/slot/fillet to a named part.
- `update_archetype_params(paramPatch, rationale)` — adjusts the archetype's params and regenerates affected parts. Used when user says "make the inner width 14 inches."
- `break_out(reason)` — sets `archetypeId = null`. After this, regeneration is disabled; user can only refine parts individually. Confirms with the user first (agent explains what regeneration loses).
- `decompose_freeform(intent)` — **stub in v1**. Returns a message pointing the user toward the closest archetype. v2 replaces with a real implementation.

**System prompt changes:**
- New section on archetype selection: the agent is given the list of 6 with tags + descriptions, and told to pick the closest match given scope + intent.
- New section on interfaces: rules for bolt-pattern matching, hinge geometry, PEM access.
- The "you must end with submit_final" instruction becomes "you must end with either `select_archetype` (new project) or `refine_part`/`add_feature_to_part`/`update_archetype_params` (existing project)."

**Iteration loop:**
- Per-part validation continues as today (today's SCS rules, hole clearance, sheet bounds)
- Project-level validation runs after any part change: see "Assembly validation rules" below
- If project-level validation fails, agent gets a tool result describing the mismatch (e.g., "Part `door` has 4 holes at corners with Ø 0.266", but mating part `wall_front` has no matching holes") and can revise

---

## Assembly validation rules

Pure functions in `convex/lib/assemblyRules.ts` returning `{ id, label, status: "pass"|"warn"|"fail", message, suggestion? }`. Run after every project mutation.

- **hole_pattern_match** (per `bolted` interface): Part A's and Part B's referenced holes must match in position (in shared assembly frame), count, and diameter.
- **fastener_clearance_ok** (per interface): Each `hardwareRefs` fastener's thread spec → required clearance hole diameter → must match the matching feature's `diameter`.
- **hinge_geometry_ok** (per `hinged` interface): Both leaves of the hinge must have matching mounting-hole patterns; rotation axis must be consistent with part positions.
- **pem_install_side_ok** (per `pem_inserted` interface): PEM inserts need access to the un-flanged side of the sheet; rule checks the `accessSide` against part geometry.
- **scope_material_match**: If `scope.environment.location === "outdoor"`, parts with bare CRS get a warn (not fail — user may override).
- **scope_tier_fastener_match**: Commercial tier warns on anything that isn't stainless or zinc-plated steel.

---

## UX design (option 2c, hidden archetype + reveal chip)

### New-project flow

1. User clicks **New Project** → modal opens.
2. Modal page 1 — **Scope wizard**:
   - *"What's this for?"* (one-line use case)
   - *"Where will it live?"* (Indoor / Outdoor; if outdoor, checkboxes for Waterproof, UV, Freeze)
   - *"How nice does it need to be?"* (Jerry-rigged / MVP / Commercial — each with a one-line description)
   - *"What's inside or how big?"* (free text; parsed to `referenceScale`)
3. Modal page 2 — **Describe what you want** (single text area). User types intent; agent picks an archetype internally and generates the assembly. No archetype picker UI.
4. Modal closes; workspace opens with the generated parts.

### Workspace layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [←]  Studio  PRJ-1234   [⚙ Scope]           [👁 Show template info] [⟲][⟳][History] │
├──────────────────┬───────────────────────────────────────────────────┤
│ Parts            │                                                   │
│ ─────            │          Three.js assembled isometric             │
│ ▸ base           │          (all parts in position, fastener dots)   │
│ ▸ wall_left      │                                                   │
│ ▸ wall_right     │          [Toggle: Assembled | Focused flat]       │
│ ▸ wall_front     │                                                   │
│ ▸ wall_back      │                                                   │
│ ▸ lid   ● focus  ├───────────────────────────────────────────────────┤
│                  │   Interfaces                                      │
│ [+ Add part]     │   ─────                                           │
│ Interfaces (6)   │   wall_left ←bolted×4→ base                        │
│ ─────            │   wall_right ←bolted×4→ base                       │
│ lid ←hinged→ bwb │   ...                                             │
│                  │   [+ Add interface]                               │
├──────────────────┴───────────────────────────────────────────────────┤
│ Chat (with model/effort selector) — applies to focused part if       │
│ one is focused, otherwise to the project as a whole                  │
│                                                                      │
│ [Scope chip if dismissed elsewhere]                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Archetype reveal chip (2c core)

- Not visible by default. The user never sees the word "archetype" in the main UI.
- A small **⟨ info-i ⟩** icon in the header opens a popover: *"This project was generated from the Hinged Enclosure template. [Tweak standard options] [Design fully custom instead]"*
  - "Tweak standard options" opens the param form (`archetypeParams` editable as a sidebar sheet)
  - "Design fully custom instead" triggers `break_out` (confirmation modal: "you'll lose the ability to regenerate from intent — continue?")
- Dismissing the popover once keeps it dismissed for that session (stored in `localStorage`). The info-i stays available in the header.

### Scope editor

Button in the header opens a sheet with the same fields as the wizard page 1. Changes cascade: the agent re-runs archetype param defaults (warn before overwriting user tweaks) and re-validates the whole assembly.

### Chat scoping

Messages are tagged internally with `scope: "project" | "part:<role>"` based on which part (if any) is focused. The agent's system prompt is updated per message with the focused-part context so "make this thicker" resolves correctly.

---

## Frontend rework (detailed)

| File | Change |
|---|---|
| `src/pages/Workspace.tsx` | Completely restructured. New left rail, new canvas tabs, focused-part state. |
| `src/components/workspace/ChatPanel.tsx` | Adds focused-part awareness; sends message scope with every send. |
| `src/components/workspace/CanvasPanel.tsx` | Tab toggle: Assembled (Three.js) / Focused Flat (today's SVG). |
| `src/components/workspace/PartList.tsx` | **NEW.** Left rail list of parts; click to focus; + button to add. |
| `src/components/workspace/InterfaceList.tsx` | **NEW.** Secondary list showing interfaces; click to inspect. |
| `src/components/workspace/AssembledView.tsx` | **NEW.** Three.js scene rendering all parts in their `position` poses. |
| `src/components/workspace/ScopeEditor.tsx` | **NEW.** Sheet-based scope editor (same fields as wizard). |
| `src/components/workspace/ArchetypeInfoChip.tsx` | **NEW.** Header info-i + popover (option 2c). |
| `src/components/workspace/HistoryPanel.tsx` | Updated: revisions now snapshot the whole project, not one spec. |
| `src/components/workspace/RulesStatusStrip.tsx` | Updated: shows both per-part and assembly-level rules. |
| `src/components/workspace/AssemblyPartsPanel.tsx` | Repurposed: shows all hardware refs from interfaces, not per-project assembly parts. |
| `src/components/workspace/GuidedInputPanel.tsx` | Deprecated or kept as power-user shortcut; not central to v1. |
| `src/pages/Home.tsx` | `New Project` button now launches the wizard modal. |
| `src/pages/NewProjectWizard.tsx` | **NEW.** 2-page modal: scope → describe intent. |
| `src/pages/Export.tsx` | Updated: per-part DXF list (download each), project summary. Full-bundle deferred. |

Three.js dep is already installed (`@react-three/fiber`, `@react-three/drei`, `three` — from the existing `FoldedPreview`); we extend it for the assembled scene.

---

## Convex backend changes (detailed)

| File | Change |
|---|---|
| `convex/schema.ts` | Add `parts`, `interfaces` tables. Add `scope`, `archetypeId`, `archetypeParams`, `isMultiPart` to `projects`. Repurpose `partRevisions.snapshot` to project-level. |
| `convex/projects.ts` | `create` now returns with `isMultiPart: true` + generated archetype (if wizard inputs supplied); legacy single-part flow behind a deprecated flag. |
| `convex/parts.ts` | **NEW.** CRUD: `listForProject`, `get`, `updatePart`, `addPart`, `removePart`, `applyDesignPatch` (internal). |
| `convex/interfaces.ts` | **NEW.** CRUD: `listForProject`, `addInterface`, `updateInterface`, `removeInterface`. |
| `convex/archetypes/` | **NEW.** One file per archetype + `index.ts` exporting the registry. |
| `convex/archetypes/hingedEnclosure.ts` | First implementation; reference for the others. |
| `convex/lib/assemblyRules.ts` | **NEW.** Project-level validation (hole-pattern-match, fastener-clearance-ok, hinge-geometry, PEM access, scope-material). |
| `convex/designer.ts` | Rename conceptually to `assemblyDesigner`. New tool set (capture_scope, select_archetype, refine_part, add_feature_to_part, update_archetype_params, break_out, decompose_freeform stub). |
| `convex/projectChat.ts` | Orchestrator now reads `focusedPartRole` from the client, passes it to the designer. Handles the archetype-generation path separately from the refinement path. |
| `convex/revisions.ts` | Snapshot now writes `parts[]` + `interfaces[]` + `scope` instead of a single `specSnapshot`. |
| `convex/exportDxf.ts` | Takes `partId` (or `projectId` → iterates), generates one DXF per part. |
| `convex/partSpecs.ts` | Kept for legacy single-part projects. `isMultiPart === false` routes go here. |

---

## Back-compat

Legacy single-part projects (`isMultiPart: false`) continue to work with today's UI. New projects go through the wizard. We do not migrate old projects automatically. Later we can add a "Convert to multi-part" button that wraps the existing spec as a single-part assembly with `archetypeId = null`.

---

## Testing strategy

Convex dev deployments can be scripted against, so:

- **Unit tests** (pure functions — in `convex/lib/__tests__/`):
  - Each archetype's `generate` for a spread of param inputs produces valid parts + interfaces
  - Each assembly rule fires correctly on known-bad inputs
  - `select_archetype` tool picks the expected archetype for 10+ canonical user intents
- **Integration** (real Convex deployment):
  - New project with tennis-ball-locker intent ends with `hinged_enclosure` + 6 parts + 5 interfaces
  - `update_archetype_params` changing innerWidth regenerates correct part dimensions without losing user tweaks
  - `break_out` disables regeneration and allows free part edits
- **Manual smoke**:
  - Run the canonical tennis-ball-locker flow end-to-end in the browser; verify assembled canvas, all per-part DXFs, interface list, scope editor

---

## Resolved open questions (2026-04-24)

1. **Break-out semantics → clear params.** `break_out` sets both `archetypeId = null` and `archetypeParams = null`. Rationale: "break out" semantically means diverging from the template; keeping stale params as "hints" creates confusion when the user has since edited part DSLs past the param's implied shape. After break-out the project is just N parts and M interfaces the user maintains directly; the agent can still `refine_part` and `add_feature_to_part` but cannot regenerate from intent until v2.
2. **Interface editing → chat-only in v1.** No explicit "Add interface" form. Users request interface changes via chat (*"add a bolted connection between the lid and the front wall"*); the agent calls `add_interface` internally. This keeps the UI simple and consistent with the agent-driven experience. If it becomes a friction point post-launch, a form is a cheap addition.
3. **Three.js perf → not a blocker for v1.** Starter archetypes max out around 12 parts (divided_tray with 6 dividers). In-browser Three.js handles that trivially. If a user scales `divided_tray` to 20+ dividers in a single project, perf might degrade; we'll ship an advisory warning if `parts.length > 30` and optimize then.
4. **Position precision → single `position` field, compute mating frames on demand.** Each part has one 6-DOF `position` in the assembly frame. The exact world-space positions of mating holes (used by `hole_pattern_match` validation) are computed from `position + dsl` at validation time. Rationale: avoids dual-source-of-truth bugs, keeps the schema simple, recomputation is cheap (sub-millisecond for ≤20 parts).

---

## Acceptance test

The canonical tennis-ball-locker end-to-end in one session:

1. User opens `/studio`, clicks **New Project**.
2. Fills wizard:
   - Use case: "Outdoor lockers for a tennis club to store 3 balls per rental."
   - Environment: Outdoor, Waterproof
   - Tier: Commercial
   - Reference scale: "3 tennis balls, ~12×12×12 inches inside"
   - Intent: "Locker with hinged top, keypad lock, stackable."
3. Agent silently selects `hinged_enclosure`, fills params (inner 12×12×12, 0.090" stainless, black powder coat, top-hinged, cam_lock placeholder for now since keypad needs slice 7).
4. Workspace opens: 6 parts visible in the left rail, assembled isometric renders in the canvas, rules strip shows passes on material (stainless → outdoor OK), fastener-clearance, hole-pattern-match.
5. User says in chat: *"make the walls taller, 16 inches instead of 12."* Agent calls `update_archetype_params` with `innerHeight: 16`. All 4 walls regenerate at the new height; re-validation passes.
6. User focuses `lid` in the part list and types *"add a 1-inch drain hole in the center of the lid."* Agent calls `refine_part("lid", { features: [... new hole feature ...] })`. Just the lid updates.
7. User clicks the header info-i chip, dismisses the popover (doesn't break out).
8. User clicks **Export** → sees 6 DXF download buttons, one per part.

If every step above works without errors, slice 1 is done.

---

## Out-of-slice but in-roadmap

These are NOT in this slice, but the design accommodates them without rework:

- Cost/BOM (slice 2): `parts` + `interfaces` already carry material/qty/hardware refs → trivial roll-up
- Mixed materials (slice 3): add a `material` field to parts that isn't a sheet-metal enum; rules gain material-compat checks
- Electronics (slice 7): new part kind, new interface kind (connector / mounting standoff)
- Export bundle (slice 4): iterate parts + interfaces to produce the zip
- Free-form (slice C): `decompose_freeform` implemented, `archetypeId = null` allowed from the start
- Photoreal (later): the same `position` values feed a higher-fidelity renderer

---

## Glossary

- **Archetype** — a parametric template producing a starter `{ parts, interfaces, positions }` tuple.
- **Interface** — a typed relationship between two parts (bolted, hinged, riveted, PEM-inserted).
- **Scope** — the project-level intent envelope (tier, environment, use case, reference scale).
- **Break out** — setting `archetypeId = null` so the project is treated as free-form (regeneration disabled in v1; enabled in v2).
- **Focused part** — the part currently selected in the left rail; chat messages scope to it unless overridden.
