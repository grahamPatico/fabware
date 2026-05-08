---
phase: 4
slug: assembly-graph-urdf
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Documented retroactively against the branch `feat/cad-ir-phase-4` (tip `73842b8`).

Authoritative plan: `/Users/grahampatterson/fabware/docs/superpowers/plans/2026-04-30-cad-ir-phase-4.md`.

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
| 4-01 | 04 | 1 | ASSEMBLY-01 | Assembly TS types compile (PartRef, AxisRef, Joint, Connection) | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 4-02 | 04 | 1 | ASSEMBLY-01 | Zod schemas with z.lazy parse valid + reject invalid | unit | `vitest run convex/cad/ir/__tests__/assembly-schema.test.ts` | ✅ | ✅ COVERED |
| 4-03 | 04 | 1 | ASSEMBLY-01 | Schema-tier rejects unknown part-ids in joints/connections | unit | `vitest run convex/cad/validate/__tests__/schemaTier.test.ts` | ✅ | ✅ COVERED |
| 4-04 | 04 | 1 | ASSEMBLY-01 | Tier 5 catches floating part + over-constrained | unit | `vitest run convex/cad/validate/__tests__/assemblyTier.test.ts` | ✅ | ✅ COVERED |
| 4-05 | 04 | 1 | ASSEMBLY-01 | URDF compiler emits fixed/revolute/linear with origin | unit | `vitest run convex/cad/codegen/__tests__/compileToUrdf.test.ts` | ✅ | ✅ COVERED |
| 4-06 | 04 | 1 | ASSEMBLY-01 | Patch types compile | typecheck | `pnpm --filter @workspace/hardwareai typecheck` | ✅ | ✅ COVERED |
| 4-07 | 04 | 1 | ASSEMBLY-01 | Patch applier handles add_part/add_joint/add_connection | unit | `vitest run convex/cad/patch/__tests__/apply.test.ts` | ✅ | ✅ COVERED |
| 4-08 | 04 | 1 | ASSEMBLY-01 | CAD_IR_TOOLS contains 12 tool defs | unit | `vitest run convex/cad/patch/__tests__/tools.test.ts` | ✅ | ✅ COVERED |
| 4-09 | 04 | 1 | ASSEMBLY-01 | Specialist toolCallToPatch dispatches new tools | integration | covered transitively by `convex/cad/__tests__/assembly-mock.test.ts` | ✅ | ✅ COVERED (transitive) |
| 4-10 | 04 | 1 | ASSEMBLY-01 | Plugin validate composes assemblyTier | unit | `vitest run convex/cad/__tests__/plugin.test.ts` | ✅ | ✅ COVERED |
| 4-11 | 04 | 1 | ASSEMBLY-01 | Multi-part hinged-box mock repair-loop converges | integration | `vitest run convex/cad/__tests__/assembly-mock.test.ts` | ✅ | ✅ COVERED |
| 4-12 | 04 | 1 | ASSEMBLY-01 | Prompts + README updated; URDF loads in viewer | manual | URDF viewer load check | ⚠️ manual | manual: URDF viewer load |

*Status: ⬜ pending · ✅ COVERED · ⚠️ manual · ❌ red*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest already present from Phase 1.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| URDF emitted by compileToUrdf loads and articulates in a motion-sim viewer | ASSEMBLY-01 | external viewer (PyBullet, RViz, urdf-viz) — no headless coverage in Wave 0 | Run `compileToUrdf` against the hinged-box assembly; save `.urdf` to disk; load in PyBullet (`p.loadURDF`) or `urdf-viz`; confirm the revolute joint articulates over its declared range. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or are explicitly manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07 (retroactive — branch tip `73842b8`).
