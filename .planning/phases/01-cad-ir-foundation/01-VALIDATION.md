---
phase: 1
slug: cad-ir-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Documented retroactively against the branch `feat/cad-ir-phase-1` (tip `d46ca95`).

Authoritative plan: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-29-cad-ir-phase-1.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `artifacts/hardwareai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @workspace/hardwareai test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30–60 s for the cad scope |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @workspace/hardwareai test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01 | 01 | 1 | CADIR-01 | Type surface compiles | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 1-02 | 01 | 1 | CADIR-01 | Zod schema parses valid + rejects invalid IR | unit | `vitest run convex/cad/ir/__tests__/schema.test.ts` | ✅ | ✅ COVERED |
| 1-03 | 01 | 1 | CADIR-01 | emptyIr() round-trips through schema | unit | covered by `convex/cad/ir/__tests__/schema.test.ts` | ✅ | ✅ COVERED |
| 1-04 | 01 | 1 | CADIR-01 | Expression parser tokenizes/parses correctly | unit | `vitest run convex/cad/expression/__tests__/parser.test.ts` | ✅ | ✅ COVERED |
| 1-05 | 01 | 1 | CADIR-01 | Evaluator catches cycles / div-by-zero / out-of-bounds | unit | `vitest run convex/cad/expression/__tests__/evaluator.test.ts` | ✅ | ✅ COVERED |
| 1-06 | 01 | 1 | CADIR-01 | Tier-1 validator flags refs/dups/forward refs | unit | `vitest run convex/cad/validate/__tests__/schemaTier.test.ts` | ✅ | ✅ COVERED |
| 1-07 | 01 | 1 | CADIR-01 | resolveIr produces a ResolvedIr | unit | `vitest run convex/cad/resolve/__tests__/resolveIr.test.ts` | ✅ | ✅ COVERED |
| 1-08 | 01 | 1 | CADIR-01 | extrude codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-extrude.test.ts` | ✅ | ✅ COVERED |
| 1-09 | 01 | 1 | CADIR-01 | cut_extrude codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-cut-extrude.test.ts` | ✅ | ✅ COVERED |
| 1-10 | 01 | 1 | CADIR-01 | fillet codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-fillet.test.ts` | ✅ | ✅ COVERED |
| 1-11 | 01 | 1 | CADIR-01 | chamfer codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-chamfer.test.ts` | ✅ | ✅ COVERED |
| 1-12 | 01 | 1 | CADIR-01 | simple-hole codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-hole.test.ts` | ✅ | ✅ COVERED |
| 1-13 | 01 | 1 | CADIR-01 | linear-pattern codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-pattern.test.ts` | ✅ | ✅ COVERED |
| 1-14 | 01 | 1 | CADIR-01 | Sandbox runner Python contract | manual | sandbox glb preview review | ⚠️ manual | manual: glb preview rendering |
| 1-15 | 01 | 1 | CADIR-01 | Sandbox executor TS wrapper | manual | covered transitively by repair-loop integration test | ✅ | ✅ COVERED (transitive) |
| 1-16 | 01 | 1 | CADIR-01 | entities parser parses report JSON | unit | `vitest run convex/cad/executor/__tests__/entitiesParser.test.ts` | ✅ | ✅ COVERED |
| 1-17 | 01 | 1 | CADIR-01 | Revision hash is stable + canonical | unit | `vitest run convex/cad/revisions/__tests__/hash.test.ts` | ✅ | ✅ COVERED |
| 1-18 | 01 | 1 | CADIR-01 | Convex schema additions compile | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 1-19 | 01 | 1 | CADIR-01 | Patch types union | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 1-20 | 01 | 1 | CADIR-01 | Patch applier (set_parameter + add_feature) | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 1-21 | 01 | 1 | CADIR-01 | Anthropic tool defs registered | unit | `vitest run convex/cad/patch/__tests__/tools.test.ts` | ✅ | ✅ COVERED |
| 1-22 | 01 | 1 | CADIR-01 | System prompt fragment | manual | golden prompt review (no automated cover) | ⚠️ manual | manual: prompt review |
| 1-23 | 01 | 1 | CADIR-01 | mfg.hole-edge-distance fires at Tier 4 | unit | `vitest run convex/cad/validate/__tests__/manufacturingTier.test.ts` | ✅ | ✅ COVERED |
| 1-24 | 01 | 1 | CADIR-01 | cadIrPlugin composes tier-1+4 validate | unit | `vitest run convex/cad/__tests__/plugin.test.ts` | ✅ | ✅ COVERED |
| 1-25 | 01 | 1 | CADIR-01 | Specialist action drives repair loop | unit | covered transitively by `convex/cad/__tests__/repair-loop-mock.test.ts` | ✅ | ✅ COVERED (transitive) |
| 1-26 | 01 | 1 | CADIR-01 | setUseCadIr mutation | manual | manual: convex dashboard mutation invocation | ⚠️ manual | manual: convex mutation |
| 1-27 | 01 | 1 | CADIR-01 | Repair loop converges on hole-edge violation | integration | `vitest run convex/cad/__tests__/repair-loop-mock.test.ts` | ✅ | ✅ COVERED |
| 1-28 | 01 | 1 | CADIR-01 | Bracket golden snapshot | snapshot | `vitest run convex/cad/codegen/__tests__/compile-bracket-golden.test.ts` | ✅ | ✅ COVERED |
| 1-29 | 01 | 1 | CADIR-01 | CadPreview renders glb | manual | glb viewer load in dev | ⚠️ manual | manual: glb preview rendering |
| 1-30 | 01 | 1 | CADIR-01 | Module README accuracy | manual | doc review | ⚠️ manual | manual: doc review |

*Status: ⬜ pending · ✅ COVERED · ⚠️ manual · ❌ red*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest already present, no new framework install needed. Sandbox Python (`build123d==0.7.0`) is pinned in `artifacts/hardwareai/scripts/sandbox/requirements.txt`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| glb preview renders in CadPreview component | CADIR-01 | three.js DOM rendering — no headless coverage in Wave 0 | Run `pnpm --filter @workspace/hardwareai dev`; load a part with a CAD revision artifact; inspect the preview pane. |
| Vercel Sandbox produces report.json from build123d run | CADIR-01 | external service — covered transitively by repair-loop integration test against a recorded report; live runs verified by hand during Phase 1 execution | Trigger a CAD IR specialist run with a real `VERCEL_API_TOKEN`; confirm `cad_revision_artifacts` row appears with non-empty `glbUrl`. |
| System prompt content is appropriate for the agent | CADIR-01 | qualitative prompt review | Read `artifacts/hardwareai/convex/cad/prompts.ts` against the spec § 11. |
| setUseCadIr mutation flips parts.useCadIr | CADIR-01 | Convex mutation — covered transitively by integration; manual sanity in dashboard | Invoke `setUseCadIr` from Convex dashboard; confirm `parts` row updates. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manuals are interleaved with covered tasks)
- [x] Wave 0 covers all MISSING references — vitest pre-existed, no new framework needed
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (retroactive — branch tip `d46ca95`).
