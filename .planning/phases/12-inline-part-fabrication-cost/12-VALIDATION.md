---
phase: 12
slug: inline-part-fabrication-cost
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 12 — Validation Strategy

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
| 12-01 | 12 | 1 | COMPILE-03 | — | BUILTIN_MATERIALS exposes v1 material rows; lookup returns expected entries. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/materials.test.ts` | ✅ | ✅ green |
| 12-02 | 12 | 1 | COMPILE-03 | — | Optional `CadIr.material` field validates through Zod. | unit | `pnpm --filter @workspace/hardwareai test ir/__tests__/material-schema.test.ts` | ✅ | ✅ green |
| 12-03 | 12 | 1 | COMPILE-03 | — | estimateVolume returns reasonable values across feature mixes. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/volume.test.ts` | ✅ | ✅ green |
| 12-04 | 12 | 1 | COMPILE-03 | — | compileFabricationCost returns volume × density × $/kg lines per inline part. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/fabricationCost.test.ts` | ✅ | ✅ green |
| 12-05 | 12 | 1 | COMPILE-03 | — | compileCost.totalUsd includes fabrication; budget rule still fires correctly. | integration | `pnpm --filter @workspace/hardwareai test compile/__tests__/cost.test.ts __tests__/integration-phase10.test.ts` | ✅ | ✅ green |
| 12-06 | 12 | 1 | COMPILE-03 | — | Prompts + README reflect Phase 12 surface. | manual | docs review | ✅ (transitively) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sanity-check fabrication cost magnitudes against vendor pricing | COMPILE-03 | Catalog values vary with market; unit tests assert structure not absolute price. | Run `compileCost` on a representative inline part, compare totalUsd to a known fabrication quote within ±20%. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
