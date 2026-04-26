import { describe, it, expect } from "vitest";
import { buildEscalationDoc } from "../escalations";

describe("buildEscalationDoc", () => {
  it("creates an open escalation with the suggested answer", () => {
    const before = Date.now();
    const doc = buildEscalationDoc({
      projectId: "p1" as never,
      sourceViolationId: undefined,
      question: "Is 14ga steel enough for the back panel?",
      suggestedAnswer: "Yes",
      choices: ["Yes", "Use 12ga", "Switch to aluminum"],
    });
    expect(doc.status).toBe("open");
    expect(doc.suggestedAnswer).toBe("Yes");
    expect(doc.choices?.length).toBe(3);
    expect(doc.createdAt).toBeGreaterThanOrEqual(before);
  });
});
