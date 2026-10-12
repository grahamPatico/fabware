// Prompts for the production journey's guide (convex/journeyAgent.ts).
// Pure string building, so the wording is unit-tested without a model.
//
// The guide writes the plan as JSON. Everything it is told about suppliers
// and part numbers comes from the registries in this folder, so a change to
// the supplier list or its rules reaches the prompt without editing it.

import {
  PCB_CHECKLIST,
  type GeneratedStageId, type StageContentMap, type Track,
} from "./journey";
import { MCMASTER_SEED } from "./mcmasterSeed";
import { SUPPLIERS } from "./suppliers";

export const GUIDE_SYSTEM = [
  "You are the guide in fabware, a tool that walks a person from a hardware idea to parts in hand.",
  "You are a practical hardware mentor who has shipped products and built plenty of one-offs.",
  "",
  "How you write:",
  "- Short and concrete. Plain words. No hype and no filler.",
  "- Never use em dashes. Use a period or a comma.",
  "- Give numbers with units (12 mm, 3.3 V, 250 mA, 40 USD).",
  "- When you do not know a price, a part number or a fact about a competitor, answer null. " +
    "Never invent one. A wrong part number sends someone to the wrong part.",
  "- Write for the person doing the work: say what to do and why it matters.",
  "- Size the plan to the project. A one-off for a hobby needs less than a product for sale.",
  "",
  "You answer with one JSON object in the shape you are given and nothing else.",
].join("\n");

function supplierRegistry(): string {
  return SUPPLIERS
    .map((s) => `- ${s.id} | ${s.name} | ${s.category} | ${s.bestFor}`)
    .join("\n");
}

function mcmasterSeed(): string {
  return MCMASTER_SEED.map((p) => `- ${p.partNumber}: ${p.name}`).join("\n");
}

function standardPcbChecklist(): string {
  return PCB_CHECKLIST
    .map((g) => `${g.group}:\n${g.items.map((i) => `- ${i.text}`).join("\n")}`)
    .join("\n");
}

const STAGE_INSTRUCTIONS: Record<GeneratedStageId, () => string> = {
  idea: () => [
    "Stage: shape the idea.",
    "Restate the idea so a stranger understands what the thing is and how it works.",
    "- oneLiner: one sentence, what it is and what it does.",
    "- problem, whoItsFor: who has this problem and when.",
    "- howItWorks: the steps of using it, in order.",
    "- keyFeatures: only the ones that matter to the first version.",
    "- needsElectronics: decide honestly. True only when it needs a circuit, power or firmware to do its job. " +
      "A bracket, a box or a jig does not. Explain in electronicsReason.",
    "- openQuestions: what you would need to know to plan this well. Ask about real unknowns only.",
    "- conceptImagePrompt: describe ONE product, seen from the outside, on a plain background. " +
      "Shape, materials, colours, rough size. No text, no logos, no people, no scene.",
  ].join("\n"),

  validate: () => [
    "Stage: check the market. This project is meant to be sold.",
    "- customer: the specific person who buys it. problemStatement: the problem in their words.",
    "- alternatives: what they use today. kind is direct (same product), indirect (different product, same job) or diy.",
    "- differentiators: why someone would switch. Be honest when there is little.",
    "- pricing: a target price and a target unit cost in USD, with the reasoning. null when you cannot say.",
    "- experiments: 3 to 5 cheap tests to run before building, each with how to run it, " +
      "a success signal that is a number, and its cost and days.",
    "- risks: what is most likely to kill this.",
    "- goSignals: what would have to be true to go ahead.",
    "- sources: the pages you actually read, with their titles. Empty when you did not search.",
    "An alternative's url must be a page you actually found in a search result. Otherwise null. Never guess a URL.",
  ].join("\n"),

  requirements: () => [
    "Stage: write the requirements. Every later choice is checked against these.",
    "- summary: one or two sentences on what must be built.",
    "- functional: what it must do, each one testable.",
    "- envelope: overall width, depth and height in inches. null for any you cannot justify. Put the reasoning in note.",
    "- environment: indoor or outdoor, whether it must be waterproof, and anything else (heat, dust, sun, vibration).",
    "- power: how it is powered, or \"none\".",
    "- quantity and budgetUsd: null when the person has not said and you cannot infer it.",
    "- tier: jerry-rigged (works once, looks rough), mvp (works reliably, plain looks) or commercial (ready to sell).",
    "- constraints: limits the design must respect. successCriteria: how to tell it worked.",
    "For a hobby build keep this light: a handful of functional points and a few criteria.",
  ].join("\n"),

  sourcing: () => [
    "Stage: find suppliers. Write one line per thing to obtain.",
    "approach is one of:",
    "- buy: off-the-shelf hardware (fasteners, hinges, latches, seals, bearings, stock).",
    "- enclosure: an off-the-shelf box.",
    "- laser_cut: a custom flat or bent sheet-metal part.",
    "- print_3d: a custom 3D shape.",
    "- pcb: a bare or assembled circuit board.",
    "- electronics: chips, modules, sensors, connectors, batteries.",
    "",
    "Choose supplierId from this registry (id | name | category | best for):",
    supplierRegistry(),
    "",
    "Rules:",
    "- When the project needs a box and custom sheet metal is not the point, prefer an off-the-shelf Polycase enclosure " +
      "(approach enclosure, supplier polycase). In searchQuery describe the box: size, material, rating.",
    "- Custom flat parts go to sendcutsend. Custom 3D shapes are printed: print_self when one or two are needed, " +
      "jlc3dp or craftcloud for nicer materials or larger quantities.",
    "- Boards go to a PCB house (jlcpcb, oshpark or pcbway). Chips and modules go to digikey, or lcsc when jlcpcb will assemble.",
    "- partNumber: give a McMaster part number only when you are certain it is real. These are known good:",
    mcmasterSeed(),
    "  For anything else set partNumber to null and write a searchQuery that finds it " +
      "(thread, length, material, head style).",
    "- Never invent a part number for any supplier. null plus a good searchQuery is the right answer.",
    "- estUnitCostUsd: a realistic estimate, or null when you cannot say.",
    "- why: one sentence on why this part and this supplier.",
    "- notes: things that cut across lines, such as shipping time or a minimum order.",
    "At most 20 lines. Group identical items into one line with a quantity.",
  ].join("\n"),

  electronics: () => [
    "Stage: plan the electronics, before any schematic.",
    "- summary: what the circuit does, in two or three sentences.",
    "- prototypeFirst: what to prove on a dev board or breadboard before designing a custom board, and with which dev board.",
    "- blocks: the functional blocks (controller, power, sensing, radio, drive, user interface). " +
      "For each, up to 4 candidate parts. A candidate's part is a description or a well-known family, " +
      "and searchQuery is what to type into the supplier's search. " +
      "Do not give a manufacturer part number unless you are certain it exists.",
    "- candidates use supplierId digikey, mouser or lcsc.",
    "- power: the source, each rail with its voltage and peak current in mA (null when unknown), and a runtime note.",
    "- interfaces: the buses and connectors (I2C, SPI, UART, USB, GPIO counts).",
    "- firmware: what the firmware must do, and the framework you would start with.",
    "- risks: what usually goes wrong with a design like this.",
  ].join("\n"),

  pcb: () => [
    "Stage: design the board. Give the outline and what to check, not a schematic.",
    "- board: width and height in mm, corner radius, thickness (1.6 mm unless there is a reason), 2 or 4 layers.",
    "  Fit the board inside the chosen enclosure. When the sourcing stage has live enclosure data, " +
      "use its internal size, leave clearance, and say so in outlineBasis. " +
      "When it does not, say what the outline is based on and that it must be checked.",
    "- mountingHoles: xMm from the left edge and yMm from the top edge of the board. Keep them at least 3 mm inside the edge.",
    "- Use 2 layers unless the design has a radio, a fast bus or dense parts that need 4.",
    "- fab: jlcpcb, oshpark or pcbway, with one sentence on why it suits this board.",
    "- projectChecks: checks specific to THIS board. Do not repeat the standard checklist, which is shown already:",
    standardPcbChecklist(),
    "- nextSteps: what to do next, in order. KiCad is the suggested free tool for the schematic and layout.",
  ].join("\n"),

  build: () => [
    "Stage: order and build. The order list is made from the sourcing stage, so do not repeat it.",
    "- steps: assembly in order. Each has a short title and the detail a first-time builder needs " +
      "(tools, torque or fit, what to check before moving on).",
    "- tests: what to test when the parts arrive and after assembly, most important first.",
    "- nextIteration: what you expect to change in the next version, and what to measure on this one to decide.",
  ].join("\n"),
};

export function stageInstructions(stage: GeneratedStageId): string {
  return STAGE_INSTRUCTIONS[stage]();
}

const MAX_STAGE_CONTEXT_CHARS = 7_000;

/** Earlier-stage content as compact JSON, without the bulk the server added. */
function compact(stage: GeneratedStageId, content: unknown): string {
  let value = content;
  if (stage === "pcb" && content && typeof content === "object") {
    // The checklist and rules are fixed text the model has already been given.
    const { checklist: _checklist, rules: _rules, ...rest } = content as Record<string, unknown>;
    value = rest;
  }
  if (stage === "sourcing" && content && typeof content === "object") {
    const { items, ...rest } = content as { items?: Array<Record<string, unknown>> };
    value = {
      ...rest,
      items: (items ?? []).map(({ url: _url, ...item }) => item),
    };
  }
  const json = JSON.stringify(value);
  return json.length > MAX_STAGE_CONTEXT_CHARS ? json.slice(0, MAX_STAGE_CONTEXT_CHARS) + "…(cut)" : json;
}

export interface StageContextInput {
  stage: GeneratedStageId;
  project: { name: string; description?: string | null };
  track: Track;
  needsElectronics: boolean;
  /** Content of the stages already written, keyed by stage id. */
  earlier: Partial<StageContentMap>;
  /** This stage's current content, when the user is asking for a rewrite. */
  current?: unknown;
  /** The user's steering notes for this generation. */
  notes?: string | null;
  /** True when the web search tool is attached to the request. */
  webSearch?: boolean;
  /** True when the reply must carry the JSON itself (no structured-output format on the request). */
  jsonSchemaInPrompt?: Record<string, unknown> | null;
}

const STAGE_ORDER: readonly GeneratedStageId[] = [
  "idea", "validate", "requirements", "sourcing", "electronics", "pcb", "build",
];

/** The user message for one stage: the instructions, the project, what is already decided, and the notes. */
export function buildStageContext(input: StageContextInput): string {
  const out: string[] = [stageInstructions(input.stage), ""];

  out.push("Project:");
  out.push(`- Name: ${input.project.name}`);
  if (input.project.description?.trim()) out.push(`- Description: ${input.project.description.trim()}`);
  out.push(
    input.track === "product"
      ? "- Track: product. The person intends to sell this."
      : "- Track: hobby. The person is building this for themselves. Keep the plan light.",
  );
  if (input.stage !== "idea") {
    out.push(`- Needs electronics: ${input.needsElectronics ? "yes" : "no"}.`);
  }

  const earlier = STAGE_ORDER.filter((id) => id !== input.stage && input.earlier[id]);
  if (earlier.length > 0) {
    out.push("", "Already decided in earlier stages (JSON). Stay consistent with it:");
    for (const id of earlier) out.push(`${id}: ${compact(id, input.earlier[id])}`);
  }
  if (input.current) {
    out.push("", "Your previous answer for this stage (JSON). Improve on it:", compact(input.stage, input.current));
  }

  const notes = input.notes?.trim();
  if (notes) {
    out.push("", "The person's notes for this stage. Follow them where they conflict with the above:", notes);
  }

  if (input.webSearch) {
    out.push(
      "",
      "You have a web search tool. Search before you answer: look for existing products, their prices, " +
      "and where the customers talk. Base alternatives and pricing on what you find, and list the pages you used in sources.",
    );
  }
  if (input.jsonSchemaInPrompt) {
    out.push(
      "",
      "Finish with your answer as one JSON object inside a ```json code block, matching this JSON Schema exactly. " +
      "Write nothing after the block.",
      JSON.stringify(input.jsonSchemaInPrompt),
    );
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Concept picture
// ---------------------------------------------------------------------------

export const CONCEPT_IMAGE_STYLE =
  "Product concept render, single object, three-quarter view, plain studio background, no text, no logos";

/** The prompt sent to the image model. */
export function conceptImagePrompt(ideaPrompt: string): string {
  return `${CONCEPT_IMAGE_STYLE}. ${ideaPrompt.trim()}`.slice(0, 1_800);
}

/** The prompt that asks Claude for a sketch when no image model is configured. */
export function conceptSvgPrompt(ideaPrompt: string): string {
  return [
    "Draw a clean concept sketch of this product as one SVG.",
    "",
    `Product: ${ideaPrompt.trim()}`,
    "",
    "Rules:",
    '- One <svg> element with xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 800 600".',
    "- First a full-size background rectangle filled #0f1620.",
    "- Line-art style: the product in a three-quarter view, drawn with light strokes (#e2e8f0, 2 to 3 px), no heavy fills.",
    "- Use the orange accent #f97316 for one or two key features only.",
    "- Only path, rect, circle, ellipse, line, polyline, polygon and g elements. Gradients are fine.",
    "- No text elements, no images, no scripts, no styles, no links, no animation.",
    "- Under 20 KB.",
    "",
    "Reply with the SVG and nothing else.",
  ].join("\n");
}
