---
phase: 13
slug: process-aware-machine-cost
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 13 — Validation Strategy

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
| 13-01 | 13 | 1 | COMPILE-04 | — | BUILTIN_PROCESSES catalog covers laser_cut, cnc, print_3d, sheet_metal_bend; lookupProcess returns expected entries. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/processes.test.ts` | ✅ | ✅ green |
| 13-02 | 13 | 1 | COMPILE-04 | — | Optional `CadIr.process` field validates via Zod. | unit | `pnpm --filter @workspace/hardwareai test ir/__tests__/schema.test.ts` | ✅ | ✅ green |
| 13-03 | 13 | 1 | COMPILE-04 | — | estimatePerimeter returns reasonable numbers per feature mix. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/perimeter.test.ts` | ✅ | ✅ green |
| 13-04 | 13 | 1 | COMPILE-04 | — | compileMachineCost scales with perimeter for laser_cut and uses per-process drivers otherwise. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/machineCost.test.ts` | ✅ | ✅ green |
| 13-05 | 13 | 1 | COMPILE-04 | — | compileCost exposes `machine` line; switching process changes the line. | integration | `pnpm --filter @workspace/hardwareai test compile/__tests__/cost.test.ts` | ✅ | ✅ green |
| 13-06 | 13 | 1 | COMPILE-04 | — | Prompts + README reflect Phase 13 surface. | manual | docs review | ✅ (transitively) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cost reporting CSV sanity check | COMPILE-04 | Final cost-report exports are reviewed by humans before being shared with vendors. | Run `compileCost` for a representative IR with `process` set, export to CSV, eyeball machine line magnitudes against vendor quotes. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
