---
phase: 19
slug: final-consolidation-cutover
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. This is the milestone-level cutover phase: the gate is the tennis-ball-locker end-to-end on both schemas plus the mega-integration test.

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
| 19-01 | 19 | 1 | CUTOVER-01 | — | Mega-integration walks all 5 tiers + all compile targets + all patch tools end-to-end | integration | `pnpm --filter @workspace/hardwareai test integration-final` | ✅ `artifacts/hardwareai/convex/cad/__tests__/integration-final.test.ts` | ✅ green |
| 19-02 | 19 | 1 | CUTOVER-01 | — | README final-state summary documents rebuilt CAD IR backbone | manual | n/a — docs review | ✅ `artifacts/hardwareai/convex/cad/README.md` | ✅ green |
| 19-03 | 19 | 1 | CUTOVER-01, CUTOVER-02, CADIR-02 | — | Final sweep confirms no regressions across all 19 phases | transitive | covered by mega-integration test (19-01) + the milestone verification sweep recorded in `/tmp/cad-ir-verify-results.tsv` (0 new typecheck errors per phase) | ✅ `/tmp/cad-ir-verify-results.tsv` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| glTF preview parity in `AssembledView` / `Workspace` with `useCadIr=true` | CADIR-02 | Visual fidelity inside the existing Three.js components is editorial — automated geometry tests cover the codegen path, but pixel/material parity in the renderer requires a human eye | Set `useCadIr=true` in the Workspace, load a representative project (the tennis-ball-locker assembly works), confirm every part renders as a glTF preview in `AssembledView` with materials, scale, and orientation matching the prior Slice 1 render |
| Tennis-ball-locker end-to-end with `useCadIr=true` (CUTOVER-02) — milestone acceptance gate | CUTOVER-02 | End-to-end agent-driven flow includes user refinement steps; the gate is editorial whole-flow success | Toggle `useCadIr=true`. From the scope wizard, describe a tennis-ball locker. Confirm the system generates a multi-part sheet-metal assembly. Refine at least one part interactively. Export per-part DXFs. Confirm every part exports a valid DXF that opens in a DXF viewer without geometry loss |
| Tennis-ball-locker end-to-end with `useCadIr=false` (regression check on main) | CUTOVER-02 | Same flow, on the live Slice 1 schema, must continue to pass — ensures the rebuild did not regress the live pipeline | Toggle `useCadIr=false`. Repeat the tennis-ball-locker flow above against the Slice 1 schema on `main`. Confirm the same end-state (per-part DXFs export cleanly) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
