import { describe, it, expect } from "vitest";
import { validateSpec, type RuleResult, type SpecInput } from "../scsRules";
import type { ScsLiveSku } from "../scsLive";

// SKUs as parsed from the official SCS feeds fetched 2026-08-16. Numbers are
// the real published values — see convex/lib/__tests__/scsLive.test.ts for the
// raw feed excerpts these come from.
const CRS_048: ScsLiveSku = {
  sku: "CRS-048",
  thickness: 0.048,
  outOfStock: false,
  cuttingProcess: "Fiber Laser",
  minHoleSize: 0.018,
  minBridgeSize: 0.024,
  minHoleToEdge: 0.02,
  minPartLength: 0.375,
  minPartWidth: 0.25,
  maxPartSize: { w: 44, h: 30 },
  bending: {
    minFlangeBefore: 0.255,
    minFlangeAfter: 0.298,
    maxBendLength: 44,
    effectiveBendRadius: 0.045,
    maxBendAngle: 130,
    kFactor: 0.38,
    bendDeduction: 0.086,
    bendReliefDepth: 0.113,
  },
};

// 0.313" hot-rolled plate: same fabware material ("Mild Steel (CRS)", whose
// snapshot says canBend: true) but SCS publishes no bending_specs for it.
const HRP_313: ScsLiveSku = {
  sku: "HRP-313",
  thickness: 0.313,
  outOfStock: false,
  cuttingProcess: "Fiber Laser",
  minHoleSize: 0.075,
  minBridgeSize: 0.118,
  minHoleToEdge: 0.094,
  minPartLength: 1.0,
  minPartWidth: 1.0,
  maxPartSize: { w: 44, h: 30 },
  bending: null,
};

// G90 Galvanized is the material SCS omits `max_part_size` for in both feeds.
const G90_048: ScsLiveSku = {
  sku: "G90-048",
  thickness: 0.048,
  outOfStock: false,
  cuttingProcess: "Fiber Laser",
  minHoleSize: 0.02,
  minBridgeSize: 0.024,
  minHoleToEdge: 0.02,
  minPartLength: 0.375,
  minPartWidth: 0.25,
  maxPartSize: null,
  bending: CRS_048.bending,
};

function baseSpec(over: Partial<SpecInput> = {}): SpecInput {
  return {
    partType: "bracket",
    material: "Mild Steel (CRS)",
    thickness: 0.048,
    width: 4,
    height: 3,
    bendAngles: "[]",
    ...over,
  };
}

function rule(rules: RuleResult[], id: string): RuleResult | undefined {
  return rules.find((r) => r.id === id);
}

describe("validateSpec without live rules", () => {
  it("adds no live-only rules and keeps the snapshot's hole floor", () => {
    const { rules } = validateSpec(
      baseSpec({ holePattern: JSON.stringify({ count: 4, diameter: 0.03, pattern: "corner" }) }),
    );
    expect(rule(rules, "stock")).toBeUndefined();
    expect(rule(rules, "min-part-size")).toBeUndefined();
    expect(rule(rules, "bend-max-angle")).toBeUndefined();
    expect(rule(rules, "bend-effective-radius")).toBeUndefined();
    // 0.03" < the global 0.04" floor.
    expect(rule(rules, "hole-diameter")!.status).toBe("fail");
    expect(rule(rules, "hole-diameter")!.message).toContain("1× thickness");
  });
});

describe("validateSpec live min hole size", () => {
  it("replaces the 0.04\" floor with the SKU's published min_hole_size", () => {
    const spec = baseSpec({
      holePattern: JSON.stringify({ count: 4, diameter: 0.03, pattern: "corner" }),
    });
    const { rules } = validateSpec(spec, CRS_048);
    const r = rule(rules, "hole-diameter")!;
    expect(r.status).toBe("pass");
    expect(r.message).toContain("0.018");
    expect(r.message).toContain(
      "per sendcutsend-specs.json materials[sku=CRS-048].cutting_specs.min_hole_size",
    );
  });

  it("fails below the published minimum and cites the field", () => {
    const spec = baseSpec({
      holePattern: JSON.stringify({ count: 4, diameter: 0.01, pattern: "corner" }),
    });
    const { rules, hasFailures } = validateSpec(spec, CRS_048);
    const r = rule(rules, "hole-diameter")!;
    expect(r.status).toBe("fail");
    expect(hasFailures).toBe(true);
    expect(r.message).toContain("below 0.018\" minimum");
    expect(r.message).toContain("materials[sku=CRS-048].cutting_specs.min_hole_size");
  });
});

describe("validateSpec live part-size rules", () => {
  it("fails a part under min_part_width in both directions", () => {
    const { rules } = validateSpec(baseSpec({ width: 0.2, height: 0.2 }), CRS_048);
    const r = rule(rules, "min-part-size")!;
    expect(r.status).toBe("fail");
    expect(r.message).toContain("0.375\"×0.25\"");
    expect(r.message).toContain("materials[sku=CRS-048].cutting_specs.min_part_width");
  });

  it("warns when only the long side is under min_part_length", () => {
    const { rules } = validateSpec(baseSpec({ width: 0.3, height: 0.26 }), CRS_048);
    const r = rule(rules, "min-part-size")!;
    expect(r.status).toBe("warn");
    expect(r.message).toContain("materials[sku=CRS-048].cutting_specs.min_part_length");
  });

  it("passes a normal part", () => {
    const { rules } = validateSpec(baseSpec(), CRS_048);
    expect(rule(rules, "min-part-size")!.status).toBe("pass");
  });

  it("uses the live 44x30 envelope, allowing a rotated fit", () => {
    const fits = validateSpec(baseSpec({ width: 20, height: 40 }), CRS_048);
    expect(rule(fits.rules, "sheet")!.status).toBe("pass");
    expect(rule(fits.rules, "sheet")!.message).toContain("44\"×30\" max");

    const tooBig = validateSpec(baseSpec({ width: 45, height: 10 }), CRS_048);
    expect(rule(tooBig.rules, "sheet")!.status).toBe("fail");
    expect(rule(tooBig.rules, "sheet")!.message).toContain(
      "materials[sku=CRS-048].cutting_specs.max_part_size",
    );
  });

  it("falls back to the snapshot's max sheet when SCS publishes none", () => {
    const { rules } = validateSpec(
      baseSpec({ material: "Galvanized Steel", width: 42, height: 42 }),
      G90_048,
    );
    const r = rule(rules, "sheet")!;
    expect(r.status).toBe("pass");
    expect(r.message).toBe("42\"×42\" fits 43\"×43\" max.");
  });
});

describe("validateSpec live stock status", () => {
  it("warns when the SKU is out of stock", () => {
    const { rules, hasFailures } = validateSpec(baseSpec(), { ...CRS_048, outOfStock: true });
    const r = rule(rules, "stock")!;
    expect(r.status).toBe("warn");
    expect(r.message).toContain("SKU currently out of stock at SendCutSend");
    expect(r.message).toContain("per sendcutsend-catalog.json materials[sku=CRS-048].out_of_stock");
    expect(hasFailures).toBe(false);
  });

  it("stays silent when the SKU is in stock", () => {
    expect(rule(validateSpec(baseSpec(), CRS_048).rules, "stock")).toBeUndefined();
  });
});

describe("validateSpec live bending rules", () => {
  const bent = baseSpec({ bendAngles: "[90]", bendRadius: 0.05 });

  it("fails when SCS publishes no bending_specs for the SKU", () => {
    // The snapshot says Mild Steel (CRS) bends; SCS doesn't bend 0.313" plate.
    const { rules, hasFailures } = validateSpec(
      { ...bent, thickness: 0.313 },
      HRP_313,
    );
    const r = rule(rules, "bend-allowed")!;
    expect(r.status).toBe("fail");
    expect(hasFailures).toBe(true);
    expect(r.message).toContain("SCS does not offer bending for this SKU");
    expect(r.message).toContain("sendcutsend-specs.json materials[sku=HRP-313]");
    expect(rule(rules, "bend-max-angle")).toBeUndefined();
  });

  it("still allows bending when the SKU has bending_specs", () => {
    const { rules } = validateSpec(bent, CRS_048);
    expect(rule(rules, "bend-allowed")).toBeUndefined();
    expect(rule(rules, "bend-max-angle")!.status).toBe("pass");
  });

  it("fails a bend angle beyond max_bend_angle", () => {
    const { rules } = validateSpec({ ...bent, bendAngles: "[90,140]" }, CRS_048);
    const r = rule(rules, "bend-max-angle")!;
    expect(r.status).toBe("fail");
    expect(r.message).toContain("140°");
    expect(r.message).toContain("materials[sku=CRS-048].bending_specs.max_bend_angle");
  });

  it("warns when the requested radius is tighter than SCS's tooling", () => {
    const { rules } = validateSpec({ ...bent, bendRadius: 0.03 }, CRS_048);
    const r = rule(rules, "bend-effective-radius")!;
    expect(r.status).toBe("warn");
    expect(r.message).toContain("R0.045\"");
    expect(r.message).toContain("materials[sku=CRS-048].bending_specs.effective_bend_radius");
  });

  it("warns when the longest side exceeds max_bend_length", () => {
    const { rules } = validateSpec({ ...bent, width: 46, height: 20 }, CRS_048);
    const r = rule(rules, "bend-length")!;
    expect(r.status).toBe("warn");
    expect(r.message).toContain("materials[sku=CRS-048].bending_specs.max_bend_length");
  });

  it("adds no live bend rules when there are no bends", () => {
    const { rules } = validateSpec(baseSpec(), CRS_048);
    expect(rule(rules, "bend-max-angle")).toBeUndefined();
    expect(rule(rules, "bend-effective-radius")).toBeUndefined();
    expect(rule(rules, "bend-length")).toBeUndefined();
  });
});
