// The production journey: the guided path from an idea to parts in hand.
// Pure data and types — imported by both Convex functions and the React
// client. Runtime validation of model output lives in journeySchemas.ts.

import type { SupplierId } from "./suppliers";

export const STAGE_IDS = [
  "idea",
  "validate",
  "requirements",
  "sourcing",
  "mechanical",
  "electronics",
  "pcb",
  "build",
] as const;
export type StageId = (typeof STAGE_IDS)[number];

/** "hobby" builds one for yourself; "product" is something you intend to sell. */
export type Track = "hobby" | "product";

export type StageStatus = "todo" | "generating" | "ready" | "done" | "error";

export interface StageDef {
  id: StageId;
  /** Short name for the stage rail. */
  label: string;
  /** Heading on the stage page. */
  title: string;
  /** One sentence on what this stage decides. */
  blurb: string;
  /** "generated": the guide writes it. "studio": done in the design studio. */
  kind: "generated" | "studio";
}

export const STAGES: readonly StageDef[] = [
  {
    id: "idea",
    label: "Idea",
    title: "Shape the idea",
    blurb: "Turn a rough idea into a clear description of what the thing is and how it works.",
    kind: "generated",
  },
  {
    id: "validate",
    label: "Validate",
    title: "Check the market",
    blurb: "Find out who would buy it, what they use today, and the cheapest tests to run before building.",
    kind: "generated",
  },
  {
    id: "requirements",
    label: "Requirements",
    title: "Write the requirements",
    blurb: "Pin down size, environment, power, quantity and budget so every later choice has a target.",
    kind: "generated",
  },
  {
    id: "sourcing",
    label: "Sourcing",
    title: "Find suppliers",
    blurb: "Decide what to buy off the shelf, what to laser cut and what to print, and where each comes from.",
    kind: "generated",
  },
  {
    id: "mechanical",
    label: "Mechanical",
    title: "Design the parts",
    blurb: "Design the custom parts in the studio and check them against the fabricator's rules.",
    kind: "studio",
  },
  {
    id: "electronics",
    label: "Electronics",
    title: "Plan the electronics",
    blurb: "Lay out the blocks, pick candidate components and budget the power before drawing a schematic.",
    kind: "generated",
  },
  {
    id: "pcb",
    label: "PCB",
    title: "Design the board",
    blurb: "Set the board outline, the design rules and a checklist to follow, then pick a board house.",
    kind: "generated",
  },
  {
    id: "build",
    label: "Build",
    title: "Order and build",
    blurb: "One order list per supplier, the assembly steps, and what to test when it arrives.",
    kind: "generated",
  },
];

export function getStage(id: StageId): StageDef {
  return STAGES.find((s) => s.id === id)!;
}

export function isStageId(value: string): value is StageId {
  return (STAGE_IDS as readonly string[]).includes(value);
}

/**
 * The stages a project walks through, in order. A hobby build skips market
 * validation; a project with no electronics skips the electronics and PCB
 * stages.
 */
export function applicableStages(track: Track, needsElectronics: boolean): StageId[] {
  return STAGE_IDS.filter((id) => {
    if (id === "validate") return track === "product";
    if (id === "electronics" || id === "pcb") return needsElectronics;
    return true;
  });
}

/** Stored on `projects.journey`. */
export interface JourneyState {
  track: Track;
  needsElectronics: boolean;
  /** True once the user has set `needsElectronics` by hand; the idea stage no longer overwrites it. */
  electronicsLocked?: boolean;
  startedAt: number;
}

// ---------------------------------------------------------------------------
// Stage content. One shape per generated stage.
// ---------------------------------------------------------------------------

export interface IdeaContent {
  oneLiner: string;
  problem: string;
  whoItsFor: string;
  howItWorks: string[];
  keyFeatures: string[];
  needsElectronics: boolean;
  electronicsReason: string;
  openQuestions: string[];
  /** Prompt for the concept picture: one product, plain background, no text. */
  conceptImagePrompt: string;
}

export interface ValidateAlternative {
  name: string;
  kind: "direct" | "indirect" | "diy";
  note: string;
  url: string | null;
}

export interface ValidateExperiment {
  name: string;
  how: string;
  successSignal: string;
  costUsd: number | null;
  days: number | null;
}

export interface ValidateContent {
  customer: string;
  problemStatement: string;
  alternatives: ValidateAlternative[];
  differentiators: string[];
  pricing: { targetPriceUsd: number | null; targetCostUsd: number | null; reasoning: string };
  experiments: ValidateExperiment[];
  risks: string[];
  /** What would have to be true to go ahead. */
  goSignals: string[];
  /** Pages the guide actually read. Empty when it answered from memory. */
  sources: Array<{ title: string; url: string }>;
  /** True when the guide searched the web for this. False = from the model's memory, unchecked. */
  researched: boolean;
}

export interface RequirementsContent {
  summary: string;
  functional: string[];
  envelope: { widthIn: number | null; depthIn: number | null; heightIn: number | null; note: string };
  environment: { location: "indoor" | "outdoor"; waterproof: boolean; notes: string };
  power: string;
  quantity: number | null;
  budgetUsd: number | null;
  tier: "jerry-rigged" | "mvp" | "commercial";
  constraints: string[];
  successCriteria: string[];
}

export type SourcingApproach =
  | "buy"
  | "enclosure"
  | "laser_cut"
  | "print_3d"
  | "pcb"
  | "electronics";

/** Live catalog data attached to a sourcing line by the server. */
export interface SourcingLive {
  productName: string;
  partNumber: string;
  productUrl: string;
  priceUsd: number | null;
  /** Why it fits, in plain words. */
  fitSummary: string;
  /** The supplier's "check before you buy" note. */
  purchaseNote: string;
  /** GLB of a simplified solid built from published dimensions; null when geometry may not be shown. */
  modelGlbUrl: string | null;
  /** Catalog date the data was read from. */
  asOf: string;
}

export interface SourcingItem {
  need: string;
  approach: SourcingApproach;
  supplierId: SupplierId;
  searchQuery: string;
  partNumber: string | null;
  qty: number;
  estUnitCostUsd: number | null;
  why: string;
  /** Set by the server from the supplier registry. Never written by the model. */
  url: string;
  /** Set by the server: true only when `live` came from a live catalog call. */
  verified: boolean;
  live: SourcingLive | null;
}

export interface SourcingContent {
  items: SourcingItem[];
  notes: string[];
}

export interface ElectronicsCandidate {
  part: string;
  why: string;
  supplierId: SupplierId;
  searchQuery: string;
  /** Set by the server from the supplier registry. */
  url: string;
}

export interface ElectronicsBlock {
  name: string;
  role: string;
  candidates: ElectronicsCandidate[];
}

export interface ElectronicsContent {
  summary: string;
  /** What to prototype on a dev board before making a custom PCB. */
  prototypeFirst: string;
  blocks: ElectronicsBlock[];
  power: {
    source: string;
    rails: Array<{ name: string; volts: number; maxMa: number | null }>;
    runtimeNote: string;
  };
  interfaces: string[];
  firmware: string[];
  risks: string[];
}

export interface PcbBoard {
  widthMm: number;
  heightMm: number;
  cornerRadiusMm: number;
  thicknessMm: number;
  layers: 2 | 4;
  mountingHoles: Array<{ xMm: number; yMm: number; diameterMm: number }>;
  /** Where the outline came from, e.g. "fits inside the HD-35F with 2 mm clearance". */
  outlineBasis: string;
}

/** Design rules a board house accepts. Millimetres. */
export interface PcbRules {
  minTraceMm: number;
  minSpaceMm: number;
  minViaDrillMm: number;
  minViaPadMm: number;
  minHoleToEdgeMm: number;
  copperOz: number;
  note: string;
}

export interface PcbChecklistGroup {
  group: string;
  items: Array<{ text: string; why: string }>;
}

export interface PcbContent {
  board: PcbBoard;
  fab: { supplierId: SupplierId; why: string };
  /** Set by the server from SAFE_PCB_RULES. */
  rules: PcbRules;
  /** Set by the server: the standard checklist, then project-specific items. */
  checklist: PcbChecklistGroup[];
  /** Project-specific checks from the guide, shown as their own group. */
  projectChecks: Array<{ text: string; why: string }>;
  nextSteps: string[];
}

export interface BuildOrderGroup {
  supplierId: SupplierId;
  lines: Array<{ need: string; qty: number; url: string; estUnitCostUsd: number | null }>;
  subtotalUsd: number | null;
}

export interface BuildContent {
  /** Set by the server from the sourcing stage. */
  orderGroups: BuildOrderGroup[];
  /** Set by the server: sum of the known line costs; null when none are known. */
  estTotalUsd: number | null;
  steps: Array<{ title: string; detail: string }>;
  tests: string[];
  nextIteration: string[];
}

export interface StageContentMap {
  idea: IdeaContent;
  validate: ValidateContent;
  requirements: RequirementsContent;
  sourcing: SourcingContent;
  electronics: ElectronicsContent;
  pcb: PcbContent;
  build: BuildContent;
}
export type GeneratedStageId = keyof StageContentMap;

export const GENERATED_STAGE_IDS: readonly GeneratedStageId[] = [
  "idea",
  "validate",
  "requirements",
  "sourcing",
  "electronics",
  "pcb",
  "build",
];

export function isGeneratedStage(id: StageId): id is GeneratedStageId {
  return id !== "mechanical";
}

/** The concept picture shown at the top of the plan. */
export type ConceptImage =
  | { kind: "image"; url: string; prompt: string }
  | { kind: "svg"; svg: string; prompt: string };

/** One stage as `journey.get` returns it. */
export interface StageView<S extends StageId = StageId> {
  id: S;
  status: StageStatus;
  /** Null until generated. Always null for the mechanical stage. */
  content: S extends GeneratedStageId ? StageContentMap[S] | null : null;
  /** The user's steering notes from the last generate. */
  notes: string | null;
  error: string | null;
  generatedAt: number | null;
}

/** What `journey.get` returns. Null `journey` means the project has no plan yet. */
export interface JourneyView {
  journey: JourneyState | null;
  /** Stages this project walks through, in order. */
  applicable: StageId[];
  /** Keyed by stage id; only applicable stages are present. */
  stages: Partial<{ [S in StageId]: StageView<S> }>;
  /** The first applicable stage that is not done; null when all are done. */
  nextStage: StageId | null;
  mechanical: { partCount: number; fails: number; warns: number };
  concept: {
    status: "none" | "generating" | "ready" | "error";
    image: ConceptImage | null;
    error: string | null;
    /** Regenerations left for this project. */
    remaining: number;
  };
}

// ---------------------------------------------------------------------------
// PCB rules and checklist. Curated, not generated.
// ---------------------------------------------------------------------------

/**
 * Conservative rules that the standard service at JLCPCB, OSH Park and PCBWay
 * all accept. A design that follows them can go to any of the three.
 */
export const SAFE_PCB_RULES: PcbRules = {
  minTraceMm: 0.2,
  minSpaceMm: 0.2,
  minViaDrillMm: 0.3,
  minViaPadMm: 0.6,
  minHoleToEdgeMm: 0.5,
  copperOz: 1,
  note:
    "Conservative starting rules for a 1.6 mm FR-4 board. Board houses change their limits, " +
    "so confirm on your board house's capabilities page before you order.",
};

export const PCB_CHECKLIST: readonly PcbChecklistGroup[] = [
  {
    group: "Before layout",
    items: [
      { text: "Prove the circuit on a dev board or breadboard first.", why: "A board respin costs a week. A jumper wire costs a minute." },
      { text: "Run the electrical rules check on the schematic and clear every error.", why: "Unconnected pins and shorted nets are cheapest to fix here." },
      { text: "Check every footprint against the part's datasheet, including pin 1.", why: "Wrong footprints are the most common reason a first board fails." },
      { text: "Confirm each part is in stock at your supplier.", why: "A board designed around a part you can't buy is a redesign." },
    ],
  },
  {
    group: "Power",
    items: [
      { text: "Put a 100 nF capacitor at every IC power pin, as close as the footprint allows.", why: "It supplies the fast current the chip pulls when it switches." },
      { text: "Add bulk capacitance where power enters the board and at each regulator, per its datasheet.", why: "Regulators can oscillate without the capacitors they were designed with." },
      { text: "Size power traces for their current. About 0.5 mm per amp on outer layers is a safe start.", why: "Thin traces heat up and drop voltage." },
      { text: "Add reverse-polarity and over-current protection on any connector a user can plug in.", why: "Batteries and barrel jacks get plugged in backwards." },
    ],
  },
  {
    group: "Layout",
    items: [
      { text: "Place connectors, switches, LEDs and mounting holes first, from the enclosure.", why: "The mechanical fit decides where these go. Everything else moves around them." },
      { text: "Keep one unbroken ground plane under the whole board.", why: "Return current follows the trace above it. A gap in the plane makes noise and emissions." },
      { text: "Keep switching regulators, crystals and antennas away from each other and from sensitive analog parts.", why: "They are the noisiest and the most easily disturbed parts on the board." },
      { text: "Follow the antenna or radio module's keep-out exactly. No copper under the antenna.", why: "Copper near an antenna detunes it and cuts range." },
      { text: "Route USB and other fast pairs together, the same length, over solid ground.", why: "Mismatched or split pairs cause dropouts that are hard to debug." },
    ],
  },
  {
    group: "Bring-up and test",
    items: [
      { text: "Add test points for every power rail, ground, and the programming and debug pins.", why: "You can't fix what you can't probe." },
      { text: "Add a programming header or pads, even if you plan to remove it later.", why: "The first boards always need reflashing." },
      { text: "Add a power LED and one LED the firmware controls.", why: "They answer \"is it on\" and \"is it running\" at a glance." },
      { text: "Leave 0 ohm resistors or solder jumpers where you may need to cut a rail or swap an option.", why: "They let you isolate a fault without cutting traces." },
    ],
  },
  {
    group: "Before you order",
    items: [
      { text: "Run the design rules check with your board house's limits and clear every error.", why: "Boards that break the rules get put on hold or built wrong." },
      { text: "Label the board with its name, revision and date in silkscreen, plus pin 1 and polarity marks.", why: "You will have several revisions on the bench at once." },
      { text: "Check the mounting holes and outline against the enclosure drawing.", why: "A board that doesn't fit the box is scrap." },
      { text: "Open the exported Gerbers in a viewer and look at every layer.", why: "Export mistakes are invisible in the design tool." },
      { text: "Order a few extra boards.", why: "The price barely changes and you will damage one." },
    ],
  },
];
