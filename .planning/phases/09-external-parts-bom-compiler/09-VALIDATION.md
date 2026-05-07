---
phase: 9
slug: external-parts-bom-compiler
status: retroactive
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 9 — Validation Strategy

> Per-phase validation contract, recorded retroactively for the existing `feat/cad-ir-phase-9` branch.

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
| 09-01 | 09 | 1 | COMPILE-01 | PartRef union present in types | typecheck | (typecheck on `cad/ir/types.ts`) | ✅ TRANSITIVE |
| 09-02 | 09 | 1 | COMPILE-01 | Zod parses inline + external variants | unit | `convex/cad/ir/__tests__/partRefSchema.test.ts` | ✅ COVERED |
| 09-03 | 09 | 1 | COMPILE-01 | Schema-tier skips ir-field check for externals | unit | `convex/cad/ir/__tests__/partRefSchema.test.ts` | ✅ COVERED |
| 09-04 | 09 | 1 | COMPILE-01 | partsInterfere handles externals (skip / use declared bbox) | unit | `convex/cad/validate/__tests__/rules-partsInterfere.test.ts` | ✅ COVERED |
| 09-05 | 09 | 1 | COMPILE-01 | compileBom aggregates externals by vendor+partNumber | unit | `convex/cad/compile/__tests__/bom.test.ts` | ✅ COVERED |
| 09-06 | 09 | 1 | COMPILE-01 | add_part schema accepts inline + external | unit | `convex/cad/patch/__tests__/tools.test.ts` | ✅ COVERED |
| 09-07 | 09 | 1 | COMPILE-01 | toolCallToPatch handles ExternalPartRef | unit | `convex/cad/patch/__tests__/tools.test.ts` (specialist path) | ✅ COVERED |
| 09-08 | 09 | 1 | COMPILE-01 | Prompts + README accurate | docs | (transitively covered by tests above) | ✅ TRANSITIVE |

*Status: ✅ COVERED · ✅ TRANSITIVE · ⚠️ MANUAL*

---

## Wave 0 Requirements

Existing infrastructure (vitest in `artifacts/hardwareai`) covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BOM CSV / table review for a representative assembly | COMPILE-01 | The compiled BOM is a structured artifact a fabricator reads; visual sanity check on aggregation | Run `compileBom` on a 2-inline + 3-external assembly; eyeball quantities, vendors, and part numbers in the returned `BomEntry[]` |

---

## Verification Result

- **Typecheck:** PASS — 0 new errors in modified files; 15 pre-existing baseline errors in non-CAD code, inherited.
- **Method:** typecheck on phase branch tip after `tsc -b` of each `lib/*` package; intersect error paths with the modified-files list.

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly transitive / manual
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered (existing infra)
- [x] No watch-mode flags
- [x] Feedback latency under threshold
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactive 2026-05-07
