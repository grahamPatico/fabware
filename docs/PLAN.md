# Fabware — Plan (2026-04-23)

> AI harness for hardware. Idea → manufacturable part → partner handoff (SendCutSend first, McMaster for off-the-shelf assembly parts).

## Thesis

Most hardware projects stall at the gap between "I know what I want" and "I have a DXF / BOM a fabricator will accept." Fabware collapses that gap. The user describes the part in plain English (or pastes a reference image), Fabware produces a parametric part, validates against real manufacturing rules, emits a process-specific export (DXF today, STEP/3MF later), and assembles the rest of the bill of materials from standard catalogs (McMaster-Carr today).

## Inherited from the Replit prototype (Hardware-Genesis)

Keep and extend:

- **Part DSL** (`artifacts/api-server/src/lib/dsl.ts`) — version-1 zod schema for bracket/plate/enclosure/angle/channel/tab/gusset with hole/bend/slot/fillet features
- **SCS rules engine** (`scsRules.ts`) — materials catalog, thicknesses, powder-coat colors, rule validation + snap-to-valid
- **Feature graph + DXF generator** (`featureGraph.ts`, `dxfGenerator.ts`)
- **AI designer agent loop** (`aiDesigner.ts`) — Claude Sonnet 4.6, tool use (`validate_dsl`, `submit_final`)
- **Revision history** (`routes/revisions.ts`) — part revisions per project
- **Workspace UI** — chat left / canvas right, `RulesStatusStrip`, `HistoryPanel`, `GuidedInputPanel`, `FoldedPreview`

Monorepo shape to preserve:

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/api-zod/` — zod schemas (orval-generated from OpenAPI)
- `lib/api-client-react/` — React Query hooks (orval-generated)
- `lib/db/` — Drizzle schemas (Postgres)
- `artifacts/api-server/` — Express server
- `artifacts/hardwareai/` — Vite + React + shadcn/ui frontend

## This iteration — scope

### 1. Rebrand Hardware-Genesis → Fabware

- Replace in-UI strings: header title, system prompt product name, README, replit.md → README.md
- Package names: `@workspace/*` → keep internal scope but rename artifact names where user-visible
- Update OpenAPI `info.description`

### 2. McMaster-Carr assembly parts

McMaster has no public API and blocks scraping; realistic integration is:

- Users enter a McMaster part number (e.g. `91251A540`); we store it and deep-link to the product page
- Optional fields: display name, category, quantity, notes, attached STEP/PDF (user-downloaded)
- No auth/gating yet (per user request — move fast, add later)

Schema: `assembly_parts` table, scoped by `project_id`, fields:

- `id`, `project_id`, `mcmaster_part_number`, `name`, `category` (enum), `quantity`, `notes`, `created_at`, `updated_at`

Routes (hand-rolled zod, skip orval regen this iteration):

- `GET /projects/:id/assembly-parts` — list
- `POST /projects/:id/assembly-parts` — create
- `PATCH /projects/:id/assembly-parts/:partId` — update
- `DELETE /projects/:id/assembly-parts/:partId` — delete
- `GET /assembly-parts/mcmaster/:partNumber` — resolve deep-link URL + basic metadata (URL pattern is deterministic; no scraping)

DSL extension: add optional `assemblyRefs: [{ mcmasterPartNumber, quantity, role }]` to `PartDsl` so the AI designer can attach fasteners to a part (e.g. "four 1/4-20 SHCS for mounting holes").

UI: new `AssemblyPartsPanel` rendered in the workspace below `GuidedInputPanel`. List + "Add McMaster part" form + per-row deep-link chip.

AI awareness: append a McMaster section to the system prompt with common categories (socket-head cap screws, hex nuts, washers, bearings, linear rails, pneumatic fittings, extrusion, etc.) and teach the agent that when the user says "add four 1/4-20 mounting screws" it should call a new `add_assembly_part` tool with part number + quantity. Start with a small hardcoded lookup (12–20 common fasteners → McMaster part number) so the agent can answer without calling out; this list grows over time.

### 3. Seed McMaster lookup table

`lib/db/src/schema/mcmasterSeed.ts` (or inline constant) — a small curated list of the ~20 most-common fasteners with part number, display name, category, canonical description. Enough to demo the flow without needing a live McMaster integration. A future `mcmaster_cache` table can hold resolved metadata per part number as users enter new ones.

## Out of scope (explicitly deferred)

- User accounts, login, org/team gating
- Live McMaster metadata scraping (legal + rate-limit issues; revisit with aggregator license like Part Analytics)
- STEP file upload/storage for assembly parts
- 3D-print / laser / CNC exporters
- Shared gallery, public project pages
- Billing
- Fabware brand system (logo, landing page) — stub header only

## Manual steps (user must do)

- Create GitHub org **`fabware`** via https://github.com/organizations/new — the GitHub API/CLI does not support org creation
- Once the org exists, transfer the repo: `gh repo transfer grahamPatico/fabware fabware`
- For now the repo will live at `grahamPatico/fabware`

## Roadmap after this iteration

1. Live McMaster part-number resolver (cache metadata on first-seen)
2. Assembly-level validation (clearance holes match screw size; thread engagement vs. material thickness)
3. Process pack #2: 3D printing (FDM) — STL export + bambu/prusa best-practice rules
4. Process pack #3: bending + powder coat details already in SCS — harden them
5. Scrape SCS published capabilities into the rules engine (materials × thicknesses × finishes × pricing)
6. Company shell: landing page, waitlist, brand, auth, Convex or Postgres+auth plumbing
