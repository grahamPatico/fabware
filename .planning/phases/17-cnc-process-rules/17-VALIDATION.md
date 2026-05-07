---
phase: 17
slug: cnc-process-rules
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 17 — Validation Strategy

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
| 17-01 | 17 | 1 | MFG-03 | — | `cncToolDiameter` is optional and round-trips through Zod schema | unit | `pnpm --filter @workspace/hardwareai test ir/__tests__/schema` | ✅ `artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts` | ✅ green |
| 17-02 | 17 | 1 | MFG-03 | — | Internal corner < cncToolDiameter under process=cnc violates; non-CNC passes | unit | `pnpm --filter @workspace/hardwareai test rules-cncMinInternalCorner` | ✅ `artifacts/hardwareai/convex/cad/validate/__tests__/rules-cncMinInternalCorner.test.ts` | ✅ green |
| 17-03 | 17 | 1 | MFG-03 | — | Pocket exceeding depth-to-diameter ratio under process=cnc violates; non-CNC passes | unit | `pnpm --filter @workspace/hardwareai test rules-cncPocketTooDeep` | ✅ `artifacts/hardwareai/convex/cad/validate/__tests__/rules-cncPocketTooDeep.test.ts` | ✅ green |
| 17-04 | 17 | 1 | MFG-03 | — | manufacturingTier dispatches CNC rules only when process === 'cnc' | transitive | covered by 17-02 / 17-03 negative-case assertions | ✅ `artifacts/hardwareai/convex/cad/validate/manufacturingTier.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pocket-depth heuristic threshold matches realistic shop practice | MFG-03 | Depth-to-diameter ratio constant is editorial; sanity-check against typical end-mill DOC guidelines | Open `cncPocketTooDeep.ts`, locate the ratio constant, cross-reference against a typical 4× depth-to-diameter rule of thumb for end mills, adjust if needed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
