## Conflict Detection Report

### BLOCKERS (0)

(None. The architectural-supersession blocker from the previous run was resolved by `docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md` (LOCKED). With ADR-0001 in place, the three overlapping SPEC directions auto-resolve under precedence ADR > SPEC.)

### WARNINGS (0)

(None. No PRDs in the ingest set, so no competing acceptance variants. No partial-overlap ambiguity that requires user input.)

### INFO (3)

[INFO] Auto-resolved: ADR > SPEC on architectural direction (CAD IR Backbone is canonical)
  Note: docs/adr/0001-cad-ir-supersedes-ai-harness-and-sheet-metal-specs.md (LOCKED, Accepted) declares the CAD IR Backbone the canonical architectural direction and supersedes docs/superpowers/specs/2026-04-25-ai-harness-design.md and docs/superpowers/specs/2026-04-24-sheet-metal-assembly-design.md at the architectural-direction level. Both superseded SPECs carry "Status: Superseded by ADR-0001" headers. ADR wins on overlapping scope; named carve-outs in ADR-0001 §Decision are honored as constraints (ProcessPlugin contract, runAgentRepairLoop, two-tier validation loop, orchestrator state machine, violations/escalations/planEvents/parts tables, Slice 1 schema on main as the live customer surface, tennis-ball-locker canonical test, AssembledView/Workspace component reuse). Synthesized into `.planning/intel/decisions.md` and `.planning/intel/constraints.md`.

[INFO] Auto-resolved: ADR > SPEC on PartDsl deprecation
  Note: ADR-0001 (LOCKED) deprecates PartDsl as the agent's source of truth and replaces it with CadIr. The earlier SPECs (sheet-metal-assembly-design.md, ai-harness-design.md) treat PartDsl as the canonical part data shape; the CAD IR Backbone SPEC explicitly supersedes that. ADR-0001 records this decision; deprecated items recorded in `.planning/intel/decisions.md` under "Deprecated and being phased out". The four early plans (ai-harness-step-0-scaffold, ai-harness-step-1-sheet-metal-plugin, ai-harness-step-1b-specialist-agent-repair-loop, sheet-metal-assembly) are retained as Phase-0 infrastructure that lands on main before the CAD IR rebuild branch is cut.

[INFO] Auto-resolved: ADR > SPEC on revision storage
  Note: ADR-0001 (LOCKED) replaces partRevisions with cad_revisions / cad_revision_artifacts as the project-level snapshot mechanism. Earlier specs assumed partRevisions as the snapshot model. ADR wins on overlapping scope; recorded under "Deprecated and being phased out" in `.planning/intel/decisions.md`.
