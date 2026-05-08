---
phase: 11
slug: joint-range-self-collision
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 11 — Validation Strategy

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
| 11-01 | 11 | 1 | ASSEMBLY-03 | — | Pose sampler enumerates revolute/linear joints across N samples without overflow. | unit | `pnpm --filter @workspace/hardwareai test geometry/__tests__/jointPose.test.ts` | ✅ | ✅ green |
| 11-02 | 11 | 1 | ASSEMBLY-03 | — | jointRangeCollision flags self-collision across motion arc; clear arcs pass. | unit | `pnpm --filter @workspace/hardwareai test validate/__tests__/rules-jointRangeCollision.test.ts` | ✅ | ✅ green |
| 11-03 | 11 | 1 | ASSEMBLY-03 | — | Prompts + README documentation reflects Phase 11 rule and tool surface. | manual | docs review | ✅ (transitively) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Joint-range pose sampling visual review (eyeballing sampled poses against an articulated assembly) | ASSEMBLY-03 | No deterministic assertion for "looks right"; sampling resolution is operator-tuned. | Load an articulated multi-part fixture, render a small set of sampled poses (`sampleJointPoses` output) in an external viewer, confirm joint axes/ranges look correct. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
