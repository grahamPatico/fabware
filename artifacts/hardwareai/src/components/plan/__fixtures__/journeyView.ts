// Realistic `JourneyView` fixtures for the dev preview route and for checking
// the plan page without a backend. Dev only: nothing in the production bundle
// imports this file.

import {
  applicableStages,
  PCB_CHECKLIST,
  SAFE_PCB_RULES,
  type BuildContent,
  type ElectronicsContent,
  type IdeaContent,
  type JourneyView,
  type PcbContent,
  type RequirementsContent,
  type SourcingContent,
  type StageId,
  type StageStatus,
  type StageView,
  type ValidateContent,
} from "../../../../convex/lib/journey";
import { supplierLink } from "../../../../convex/lib/suppliers";
import type { PlanProject } from "../PlanView";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 10, 15, 30);

function todo<S extends StageId>(id: S): StageView<S> {
  return { id, status: "todo", content: null as StageView<S>["content"], notes: null, error: null, generatedAt: null };
}

function filled<S extends StageId>(
  id: S,
  status: StageStatus,
  content: StageView<S>["content"],
  generatedAt: number,
  notes: string | null = null,
): StageView<S> {
  return { id, status, content, notes, error: null, generatedAt };
}

// ---------------------------------------------------------------------------
// 1. A product with every stage filled
// ---------------------------------------------------------------------------

const CONCEPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#e9edf2"/>
  <rect x="0" y="230" width="400" height="70" fill="#cfd6de"/>
  <rect x="60" y="60" width="14" height="190" fill="#5b6570"/>
  <rect x="74" y="110" width="250" height="10" fill="#7a8591"/>
  <rect x="74" y="200" width="250" height="10" fill="#7a8591"/>
  <g fill="#7a8591">
    <rect x="110" y="110" width="8" height="100"/><rect x="150" y="110" width="8" height="100"/>
    <rect x="190" y="110" width="8" height="100"/><rect x="230" y="110" width="8" height="100"/>
    <rect x="270" y="110" width="8" height="100"/><rect x="310" y="110" width="8" height="100"/>
  </g>
  <rect x="36" y="150" width="62" height="78" rx="6" fill="#f97316"/>
  <rect x="44" y="160" width="46" height="26" rx="3" fill="#1f2937"/>
  <circle cx="67" cy="206" r="7" fill="#fde68a"/>
  <polygon points="30,60 104,44 104,74 30,90" fill="#1e3a8a"/>
  <g stroke="#93c5fd" stroke-width="1.5">
    <line x1="55" y1="55" x2="55" y2="84"/><line x1="80" y1="49" x2="80" y2="79"/>
    <line x1="30" y1="75" x2="104" y2="59"/>
  </g>
  <rect x="98" y="182" width="120" height="8" rx="4" fill="#374151"/>
</svg>`;

const FULL_IDEA: IdeaContent = {
  oneLiner: "A solar powered gate opener you control from your phone, sized for a single swing gate up to 12 ft.",
  problem:
    "Getting out of the truck to open and close a farm gate costs a few minutes every trip, and running mains power to the gate is expensive.",
  whoItsFor: "Rural property owners with a swing gate that is too far from the house for a wired opener.",
  howItWorks: [
    "A 20 W solar panel keeps a 12 V battery charged.",
    "A linear actuator pushes the gate open and pulls it closed.",
    "A small controller with a cellular modem takes open and close commands from a phone app.",
    "Limit switches in the actuator stop the gate at each end of travel.",
    "A keypad on the post opens the gate when there is no phone signal.",
  ],
  keyFeatures: [
    "No trenching: runs from the sun",
    "Opens from anywhere with a phone signal",
    "Keypad backup at the gate",
    "Manual release pin for a dead battery",
    "Bolts to a standard 4 in round post",
  ],
  needsElectronics: true,
  electronicsReason: "It drives a motor, charges a battery and talks to a phone, so it needs a controller board.",
  openQuestions: [
    "How heavy is the heaviest gate it must move?",
    "Is there cellular coverage at the gate, and on which carrier?",
    "Does it need to sense a vehicle in the way before closing?",
  ],
  conceptImagePrompt:
    "A weatherproof orange control box with a small solar panel on a steel gate post, a linear actuator arm on a farm gate, plain background, no text.",
};

const FULL_VALIDATE: ValidateContent = {
  customer: "Owners of 5 to 100 acre properties who open a gate several times a day and have no power at the gate.",
  problemStatement:
    "Wired openers need a trench and an electrician. The solar kits that exist are sold without remote control from a phone, or need a hub at the house within radio range.",
  alternatives: [
    {
      name: "Mighty Mule MM371W",
      kind: "direct",
      note: "Popular DIY swing gate kit. Solar panel sold separately. Phone control needs a Wi-Fi bridge within range of the house.",
      url: "https://www.mightymule.com",
    },
    {
      name: "Ghost Controls TSS1",
      kind: "direct",
      note: "Solar kit with remote fobs. Phone control is an add-on module.",
      url: null,
    },
    {
      name: "A chain and a padlock",
      kind: "indirect",
      note: "What most people use today. Free, slow, and nobody can open it for a delivery.",
      url: null,
    },
    {
      name: "Car battery, actuator and a relay board",
      kind: "diy",
      note: "Forum builds exist. They work but have no weatherproof box and no safe stop.",
      url: null,
    },
  ],
  differentiators: [
    "Cellular, so it works far from the house Wi-Fi",
    "Everything in one box that mounts on the post",
    "Sold with the panel and battery sized for the gate",
  ],
  pricing: {
    targetPriceUsd: 549,
    targetCostUsd: 210,
    reasoning:
      "Existing kits with a panel land between $450 and $700. A price near the middle leaves room for a cellular plan and still gives a margin above 60 percent at the target cost.",
  },
  experiments: [
    {
      name: "Landing page with a deposit",
      how: "Put up a one page site with the concept picture and a $20 refundable deposit button. Share it in three rural property groups.",
      successSignal: "10 deposits from 500 visitors.",
      costUsd: 60,
      days: 7,
    },
    {
      name: "Five phone calls",
      how: "Call five people who posted about gate openers and ask what they bought, what it cost and what annoyed them.",
      successSignal: "At least three name phone control or range as a problem without being asked.",
      costUsd: 0,
      days: 3,
    },
    {
      name: "Bench prototype on one gate",
      how: "Build one from a dev board and off the shelf parts and run it on a real gate for two weeks.",
      successSignal: "No missed commands and the battery never drops below half.",
      costUsd: null,
      days: null,
    },
  ],
  risks: [
    "Cellular plans add a monthly cost that buyers may not accept.",
    "A gate that closes on a vehicle or an animal is a safety and liability problem.",
    "Radio certification is needed before selling, even with a pre-certified modem.",
  ],
  goSignals: [
    "People put down a deposit before a product exists.",
    "The prototype runs two weeks on solar alone in winter light.",
    "Parts cost stays under $210 at 100 units.",
  ],
  sources: [],
  researched: false,
};

const FULL_REQUIREMENTS: RequirementsContent = {
  summary:
    "A post-mounted control box and actuator that opens a swing gate up to 12 ft and 250 lb from a phone or a keypad, powered only by a 20 W panel.",
  functional: [
    "Open or close the gate in under 20 seconds",
    "Take commands from a phone over cellular",
    "Open from a 4 digit code on a keypad",
    "Stop and reverse if the gate meets an obstruction",
    "Report battery level and gate state",
  ],
  envelope: { widthIn: 6.3, depthIn: 4.3, heightIn: null, note: "Control box only. Height is open until the battery is picked." },
  environment: { location: "outdoor", waterproof: true, notes: "Rain, dust and sun all year. -10 to 50 °C." },
  power: "12 V 7 Ah sealed battery charged by a 20 W solar panel",
  quantity: 100,
  budgetUsd: 210,
  tier: "commercial",
  constraints: [
    "No mains power at the gate",
    "Mounts to a 4 in round or 4 x 4 in square post",
    "Must be installable with hand tools",
  ],
  successCriteria: [
    "30 open and close cycles a day for 5 cloudy days without a recharge",
    "No water inside the box after a hose test",
    "A first-time user installs it in under 2 hours",
  ],
};

const FULL_SOURCING: SourcingContent = {
  items: [
    {
      need: "Weatherproof box for the controller and battery",
      approach: "enclosure",
      supplierId: "polycase",
      searchQuery: "hinged polycarbonate NEMA 4X enclosure 6 x 4 in",
      partNumber: "WC-33",
      qty: 1,
      estUnitCostUsd: 30,
      why: "A hinged, gasketed polycarbonate box keeps water out and lets the cellular signal through, which a metal box would block.",
      url: supplierLink("polycase", { query: "WC-33" }),
      verified: true,
      live: {
        productName: "WC-33 Hinged NEMA Enclosure",
        partNumber: "WC-33",
        productUrl: "https://www.polycase.com/wc-33",
        priceUsd: 32.14,
        fitSummary:
          "Inside 6.0 x 4.0 x 2.9 in. Fits the 100 x 70 mm board with 25 mm to spare on the long side. The battery needs its own box or the next size up.",
        purchaseNote:
          "Dimensions are from the published drawing. Check the current drawing and price on polycase.com before you order.",
        modelGlbUrl: "https://polycase-mcp.vercel.app/api/models/WC-33/model.glb",
        asOf: "2026-10-09",
      },
    },
    {
      need: "Linear actuator, 12 V, 12 in stroke",
      approach: "buy",
      supplierId: "mcmaster",
      searchQuery: "12V DC linear actuator 12 inch stroke weatherproof",
      partNumber: null,
      qty: 1,
      estUnitCostUsd: null,
      why: "Moves the gate. A 12 in stroke on a 10 in lever arm gives about 100 degrees of swing.",
      url: supplierLink("mcmaster", { query: "12V DC linear actuator 12 inch stroke weatherproof" }),
      verified: false,
      live: null,
    },
    {
      need: "Stainless U-bolts for the post bracket",
      approach: "buy",
      supplierId: "mcmaster",
      searchQuery: "316 stainless U-bolt 4 inch pipe",
      partNumber: "8880T58",
      qty: 2,
      estUnitCostUsd: 9.75,
      why: "Clamps the bracket to a round post without drilling it.",
      url: supplierLink("mcmaster", { partNumber: "8880T58" }),
      verified: false,
      live: null,
    },
    {
      need: "Post bracket for the actuator",
      approach: "laser_cut",
      supplierId: "sendcutsend",
      searchQuery: "",
      partNumber: null,
      qty: 1,
      estUnitCostUsd: 18,
      why: "3/16 in steel, bent once, powder coated. Carries the actuator load into the post.",
      url: supplierLink("sendcutsend"),
      verified: false,
      live: null,
    },
    {
      need: "Keypad bezel",
      approach: "print_3d",
      supplierId: "print_self",
      searchQuery: "",
      partNumber: null,
      qty: 1,
      estUnitCostUsd: 1.5,
      why: "Holds the keypad to the box lid. PETG for sun and heat.",
      url: supplierLink("print_self"),
      verified: false,
      live: null,
    },
    {
      need: "Controller board, 2 layers",
      approach: "pcb",
      supplierId: "jlcpcb",
      searchQuery: "",
      partNumber: null,
      qty: 5,
      estUnitCostUsd: 4,
      why: "Five boards is the smallest order and gives spares for bring-up.",
      url: supplierLink("jlcpcb"),
      verified: false,
      live: null,
    },
    {
      need: "Cellular module with antenna",
      approach: "electronics",
      supplierId: "digikey",
      searchQuery: "LTE-M module pre-certified",
      partNumber: null,
      qty: 1,
      estUnitCostUsd: 24,
      why: "A pre-certified LTE-M module avoids most of the radio testing.",
      url: supplierLink("digikey", { query: "LTE-M module pre-certified" }),
      verified: false,
      live: null,
    },
    {
      need: "Motor driver, 12 V 10 A",
      approach: "electronics",
      supplierId: "digikey",
      searchQuery: "H-bridge motor driver 12V 10A current sense",
      partNumber: null,
      qty: 1,
      estUnitCostUsd: 6.2,
      why: "Reverses the actuator and reports current, which is how the gate senses an obstruction.",
      url: supplierLink("digikey", { query: "H-bridge motor driver 12V 10A current sense" }),
      verified: false,
      live: null,
    },
  ],
  notes: [
    "The battery and solar panel are not listed yet. Pick them after the power budget in the electronics step.",
    "Order the enclosure first: the board outline depends on it.",
  ],
};

const FULL_ELECTRONICS: ElectronicsContent = {
  summary:
    "One board with a microcontroller, a cellular modem, a motor driver and a solar charger. The battery and actuator connect through screw terminals.",
  prototypeFirst:
    "Wire a cellular dev kit to a motor driver breakout and a bench supply. Open and close the real gate 100 times and log the motor current before drawing a board.",
  blocks: [
    {
      name: "Controller and modem",
      role: "Runs the gate logic and talks to the phone app over LTE-M.",
      candidates: [
        {
          part: "Nordic nRF9151 module",
          why: "Microcontroller and LTE-M modem in one pre-certified part.",
          supplierId: "digikey",
          searchQuery: "nRF9151",
          url: supplierLink("digikey", { query: "nRF9151" }),
        },
        {
          part: "ESP32-C3 with a SIM7080G modem",
          why: "Cheaper parts, more firmware work, two things to certify.",
          supplierId: "lcsc",
          searchQuery: "SIM7080G",
          url: supplierLink("lcsc", { query: "SIM7080G" }),
        },
      ],
    },
    {
      name: "Motor driver",
      role: "Drives the actuator both ways and measures its current.",
      candidates: [
        {
          part: "DRV8874",
          why: "Built-in current sense output and protection, up to 37 V.",
          supplierId: "mouser",
          searchQuery: "DRV8874",
          url: supplierLink("mouser", { query: "DRV8874" }),
        },
      ],
    },
    {
      name: "Solar charger",
      role: "Charges the 12 V battery from the panel and stops it over-discharging.",
      candidates: [
        {
          part: "CN3767 lead-acid charger",
          why: "Simple panel tracking, few parts.",
          supplierId: "lcsc",
          searchQuery: "CN3767",
          url: supplierLink("lcsc", { query: "CN3767" }),
        },
      ],
    },
    {
      name: "Keypad and status light",
      role: "Local open code and a light that shows the box is alive.",
      candidates: [],
    },
  ],
  power: {
    source: "12 V 7 Ah sealed lead-acid battery, 20 W panel",
    rails: [
      { name: "Battery (motor)", volts: 12, maxMa: 8000 },
      { name: "Modem", volts: 3.8, maxMa: 500 },
      { name: "Logic", volts: 3.3, maxMa: null },
    ],
    runtimeNote:
      "At 30 cycles a day the motor uses about 1 Ah. Sleep current must stay under 2 mA to last 5 cloudy days.",
  },
  interfaces: [
    "Screw terminals: battery, panel, actuator, limit switches",
    "4 x 3 matrix keypad on a 7 pin header",
    "SIM card slot and u.FL antenna connector",
    "Tag-Connect programming pads",
  ],
  firmware: [
    "Sleep between commands and wake on the modem or a key press",
    "Stop and reverse when motor current passes a threshold for 200 ms",
    "Time out a move after 30 seconds",
    "Over-the-air updates from day one",
  ],
  risks: [
    "Motor noise resetting the microcontroller. Keep the motor ground return separate.",
    "Modem current peaks sagging the 3.8 V rail. Follow the module's capacitor guidance.",
  ],
};

const FULL_PCB: PcbContent = {
  board: {
    widthMm: 100,
    heightMm: 70,
    cornerRadiusMm: 3,
    thicknessMm: 1.6,
    layers: 2,
    mountingHoles: [
      { xMm: 5, yMm: 5, diameterMm: 3.2 },
      { xMm: 95, yMm: 5, diameterMm: 3.2 },
      { xMm: 5, yMm: 65, diameterMm: 3.2 },
      { xMm: 95, yMm: 65, diameterMm: 3.2 },
    ],
    outlineBasis: "Fits inside the WC-33 with 2 mm clearance on every side.",
  },
  fab: {
    supplierId: "jlcpcb",
    why: "Cheapest for five 2 layer boards, and it can place most of the parts from LCSC stock.",
  },
  rules: SAFE_PCB_RULES,
  checklist: [...PCB_CHECKLIST],
  projectChecks: [
    {
      text: "Keep the motor driver and its traces on the opposite side of the board from the antenna.",
      why: "Motor switching noise raises the modem's noise floor and cuts range.",
    },
    {
      text: "Size the battery and motor traces for 10 A: at least 5 mm wide.",
      why: "The actuator can pull 8 A at stall.",
    },
  ],
  nextSteps: [
    "Download the starter board and open it in KiCad.",
    "Draw the schematic from the blocks in the electronics step.",
    "Place the terminals and mounting holes first, then route power.",
    "Run the design rules check and order five boards.",
  ],
};

const FULL_BUILD: BuildContent = {
  orderGroups: [
    {
      supplierId: "polycase",
      lines: [
        {
          need: "Weatherproof box for the controller and battery",
          qty: 1,
          url: "https://www.polycase.com/wc-33",
          estUnitCostUsd: 32.14,
        },
      ],
      subtotalUsd: 32.14,
    },
    {
      supplierId: "mcmaster",
      lines: [
        {
          need: "Linear actuator, 12 V, 12 in stroke",
          qty: 1,
          url: supplierLink("mcmaster", { query: "12V DC linear actuator 12 inch stroke weatherproof" }),
          estUnitCostUsd: null,
        },
        {
          need: "Stainless U-bolts for the post bracket",
          qty: 2,
          url: supplierLink("mcmaster", { partNumber: "8880T58" }),
          estUnitCostUsd: 9.75,
        },
      ],
      subtotalUsd: 19.5,
    },
    {
      supplierId: "sendcutsend",
      lines: [{ need: "Post bracket for the actuator", qty: 1, url: supplierLink("sendcutsend"), estUnitCostUsd: 18 }],
      subtotalUsd: 18,
    },
    {
      supplierId: "print_self",
      lines: [{ need: "Keypad bezel", qty: 1, url: "", estUnitCostUsd: 1.5 }],
      subtotalUsd: 1.5,
    },
    {
      supplierId: "jlcpcb",
      lines: [{ need: "Controller board, 2 layers", qty: 5, url: supplierLink("jlcpcb"), estUnitCostUsd: 4 }],
      subtotalUsd: 20,
    },
    {
      supplierId: "digikey",
      lines: [
        {
          need: "Cellular module with antenna",
          qty: 1,
          url: supplierLink("digikey", { query: "LTE-M module pre-certified" }),
          estUnitCostUsd: 24,
        },
        {
          need: "Motor driver, 12 V 10 A",
          qty: 1,
          url: supplierLink("digikey", { query: "H-bridge motor driver 12V 10A current sense" }),
          estUnitCostUsd: 6.2,
        },
      ],
      subtotalUsd: 30.2,
    },
  ],
  estTotalUsd: 121.34,
  steps: [
    { title: "Bring up the board on the bench", detail: "Power it from a bench supply at 12 V with a 1 A limit. Check each rail before fitting the modem." },
    { title: "Fit the board and keypad in the box", detail: "Four M3 screws into the box bosses. Route the keypad cable through the lid gland." },
    { title: "Mount the bracket and actuator", detail: "Clamp the bracket to the post with the U-bolts at gate hinge height. Pin the actuator to the bracket and the gate." },
    { title: "Wire the battery, panel and actuator", detail: "Battery last. Use the cable glands and leave a drip loop on every cable." },
    { title: "Set the limits and the stop current", detail: "Run the gate to each end, save the limits, then set the stop threshold just above the highest current you saw." },
  ],
  tests: [
    "Open and close 50 times in a row with no missed stop",
    "Block the gate by hand: it stops and reverses within half a second",
    "Hose the box for 5 minutes, then open it and look for water",
    "Leave it for 5 days with the panel covered and check it still opens",
  ],
  nextIteration: [
    "Move the battery into the same box",
    "Add a vehicle sensor so it won't close on a car",
    "Replace the U-bolts with a single clamp bracket",
  ],
};

export const FULL_PROJECT: PlanProject = {
  _id: "fixture-full",
  name: "Solar gate opener",
  description: "A solar powered gate opener I can control from my phone",
};

export const FULL_VIEW: JourneyView = {
  journey: { track: "product", needsElectronics: true, electronicsLocked: true, startedAt: T0 },
  applicable: applicableStages("product", true),
  stages: {
    idea: filled("idea", "done", FULL_IDEA, T0),
    validate: filled("validate", "done", FULL_VALIDATE, T0 + DAY),
    requirements: filled("requirements", "done", FULL_REQUIREMENTS, T0 + DAY),
    sourcing: filled("sourcing", "ready", FULL_SOURCING, T0 + 2 * DAY, "use a polycarbonate box, not metal"),
    mechanical: { id: "mechanical", status: "done", content: null, notes: null, error: null, generatedAt: null },
    electronics: filled("electronics", "ready", FULL_ELECTRONICS, T0 + 2 * DAY),
    pcb: filled("pcb", "ready", FULL_PCB, T0 + 2 * DAY),
    build: filled("build", "ready", FULL_BUILD, T0 + 2 * DAY),
  },
  nextStage: "sourcing",
  mechanical: { partCount: 4, fails: 0, warns: 0 },
  concept: {
    status: "ready",
    image: { kind: "svg", svg: CONCEPT_SVG, prompt: FULL_IDEA.conceptImagePrompt },
    error: null,
    remaining: 2,
  },
};

// ---------------------------------------------------------------------------
// 2. A hobby build mid-way: one stage working, one failed
// ---------------------------------------------------------------------------

const MID_IDEA: IdeaContent = {
  oneLiner: "A wall-mounted rack that holds 6 fishing rods upright in a garage.",
  problem: "Rods leaning in a corner get tangled and the tips get broken.",
  whoItsFor: "Me. One rack for my garage wall.",
  howItWorks: [
    "A top rail with 6 slots holds each rod near the tip.",
    "A bottom rail with 6 cups holds each rod butt.",
    "Both rails screw into two wall studs.",
  ],
  keyFeatures: ["Holds 6 rods up to 8 ft", "Rods lift straight out", "Screws to studs at 16 in spacing"],
  needsElectronics: false,
  electronicsReason: "Nothing moves and nothing needs power.",
  openQuestions: ["What is the thickest rod butt it has to hold?"],
  conceptImagePrompt: "A steel wall rack holding six fishing rods upright, plain background, no text.",
};

const MID_REQUIREMENTS: RequirementsContent = {
  summary: "Two steel rails that hold 6 rods upright against a garage wall, screwed to studs.",
  functional: ["Hold 6 rods without them touching", "Let a rod be lifted out with one hand"],
  envelope: { widthIn: 24, depthIn: 3, heightIn: null, note: "Two rails, each 24 in wide. The gap between them is set on the wall." },
  environment: { location: "indoor", waterproof: false, notes: "Unheated garage." },
  power: "None",
  quantity: 1,
  budgetUsd: null,
  tier: "jerry-rigged",
  constraints: ["Mounts with four wood screws into studs 16 in apart"],
  successCriteria: ["All 6 rods stay put when the garage door slams"],
};

export const MID_PROJECT: PlanProject = {
  _id: "fixture-mid",
  name: "Fishing rod wall rack",
  description: "A wall-mounted rack for 6 fishing rods",
};

export const MID_VIEW: JourneyView = {
  journey: { track: "hobby", needsElectronics: false, startedAt: T0 },
  applicable: applicableStages("hobby", false),
  stages: {
    idea: filled("idea", "done", MID_IDEA, T0),
    requirements: filled("requirements", "done", MID_REQUIREMENTS, T0 + DAY),
    sourcing: { id: "sourcing", status: "generating", content: null, notes: null, error: null, generatedAt: null },
    mechanical: { id: "mechanical", status: "ready", content: null, notes: null, error: null, generatedAt: null },
    build: {
      id: "build",
      status: "error",
      content: null,
      notes: null,
      error: "The guide ran out of time on this step. Nothing was charged for it.",
      generatedAt: null,
    },
  },
  nextStage: "sourcing",
  mechanical: { partCount: 3, fails: 1, warns: 2 },
  concept: {
    status: "error",
    image: null,
    error: "The picture service is busy. Try again in a minute.",
    remaining: 3,
  },
};

// ---------------------------------------------------------------------------
// 3. A brand-new plan: only the idea is being written
// ---------------------------------------------------------------------------

export const NEW_PROJECT: PlanProject = {
  _id: "fixture-new",
  name: "A bike tail light that also tracks the bike",
  description: "A bike tail light that also tracks the bike",
};

export const NEW_VIEW: JourneyView = {
  journey: { track: "hobby", needsElectronics: true, startedAt: T0 },
  applicable: applicableStages("hobby", true),
  stages: {
    idea: { id: "idea", status: "generating", content: null, notes: null, error: null, generatedAt: null },
    requirements: todo("requirements"),
    sourcing: todo("sourcing"),
    mechanical: todo("mechanical"),
    electronics: todo("electronics"),
    pcb: todo("pcb"),
    build: todo("build"),
  },
  nextStage: "idea",
  mechanical: { partCount: 0, fails: 0, warns: 0 },
  concept: { status: "none", image: null, error: null, remaining: 3 },
};

// ---------------------------------------------------------------------------
// 4. An older project with no plan
// ---------------------------------------------------------------------------

export const NO_PLAN_PROJECT: PlanProject = {
  _id: "fixture-none",
  name: "3 x 5 in L-bracket",
  description: "3 x 5 in L-bracket, 14 ga steel, four 1/4-20 holes",
};

export const NO_PLAN_VIEW: JourneyView = {
  journey: null,
  applicable: [],
  stages: {},
  nextStage: null,
  mechanical: { partCount: 2, fails: 0, warns: 0 },
  concept: { status: "none", image: null, error: null, remaining: 0 },
};

/** A sample of what `journey.mechanicalBrief` returns. */
export const MECHANICAL_BRIEF = `Design the custom parts for this project.

What it is: A bike tail light that also tracks the bike.

Requirements
- Fits a 27.2 to 31.6 mm seat post
- Outdoor, waterproof
- Envelope: 3 x 1.5 x 1.5 in

Bought parts to design around
- 1 x rear light lens, 40 mm
- 1 x 18650 cell holder

Start with the seat post clamp and the housing. Ask me before adding parts that are not listed here.`;

export type FixtureId = "full" | "mid" | "new" | "none";

export const FIXTURES: Record<FixtureId, { label: string; project: PlanProject; view: JourneyView }> = {
  full: { label: "Product, every stage filled", project: FULL_PROJECT, view: FULL_VIEW },
  mid: { label: "Hobby, mid-way", project: MID_PROJECT, view: MID_VIEW },
  new: { label: "Brand new", project: NEW_PROJECT, view: NEW_VIEW },
  none: { label: "No plan yet", project: NO_PLAN_PROJECT, view: NO_PLAN_VIEW },
};
