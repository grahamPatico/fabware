---
phase: 15
slug: extended-sketch-primitives
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 15 — Validation Strategy

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
| 15-01 | 15 | 1 | PATCH-03 | — | Arc/polygon/spline entity kinds validate via Zod and types. | unit | `pnpm --filter @workspace/hardwareai test ir/__tests__/schema.test.ts` | ✅ | ✅ green |
| 15-02 | 15 | 1 | PATCH-03 | — | Volume + perimeter estimators handle the new kinds. | unit | `pnpm --filter @workspace/hardwareai test compile/__tests__/volume.test.ts compile/__tests__/perimeter.test.ts` | ✅ | ✅ green |
| 15-03 | 15 | 1 | PATCH-03 | — | Codegen emits build123d output for arc/polygon/spline sketches. | unit | `pnpm --filter @workspace/hardwareai test codegen/__tests__/compile-sketch-entities-phase15.test.ts` | ✅ | ✅ green |
| 15-04 | 15 | 1 | PATCH-03 | — | `add_sketch` tool schema accepts and round-trips new entity kinds. | unit | `pnpm --filter @workspace/hardwareai test patch/__tests__/tools.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual review of build123d output for arc/polygon/spline sketches | PATCH-03 | Codegen correctness for curved primitives is best confirmed in the executor preview, not just byte-for-byte assertion. | Run the executor on a sample IR using each new entity kind, render the generated geometry, eyeball that arcs/polygons/splines render with correct shape and continuity. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
