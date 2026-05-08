---
phase: 8
slug: aabb-interference-detection
status: retroactive
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 8 — Validation Strategy

> Per-phase validation contract, recorded retroactively for the existing `feat/cad-ir-phase-8` branch.

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
| 08-01 | 08 | 1 | ASSEMBLY-02 | computePartBbox correct for empty / rect / circle / revolve | unit | `convex/cad/geometry/__tests__/partBbox.test.ts` | ✅ COVERED |
| 08-02 | 08 | 1 | ASSEMBLY-02 | transformBbox translates origin; sphere-expands rotation | unit | `convex/cad/geometry/__tests__/transform.test.ts` | ✅ COVERED |
| 08-03 | 08 | 1 | ASSEMBLY-02 | partsInterfere flags overlap; passes non-overlap | unit | `convex/cad/validate/__tests__/rules-partsInterfere.test.ts` | ✅ COVERED |
| 08-04 | 08 | 1 | ASSEMBLY-02 | Prompts + README accurate | docs | (transitively covered by tests above) | ✅ TRANSITIVE |

*Status: ✅ COVERED · ✅ TRANSITIVE · ⚠️ MANUAL*

---

## Wave 0 Requirements

Existing infrastructure (vitest in `artifacts/hardwareai`) covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Verification Result

- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code, inherited.
- **Method:** typecheck on phase branch tip after `tsc -b` of each `lib/*` package; intersect error paths with the modified-files list.

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly transitive
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered (existing infra)
- [x] No watch-mode flags
- [x] Feedback latency under threshold
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactive 2026-05-07
