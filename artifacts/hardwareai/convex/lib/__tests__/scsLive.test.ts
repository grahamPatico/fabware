import { describe, it, expect } from "vitest";
import {
  CATALOG_NAME_TO_FABWARE,
  liveSkuFor,
  num,
  parseScsFeeds,
  parseSize,
} from "../scsLive";

// Entries copied verbatim from the official feeds fetched 2026-08-16:
//   https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json
//   https://cdn.sendcutsend.com/specs/sendcutsend-specs.json
// Trimmed to the SKUs that exercise a distinct parse path. The full feeds are
// ~780 KB combined and are never committed or fetched at test time.
const CATALOG_FIXTURE = {
  _meta: {
    schema_version: "1.0",
    source: "SendCutSend",
    generated_at: "2026-04-29T20:52:33.873247+00:00",
    material_count: 178,
  },
  materials: [
    {
      sku: "CRS-048",
      name: "A36/1008 Mild Steel",
      category: "Steel",
      subcategory: "CRS",
      group: "Metals",
      form: "sheet",
      base_material: "Metals",
      grade: "A36/1008 Mild Steel",
      thickness: "0.048",
      out_of_stock: false,
      new_material: false,
      limited_material: false,
      cutting_process: "Fiber Laser",
      min_part_size: "0.375x0.25",
      max_part_size: "44 x 30",
      available_services: ["dimple_forming", "bending", "tumbling", "etching", "plating", "powder"],
    },
    {
      sku: "CRS-030",
      name: "A36/1008 Mild Steel",
      category: "Steel",
      subcategory: "CRS",
      group: "Metals",
      form: "sheet",
      base_material: "Metals",
      grade: "A36/1008 Mild Steel",
      thickness: "0.030",
      out_of_stock: false,
      new_material: false,
      limited_material: false,
      cutting_process: "Fiber Laser",
      min_part_size: "0.375x0.25",
      max_part_size: "44 x 30",
      available_services: ["dimple_forming", "bending", "tumbling", "etching", "plating", "powder"],
    },
    // G90 Galvanized is the real material that omits `max_part_size` in BOTH
    // feeds — it drives the fallback-to-snapshot path.
    {
      sku: "G90-048",
      name: "G90 Galvanized",
      category: "Steel",
      subcategory: "",
      group: "Metals",
      form: "sheet",
      base_material: "Metals",
      grade: "G90 Galvanized",
      thickness: "0.048",
      out_of_stock: false,
      new_material: false,
      limited_material: false,
      cutting_process: "Fiber Laser",
      min_part_size: "0.375x0.25",
      available_services: ["dimple_forming", "bending", "powder", "deburring"],
    },
    // Acrylic has no `bending_specs` entry at all — SCS doesn't bend it.
    // Also note: no `available_services` key on this row.
    {
      sku: "ACRYLICCL-118",
      name: "Acrylic-Clear",
      category: "Acrylic",
      group: "Plastics",
      form: "sheet",
      base_material: "Plastics",
      grade: "Acrylic-Clear",
      thickness: "0.118",
      out_of_stock: false,
      new_material: false,
      limited_material: false,
      cutting_process: "CO2 Laser",
      min_part_size: "0.375x0.187",
      max_part_size: "44 x 30",
    },
    // Grade 5 Titanium has no fabware counterpart — must be skipped entirely.
    {
      sku: "TIGR5-040",
      name: "Grade 5 Titanium",
      category: "Titanium",
      group: "Metals",
      form: "sheet",
      base_material: "Metals",
      grade: "Grade 5 Titanium",
      thickness: "0.040",
      out_of_stock: false,
      new_material: false,
      limited_material: false,
      cutting_process: "Fiber Laser",
      min_part_size: "0.375x0.25",
      max_part_size: "44 x 30",
      available_services: ["engraving", "deburring"],
    },
  ],
};

const SPECS_FIXTURE = {
  _meta: {
    schema_version: "1.0",
    source: "SendCutSend",
    generated_at: "2026-04-29T20:52:33.873247+00:00",
    material_count: 178,
    units_note: "All dimensions are in inches",
  },
  materials: [
    {
      sku: "CRS-048",
      cutting_specs: {
        cutting_process: "Fiber Laser",
        flatness_tolerance: "+/-0.030 per foot",
        min_part_size: "0.375x0.25",
        max_part_size: "44 x 30",
        min_hole_size: "0.018",
        min_bridge_size: 0.024,
        min_hole_to_edge: 0.02,
        tab_slot_tolerance: "0.010",
        min_part_length: 0.375,
        min_part_width: 0.25,
        cut_tolerance_positive: "+0.005",
        cut_tolerance_negative: "-0.005",
      },
      bending_specs: {
        min_flat_part_size: "0.375 x 1.5",
        max_flat_part_size: "44 x 30",
        max_bend_length: "44.0",
        min_flange_length_before_bend: "0.255",
        min_flange_length_after_bend: "0.298",
        die_width: "0.472",
        effective_bend_radius: "0.045",
        max_bend_angle: 130.0,
        bend_deduction: "0.086",
        k_factor: "0.38",
        bend_relief_depth: "0.113",
        bend_radius: "0.045",
      },
    },
    {
      sku: "CRS-030",
      cutting_specs: {
        cutting_process: "Fiber Laser",
        min_part_size: "0.375x0.25",
        max_part_size: "44 x 30",
        min_hole_size: "0.015",
        min_bridge_size: 0.015,
        min_hole_to_edge: 0.02,
        min_part_length: 0.375,
        min_part_width: 0.25,
      },
      bending_specs: {
        max_bend_length: "44.0",
        min_flange_length_before_bend: "0.255",
        min_flange_length_after_bend: "0.286",
        effective_bend_radius: "0.045",
        max_bend_angle: 130.0,
        bend_deduction: "0.061",
        k_factor: "0.38",
        bend_relief_depth: "0.095",
      },
    },
    {
      sku: "G90-048",
      cutting_specs: {
        cutting_process: "Fiber Laser",
        min_part_size: "0.375x0.25",
        min_hole_size: "0.020",
        min_bridge_size: 0.024,
        min_hole_to_edge: 0.02,
        tab_slot_tolerance: 0.01,
        min_part_length: 0.375,
        min_part_width: 0.25,
      },
      bending_specs: {
        max_bend_length: "44.0",
        min_flange_length_before_bend: "0.255",
        min_flange_length_after_bend: "0.298",
        effective_bend_radius: "0.045",
        max_bend_angle: 130.0,
        bend_deduction: "0.086",
        k_factor: "0.38",
        bend_relief_depth: "0.113",
      },
    },
    {
      sku: "ACRYLICCL-118",
      cutting_specs: {
        cutting_process: "CO2 Laser",
        min_part_size: "0.375x0.187",
        max_part_size: "44 x 30",
        min_hole_size: "0.047",
        min_bridge_size: 0.053,
        min_hole_to_edge: 0.035,
        min_part_length: 0.375,
        min_part_width: 0.187,
      },
    },
    {
      sku: "TIGR5-040",
      cutting_specs: {
        cutting_process: "Fiber Laser",
        min_hole_size: "0.020",
        min_hole_to_edge: 0.02,
        min_part_length: 0.375,
        min_part_width: 0.25,
        max_part_size: "44 x 30",
      },
    },
  ],
};

// Degenerate feed pair. The catalog row is CRS-030 with `out_of_stock` flipped
// (no mapped material is out of stock in the live feed today — 4130 Chromoly
// and Carbon Fiber are, and neither maps to fabware). The specs row carries the
// "N/A" sentinel SCS emits elsewhere in the feed (CORK-125.flatness_tolerance)
// plus the sparse bending block shape that ALU2024-025 really ships with.
const DEGENERATE_CATALOG = {
  _meta: {},
  materials: [
    {
      sku: "CRS-030",
      name: "A36/1008 Mild Steel",
      thickness: "0.030",
      out_of_stock: true,
      cutting_process: "Fiber Laser",
      max_part_size: "not a size",
    },
    { sku: "", name: "A36/1008 Mild Steel", thickness: "0.048" },
    { name: "A36/1008 Mild Steel", thickness: "0.048" },
    "not an object",
  ],
};

const DEGENERATE_SPECS = {
  materials: [
    {
      sku: "CRS-030",
      cutting_specs: {
        min_hole_size: "N/A",
        min_bridge_size: null,
        min_hole_to_edge: "n/a",
        min_part_length: "",
        max_part_size: "N/A",
      },
      bending_specs: {
        max_bend_length: "44.0",
        max_bend_angle: 130.0,
        k_factor: "0.36",
      },
    },
  ],
};

describe("num", () => {
  it("accepts numbers and numeric strings", () => {
    expect(num(0.022)).toBe(0.022);
    expect(num("0.025")).toBe(0.025);
    expect(num("44.0")).toBe(44);
    expect(num("+0.005")).toBe(0.005);
    expect(num("-0.005")).toBe(-0.005);
  });

  it("returns null for the sentinels the feeds actually emit", () => {
    expect(num("N/A")).toBeNull();
    expect(num("n/a")).toBeNull();
    expect(num("")).toBeNull();
    expect(num("   ")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num(NaN)).toBeNull();
    expect(num({})).toBeNull();
    expect(num(["0.02"])).toBeNull();
  });
});

describe("parseSize", () => {
  it("parses every spacing/casing variant the feeds use", () => {
    expect(parseSize("44 x 30")).toEqual({ w: 44, h: 30 });
    expect(parseSize("3.0x3.0")).toEqual({ w: 3, h: 3 });
    expect(parseSize("0.375x0.187")).toEqual({ w: 0.375, h: 0.187 });
    expect(parseSize("1.00 x 2.00")).toEqual({ w: 1, h: 2 });
    expect(parseSize(" 44 X 30 ")).toEqual({ w: 44, h: 30 });
  });

  it("returns null rather than a fabricated size", () => {
    expect(parseSize("N/A")).toBeNull();
    expect(parseSize("44")).toBeNull();
    expect(parseSize("44 x")).toBeNull();
    expect(parseSize("0 x 30")).toBeNull();
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize(44)).toBeNull();
  });
});

describe("parseScsFeeds", () => {
  const rules = parseScsFeeds(CATALOG_FIXTURE, SPECS_FIXTURE);

  it("reads generatedAt from the specs _meta", () => {
    expect(rules.generatedAt).toBe("2026-04-29T20:52:33.873247+00:00");
  });

  it("maps SCS catalog names onto fabware material names", () => {
    expect(Object.keys(rules.materials).sort()).toEqual([
      "Acrylic Clear",
      "Galvanized Steel",
      "Mild Steel (CRS)",
    ]);
    // Every mapped name must exist as a fabware key.
    expect(CATALOG_NAME_TO_FABWARE["A36/1008 Mild Steel"]).toBe("Mild Steel (CRS)");
  });

  it("skips SCS materials with no fabware counterpart", () => {
    const skus = Object.values(rules.materials).flat().map((s) => s.sku);
    expect(skus).not.toContain("TIGR5-040");
  });

  it("sorts each material's SKUs by ascending thickness", () => {
    expect(rules.materials["Mild Steel (CRS)"].map((s) => s.sku)).toEqual(["CRS-030", "CRS-048"]);
  });

  it("joins catalog + specs on sku for a bending material", () => {
    const crs = rules.materials["Mild Steel (CRS)"].find((s) => s.sku === "CRS-048")!;
    expect(crs.thickness).toBe(0.048);
    expect(crs.outOfStock).toBe(false);
    expect(crs.cuttingProcess).toBe("Fiber Laser");
    expect(crs.minHoleSize).toBe(0.018);
    expect(crs.minBridgeSize).toBe(0.024);
    expect(crs.minHoleToEdge).toBe(0.02);
    expect(crs.minPartLength).toBe(0.375);
    expect(crs.minPartWidth).toBe(0.25);
    expect(crs.maxPartSize).toEqual({ w: 44, h: 30 });
    expect(crs.bending).toEqual({
      minFlangeBefore: 0.255,
      minFlangeAfter: 0.298,
      maxBendLength: 44,
      effectiveBendRadius: 0.045,
      maxBendAngle: 130,
      kFactor: 0.38,
      bendDeduction: 0.086,
      bendReliefDepth: 0.113,
    });
  });

  it("leaves bending null when SCS publishes no bending_specs", () => {
    const acrylic = rules.materials["Acrylic Clear"][0];
    expect(acrylic.sku).toBe("ACRYLICCL-118");
    expect(acrylic.bending).toBeNull();
    expect(acrylic.cuttingProcess).toBe("CO2 Laser");
    expect(acrylic.minHoleSize).toBe(0.047);
  });

  it("leaves maxPartSize null when both feeds omit it", () => {
    const g90 = rules.materials["Galvanized Steel"][0];
    expect(g90.sku).toBe("G90-048");
    expect(g90.maxPartSize).toBeNull();
    expect(g90.minHoleSize).toBe(0.02);
    expect(g90.bending?.effectiveBendRadius).toBe(0.045);
  });

  it("degrades N/A, null and missing values to null instead of fabricating them", () => {
    const degenerate = parseScsFeeds(DEGENERATE_CATALOG, DEGENERATE_SPECS);
    const crs = degenerate.materials["Mild Steel (CRS)"];
    expect(crs).toHaveLength(1);
    expect(crs[0].sku).toBe("CRS-030");
    expect(crs[0].outOfStock).toBe(true);
    expect(crs[0].minHoleSize).toBeNull();
    expect(crs[0].minBridgeSize).toBeNull();
    expect(crs[0].minHoleToEdge).toBeNull();
    expect(crs[0].minPartLength).toBeNull();
    expect(crs[0].minPartWidth).toBeNull();
    expect(crs[0].maxPartSize).toBeNull();
    expect(crs[0].bending).toEqual({
      minFlangeBefore: null,
      minFlangeAfter: null,
      maxBendLength: 44,
      effectiveBendRadius: null,
      maxBendAngle: 130,
      kFactor: 0.36,
      bendDeduction: null,
      bendReliefDepth: null,
    });
    expect(degenerate.generatedAt).toBeNull();
  });

  it("survives entirely wrong input", () => {
    expect(parseScsFeeds({}, {})).toEqual({ generatedAt: null, materials: {} });
    expect(parseScsFeeds(null, undefined)).toEqual({ generatedAt: null, materials: {} });
    expect(parseScsFeeds("nope", 42)).toEqual({ generatedAt: null, materials: {} });
  });
});

describe("liveSkuFor", () => {
  const rules = parseScsFeeds(CATALOG_FIXTURE, SPECS_FIXTURE);

  it("matches an exact thickness", () => {
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.03)?.sku).toBe("CRS-030");
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.048)?.sku).toBe("CRS-048");
  });

  it("matches within the ±0.0015\" stock tolerance", () => {
    // Fabware's snapshot rounds where SCS doesn't (0.060 vs SCS's 0.059).
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.049)?.sku).toBe("CRS-048");
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.047)?.sku).toBe("CRS-048");
    // Exactly on the boundary, where binary rounding would otherwise miss.
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.0315)?.sku).toBe("CRS-030");
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.0495)?.sku).toBe("CRS-048");
  });

  it("returns null outside the tolerance", () => {
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.052)).toBeNull();
    expect(liveSkuFor(rules, "Mild Steel (CRS)", 0.25)).toBeNull();
  });

  it("returns null for unknown material, missing rules, or a non-finite thickness", () => {
    expect(liveSkuFor(rules, "Aluminum 6061", 0.125)).toBeNull();
    expect(liveSkuFor(rules, "Unobtainium", 0.048)).toBeNull();
    expect(liveSkuFor(rules, undefined, 0.048)).toBeNull();
    expect(liveSkuFor(null, "Mild Steel (CRS)", 0.048)).toBeNull();
    expect(liveSkuFor(rules, "Mild Steel (CRS)", NaN)).toBeNull();
  });
});
