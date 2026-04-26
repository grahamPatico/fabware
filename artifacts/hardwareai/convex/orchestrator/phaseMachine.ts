import type { Doc } from "../_generated/dataModel";
import type { PartKind, ProjectPhase } from "../plugins/types";

export type Action =
  | { kind: "wait"; reason: string }
  | { kind: "noop"; reason: string }
  | { kind: "designPart"; partId: string }
  | { kind: "transitionPhase"; fromPhase: ProjectPhase; toPhase: ProjectPhase };

interface Input {
  project: Doc<"projects">;
  parts: Doc<"parts">[];
  openEscalations: Doc<"escalations">[];
  registeredKinds: PartKind[];
}

/**
 * Pure decision function — given the current state, what should the orchestrator do next?
 * The tick action interprets the returned Action.
 */
export function computeNextAction(input: Input): Action {
  if (input.openEscalations.length > 0) {
    return { kind: "wait", reason: "open escalation pending user answer" };
  }

  const phase: ProjectPhase = input.project.phase ?? "scoping";

  if (phase === "scoping") {
    if (!input.project.scope) {
      return { kind: "wait", reason: "scope not yet submitted" };
    }
    return { kind: "transitionPhase", fromPhase: "scoping", toPhase: "decomposing" };
  }

  if (phase === "decomposing") {
    if (input.parts.length === 0) {
      return { kind: "noop", reason: "decomposition tool not yet wired (Plan 2)" };
    }
    return { kind: "transitionPhase", fromPhase: "decomposing", toPhase: "designing" };
  }

  if (phase === "designing") {
    const pending = input.parts.find((p) => {
      const status = (p as Doc<"parts"> & { status?: string }).status;
      return status === "pending" || status === undefined;
    });
    if (pending) {
      const kind = (pending as Doc<"parts"> & { kind?: string }).kind as PartKind | undefined;
      if (!kind || !input.registeredKinds.includes(kind)) {
        return { kind: "noop", reason: `no plugin registered for kind="${kind ?? "unknown"}"` };
      }
      return { kind: "designPart", partId: pending._id };
    }
    const allDone = input.parts.every((p) => {
      const s = (p as Doc<"parts"> & { status?: string }).status;
      return s === "ok" || s === "escalated" || s === "failed";
    });
    if (allDone && input.parts.length > 0) {
      return { kind: "transitionPhase", fromPhase: "designing", toPhase: "validating" };
    }
    return { kind: "noop", reason: "designing in flight" };
  }

  if (phase === "validating") {
    return { kind: "noop", reason: "assembly validator not yet wired (Plan 2)" };
  }

  if (phase === "exporting") {
    return { kind: "noop", reason: "exporter not yet wired (later plan)" };
  }

  // phase === "done"
  return { kind: "wait", reason: "project complete" };
}
