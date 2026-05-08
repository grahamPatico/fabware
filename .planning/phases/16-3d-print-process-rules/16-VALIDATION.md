---
phase: 16
slug: 3d-print-process-rules
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `artifacts/hardwareai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @workspace/hardwareai test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30 seconds (quick), ~2 minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @workspace/hardwareai test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01 | 16 | 1 | MFG-02 | — | Sub-threshold wall under print_3d violates; non-print process passes | unit | `pnpm --filter @workspace/hardwareai test rules-print3dMinWall` | ✅ `artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dMinWall.test.ts` | ✅ green |
| 16-02 | 16 | 1 | MFG-02 | — | Oversize footprint under print_3d violates; non-print process passes | unit | `pnpm --filter @workspace/hardwareai test rules-print3dBedSize` | ✅ `artifacts/hardwareai/convex/cad/validate/__tests__/rules-print3dBedSize.test.ts` | ✅ green |
| 16-03 | 16 | 1 | MFG-02 | — | Composition: validateManufacturingTier dispatches print-3d rules only when process === 'print_3d' | transitive | covered by 16-01 / 16-02 negative-case assertions and existing manufacturingTier tests | ✅ `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual check that bed-footprint default matches a representative consumer-FDM bed | MFG-02 | Default constant is editorial; visual sanity check against a known printer | Open `print3dBedSize.ts`, confirm default footprint constant; cross-reference against a known FDM printer (e.g., Prusa MK4 250×210 mm) and adjust if needed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
