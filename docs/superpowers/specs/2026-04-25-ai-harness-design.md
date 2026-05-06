# AI Harness Design

**Date:** 2026-04-25
**Status:** Superseded by [ADR-0001](../../adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md) (CAD IR Backbone is the canonical architecture). Carve-outs from this spec are retained per ADR-0001 §"Retained from AI Harness Design": `ProcessPlugin<TDsl>` contract, `runAgentRepairLoop`, two-tier validation loop, orchestrator state machine, and the Convex tables `violations` / `escalations` / `planEvents` / `parts`.
**Supersedes (in part):** the per-kind dispatch in `assemblyDesigner.ts` + `partValidator.ts` (this spec migrates them).
**Companion to:** `docs/roadmap/2026-04-24-platform-vision.md` (this spec is the architecture for the harness that delivers slices 1–5 of the roadmap and prepares the ground for later slices).

---

## Goal

Design the AI harness that turns intent ("a rental locker for tennis balls, outdoor, commercial grade") into a buildable, manufacturable assembly across the three accessible processes Fabware ships first:

1. **Sheet-metal** — laser-cut flat patterns + bends (K-factor)
2. **3D printed** — FDM/SLA parts
3. **Hardware-assembly** — purchased / catalog parts (McMaster today)

Two things the harness must do, equally:

- **Build the designs.** Decompose intent → parts → DSL → previews → exports.
- **Make sure they can be made.** Run manufacturability rules per part and across the assembly; auto-fix mechanical violations; escalate judgment calls to the user.

---

## Architecture overview

Three layers, all running in Convex:

```
┌───────────────────────────────────────────────────────────────────┐
│  Orchestrator action  (one per project, durable, resumable)       │
│  • Owns: scope answers, parts list, interfaces, design plan       │
│  • Decomposes intent → parts (archetype now, free-form later)     │
│  • Schedules specialists, runs assembly-level validation          │
│  • Surfaces escalations to the user                               │
└───────────────────┬─────────────────────────────────┬─────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  Specialist actions (per part)│   │  Assembly validator           │
│  • One Convex action per kind │   │  • Runs cross-part rules      │
│    (sheet, printed, asm)      │   │    (interface match, BOM      │
│  • Owns: that process's DSL,  │   │    consistency, env rules)    │
│    rules, tools, repair loop  │   │  • Returns assembly violations│
└───────────────────────────────┘   └───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  Process plugins (data + pure functions, no Convex coupling)      │
│  sheet-metal · printed · hardware-assembly                        │
│  Each exposes the uniform Plugin contract (next section).         │
└───────────────────────────────────────────────────────────────────┘
```

### Key invariants

- **Plugins are pure modules.** No Convex, no Anthropic. They expose schemas, rules, validators, exporters as plain TS. Specialists/orchestrator import them.
- **Every part has exactly one process.** A bent bracket is a single sheet-metal part with bends, not a "sheet + bend" composite. Bending is a sheet-metal capability inside the same plugin.
- **The orchestrator never edits part DSL directly.** Only specialists do, through their plugin's tools. Process knowledge stays contained.
- **Two-tier rules feedback** lives at two scopes: per-part (inside the specialist's repair loop) and assembly-wide (the orchestrator's loop after all parts return).
- **Adding a new process** (CNC, welding, acrylic, gaskets) means writing a new plugin module that satisfies the same contract — no orchestrator changes.

---

## The plugin contract

Every plugin exports the same shape (sketch, types finalized in implementation):

```ts
interface ProcessPlugin<TDsl> {
  kind: 'sheet-metal' | 'printed' | 'hardware-assembly';

  // 1. Data
  dslSchema: ZodSchema<TDsl>;                  // part-data shape for this process
  archetypes?: ArchetypeSet<TDsl>;             // optional starter shapes

  // 2. Agent surface
  tools: AgentTool[];                          // add_X_part, refine_X_part, …
  systemPromptFragment: string;                // process-specific guidance
  defaultModel?: { model: string; effort: 'low'|'med'|'high' };

  // 3. Validation (the two-tier engine)
  rules: Rule<TDsl>[];                         // manufacturability rules
  validate(dsl: TDsl, ctx: PartContext): Violation[];
  autoRepair(dsl: TDsl, v: Violation): TDsl | null;  // null = not repairable

  // 4. Outputs
  renderPreview(dsl: TDsl): ThreePreview;      // mesh for AssembledView
  export(dsl: TDsl): ExportArtifact[];         // DXF/STL/cart-line/…
  estimateCost(dsl: TDsl, ctx: PartContext): CostBreakdown;

  // 5. Inter-part vocabulary
  supportedInterfaces: InterfaceKind[];        // ['bolted', 'pem', 'riveted', 'hinge'] etc.
}

interface Rule<TDsl> {
  id: string;                                  // e.g. 'sheet.hole-too-close-to-bend'
  severity: 'error' | 'warn';
  check(dsl: TDsl, ctx: PartContext): Violation | null;
  tier: 'auto-fixable' | 'requires-judgment'; // drives the two-tier loop
  judgmentPrompt?: (v: Violation) => string;  // for requires-judgment rules
}

interface Violation {
  ruleId: string;
  severity: 'error' | 'warn';
  message: string;            // human-readable for chip UI
  agentMessage: string;       // imperative for the agent: "Move hole H3 to ≥3.2mm from bend B1"
  suggestedFix?: unknown;     // structured proposed change
  location?: GeometryRef;     // for chip-on-3D highlighting
}
```

### What this buys

1. Adding bending/K-factor properly is editing the `sheet-metal` plugin (extend DSL with `bends[]`, add K-factor rules, extend exporter to compute bend allowance) — *not* changing the orchestrator, agent loop, or any other plugin.
2. The orchestrator stays small. Its job is "for each part, look up its plugin, call it." Pure dispatch.
3. Tests fall out naturally. Each plugin can be tested in isolation with fixture DSLs — no Convex, no Anthropic, no UI.

### `autoRepair` vs agent-driven repair

`autoRepair` is a pure function for rules where the fix is mechanical and unambiguous (move a hole 1mm, bump a wall 0.4mm). For rules where the geometry is ambiguous (which of three holes to move?), `autoRepair` returns `null` and the orchestrator hands the violation back to the specialist as a regular tool-loop turn. The two-tier loop (below) handles both paths.

---

## Orchestrator state machine + design plan

The orchestrator is a Convex action that runs against a persistent **design plan** stored in the existing `projects` table (extended). The plan is the project's authoritative state; the orchestrator reads it, schedules work, writes it back.

### Phases

```
[scoping] ──► [decomposing] ──► [designing] ──► [validating] ──► [exporting] ──► [done]
    ▲              │                  │                │
    │              │                  │                │
    └──────────────┴──────────────────┴────────────────┘
              user escalation (any phase, any time)
```

| Phase | Driver | Produces | Exit condition |
|---|---|---|---|
| **scoping** | scope wizard (#5) | `scope` answers | user submits or chats answers |
| **decomposing** | orchestrator + agent's `select_archetype` (v1) or `decompose_freeform` (v2) tool | `parts[]` skeletons + `interfaces[]` | parts list approved (auto if confidence high, else user confirms) |
| **designing** | per-part specialists, parallel where possible | populated `dsl` per part, per-part violations resolved or escalated | every `part.status ∈ {ok, escalated}` |
| **validating** | assembly validator | assembly violations resolved or escalated | every assembly violation `∈ {resolved, escalated}` |
| **exporting** | export bundle (#8) | zip artifact | artifact written |

User edits at any time can bounce the project back to an earlier phase (e.g., changing tier in scope re-runs designing for affected parts).

### The design plan (persisted shape)

```ts
projects: {
  // existing fields …
  phase: 'scoping' | 'decomposing' | 'designing' | 'validating' | 'exporting' | 'done',
  scope: ScopeAnswers | null,           // tier, env, users, reference scale, etc.
  archetypeId: string | null,           // v1: required; v2: nullable for free-form
}

parts: {                                // already exists from Slice 1/2
  // existing fields …
  kind: 'sheet-metal' | 'printed' | 'hardware-assembly',
  dsl: ProcessSpecificDsl,
  status: 'pending' | 'designing' | 'ok' | 'escalated' | 'failed',
  lastValidationAt: number,
}

interfaces: { … }                       // already exists; gains validation status

violations: {                           // NEW — first-class, queryable
  projectId, partId | null,             // null = assembly-level
  ruleId, severity, tier,
  message, agentMessage, location,
  status: 'open' | 'auto-repaired' | 'escalated' | 'dismissed',
  resolution: { kind, by: 'agent' | 'user', at, note } | null,
}

escalations: {                          // NEW — open questions for the user
  projectId, sourceViolationId | null,
  question, suggestedAnswer, choices?,
  status: 'open' | 'answered',
  answer: string | null,
}

planEvents: {                           // NEW — append-only audit log
  projectId, at, kind, payload,         // 'phase-changed' | 'specialist-ran' | 'auto-repaired' | …
}
```

### Orchestrator loop (one tick per Convex action invocation)

```
1. Read project + open violations + open escalations.
2. If any open escalation → wait (UI shows it, user answers via chat).
3. Else compute current phase from project state.
4. Run that phase's step:
   - scoping: nothing (chat/wizard advances it)
   - decomposing: invoke decomposition agent → write parts[] + interfaces[]
   - designing: schedule specialist actions for parts with status='pending'
                or status='ok' but newer scope/interface invalidated them
   - validating: run assembly validator → write violations
   - exporting: build bundle
5. Specialist completion (separate action) → re-invokes orchestrator tick.
```

The loop is event-driven, not a long-running process. Every tick is short (read state, dispatch, write state, return). Convex schedulers chain ticks.

### Why this shape

- **Resumable for free.** Crash mid-design? Next tick reads state and continues. No in-memory loop.
- **Parallel by default.** `designing` can fan out N specialist actions in parallel; orchestrator joins via the standard Convex pattern when each completes.
- **UI is a query.** The chat/canvas reads `project + parts + violations + escalations` via Convex queries; no orchestrator coupling. Live updates fall out.
- **Test surface is the plan.** Drive the orchestrator with a fixture plan, assert on the plan after N ticks. No need to mock Anthropic for state-machine tests.

---

## Agent layer

### Roles

| Role | When it runs | Tools | Model/effort default |
|---|---|---|---|
| **Orchestrator agent** | `decomposing` phase; escalation synthesis | `select_archetype`, `decompose_freeform` (v2), `propose_interfaces`, `phrase_escalation`, `decide_make_or_buy` | Sonnet 4.6, **high** |
| **Specialist agents** (one per plugin) | `designing` phase, including auto-repair turns | only that plugin's tools | Sonnet 4.6, **med** (low for repair turns) |
| **Assembly validator** (mostly not an agent) | `validating` phase | pure code; agent only invoked to *synthesize* a multi-violation summary or escalation question | Sonnet 4.6, **low** |

The "per-message model + effort" knob already shipped feeds these defaults but stays user-overridable per turn.

Resolution order for model + effort on any given call: **plugin `defaultModel`** (most specific, e.g. printed parts may use a higher-effort default) → **role default** (the table above) → **per-message override** (user knob). Orchestrator and assembly-validator calls have no plugin context, so they fall straight to the role default.

### System prompt assembly

Every agent call gets a system prompt built from layered fragments — composed at call time, not stored:

```
[1] Global Fabware preamble        (tone, jerry/MVP/commercial tier model, never-fabricate rule)
[2] Role preamble                  (orchestrator | specialist:<kind> | escalation)
[3] Project scope summary          (scope answers, environment, reference scale, tier)
[4] Plugin systemPromptFragment    (for specialists only — process-specific guidance)
[5] Local context                  (this part's DSL, peer-parts summary, interfaces it touches)
[6] Turn intent                    (free design | repair these violations | answer this escalation)
```

Layered, not concatenated-blob. Each fragment is a typed string the orchestrator constructs from plan state, so there's one source of truth for "what does the agent know right now."

### Tool routing

**Rule:** an agent only ever sees tools from one plugin per call (specialists) or only orchestration tools (orchestrator). Cross-process work happens by the orchestrator scheduling a different specialist, not by one agent calling another's tools.

Implication: the existing `add_printed_part` / `add_purchased_part` / `decide_make_or_buy` / `add_sheet_part` tools get split apart — each lives only in its specialist's tool set. `decide_make_or_buy` becomes an **orchestrator-level** tool (it's a cross-plugin decision). Migration step.

### Repair-turn prompt

When the orchestrator hands violations back to a specialist for auto-repair, the specialist gets a stripped-down repair prompt:

```
[1] Global preamble
[2] Specialist role + plugin fragment
[3] Project scope summary
[4] Current part DSL
[5] These violations (agentMessage + location for each)
[6] "Apply minimal mechanical fixes via your tools. Do not redesign.
    If a violation cannot be fixed mechanically, leave it open with a note."
```

Lower effort, narrower tool budget (max N tool calls — config), no chat surface to user.

### Escalation phrasing

When a `requires-judgment` violation surfaces, the orchestrator runs a tiny low-effort agent call:

```
"Phrase this violation as a question for the user. Include:
 - what's wrong, in one sentence,
 - the most likely answer (so they can hit 'yes'),
 - 1-3 alternative answers if applicable.
 Output the escalation JSON."
```

Output lands in the `escalations` table. UI renders it as an inline chat card. User clicks an answer (or types one) → orchestrator re-ticks.

### What this leaves out (intentionally)

- **No multi-agent chat.** Specialists never talk to each other. All cross-part coordination flows through the orchestrator + plan.
- **No agent for export.** Export is pure code over the plan + per-plugin `export()` calls.
- **No agent for cost.** Cost is pure code over per-plugin `estimateCost()` calls.

---

## Rules engine + two-tier loop

### Where rules live

Each plugin owns a **rule pack** — a TS module that exports `rules: Rule<TDsl>[]`. Rule packs are pure (no Convex, no I/O). They live in the plugin module:

```
lib/plugins/sheet-metal/
  index.ts              ← exports the ProcessPlugin
  dsl.ts                ← Zod schema
  rules/
    index.ts            ← exports rules: Rule<SheetDsl>[]
    bend-clearance.ts   ← one rule per file
    hole-edge-distance.ts
    min-flange.ts
    kfactor-required.ts ← #1 from roadmap, lives here
    ...
  validator.ts          ← runs the pack, returns Violation[]
  auto-repair.ts        ← per-rule mechanical fixes
  preview.ts
  export.ts
  cost.ts
  tools.ts              ← agent tool definitions
  prompts.ts            ← systemPromptFragment
  archetypes/
```

Per-process knowledge is colocated, not scattered across the codebase by concern.

### Rule shape (concrete example)

```ts
export const holeEdgeDistance: Rule<SheetDsl> = {
  id: 'sheet.hole-edge-distance',
  severity: 'error',
  tier: 'auto-fixable',
  check(dsl, ctx) {
    for (const hole of dsl.holes) {
      const d = distanceToNearestEdge(hole, dsl.outline);
      const min = 1.5 * hole.diameter;
      if (d < min) return {
        ruleId: 'sheet.hole-edge-distance',
        severity: 'error',
        message: `Hole ${hole.id} is ${d.toFixed(2)}mm from edge; min ${min.toFixed(2)}mm`,
        agentMessage: `Move hole ${hole.id} so its center is ≥${min.toFixed(2)}mm from any outline edge.`,
        location: { kind: 'hole', id: hole.id },
        suggestedFix: { holeId: hole.id, newCenter: pushAwayFromEdge(hole, dsl.outline, min) },
      };
    }
    return null;
  },
};

export const autoRepairHoleEdgeDistance: AutoRepair<SheetDsl> = (dsl, v) => {
  if (v.ruleId !== 'sheet.hole-edge-distance' || !v.suggestedFix) return null;
  return moveHole(dsl, v.suggestedFix.holeId, v.suggestedFix.newCenter);
};
```

Rules are small, single-purpose, individually testable with fixture DSLs.

### Rule scopes

Three scopes, all using the same `Rule` shape but different `check` signatures:

- **Part-rule** — `check(dsl, partCtx)` — runs inside the specialist
- **Interface-rule** — `check(interface, partA, partB)` — runs in assembly validation; e.g. "bolt pattern on panel A matches matching face on panel B"
- **Assembly-rule** — `check(project, parts, interfaces)` — runs in assembly validation; e.g. "every part's material is compatible with the declared environment"

Plugins contribute mostly part-rules and the interface-rules for interfaces they support. Assembly-rules live in a small core rule pack the orchestrator loads (env compatibility, BOM consistency, weight totals).

### The two-tier loop, step by step

Per part (inside specialist after a design turn):

```
loop (max R repair turns, R configurable, default 3):
  violations = plugin.validate(part.dsl, ctx)
  if violations.empty: mark part 'ok', exit
  partition violations by tier:
    auto      = tier == 'auto-fixable'
    judgment  = tier == 'requires-judgment'
  for v in auto:
    repaired = plugin.autoRepair(part.dsl, v)
    if repaired: part.dsl = repaired; record planEvent('auto-repaired', v)
    else: demote v to 'agent-repair'  // null repair → next bullet
  if any 'agent-repair' violations:
    next agent turn = repair-prompt with those violations
    (consumes one of the R repair turns, then loop again)
  if judgment.nonempty:
    for v in judgment:
      run escalation-phrasing agent → write to escalations
    mark part 'escalated', exit
loop end (budget exhausted):
  any remaining violations → mark part 'escalated' with 'repair budget exhausted' note
```

Per assembly (inside orchestrator after all parts return):

```
violations = assemblyValidator.run(project, parts, interfaces)
auto-repair where the affected plugin can repair (e.g. interface: bump fastener size)
remaining → escalations
```

### Two design choices worth flagging

1. **Mechanical auto-fixes can cascade.** Moving a hole 1mm to satisfy edge-distance might break bolt-pattern interface-match on the mating part. So after any auto-repair, the plan re-runs validation on the changed part **and any interface-linked peer parts**. Cap the cascade depth (default 2) to avoid loops; if exceeded, escalate.
2. **Rule severity vs tier are independent.** A rule can be `severity: 'warn' + tier: 'requires-judgment'` (UV-stable material warning that's actually a scope question) or `severity: 'error' + tier: 'auto-fixable'` (hard failure with an obvious fix). Don't conflate them.

### What's deferred (rules engine)

- **Rule weighting / prioritization.** All rules treated equal for now. Add weights later if rule conflicts pile up.
- **Rule disable per-project.** Useful escape hatch ("I know this hole is close to the edge, ship it") but not in v1.
- **Constraint-solver-style rules.** Pure-function check + repair is sufficient for the rules we know about.

---

## Migration sequence

Five steps, each a reviewable gate. Tests stay green at every step.

### Step 0 — Plugin contract + orchestrator scaffold

- Land `lib/plugins/types.ts` (the `ProcessPlugin`, `Rule`, `Violation` types).
- Land `lib/orchestrator/` (state-machine action, design plan reads/writes, escalation queue) — wired but not yet driving any project.
- Add `violations`, `escalations`, `planEvents` Convex tables (additive; no existing data touched).
- New projects flag-gate to the new orchestrator path; existing projects keep using `assemblyDesigner` action untouched.

**Gate:** existing flows unchanged; new orchestrator passes a no-op fixture (empty plan → done).

### Step 1 — Sheet-metal plugin (the proof)

- Move sheet-metal DSL, validator, archetypes, preview, export, cost into `lib/plugins/sheet-metal/`.
- Author the rule pack — start by porting whatever's in `scsRules.ts` into individual `Rule` files. Tag tier per rule.
- Sheet-metal specialist action: thin wrapper that loads the plugin, runs the agent loop with only sheet tools, returns part DSL + violations.
- Orchestrator routes sheet-metal parts to the new specialist when `useNewHarness` flag set.

**Gate:** tennis-ball-locker example (sheet-only subset) produces the same DXFs under the new harness as the old.

### Step 2 — 3D-print plugin

- Same shape, smaller surface. `lib/plugins/printed/` with DSL, rules (min wall, overhang angle, bridging length, base layer), STL exporter, FDM/SLA cost models.
- Specialist + tool routing.

**Gate:** any project with a printed part round-trips through the new harness with the same STL output as Slice 2.

### Step 3 — Hardware-assembly plugin

- `lib/plugins/hardware-assembly/` wraps the McMaster catalog + lookup logic.
- Tools: `lookup_mcmaster`, `pick_fastener_for_hole_pattern`, `add_purchased_part`.
- `decide_make_or_buy` migrates **up** to the orchestrator (it's cross-plugin).
- Interface-rule contributions: `bolted`, `pem`, `riveted`, `hinge` validation.

**Gate:** existing McMaster-suggest flow works under the new harness; cart export unchanged.

### Step 4 — Bending (#1 from roadmap, net new)

Inside `sheet-metal` plugin (not a new plugin — bends are a sheet-metal feature):

- Extend `SheetDsl` with `bends[]` (bend lines, axis, angle, radius).
- Add per-material K-factor table (data file; values from SCS docs).
- New rules: `kfactor-required` (every bend has K-factor resolved), `bend-clearance` (hole/feature distance from bend line ≥ thresholds), `min-flange-after-bend`, `bend-radius-vs-thickness`, `bend-direction-consistency`.
- Tools: `add_bend`, `set_bend_angle`, `set_bend_radius`.
- Exporter: develop flat pattern using K-factor; emit fold lines as DXF construction lines SCS recognizes.
- Three.js preview: show folded geometry from flat pattern + bends.

**Gate:** can design a bent bracket end-to-end (intent → bent part → DXF SCS accepts).

### Step 5 — Cleanup

- Flip `useNewHarness` default to true.
- Delete `assemblyDesigner.ts` and the per-kind dispatch in `partValidator.ts`.
- Drop the flag.

Each step is one PR (or a small handful), reviewable, with the existing test suite + the worked example as its gate.

---

## Testing strategy

| Layer | What's under test | How |
|---|---|---|
| **Plugins (unit)** | DSL → violations, DSL → repaired DSL, DSL → preview, DSL → export, DSL → cost | Pure-function tests with fixture DSLs. No Convex, no Anthropic. Per-rule fixture: minimal DSL that triggers exactly that rule. |
| **Orchestrator (state machine)** | Plan transitions, escalation routing, repair cascade, parallel fan-out | Drive `orchestrator.tick` against a fixture project with stubbed specialist actions returning canned `{partDsl, violations}`. No Anthropic. |
| **End-to-end (worked example)** | Tennis-ball locker (sheet-only subset → full mixed build) | One e2e test per slice that runs the real orchestrator + real specialists + a recorded Anthropic transcript (cassette) so it's reproducible without burning tokens. |

Per-rule fixture DSLs become the rule pack's test suite — adding a rule means adding its fixture. Catches regressions when DSL evolves.

---

## Explicit non-goals

This design **does not** cover:

- **Free-form decomposition** (`decompose_freeform`). Stays archetype-only; the orchestrator/data are *built to support free-form later* (per the existing "B leads to C" commitment in `docs/roadmap/2026-04-24-platform-vision.md`), but no agent-driven free-form in this spec.
- **Welding / CNC / acrylic / gaskets / mesh** — future plugins, not in scope.
- **Photoreal renders.** Three.js isometric only.
- **FEA / thermal / drop simulation** (#15 in the roadmap).
- **Tolerance stackup** (#16).
- **Electronics integration** (#7) — too big, separate spec.
- **Environmental rule pack** (waterproof / IP / UV) (#14) — slot in later as an assembly-level rule pack; not this spec.
- **Multi-user / team features.**
- **Cost catalog expansion** (#3 beyond seed) — orchestrator + plugins will *consume* a richer catalog when it lands; not building it here.
- **Authoring UI for rules.** Rules are TS files developers edit, not user-editable.
- **Auto-fix audit-trail UI surface.** `planEvents` is captured; surfacing it in chat/canvas can come later.

---

## Open questions to resolve during implementation (not blockers)

1. Repair-budget `R` — start at 3, tune from real runs.
2. Cascade-depth cap for re-validation — start at 2.
3. Whether to expose plan-event log in the chat as a collapsible "what the agent did" panel.
4. Whether `assemblyValidator` runs eagerly after each part finishes vs only after all parts settle. Eager is more responsive but more compute. Default lazy; revisit.

---

## Links

- Platform vision (subsystem map, sequencing, tiering): `docs/roadmap/2026-04-24-platform-vision.md`
- Slice 1 spec (sheet-metal assembly archetypes): `docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md`
- Existing high-level plan: `docs/PLAN.md`
- SCS scraping notes (background for sheet-metal rules + K-factor): `docs/SCS-SCRAPE.md`
