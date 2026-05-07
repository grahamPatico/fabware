---
phase: 3
slug: hardware-spec-holes
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Documented retroactively against the branch `feat/cad-ir-phase-3` (tip `b699b4e`).

Authoritative plan: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-3.md`.

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
| 3-01 | 03 | 1 | HARDWARE-01 | HoleFeature subtype TS surface compiles | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 3-02 | 03 | 1 | HARDWARE-01 | Zod superRefine accepts/rejects subtypes correctly | unit | `vitest run convex/cad/ir/__tests__/schema.test.ts` | ✅ | ✅ COVERED |
| 3-03 | 03 | 1 | HARDWARE-01 | CounterSinkHole codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-hole.test.ts` | ✅ | ✅ COVERED |
| 3-04 | 03 | 1 | HARDWARE-01 | CounterBoreHole codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-hole.test.ts` | ✅ | ✅ COVERED |
| 3-05 | 03 | 1 | HARDWARE-01 | Threaded hole codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-hole.test.ts` | ✅ | ✅ COVERED |
| 3-06 | 03 | 1 | HARDWARE-01 | mfg.bolt-clearance fires on tight bolt-stack | unit | `vitest run convex/cad/validate/__tests__/rules-boltClearance.test.ts` | ✅ | ✅ COVERED |
| 3-07 | 03 | 1 | HARDWARE-01 | add_feature tool schema covers all 4 hole subtypes | unit | `vitest run convex/cad/patch/__tests__/tools.test.ts` | ✅ | ✅ COVERED |
| 3-08 | 03 | 1 | HARDWARE-01 | System prompt teaches subtype selection | manual | prompt review | ⚠️ manual | manual: prompt review |
| 3-09 | 03 | 1 | HARDWARE-01 | Plugin tests still green; README updated | unit | `vitest run convex/cad/__tests__/plugin.test.ts` | ✅ | ✅ COVERED |

*Status: ⬜ pending · ✅ COVERED · ⚠️ manual · ❌ red*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest already present from Phase 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| System prompt teaches countersink/counterbore/threaded hole subtypes appropriately | HARDWARE-01 | qualitative prompt review | Read `artifacts/hardwareai/convex/cad/prompts.ts` after the commit; confirm the four subtypes are described with example bolt specs (M3/M5/etc.). |

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (retroactive — branch tip `b699b4e`).
