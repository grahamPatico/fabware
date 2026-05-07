---
phase: 5
slug: feature-round-out-multi-part-codegen
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Documented retroactively against the branch `feat/cad-ir-phase-5` (tip `0a44bc4`).

Authoritative plan: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-5.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `artifacts/hardwareai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @workspace/hardwareai test` |
| **Full suite command** | `pnpm -r test` |
| **Estimated runtime** | ~30–60 s for the cad scope |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @workspace/hardwareai test`
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01 | 05 | 1 | FEATURE-01 | RevolveFeature type + Zod parse/reject | unit | `vitest run convex/cad/ir/__tests__/schema.test.ts` | ✅ | ✅ COVERED |
| 5-02 | 05 | 1 | FEATURE-01 | revolve codegen emitter + emitFeature dispatch + resolveIr | unit | `vitest run convex/cad/codegen/__tests__/compile-revolve.test.ts` | ✅ | ✅ COVERED |
| 5-03 | 05 | 1 | FEATURE-01 | ShellFeature schema accepts/rejects | unit | `vitest run convex/cad/ir/__tests__/schema.test.ts` | ✅ | ✅ COVERED |
| 5-04 | 05 | 1 | FEATURE-01 | shell codegen + emitShell dispatch | unit | `vitest run convex/cad/codegen/__tests__/compile-shell.test.ts` | ✅ | ✅ COVERED |
| 5-05 | 05 | 1 | FEATURE-01 | BendFlange schema + mfg.min-bend-radius rule + codegen | unit | `vitest run convex/cad/codegen/__tests__/compile-bendFlange.test.ts` and `vitest run convex/cad/validate/__tests__/rules-minBendRadius.test.ts` | ✅ | ✅ COVERED |
| 5-06 | 05 | 1 | FEATURE-01 | compileAssembly emits per-part scripts | unit | `vitest run convex/cad/codegen/__tests__/compileAssembly.test.ts` | ✅ | ✅ COVERED |
| 5-07 | 05 | 1 | FEATURE-01 | Anthropic tool defs + system prompt for new features | unit | `vitest run convex/cad/patch/__tests__/tools.test.ts` (tools-side) + manual prompt review | ✅ | ✅ COVERED (tools); ⚠️ manual (prompt) |
| 5-08 | 05 | 1 | FEATURE-01 | README + module layout update | manual | doc review | ⚠️ manual | manual: doc review |

*Status: ⬜ pending · ✅ COVERED · ⚠️ manual · ❌ red*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest already present from Phase 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| System prompt teaches the agent revolve/shell/bend_flange use-cases appropriately | FEATURE-01 | qualitative prompt review | Read `artifacts/hardwareai/convex/cad/prompts.ts` after the commit; confirm each of the three new feature kinds has a usage paragraph and an example. |
| Multi-part assembly produces visually correct geometry per part when run through Vercel Sandbox | FEATURE-01 | sandbox/glb preview review (no headless coverage) | Trigger a CAD IR specialist run on a 2+ part assembly using a revolve, shell, and bend_flange feature; load the resulting per-part glb files in CadPreview / a glTF viewer; confirm each part renders correctly. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (retroactive — branch tip `0a44bc4`).
