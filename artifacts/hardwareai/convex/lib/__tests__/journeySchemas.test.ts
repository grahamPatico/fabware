import { describe, it, expect } from "vitest";
import { GENERATED_STAGE_IDS } from "../journey";
import {
  MAX_LIST_ITEMS, MAX_SOURCING_ITEMS, extractJson, parseStageOutput, stageJsonSchema,
} from "../journeySchemas";

const idea = {
  oneLiner: "  A solar gate opener for farm gates.  ",
  problem: "Getting out of the truck to open a gate.",
  whoItsFor: "Ranchers",
  howItWorks: ["Press the remote", "The arm swings the gate"],
  keyFeatures: ["Solar charged"],
  needsElectronics: true,
  electronicsReason: "It drives a motor from a battery.",
  openQuestions: [],
  conceptImagePrompt: "A grey box with a linear arm on a steel gate post",
};

describe("parseStageOutput", () => {
  it("trims strings and keeps a well-formed idea", () => {
    const out = parseStageOutput("idea", idea);
    expect(out.oneLiner).toBe("A solar gate opener for farm gates.");
    expect(out.needsElectronics).toBe(true);
    expect(out.howItWorks).toHaveLength(2);
  });

  it("defaults missing lists to [] and missing text to an empty string", () => {
    const out = parseStageOutput("idea", { oneLiner: "A bracket" });
    expect(out.howItWorks).toEqual([]);
    expect(out.openQuestions).toEqual([]);
    expect(out.problem).toBe("");
    expect(out.needsElectronics).toBe(false);
    // The picture can always be drawn from the one-liner.
    expect(out.conceptImagePrompt).toBe("A bracket");
  });

  it("accepts the reply as text, bare or fenced", () => {
    expect(parseStageOutput("idea", JSON.stringify(idea)).oneLiner).toContain("gate opener");
    const fenced = "Here is the plan.\n```json\n" + JSON.stringify(idea) + "\n```";
    expect(parseStageOutput("idea", fenced).whoItsFor).toBe("Ranchers");
  });

  it("rejects an idea with no one-liner, naming the field", () => {
    expect(() => parseStageOutput("idea", { problem: "x" })).toThrow(/idea answer was not usable: oneLiner/);
  });

  it("rejects replies that are not an object", () => {
    expect(() => parseStageOutput("idea", "no json here")).toThrow(/JSON object/);
    expect(() => parseStageOutput("idea", [idea])).toThrow(/not a JSON object/);
    expect(() => parseStageOutput("build", null)).toThrow(/not a JSON object/);
  });

  it("clamps long lists", () => {
    const many = Array.from({ length: 40 }, (_, i) => `feature ${i}`);
    expect(parseStageOutput("idea", { ...idea, keyFeatures: many }).keyFeatures).toHaveLength(MAX_LIST_ITEMS);
  });

  it("coerces numeric strings and treats junk as unknown", () => {
    const out = parseStageOutput("requirements", {
      summary: "A weatherproof sensor box",
      envelope: { widthIn: "6", depthIn: "4.5 in", heightIn: "about three", note: "" },
      environment: { location: "Outdoor", waterproof: "yes" },
      quantity: "25",
      budgetUsd: "$1,200",
      tier: "production",
    });
    expect(out.envelope).toEqual({ widthIn: 6, depthIn: 4.5, heightIn: null, note: "" });
    expect(out.environment).toEqual({ location: "outdoor", waterproof: true, notes: "" });
    expect(out.quantity).toBe(25);
    expect(out.budgetUsd).toBe(1200);
    expect(out.tier).toBe("mvp"); // unknown tier falls back
    expect(out.functional).toEqual([]);
  });

  it("fills in a whole section the model left out", () => {
    const out = parseStageOutput("requirements", { summary: "A shelf" });
    expect(out.envelope).toEqual({ widthIn: null, depthIn: null, heightIn: null, note: "" });
    expect(out.environment.location).toBe("indoor");
    expect(out.quantity).toBeNull();
  });

  it("falls back to a sensible supplier for each approach", () => {
    const approaches = ["buy", "enclosure", "laser_cut", "print_3d", "pcb", "electronics"];
    const out = parseStageOutput("sourcing", {
      items: approaches.map((approach) => ({ need: `a ${approach} thing`, approach, supplierId: "amazon" })),
    });
    expect(out.items.map((i) => i.supplierId)).toEqual([
      "mcmaster", "polycase", "sendcutsend", "print_self", "jlcpcb", "digikey",
    ]);
  });

  it("normalises sourcing lines", () => {
    const out = parseStageOutput("sourcing", {
      items: [
        { need: "M4 screws", approach: "buy", supplierId: "McMaster", partNumber: " ", qty: "8", estUnitCostUsd: "0.12" },
        { need: "Hinge", approach: "buy", supplierId: "mcmaster", partNumber: "unknown", qty: 0, estUnitCostUsd: -3 },
        { approach: "buy" }, // no `need`: dropped, not fatal
        "not an object",
      ],
      notes: "Ships in two days",
    });
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({
      supplierId: "mcmaster", partNumber: null, qty: 8, estUnitCostUsd: 0.12, searchQuery: "M4 screws",
    });
    expect(out.items[1]).toMatchObject({ partNumber: null, qty: 1, estUnitCostUsd: null });
    expect(out.notes).toEqual(["Ships in two days"]);
  });

  it("caps sourcing at 20 lines and rejects an empty plan", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ need: `part ${i}`, approach: "buy" }));
    expect(parseStageOutput("sourcing", { items }).items).toHaveLength(MAX_SOURCING_ITEMS);
    expect(() => parseStageOutput("sourcing", { items: [] })).toThrow(/no usable lines/);
    expect(() => parseStageOutput("sourcing", {})).toThrow(/sourcing answer was not usable/);
  });

  it("keeps only well-formed URLs and caps experiments at five", () => {
    const out = parseStageOutput("validate", {
      customer: "Small ranches",
      alternatives: [
        { name: "Mighty Mule", kind: "DIRECT", url: "https://example.com/mm" },
        { name: "A rope", kind: "something", url: "example.com" },
      ],
      experiments: Array.from({ length: 9 }, (_, i) => ({ name: `test ${i}`, costUsd: "0", days: "3" })),
      sources: [{ title: "", url: "https://example.com/mm" }, { title: "bad", url: "nope" }],
    });
    expect(out.alternatives.map((a) => [a.kind, a.url])).toEqual([
      ["direct", "https://example.com/mm"], ["indirect", null],
    ]);
    expect(out.experiments).toHaveLength(5);
    expect(out.experiments[0]).toMatchObject({ costUsd: 0, days: 3 });
    expect(out.sources).toEqual([{ title: "https://example.com/mm", url: "https://example.com/mm" }]);
    expect(out.pricing).toEqual({ targetPriceUsd: null, targetCostUsd: null, reasoning: "" });
    expect(out).not.toHaveProperty("researched");
  });

  it("drops electronics rails with no voltage and defaults a candidate's supplier", () => {
    const out = parseStageOutput("electronics", {
      summary: "A battery sensor node",
      blocks: [{ name: "MCU", candidates: [{ part: "ESP32-C3 module", supplierId: "sparkfun" }] }],
      power: { source: "LiPo", rails: [{ name: "3V3", volts: "3.3", maxMa: "500" }, { name: "5V" }] },
    });
    expect(out.power.rails).toEqual([{ name: "3V3", volts: 3.3, maxMa: 500 }]);
    expect(out.blocks[0].candidates[0]).toMatchObject({ supplierId: "digikey", searchQuery: "ESP32-C3 module" });
  });

  it("requires a board size and keeps the fab a board house", () => {
    const out = parseStageOutput("pcb", {
      board: { widthMm: "80", heightMm: 50, mountingHoles: [{ xMm: 4, yMm: 4, diameterMm: 3.2 }, { xMm: 4 }] },
      fab: { supplierId: "digikey", why: "cheap" },
    });
    expect(out.board).toMatchObject({ widthMm: 80, heightMm: 50, cornerRadiusMm: 0, thicknessMm: 1.6, layers: 2 });
    expect(out.board.mountingHoles).toHaveLength(1);
    expect(out.fab.supplierId).toBe("jlcpcb");
    expect(out).not.toHaveProperty("rules");
    expect(() => parseStageOutput("pcb", { board: { widthMm: 80 } })).toThrow(/board\.heightMm must be a number/);
  });

  it("requires build steps", () => {
    expect(parseStageOutput("build", { steps: [{ title: "Bolt the frame" }] }).steps)
      .toEqual([{ title: "Bolt the frame", detail: "" }]);
    expect(() => parseStageOutput("build", { tests: ["power on"] })).toThrow(/no steps/);
  });

  it("ignores server-owned fields the model tries to set", () => {
    const out = parseStageOutput("sourcing", {
      items: [{
        need: "Box", approach: "enclosure", supplierId: "polycase",
        url: "https://evil.example", verified: true, live: { productName: "fake" },
      }],
    });
    expect(out.items[0]).not.toHaveProperty("url");
    expect(out.items[0]).not.toHaveProperty("verified");
    expect(out.items[0]).not.toHaveProperty("live");
    const build = parseStageOutput("build", { steps: [{ title: "x" }], orderGroups: [1], estTotalUsd: 5 });
    expect(build).not.toHaveProperty("orderGroups");
    expect(build).not.toHaveProperty("estTotalUsd");
  });
});

describe("extractJson", () => {
  it("takes the last fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```\nrevised:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("finds an object inside prose", () => {
    expect(extractJson('Sure. {"a":{"b":1}} Hope that helps.')).toEqual({ a: { b: 1 } });
  });
});

describe("stageJsonSchema", () => {
  const FORBIDDEN = [
    "minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern", "$schema",
  ];

  function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
    if (node && typeof node === "object") {
      visit(node as Record<string, unknown>);
      Object.values(node).forEach((n) => walk(n, visit));
    }
  }

  it.each([...GENERATED_STAGE_IDS])("%s: closed objects, all properties required, no unsupported keywords", (stage) => {
    const schema = stageJsonSchema(stage);
    expect(schema.type).toBe("object");
    walk(schema, (n) => {
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect(n.required).toEqual(Object.keys(n.properties as object));
      }
      for (const key of FORBIDDEN) expect(n).not.toHaveProperty(key);
    });
  });

  it("never asks the model for server-owned fields", () => {
    const names = new Set<string>();
    for (const stage of GENERATED_STAGE_IDS) {
      walk(stageJsonSchema(stage), (n) => {
        if (n.type === "object") Object.keys(n.properties as object).forEach((k) => names.add(k));
      });
    }
    for (const field of ["verified", "live", "rules", "checklist", "orderGroups", "estTotalUsd", "researched"]) {
      expect(names.has(field)).toBe(false);
    }
    // `url` appears only where the model reports a page it found (validate).
    walk(stageJsonSchema("sourcing"), (n) => {
      if (n.type === "object") expect(Object.keys(n.properties as object)).not.toContain("url");
    });
    walk(stageJsonSchema("electronics"), (n) => {
      if (n.type === "object") expect(Object.keys(n.properties as object)).not.toContain("url");
    });
  });
});
