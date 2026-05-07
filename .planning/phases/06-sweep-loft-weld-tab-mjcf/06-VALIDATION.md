---
phase: 6
slug: sweep-loft-weld-tab-mjcf
status: retroactive
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract, recorded retroactively for the existing `feat/cad-ir-phase-6` branch.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `artifacts/hardwareai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @workspace/hardwareai test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | seconds (vitest, single package) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @workspace/hardwareai test`
- **After every plan wave:** `pnpm -r test`
- **Before sign-off:** Full suite must be green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Test File | Status |
|---------|------|------|-------------|-----------------|-----------|-----------|--------|
| 06-01 | 06 | 1 | FEATURE-02 | Sweep IR validates + compiles | unit | `convex/cad/ir/__tests__/schema.test.ts`, `convex/cad/codegen/__tests__/compile-sweep.test.ts` | ✅ COVERED |
| 06-02 | 06 | 1 | FEATURE-02 | Loft accepts ≥2 profiles, rejects 1 | unit | `convex/cad/codegen/__tests__/compile-loft.test.ts` | ✅ COVERED |
| 06-03 | 06 | 1 | FEATURE-02 | Weld_tab compiles | unit | `convex/cad/codegen/__tests__/compile-weldTab.test.ts` | ✅ COVERED |
| 06-04 | 06 | 1 | FEATURE-02 | add_feature schema accepts sweep/loft/weld_tab | unit | `convex/cad/patch/__tests__/tools.test.ts` | ✅ COVERED |
| 06-05 | 06 | 1 | FEATURE-02 | MJCF: revolute→hinge, linear→slide | unit | `convex/cad/codegen/__tests__/compileToMjcf.test.ts` | ✅ COVERED |
| 06-06 | 06 | 1 | FEATURE-02 | Prompts + README accurate | docs | (transitively covered by tests above) | ✅ TRANSITIVE |

*Status: ✅ COVERED · ✅ TRANSITIVE · ⚠️ MANUAL*

---

## Wave 0 Requirements

Existing infrastructure (vitest in `artifacts/hardwareai`) covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MJCF output loads in MuJoCo viewer | FEATURE-02 SC#3 | Requires external viewer (MuJoCo simulate) | Run sandbox executor on a sweep+loft+weld_tab assembly; load emitted `.xml` in MuJoCo `simulate` |
| URDF output loads in motion-sim viewer | FEATURE-02 SC#3 | Requires external URDF viewer | Load emitted `.urdf` in any URDF viewer (e.g. RViz, urdf-viz) and articulate joints |

---

## Verification Result

- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code, inherited.
- **Method:** typecheck on phase branch tip after `tsc -b` of each `lib/*` package; intersect error paths with the modified-files list.

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered (existing infra)
- [x] No watch-mode flags
- [x] Feedback latency under threshold
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactive 2026-05-07
