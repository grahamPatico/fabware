import { describe, it, expect } from "vitest";
import { PrintedDslSchema, emptyPrintedDsl, type PrintedDsl } from "../printedDsl";

describe("PrintedDslSchema", () => {
  it("validates a minimal box primitive", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "PLA", layerHeight: 0.2, infill: 0.2,
      primitive: { kind: "box", width: 40, depth: 30, height: 5 },
      features: [],
    };
    const r = PrintedDslSchema.safeParse(dsl);
    expect(r.success).toBe(true);
  });

  it("validates a cylinder primitive", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "PETG", layerHeight: 0.2, infill: 0.3,
      primitive: { kind: "cylinder", radius: 12, height: 8 },
      features: [],
    };
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(true);
  });

  it("rejects unknown material", () => {
    const dsl = {
      version: 1, kind: "printed",
      material: "Unobtanium", layerHeight: 0.2, infill: 0.2,
      primitive: { kind: "box", width: 1, depth: 1, height: 1 },
      features: [],
    };
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(false);
  });

  it("emptyPrintedDsl returns a valid default", () => {
    const dsl: PrintedDsl = emptyPrintedDsl();
    expect(PrintedDslSchema.safeParse(dsl).success).toBe(true);
    expect(dsl.material).toBe("PLA");
  });
});
