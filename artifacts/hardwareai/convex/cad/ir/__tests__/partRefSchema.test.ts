// convex/cad/ir/__tests__/partRefSchema.test.ts
// Phase 9 Task 2 — Zod schema tests for the PartRef union (InlinePartRef | ExternalPartRef)

import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";
import { emptyIr } from "../empty";

function makeIr(parts: Record<string, unknown>) {
  return {
    schemaVersion: 1 as const,
    units: "mm" as const,
    parameters: {},
    sketches: {},
    features: [],
    parts,
  };
}

describe("PartRef union schema (Phase 9)", () => {
  it("accepts a bare inline part (no 'kind' field — backward compat)", () => {
    // Phase 4 inline form: { id, ir } with no kind field
    const ir = makeIr({
      body: { id: "body", ir: emptyIr("mm") },
    });
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an inline part with kind: 'inline' explicitly set", () => {
    const ir = makeIr({
      body: { id: "body", kind: "inline", ir: emptyIr("mm") },
    });
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an external part with all required fields", () => {
    const ir = makeIr({
      m3: {
        id: "m3",
        kind: "external",
        vendor: "McMaster-Carr",
        partNumber: "91290A115",
        description: "M3 × 8mm socket head cap screw",
      },
    });
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts an external part with optional boundingBox", () => {
    const ir = makeIr({
      bearing: {
        id: "bearing",
        kind: "external",
        vendor: "NSK",
        partNumber: "6001ZZ",
        boundingBox: { width: 28, height: 28, depth: 8 },
      },
    });
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects an external part missing vendor or partNumber", () => {
    const missingVendor = makeIr({
      bad: { id: "bad", kind: "external", partNumber: "ABC123" },
    });
    expect(() => CadIrSchema.parse(missingVendor)).toThrow();

    const missingPartNumber = makeIr({
      bad: { id: "bad", kind: "external", vendor: "Acme" },
    });
    expect(() => CadIrSchema.parse(missingPartNumber)).toThrow();
  });

  // Phase 18: stepUrl field on ExternalPartRef
  it("accepts an external part with a valid stepUrl", () => {
    const ir = makeIr({
      bearing: {
        id: "bearing",
        kind: "external",
        vendor: "Misumi",
        partNumber: "B-6800ZZ",
        stepUrl: "https://example.com/b6800zz.step",
      },
    });
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects an external part with a malformed stepUrl", () => {
    const ir = makeIr({
      bearing: {
        id: "bearing",
        kind: "external",
        vendor: "Misumi",
        partNumber: "B-6800ZZ",
        stepUrl: "not-a-url",
      },
    });
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
