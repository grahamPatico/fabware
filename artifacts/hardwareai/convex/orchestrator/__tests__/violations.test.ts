import { describe, it, expect } from "vitest";
import { buildViolationDoc } from "../violations";

describe("buildViolationDoc", () => {
  it("creates an open violation doc with timestamps", () => {
    const before = Date.now();
    const doc = buildViolationDoc({
      projectId: "p1" as never,
      partId: "pt1" as never,
      violation: {
        ruleId: "sheet.hole-edge-distance",
        severity: "error",
        message: "Hole H3 too close to edge",
        agentMessage: "Move hole H3 ≥3.2mm from edge.",
        location: { kind: "hole", id: "H3" },
      },
      tier: "auto-fixable",
    });
    expect(doc.status).toBe("open");
    expect(doc.tier).toBe("auto-fixable");
    expect(doc.createdAt).toBeGreaterThanOrEqual(before);
    expect(doc.updatedAt).toBe(doc.createdAt);
  });

  it("supports assembly-level violations (partId omitted)", () => {
    const doc = buildViolationDoc({
      projectId: "p1" as never,
      partId: undefined,
      violation: {
        ruleId: "asm.bom-consistency",
        severity: "warn",
        message: "BOM has duplicate fastener references",
        agentMessage: "Deduplicate fasteners F1/F2.",
      },
      tier: "auto-fixable",
    });
    expect(doc.partId).toBeUndefined();
  });
});
