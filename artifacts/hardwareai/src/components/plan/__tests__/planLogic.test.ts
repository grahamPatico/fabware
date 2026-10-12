import { describe, it, expect } from "vitest";
import {
  applicableStages,
  PCB_CHECKLIST,
  STAGE_IDS,
  type PcbBoard,
  type SourcingItem,
} from "../../../../convex/lib/journey";
import {
  APPROACH_ORDER,
  checklistItemKey,
  checklistProgress,
  checklistStorageKey,
  conceptImageSrc,
  defaultStage,
  formatCatalogDate,
  formatDate,
  formatEnvelope,
  formatNumber,
  formatUsd,
  groupSourcingLines,
  hashForStage,
  nextApplicableStage,
  parseChecklistState,
  pcbChecklistGroups,
  pcbDrawing,
  PROJECT_CHECKS_GROUP,
  railMark,
  resolveSelectedStage,
  safeHttpUrl,
  serializeChecklistState,
  shouldGenerateOnContinue,
  sourcingLineUrl,
  sourcingUnitCost,
  stageFromHash,
  suppliersInLines,
  tierLabel,
} from "../planLogic";
import { FIXTURES, FULL_VIEW, MID_VIEW, NEW_VIEW } from "../__fixtures__/journeyView";

function line(overrides: Partial<SourcingItem>): SourcingItem {
  return {
    need: "A part",
    approach: "buy",
    supplierId: "mcmaster",
    searchQuery: "",
    partNumber: null,
    qty: 1,
    estUnitCostUsd: null,
    why: "",
    url: "https://www.mcmaster.com/",
    verified: false,
    live: null,
    ...overrides,
  };
}

describe("hash <-> stage", () => {
  it("round-trips every stage id", () => {
    for (const id of STAGE_IDS) expect(stageFromHash(hashForStage(id))).toBe(id);
  });

  it("accepts a hash with or without the #, in any case", () => {
    expect(stageFromHash("#sourcing")).toBe("sourcing");
    expect(stageFromHash("sourcing")).toBe("sourcing");
    expect(stageFromHash("#PCB")).toBe("pcb");
  });

  it("returns null for anything that is not a stage", () => {
    expect(stageFromHash("")).toBeNull();
    expect(stageFromHash("#")).toBeNull();
    expect(stageFromHash("#export")).toBeNull();
    expect(stageFromHash("#idea/extra")).toBeNull();
  });
});

describe("stage selection", () => {
  const hobbyNoElec = applicableStages("hobby", false);

  it("opens on the next stage to do", () => {
    expect(defaultStage({ applicable: hobbyNoElec, nextStage: "sourcing" })).toBe("sourcing");
  });

  it("opens on the last stage when everything is done", () => {
    expect(defaultStage({ applicable: hobbyNoElec, nextStage: null })).toBe("build");
  });

  it("ignores a next stage this project doesn't have", () => {
    expect(defaultStage({ applicable: hobbyNoElec, nextStage: "pcb" })).toBe("build");
  });

  it("returns null when there are no stages", () => {
    expect(defaultStage({ applicable: [], nextStage: null })).toBeNull();
    expect(resolveSelectedStage({ applicable: [], nextStage: null }, "idea")).toBeNull();
  });

  it("keeps a wanted stage the project has", () => {
    expect(resolveSelectedStage({ applicable: hobbyNoElec, nextStage: "sourcing" }, "idea")).toBe("idea");
  });

  it("falls back to the default for a stage the project skips", () => {
    expect(resolveSelectedStage({ applicable: hobbyNoElec, nextStage: "sourcing" }, "validate")).toBe("sourcing");
    expect(resolveSelectedStage({ applicable: hobbyNoElec, nextStage: "sourcing" }, null)).toBe("sourcing");
  });

  it("walks the applicable list, skipping stages the project doesn't have", () => {
    expect(nextApplicableStage(hobbyNoElec, "idea")).toBe("requirements");
    expect(nextApplicableStage(hobbyNoElec, "mechanical")).toBe("build");
    expect(nextApplicableStage(hobbyNoElec, "build")).toBeNull();
    expect(nextApplicableStage(hobbyNoElec, "pcb")).toBeNull();
    expect(nextApplicableStage(applicableStages("product", true), "idea")).toBe("validate");
  });

  it("generates on continue only for an unwritten, idle, generated stage", () => {
    expect(shouldGenerateOnContinue(NEW_VIEW, "requirements")).toBe(true);
    expect(shouldGenerateOnContinue(NEW_VIEW, "idea")).toBe(false); // already generating
    expect(shouldGenerateOnContinue(NEW_VIEW, "mechanical")).toBe(false); // studio stage
    expect(shouldGenerateOnContinue(FULL_VIEW, "electronics")).toBe(false); // has content
    expect(shouldGenerateOnContinue(MID_VIEW, "build")).toBe(true); // failed, no content
    expect(shouldGenerateOnContinue({ stages: {} }, "sourcing")).toBe(true);
  });

  it("maps a status to its rail mark", () => {
    expect(railMark(undefined)).toBe("todo");
    expect(railMark("todo")).toBe("todo");
    expect(railMark("generating")).toBe("working");
    expect(railMark("ready")).toBe("review");
    expect(railMark("done")).toBe("done");
    expect(railMark("error")).toBe("error");
  });
});

describe("formatting", () => {
  it("formats money, with unknown for null", () => {
    expect(formatUsd(null)).toBe("unknown");
    expect(formatUsd(undefined)).toBe("unknown");
    expect(formatUsd(Number.NaN)).toBe("unknown");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(12)).toBe("$12");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(32.14)).toBe("$32.14");
    expect(formatUsd(1250)).toBe("$1,250");
    expect(formatUsd(1250.4)).toBe("$1,250.40");
  });

  it("drops trailing zeros from plain numbers", () => {
    expect(formatNumber(4)).toBe("4");
    expect(formatNumber(4.5)).toBe("4.5");
    expect(formatNumber(0.2)).toBe("0.2");
    expect(formatNumber(1.6000001)).toBe("1.6");
  });

  it("formats the envelope with unknown for missing sides", () => {
    expect(formatEnvelope({ widthIn: 6, depthIn: 4, heightIn: 2.5, note: "" })).toBe("6 × 4 × 2.5 in");
    expect(formatEnvelope({ widthIn: 6.3, depthIn: 4.3, heightIn: null, note: "" })).toBe("6.3 × 4.3 × unknown in");
    expect(formatEnvelope({ widthIn: null, depthIn: null, heightIn: null, note: "" })).toBe("unknown");
  });

  it("formats dates in one fixed locale", () => {
    expect(formatDate(new Date(2026, 9, 12, 12).getTime())).toBe("Oct 12, 2026");
    expect(formatDate(null)).toBe("unknown");
    expect(formatCatalogDate("2026-10-09")).toBe("Oct 9, 2026");
    expect(formatCatalogDate("last week")).toBe("last week");
  });

  it("uses the composer's tier labels", () => {
    expect(tierLabel("jerry-rigged")).toBe("Quick and cheap");
    expect(tierLabel("mvp")).toBe("Prototype");
    expect(tierLabel("commercial")).toBe("Production");
  });

  it("turns an SVG concept into a data URL and never into markup", () => {
    const src = conceptImageSrc({ kind: "svg", svg: '<svg onload="alert(1)"><text>50% & more</text></svg>', prompt: "" });
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toContain("<");
    expect(src).not.toContain('"');
    expect(decodeURIComponent(src.split(",")[1])).toContain("50% & more");
    expect(conceptImageSrc({ kind: "image", url: "https://example.com/a.png", prompt: "" })).toBe(
      "https://example.com/a.png",
    );
  });

  it("only passes http and https links", () => {
    expect(safeHttpUrl("https://www.mcmaster.com/8880T58/")).toBe("https://www.mcmaster.com/8880T58/");
    expect(safeHttpUrl(" http://example.com ")).toBe("http://example.com");
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
  });
});

describe("sourcing lines", () => {
  it("groups by approach in a fixed order and keeps line order", () => {
    const groups = groupSourcingLines([
      line({ need: "driver", approach: "electronics" }),
      line({ need: "bolt", approach: "buy" }),
      line({ need: "box", approach: "enclosure" }),
      line({ need: "nut", approach: "buy" }),
    ]);
    expect(groups.map((g) => g.approach)).toEqual(["buy", "enclosure", "electronics"]);
    expect(groups.map((g) => g.heading)).toEqual(["Buy off the shelf", "Enclosure", "Electronic parts"]);
    expect(groups[0].items.map((i) => i.need)).toEqual(["bolt", "nut"]);
  });

  it("returns no groups for no lines", () => {
    expect(groupSourcingLines([])).toEqual([]);
  });

  it("covers every approach in the fixture, in order", () => {
    const groups = groupSourcingLines(FULL_VIEW.stages.sourcing!.content!.items);
    expect(groups.map((g) => g.approach)).toEqual([...APPROACH_ORDER]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(FULL_VIEW.stages.sourcing!.content!.items.length);
  });

  it("prefers the live price and the live product page", () => {
    const live = {
      productName: "WC-33",
      partNumber: "WC-33",
      productUrl: "https://www.polycase.com/wc-33",
      priceUsd: 32.14,
      fitSummary: "",
      purchaseNote: "",
      modelGlbUrl: null,
      asOf: "2026-10-09",
    };
    const item = line({ estUnitCostUsd: 30, url: "https://www.polycase.com/search", verified: true, live });
    expect(sourcingUnitCost(item)).toBe(32.14);
    expect(sourcingLineUrl(item)).toBe("https://www.polycase.com/wc-33");
    // A live record with no price falls back to the estimate.
    expect(sourcingUnitCost({ estUnitCostUsd: 30, live: { ...live, priceUsd: null } })).toBe(30);
    // A live record with no page falls back to the registry link.
    expect(sourcingLineUrl({ url: "https://www.polycase.com/search", live: { ...live, productUrl: "" } })).toBe(
      "https://www.polycase.com/search",
    );
  });

  it("has no cost and no link when neither is known", () => {
    expect(sourcingUnitCost(line({}))).toBeNull();
    expect(sourcingLineUrl(line({ url: "" }))).toBeNull();
  });

  it("lists each supplier once, in first-seen order", () => {
    const suppliers = suppliersInLines([
      { supplierId: "polycase" },
      { supplierId: "mcmaster" },
      { supplierId: "polycase" },
      { supplierId: "digikey" },
    ]);
    expect(suppliers.map((s) => s.id)).toEqual(["polycase", "mcmaster", "digikey"]);
    expect(suppliers[1].cadNote).toContain("never downloads");
  });
});

describe("PCB checklist", () => {
  const projectChecks = [{ text: "Keep the motor away from the antenna.", why: "Noise." }];
  const groups = pcbChecklistGroups({ checklist: [...PCB_CHECKLIST], projectChecks });
  const standardTotal = PCB_CHECKLIST.reduce((n, g) => n + g.items.length, 0);

  it("puts the project's checks last, in their own group", () => {
    expect(groups).toHaveLength(PCB_CHECKLIST.length + 1);
    expect(groups[groups.length - 1].group).toBe(PROJECT_CHECKS_GROUP);
    expect(pcbChecklistGroups({ checklist: [...PCB_CHECKLIST], projectChecks: [] })).toHaveLength(
      PCB_CHECKLIST.length,
    );
  });

  it("counts checked lines and ignores saved keys that no longer exist", () => {
    expect(checklistProgress(groups, new Set())).toEqual({ checked: 0, total: standardTotal + 1 });
    const checked = new Set([
      checklistItemKey(PCB_CHECKLIST[0].group, PCB_CHECKLIST[0].items[0].text),
      checklistItemKey(PROJECT_CHECKS_GROUP, projectChecks[0].text),
      checklistItemKey("Gone", "A line from an older plan"),
    ]);
    expect(checklistProgress(groups, checked)).toEqual({ checked: 2, total: standardTotal + 1 });
  });

  it("saves and restores the checked set, and survives bad stored data", () => {
    const checked = new Set(["b::two", "a::one"]);
    expect(serializeChecklistState(checked)).toBe('["a::one","b::two"]');
    expect(parseChecklistState(serializeChecklistState(checked))).toEqual(checked);
    expect(parseChecklistState(null)).toEqual(new Set());
    expect(parseChecklistState("not json")).toEqual(new Set());
    expect(parseChecklistState('{"a":1}')).toEqual(new Set());
    expect(parseChecklistState('["ok", 3, null]')).toEqual(new Set(["ok"]));
  });

  it("keeps one saved list per project", () => {
    expect(checklistStorageKey("abc")).not.toBe(checklistStorageKey("abd"));
  });
});

describe("PCB outline drawing", () => {
  const board: PcbBoard = {
    widthMm: 100,
    heightMm: 70,
    cornerRadiusMm: 3,
    thicknessMm: 1.6,
    layers: 2,
    mountingHoles: [
      { xMm: 5, yMm: 5, diameterMm: 3.2 },
      { xMm: 95, yMm: 65, diameterMm: 3.2 },
    ],
    outlineBasis: "",
  };

  it("draws the outline and holes in millimetres", () => {
    const drawing = pcbDrawing(board)!;
    expect(drawing.board).toEqual({ x: 0, y: 0, width: 100, height: 70, radius: 3 });
    expect(drawing.holes).toEqual([
      { cx: 5, cy: 5, r: 1.6 },
      { cx: 95, cy: 65, r: 1.6 },
    ]);
    expect(drawing.viewBox).toBe("-6 -6 112 82");
  });

  it("caps the corner radius and drops holes off the board", () => {
    const drawing = pcbDrawing({
      ...board,
      cornerRadiusMm: 500,
      mountingHoles: [
        { xMm: 50, yMm: 35, diameterMm: 3 },
        { xMm: 150, yMm: 35, diameterMm: 3 },
        { xMm: 50, yMm: 35, diameterMm: 0 },
      ],
    })!;
    expect(drawing.board.radius).toBe(35);
    expect(drawing.holes).toHaveLength(1);
  });

  it("returns nothing for a board with no size", () => {
    expect(pcbDrawing({ ...board, widthMm: 0 })).toBeNull();
    expect(pcbDrawing({ ...board, heightMm: Number.NaN })).toBeNull();
  });
});

describe("fixtures", () => {
  it("only carry stages the project walks through", () => {
    for (const { view } of Object.values(FIXTURES)) {
      expect(Object.keys(view.stages).sort()).toEqual([...view.applicable].sort());
      if (view.nextStage) expect(view.applicable).toContain(view.nextStage);
    }
  });
});
