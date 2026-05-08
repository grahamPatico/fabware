---
phase: 10
slug: cost-compiler-smoke-test
status: retroactive
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract, recorded retroactively for the existing `feat/cad-ir-phase-10` branch.

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
| 10-01 | 10 | 1 | COMPILE-02 | compileCost: known/unknown parts; BUILTIN_PRICING | unit | `convex/cad/compile/__tests__/cost.test.ts` | ✅ COVERED |
| 10-02 | 10 | 1 | COMPILE-02 | CadIr.budget optional; Zod parses | unit | `convex/cad/ir/__tests__/budget-schema.test.ts` | ✅ COVERED |
| 10-03 | 10 | 1 | COMPILE-02 | budgetExceeded warns when total > budget | unit | `convex/cad/validate/__tests__/rules-budgetExceeded.test.ts` | ✅ COVERED |
| 10-04 | 10 | 1 | COMPILE-02 | Full-stack hinged-enclosure smoke (validate + codegen + BOM + cost + URDF + MJCF) | integration | `convex/cad/__tests__/integration-phase10.test.ts` | ✅ COVERED |
| 10-05 | 10 | 1 | COMPILE-02 | Prompts + README — cost section accurate | docs | (transitively covered by tests above) | ✅ TRANSITIVE |

*Status: ✅ COVERED · ✅ TRANSITIVE · ⚠️ MANUAL*

---

## Wave 0 Requirements

Existing infrastructure (vitest in `artifacts/hardwareai`) covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification (the integration smoke test exercises end-to-end behavior in vitest).

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
