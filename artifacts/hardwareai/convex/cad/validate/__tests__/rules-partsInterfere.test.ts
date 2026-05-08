// convex/cad/validate/__tests__/rules-partsInterfere.test.ts
import { describe, expect, it } from "vitest";
import { partsInterfere } from "../rules/partsInterfere";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function ir(extra: Partial<CadIr>): CadIr {
  return { ...emptyIr("mm"), ...extra };
}

// Helper: a part IR with a single 20×20×10 box centered at (0,0,0)
function boxIr(): CadIr {
  return ir({
    sketches: {
      sk1: {
        id: "sk1",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "r1", center: { x: 0, y: 0 }, width: 20, height: 20 },
        ],
      },
    },
    features: [
      { id: "ex1", kind: "extrude", profile: "sk1", distance: 10, operation: "new_body" },
    ],
  });
}

describe("partsInterfere", () => {
  it("returns no violations when parts do not overlap", () => {
    // box1 at origin (bbox: [-10,10]×[-10,10]×[0,10])
    // box2 offset +40 in X (bbox: [30,50]×[-10,10]×[0,10]) — no overlap
    const result = partsInterfere(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: boxIr(), origin: { x: 40, y: 0, z: 0 } },
      },
    }));
    expect(result).toEqual([]);
  });

  it("returns no violations when parts touch exactly (not overlapping)", () => {
    // box1 bbox: [-10,10]×[-10,10]×[0,10]
    // box2 at x=20: bbox: [10,30]×[-10,10]×[0,10] — touching at x=10, not overlapping
    const result = partsInterfere(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: boxIr(), origin: { x: 20, y: 0, z: 0 } },
      },
    }));
    expect(result).toEqual([]);
  });

  it("reports an error when two non-rotated parts overlap", () => {
    // box1 at origin (bbox: [-10,10]×[-10,10]×[0,10])
    // box2 at x=5 (bbox: [-5,15]×[-10,10]×[0,10]) — overlaps with box1
    const result = partsInterfere(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: { id: "b", ir: boxIr(), origin: { x: 5, y: 0, z: 0 } },
      },
    }));
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("assembly.parts-interfere");
    expect(result[0].severity).toBe("error");
    expect(result[0].message).toContain('"a"');
    expect(result[0].message).toContain('"b"');
  });

  it("reports a warning (not error) when an overlapping part is rotated", () => {
    // box2 is rotated — conservative sphere expansion, so "warn" not "error"
    const result = partsInterfere(ir({
      parts: {
        a: { id: "a", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
        b: {
          id: "b",
          ir: boxIr(),
          origin: { x: 5, y: 0, z: 0 },
          rotation: { rx: 0, ry: 45, rz: 0 },
        },
      },
    }));
    // The rotated part has a sphere bbox; it likely overlaps the first part
    const interfereViolations = result.filter(v => v.ruleId === "assembly.parts-interfere");
    expect(interfereViolations.length).toBeGreaterThanOrEqual(1);
    expect(interfereViolations[0].severity).toBe("warn");
  });

  // ── Phase 9: External part tests ────────────────────────────────────────────

  it("skips external parts with no declared boundingBox (no interference reported)", () => {
    // An external part without a boundingBox cannot be checked — skip it entirely.
    // Mix with an inline box to confirm the inline part itself is still checked.
    const result = partsInterfere(ir({
      parts: {
        screw: {
          id: "screw",
          kind: "external" as const,
          vendor: "McMaster-Carr",
          partNumber: "91290A115",
          // No boundingBox — must be skipped
        },
        body: { id: "body", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
      },
    }));
    // Only 1 part has a bbox; pairs cannot be formed → no violations
    expect(result).toEqual([]);
  });

  it("uses declared boundingBox for external parts in interference check", () => {
    // External part occupies [-5,5]×[-5,5]×[0,10] at origin (10×10×10 box).
    // Inline boxIr at origin occupies [-10,10]×[-10,10]×[0,10].
    // These two overlap → violation expected.
    const result = partsInterfere(ir({
      parts: {
        bearing: {
          id: "bearing",
          kind: "external" as const,
          vendor: "NSK",
          partNumber: "6001ZZ",
          boundingBox: { width: 10, height: 10, depth: 10 },
          origin: { x: 0, y: 0, z: 0 },
        },
        body: { id: "body", ir: boxIr(), origin: { x: 0, y: 0, z: 0 } },
      },
    }));
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("assembly.parts-interfere");
    expect(result[0].severity).toBe("error");
  });
});
