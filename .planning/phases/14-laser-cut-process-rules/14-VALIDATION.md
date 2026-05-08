---
phase: 14
slug: laser-cut-process-rules
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `artifacts/hardwareai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @workspace/hardwareai test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30 seconds (workspace) / a few minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @workspace/hardwareai test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01 | 14 | 1 | MFG-01 | — | mfg.laser-cut-min-hole flags sub-minimum holes only when `process === 'laser_cut'`. | unit | `pnpm --filter @workspace/hardwareai test validate/__tests__/rules-laserCutMinHole.test.ts` | ✅ | ✅ green |
| 14-02 | 14 | 1 | MFG-01 | — | mfg.laser-cut-min-slot flags sub-minimum slots only when `process === 'laser_cut'`. | unit | `pnpm --filter @workspace/hardwareai test validate/__tests__/rules-laserCutMinSlot.test.ts` | ✅ | ✅ green |
| 14-03 | 14 | 1 | MFG-01 | — | manufacturingTier composes new rules with process context; non-laser geometry passes cleanly. | integration | `pnpm --filter @workspace/hardwareai test validate/__tests__/manufacturingTier.test.ts __tests__/integration-phase10.test.ts __tests__/repair-loop-mock.test.ts __tests__/repair-loop-multitool.test.ts` | ✅ | ✅ green |
| 14-04 | 14 | 1 | MFG-01 | — | Prompts + README reflect Phase 14 process-gated rule surface. | manual | docs review | ✅ (transitively) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vendor-specific min-feature thresholds | MFG-01 | Different laser shops publish different mins; defaults are site-tunable. | Pull a vendor's published min-hole/slot table, override the rule thresholds for a sample IR, confirm rule fires/passes accordingly. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
