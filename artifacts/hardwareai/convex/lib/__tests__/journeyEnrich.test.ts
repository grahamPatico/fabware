import { describe, it, expect } from "vitest";
import {
  PCB_CHECKLIST, SAFE_PCB_RULES,
  type IdeaContent, type RequirementsContent, type SourcingContent, type SourcingLive,
} from "../journey";
import {
  MECHANICAL_BRIEF_MAX_CHARS, buildOrderGroups, enrichElectronics, enrichPcb, enrichSourcing,
  mechanicalBrief, scopeFromRequirements,
} from "../journeyEnrich";
import type { PcbOutput, SourcingItemOutput } from "../journeySchemas";

const line = (over: Partial<SourcingItemOutput>): SourcingItemOutput => ({
  need: "M4 screws", approach: "buy", supplierId: "mcmaster", searchQuery: "M4 x 12 socket head",
  partNumber: null, qty: 4, estUnitCostUsd: 0.25, why: "", ...over,
});

const LIVE: SourcingLive = {
  productName: "WC-33 Outdoor Enclosure", partNumber: "WC-33", productUrl: "https://www.polycase.com/wc-33",
  priceUsd: 30, fitSummary: "Internal space 150 × 100 × 60 mm meets the requested minimum. Rated for outdoor use.",
  purchaseNote: "Double-check before purchasing.", modelGlbUrl: "https://polycase-mcp.vercel.app/api/models/WC-33/model.glb",
  asOf: "2026-08-22",
};

const REQ: RequirementsContent = {
  summary: "A weatherproof box for a gate controller",
  functional: ["Opens the gate"],
  envelope: { widthIn: 6, depthIn: 4, heightIn: 3, note: "" },
  environment: { location: "outdoor", waterproof: true, notes: "Full sun" },
  power: "12 V battery", quantity: 10, budgetUsd: 400, tier: "mvp",
  constraints: ["Mounts to a 2 in post"], successCriteria: [],
};

describe("enrichSourcing", () => {
  it("turns a McMaster part number outside the checked seed into a search", () => {
    const out = enrichSourcing({ items: [line({ partNumber: "91290A168" })], notes: [] });
    expect(out.items[0]).toMatchObject({
      partNumber: null,
      url: "https://www.mcmaster.com/M4%20x%2012%20socket%20head/",
      verified: false,
    });
  });

  it("builds links from the registry and marks only live lines as verified", () => {
    const out = enrichSourcing(
      {
        items: [
          line({ partNumber: "91251A536" }),
          line({ need: "Enclosure", approach: "enclosure", supplierId: "polycase", searchQuery: "outdoor box" }),
          line({ need: "Bracket", approach: "laser_cut", supplierId: "sendcutsend" }),
        ],
        notes: ["n"],
      },
      { 1: LIVE },
    );
    expect(out.items[0]).toMatchObject({ url: "https://www.mcmaster.com/91251A536/", verified: false, live: null });
    expect(out.items[1]).toMatchObject({
      url: "https://www.polycase.com/catalogsearch/result/?q=outdoor%20box", verified: true, live: LIVE,
    });
    expect(out.items[2]).toMatchObject({ url: "https://sendcutsend.com", verified: false });
    expect(out.notes).toEqual(["n"]);
  });

  it("never attaches catalog data or geometry to a link-only supplier", () => {
    const out = enrichSourcing({ items: [line({})], notes: [] }, { 0: LIVE });
    expect(out.items[0].live).toBeNull();
    expect(out.items[0].verified).toBe(false);
  });

  it("works with no live data at all", () => {
    const out = enrichSourcing({ items: [line({ approach: "enclosure", supplierId: "polycase" })], notes: [] });
    expect(out.items[0]).toMatchObject({ verified: false, live: null });
  });
});

describe("enrichElectronics", () => {
  it("fills each candidate's link", () => {
    const out = enrichElectronics({
      summary: "s", prototypeFirst: "",
      blocks: [{ name: "MCU", role: "", candidates: [{ part: "ESP32-C3", why: "", supplierId: "lcsc", searchQuery: "ESP32-C3-MINI-1" }] }],
      power: { source: "", rails: [], runtimeNote: "" }, interfaces: [], firmware: [], risks: [],
    });
    expect(out.blocks[0].candidates[0].url).toBe("https://www.lcsc.com/search?q=ESP32-C3-MINI-1");
  });
});

describe("enrichPcb", () => {
  const board = (over: Partial<PcbOutput["board"]>): PcbOutput => ({
    board: {
      widthMm: 80, heightMm: 50, cornerRadiusMm: 2, thicknessMm: 1.6, layers: 2,
      mountingHoles: [], outlineBasis: "fits the box", ...over,
    },
    fab: { supplierId: "jlcpcb", why: "cheap" },
    projectChecks: [{ text: "Check the antenna", why: "range" }],
    nextSteps: ["Draw the schematic"],
  });

  it("sets the curated rules and checklist", () => {
    const out = enrichPcb(board({}));
    expect(out.rules).toEqual(SAFE_PCB_RULES);
    expect(out.checklist).toEqual(PCB_CHECKLIST);
    expect(out.projectChecks).toHaveLength(1);
    expect(out.board).toMatchObject({ widthMm: 80, heightMm: 50, cornerRadiusMm: 2, layers: 2 });
  });

  it("clamps the outline, radius, thickness and layer count", () => {
    expect(enrichPcb(board({ widthMm: 2, heightMm: 9000 })).board).toMatchObject({ widthMm: 10, heightMm: 500 });
    expect(enrichPcb(board({ cornerRadiusMm: 400 })).board.cornerRadiusMm).toBe(25);
    expect(enrichPcb(board({ cornerRadiusMm: -3 })).board.cornerRadiusMm).toBe(0);
    expect(enrichPcb(board({ thicknessMm: 0 })).board.thicknessMm).toBe(1.6);
    expect(enrichPcb(board({ thicknessMm: Number.NaN })).board.thicknessMm).toBe(1.6);
    expect(enrichPcb(board({ layers: 3 })).board.layers).toBe(4);
    expect(enrichPcb(board({ layers: 6 })).board.layers).toBe(4);
    expect(enrichPcb(board({ layers: 1 })).board.layers).toBe(2);
  });

  it("drops holes outside the outline or too close to the edge", () => {
    const edge = SAFE_PCB_RULES.minHoleToEdgeMm + 3.2 / 2; // 2.1 mm
    const out = enrichPcb(board({
      cornerRadiusMm: 0,
      mountingHoles: [
        { xMm: 4, yMm: 4, diameterMm: 3.2 },           // fine
        { xMm: edge, yMm: 25, diameterMm: 3.2 },       // exactly at the limit
        { xMm: edge - 0.1, yMm: 25, diameterMm: 3.2 }, // too close to the left edge
        { xMm: 79, yMm: 25, diameterMm: 3.2 },         // too close to the right edge
        { xMm: 40, yMm: 60, diameterMm: 3.2 },         // below the board
        { xMm: -5, yMm: 10, diameterMm: 3.2 },         // left of the board
        { xMm: 40, yMm: 25, diameterMm: 0 },           // not a hole
      ],
    }));
    expect(out.board.mountingHoles).toEqual([
      { xMm: 4, yMm: 4, diameterMm: 3.2 },
      { xMm: 2.1, yMm: 25, diameterMm: 3.2 },
    ]);
  });

  it("measures a corner hole against the rounded corner, not the square one", () => {
    const hole = { xMm: 3, yMm: 3, diameterMm: 3.2 };
    expect(enrichPcb(board({ cornerRadiusMm: 0, mountingHoles: [hole] })).board.mountingHoles).toHaveLength(1);
    // With a 10 mm corner the same spot is 0.1 mm from the arc.
    expect(enrichPcb(board({ cornerRadiusMm: 10, mountingHoles: [hole] })).board.mountingHoles).toHaveLength(0);
  });
});

describe("buildOrderGroups", () => {
  const sourcing: SourcingContent = enrichSourcing(
    {
      items: [
        line({ need: "PCB", approach: "pcb", supplierId: "jlcpcb", qty: 5, estUnitCostUsd: 2 }),
        line({ need: "Enclosure", approach: "enclosure", supplierId: "polycase", qty: 2, estUnitCostUsd: 99 }),
        line({ need: "Screws", qty: 8, estUnitCostUsd: 0.25 }),
        line({ need: "Hinge", qty: 2, estUnitCostUsd: null }),
        line({ need: "Bracket", approach: "laser_cut", supplierId: "sendcutsend", qty: 1, estUnitCostUsd: null }),
      ],
      notes: [],
    },
    { 1: LIVE },
  );

  it("groups by supplier in registry order", () => {
    const { orderGroups } = buildOrderGroups(sourcing);
    expect(orderGroups.map((g) => g.supplierId)).toEqual(["mcmaster", "polycase", "sendcutsend", "jlcpcb"]);
    expect(orderGroups[0].lines.map((l) => l.need)).toEqual(["Screws", "Hinge"]);
  });

  it("sums only the lines with a known cost", () => {
    const { orderGroups, estTotalUsd } = buildOrderGroups(sourcing);
    expect(orderGroups[0].subtotalUsd).toBe(2);       // 8 x 0.25; the hinge is unknown
    expect(orderGroups[2].subtotalUsd).toBeNull();    // nothing known at SendCutSend
    expect(orderGroups[3].subtotalUsd).toBe(10);
    expect(estTotalUsd).toBe(72);                     // 2 + 60 + 10
  });

  it("prefers the live price and product page over the estimate and the search link", () => {
    const polycase = buildOrderGroups(sourcing).orderGroups[1];
    expect(polycase.lines[0]).toEqual({
      need: "Enclosure", qty: 2, url: "https://www.polycase.com/wc-33", estUnitCostUsd: 30,
    });
    expect(polycase.subtotalUsd).toBe(60);
  });

  it("returns nothing for a missing sourcing stage, and a null total when no cost is known", () => {
    expect(buildOrderGroups(null)).toEqual({ orderGroups: [], estTotalUsd: null });
    const unknown = enrichSourcing({ items: [line({ estUnitCostUsd: null })], notes: [] });
    expect(buildOrderGroups(unknown).estTotalUsd).toBeNull();
  });
});

describe("scopeFromRequirements", () => {
  it("maps requirements onto the project scope", () => {
    expect(scopeFromRequirements(REQ)).toEqual({
      tier: "mvp",
      environment: { location: "outdoor", waterproof: true },
      useCase: "A weatherproof box for a gate controller",
      budgetCeiling: 400,
      referenceScale: { kind: "envelope", dimensions: { w: 6, d: 4, h: 3 }, quantity: 10 },
    });
  });

  it("leaves out the reference scale unless all three dimensions are known", () => {
    const scope = scopeFromRequirements({
      ...REQ, budgetUsd: null, envelope: { widthIn: 6, depthIn: null, heightIn: 3, note: "" },
    });
    expect(scope).not.toHaveProperty("referenceScale");
    expect(scope).not.toHaveProperty("budgetCeiling");
  });
});

describe("mechanicalBrief", () => {
  const idea = { oneLiner: "A solar gate opener for farm gates." } as IdeaContent;
  const sourcing = enrichSourcing(
    {
      items: [
        line({ need: "Enclosure", approach: "enclosure", supplierId: "polycase" }),
        line({ need: "Hinge", partNumber: "91251A536", qty: 2 }),
        line({ need: "Motor bracket", approach: "laser_cut", supplierId: "sendcutsend", qty: 1 }),
        line({ need: "Cable gland boss", approach: "print_3d", supplierId: "print_self", qty: 2 }),
        line({ need: "Controller board", approach: "pcb", supplierId: "jlcpcb" }),
      ],
      notes: [],
    },
    { 0: LIVE },
  );

  it("says what to design, what is bought and the targets", () => {
    const brief = mechanicalBrief({ projectName: "Gate", idea, requirements: REQ, sourcing });
    expect(brief).toContain("A solar gate opener for farm gates.");
    expect(brief).toContain("6 x 4 x 3 in");
    expect(brief).toContain("outdoor, waterproof");
    expect(brief).toContain("Mounts to a 2 in post");
    expect(brief).toContain("WC-33 Outdoor Enclosure (Polycase WC-33). Internal space 150 × 100 × 60 mm");
    expect(brief).toContain("2 x Hinge (McMaster-Carr 91251A536)");
    expect(brief).toContain("Motor bracket (laser-cut sheet metal, qty 1)");
    expect(brief).toContain("Cable gland boss (3D printed, qty 2)");
    expect(brief).not.toContain("Controller board"); // boards are not mechanical parts
    expect(brief).not.toContain("—");
  });

  it("still gives a usable brief before any stage is written", () => {
    const brief = mechanicalBrief({ projectName: "Gate opener", idea: null, requirements: null, sourcing: null });
    expect(brief).toContain("Gate opener");
    expect(brief).toContain("work out which laser-cut and 3D printed parts");
  });

  it("stays under the length limit however long the plan is", () => {
    const long = "x".repeat(900);
    const many = enrichSourcing({
      items: Array.from({ length: 20 }, (_, i) =>
        line({ need: `${long} ${i}`, approach: i % 2 ? "buy" : "laser_cut", supplierId: i % 2 ? "mcmaster" : "sendcutsend" })),
      notes: [],
    });
    const brief = mechanicalBrief({
      projectName: "P", idea: { oneLiner: long } as IdeaContent,
      requirements: { ...REQ, constraints: [long, long, long, long] }, sourcing: many,
    });
    expect(brief.length).toBeLessThanOrEqual(MECHANICAL_BRIEF_MAX_CHARS);
    expect(brief.startsWith("Design the custom mechanical parts for:")).toBe(true);
  });
});
