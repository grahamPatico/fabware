import { describe, it, expect } from "vitest";
import { validatePrinted } from "../printedRules";
import type { PrintedDsl } from "../printedDsl";

const baseDsl: PrintedDsl = {
  version: 1, kind: "printed",
  material: "PLA", layerHeight: 0.2, infill: 0.2,
  primitive: { kind: "box", width: 40, depth: 30, height: 5 },
  features: [],
};

describe("validatePrinted", () => {
  it("passes a sane PLA box", () => {
    const r = validatePrinted(baseDsl);
    expect(r.hasFailures).toBe(false);
  });

  it("FAILs when bounding box exceeds 250mm bed", () => {
    const r = validatePrinted({ ...baseDsl, primitive: { kind: "box", width: 300, depth: 30, height: 5 } });
    const rule = r.rules.find(x => x.id === "fits_bed");
    expect(rule?.status).toBe("fail");
  });

  it("WARNs when wall thickness is below 1.2mm for PLA", () => {
    // height=1mm < 1.2mm minimum
    const r = validatePrinted({ ...baseDsl, primitive: { kind: "box", width: 40, depth: 30, height: 1 } });
    const rule = r.rules.find(x => x.id === "min_wall");
    expect(rule?.status === "fail" || rule?.status === "warn").toBe(true);
  });
});
