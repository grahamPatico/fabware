---
phase: 18
slug: step-imports-for-externals
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 18 — Validation Strategy

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
| 18-01 | 18 | 1 | EXTERNAL-01 | — | `ExternalPartRef.stepUrl` optional, validates with and without | unit | `pnpm --filter @workspace/hardwareai test partRefSchema` | ✅ `artifacts/hardwareai/convex/cad/ir/__tests__/partRefSchema.test.ts` | ✅ green |
| 18-02 | 18 | 1 | EXTERNAL-01 | — | compileAssembly emits `import_step` only when stepUrl is present | unit | `pnpm --filter @workspace/hardwareai test compileAssembly` | ✅ `artifacts/hardwareai/convex/cad/codegen/__tests__/compileAssembly.test.ts` | ✅ green |
| 18-03 | 18 | 1 | EXTERNAL-01 | — | add_part patch tool accepts and round-trips stepUrl | unit | `pnpm --filter @workspace/hardwareai test patch/__tests__/tools` | ✅ `artifacts/hardwareai/convex/cad/patch/__tests__/tools.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Imported STEP geometry visually appears correctly in the assembled preview (golden mesh review) | EXTERNAL-01 | The Vercel-Sandbox executor fetches a real STEP URL and build123d performs the import; the visual fidelity of the imported solid is editorial | Run the Phase 19 mega-integration assembly with at least one stepUrl-bearing external part, open the resulting glTF in the Workspace `AssembledView`, visually confirm the imported part's geometry matches the source STEP (correct holes, mating faces, no missing solids) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
