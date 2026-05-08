import { describe, it, expect } from "vitest";
import { buildPlanEvent } from "../planEvents";

describe("buildPlanEvent", () => {
  it("stamps createdAt and copies kind + payload", () => {
    const before = Date.now();
    const ev = buildPlanEvent({
      projectId: "p1" as never,
      kind: "phase-changed",
      payload: { fromPhase: "scoping", toPhase: "decomposing" },
    });
    expect(ev.kind).toBe("phase-changed");
    expect(ev.payload.fromPhase).toBe("scoping");
    expect(ev.at).toBeGreaterThanOrEqual(before);
  });
});
