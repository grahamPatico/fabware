---
phase: 2
slug: patch-grammar-expansion
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Documented retroactively against the branch `feat/cad-ir-phase-2` (tip `e2f0e6a`).

Authoritative plan: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-29-cad-ir-phase-2.md`.

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
| 2-01 | 02 | 1 | PATCH-01 | modify_feature applier + Zod re-validation | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-02 | 02 | 1 | PATCH-01 | suppress / unsuppress applier | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-03 | 02 | 1 | PATCH-01 | reorder_feature with forward-ref rejection | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-04 | 02 | 1 | PATCH-01 | generic remove with orphan-ref rejection | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-05 | 02 | 1 | PATCH-01 | add_sketch applier | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-06 | 02 | 1 | PATCH-01 | modify_sketch applier | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 2-07 | 02 | 1 | PATCH-01 | All 9 Anthropic tool defs registered | unit | `vitest run convex/cad/patch/__tests__/tools.test.ts` | ✅ | ✅ COVERED |
| 2-08 | 02 | 1 | PATCH-01 | Specialist toolCallToPatch dispatches new tools | integration | covered transitively by `convex/cad/__tests__/repair-loop-multitool.test.ts` | ✅ | ✅ COVERED (transitive) |
| 2-09 | 02 | 1 | PATCH-01 | System prompt updated for new tools | manual | prompt review | ⚠️ manual | manual: prompt review |
| 2-10 | 02 | 1 | PATCH-01 | manufacturingTier composes rules/; min-wall-thickness fires | unit | `vitest run convex/cad/validate/__tests__/rules-minWallThickness.test.ts` | ✅ | ✅ COVERED |
| 2-11 | 02 | 1 | PATCH-01 | Multitool repair loop converges | integration | `vitest run convex/cad/__tests__/repair-loop-multitool.test.ts` | ✅ | ✅ COVERED |
| 2-12 | 02 | 1 | PATCH-01 | README + plugin test refresh | unit | `vitest run convex/cad/__tests__/plugin.test.ts` | ✅ | ✅ COVERED |

*Status: ⬜ pending · ✅ COVERED · ⚠️ manual · ❌ red*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest already present from Phase 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| System prompt fragment teaches the agent the new grammar | PATCH-01 | qualitative prompt review | Read `artifacts/hardwareai/convex/cad/prompts.ts` after the commit; confirm all 9 tools are referenced and grammar examples are accurate. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — vitest pre-existed)
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (retroactive — branch tip `e2f0e6a`).
