import { describe, it, expect } from "vitest";
import type { BatchEntry } from "../violations";

describe("BatchEntry shape", () => {
  it("constructs a sensible escalating entry", () => {
    const entry: BatchEntry = {
      violation: {
        ruleId: "sheet.demo",
        severity: "error",
        message: "demo violation",
        agentMessage: "fix demo",
      },
      tier: "requires-judgment",
      escalate: true,
    };
    expect(entry.escalate).toBe(true);
    expect(entry.violation.severity).toBe("error");
  });

  it("supports a non-escalating entry (tier auto-fixable, agent will retry)", () => {
    const entry: BatchEntry = {
      violation: {
        ruleId: "sheet.demo2",
        severity: "warn",
        message: "demo warn",
        agentMessage: "ack",
      },
      tier: "auto-fixable",
      escalate: false,
    };
    expect(entry.escalate).toBe(false);
  });
});
