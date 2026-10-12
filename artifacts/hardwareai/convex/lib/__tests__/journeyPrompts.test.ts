import { describe, it, expect } from "vitest";
import { GENERATED_STAGE_IDS, PCB_CHECKLIST } from "../journey";
import {
  CONCEPT_IMAGE_STYLE, GUIDE_SYSTEM, buildStageContext, conceptImagePrompt, conceptSvgPrompt, stageInstructions,
} from "../journeyPrompts";
import { MCMASTER_SEED } from "../mcmasterSeed";
import { SUPPLIERS } from "../suppliers";

const base = {
  project: { name: "Gate opener", description: "Opens a farm gate from the truck" },
  track: "product" as const,
  needsElectronics: true,
  earlier: {},
};

describe("journey prompts", () => {
  it("never use em dashes, in the system prompt or any stage", () => {
    const all = [GUIDE_SYSTEM, ...GENERATED_STAGE_IDS.map(stageInstructions), conceptSvgPrompt("a box"), CONCEPT_IMAGE_STYLE];
    for (const text of all) expect(text).not.toContain("—");
  });

  it("tell the guide to answer null instead of inventing facts", () => {
    expect(GUIDE_SYSTEM).toMatch(/answer null/);
    expect(GUIDE_SYSTEM).toMatch(/Never invent/);
  });

  it("inject the whole supplier registry and the trusted McMaster list into sourcing", () => {
    const text = stageInstructions("sourcing");
    for (const s of SUPPLIERS) expect(text).toContain(`- ${s.id} | ${s.name} | ${s.category} | ${s.bestFor}`);
    for (const p of MCMASTER_SEED) expect(text).toContain(p.partNumber);
    expect(text).toMatch(/prefer an off-the-shelf Polycase enclosure/);
  });

  it("inject the standard PCB checklist so the guide does not repeat it", () => {
    const text = stageInstructions("pcb");
    for (const g of PCB_CHECKLIST) for (const i of g.items) expect(text).toContain(i.text);
    expect(text).toContain("KiCad");
    expect(text).toContain("outlineBasis");
  });

  it("describe one product with no text or logos for the concept picture", () => {
    expect(stageInstructions("idea")).toMatch(/ONE product/);
    expect(stageInstructions("idea")).toMatch(/No text, no logos/);
    expect(conceptImagePrompt("  A grey box on a post ")).toBe(
      "Product concept render, single object, three-quarter view, plain studio background, no text, no logos. A grey box on a post",
    );
    const svg = conceptSvgPrompt("A grey box");
    expect(svg).toContain("#0f1620");
    expect(svg).toContain("#f97316");
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toMatch(/No text elements/);
  });
});

describe("buildStageContext", () => {
  it("carries the project, the track and the earlier stages", () => {
    const text = buildStageContext({
      ...base,
      stage: "sourcing",
      earlier: {
        idea: { oneLiner: "A solar gate opener" } as any,
        requirements: { summary: "Weatherproof", tier: "mvp" } as any,
      },
      notes: "  Use stainless hardware  ",
    });
    expect(text).toContain("Stage: find suppliers.");
    expect(text).toContain("- Name: Gate opener");
    expect(text).toContain("- Description: Opens a farm gate from the truck");
    expect(text).toContain("Track: product");
    expect(text).toContain("- Needs electronics: yes.");
    expect(text).toContain('idea: {"oneLiner":"A solar gate opener"}');
    expect(text.indexOf("idea: {")).toBeLessThan(text.indexOf("requirements: {"));
    expect(text.trimEnd().endsWith("Use stainless hardware")).toBe(true);
  });

  it("keeps a hobby plan light and leaves out what is not there", () => {
    const text = buildStageContext({ ...base, track: "hobby", stage: "idea", project: { name: "Shelf" } });
    expect(text).toContain("Track: hobby");
    expect(text).not.toContain("Description:");
    expect(text).not.toContain("Needs electronics"); // the idea stage decides it
    expect(text).not.toContain("Already decided");
    expect(text).not.toContain("notes for this stage");
  });

  it("drops server-added bulk from earlier stages", () => {
    const text = buildStageContext({
      ...base,
      stage: "build",
      earlier: {
        sourcing: { items: [{ need: "Box", url: "https://www.polycase.com/x", live: { partNumber: "WC-33" } }], notes: [] } as any,
        pcb: { board: { widthMm: 80 }, checklist: PCB_CHECKLIST, rules: { minTraceMm: 0.2 } } as any,
      },
    });
    expect(text).toContain('"partNumber":"WC-33"'); // live enclosure data is kept: the PCB stage sizes against it
    expect(text).not.toContain("https://www.polycase.com/x");
    expect(text).not.toContain("minTraceMm");
    expect(text).not.toContain("Prove the circuit on a dev board");
  });

  it("offers the previous answer when rewriting a stage", () => {
    const text = buildStageContext({ ...base, stage: "idea", current: { oneLiner: "Old idea" } });
    expect(text).toContain("Your previous answer for this stage");
    expect(text).toContain('{"oneLiner":"Old idea"}');
  });

  it("asks for a search, and for the JSON in the reply, only when told to", () => {
    const plain = buildStageContext({ ...base, stage: "validate" });
    expect(plain).not.toContain("web search tool");
    expect(plain).not.toContain("```json");
    const searching = buildStageContext({
      ...base, stage: "validate", webSearch: true, jsonSchemaInPrompt: { type: "object", properties: {} },
    });
    expect(searching).toContain("You have a web search tool.");
    expect(searching).toContain("```json code block");
    expect(searching).toContain('{"type":"object","properties":{}}');
  });
});
