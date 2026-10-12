// Runtime validation for what the MODEL writes at each journey stage.
//
// Only the model-written fields live here. Everything the server owns (links,
// `verified`, live catalog data, PCB rules and checklist, order groups) is
// added afterwards in journeyEnrich.ts, so the model can never set it.
//
// Parsing is forgiving on purpose: strings are trimmed, missing lists become
// [], numeric strings are coerced, long lists are clamped and a malformed list
// entry is dropped instead of failing the stage. A stage is rejected only
// when the part that makes it usable is missing.

import { z } from "zod/v4";
import type {
  BuildContent, ElectronicsBlock, ElectronicsCandidate, ElectronicsContent, GeneratedStageId,
  IdeaContent, PcbBoard, PcbContent, RequirementsContent, SourcingApproach, SourcingItem,
  ValidateContent,
} from "./journey";
import { SUPPLIER_IDS, getSupplier, isSupplierId, type SupplierId } from "./suppliers";

export const MAX_LIST_ITEMS = 12;
export const MAX_SOURCING_ITEMS = 20;
const MAX_BUILD_STEPS = 20;

// ---------------------------------------------------------------------------
// What the model writes, per stage.
// ---------------------------------------------------------------------------

export type IdeaOutput = IdeaContent;
/** `sources` is the model's own list; the server keeps only pages the search really returned. */
export type ValidateOutput = Omit<ValidateContent, "researched">;
export type RequirementsOutput = RequirementsContent;
export type SourcingItemOutput = Omit<SourcingItem, "url" | "verified" | "live">;
export interface SourcingOutput { items: SourcingItemOutput[]; notes: string[] }
export type ElectronicsCandidateOutput = Omit<ElectronicsCandidate, "url">;
export interface ElectronicsBlockOutput extends Omit<ElectronicsBlock, "candidates"> {
  candidates: ElectronicsCandidateOutput[];
}
export interface ElectronicsOutput extends Omit<ElectronicsContent, "blocks"> {
  blocks: ElectronicsBlockOutput[];
}
/** `layers` and the dimensions are clamped later, in enrichPcb. */
export interface PcbOutput extends Omit<PcbContent, "rules" | "checklist" | "board"> {
  board: Omit<PcbBoard, "layers"> & { layers: number };
}
export type BuildOutput = Omit<BuildContent, "orderGroups" | "estTotalUsd">;

export interface StageOutputMap {
  idea: IdeaOutput;
  validate: ValidateOutput;
  requirements: RequirementsOutput;
  sourcing: SourcingOutput;
  electronics: ElectronicsOutput;
  pcb: PcbOutput;
  build: BuildOutput;
}

// ---------------------------------------------------------------------------
// Forgiving building blocks.
// ---------------------------------------------------------------------------

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Any scalar as a trimmed string; anything else (or nothing) as "". */
const text = (max = 800) =>
  z.unknown().transform((v) => toText(v).trim().slice(0, max));

/** Like `text`, but the stage is rejected when it comes back empty. */
const requiredText = (max = 800) =>
  text(max).refine((s) => s.length > 0, { message: "is missing" });

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // "$1,200", "12.5 mm", " 40 " all carry one usable number.
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** A number, a numeric string, or null when the model didn't know. */
const numberOrNull = z.unknown().transform((v) => toNumber(v));

/** As `numberOrNull`, but negative values and zero mean "unknown". */
const positiveOrNull = numberOrNull.transform((n) => (n !== null && n > 0 ? n : null));

/** Prices: zero is a real answer (a free experiment), negatives are not. */
const costOrNull = numberOrNull.transform((n) => (n !== null && n >= 0 ? n : null));

const requiredNumber = z.unknown().transform((v, ctx): number => {
  const n = toNumber(v);
  if (n === null) {
    ctx.issues.push({ code: "custom", message: "must be a number", input: v });
    return z.NEVER;
  }
  return n;
});

const numberOr = (fallback: number) => numberOrNull.transform((n) => n ?? fallback);

const bool = z.unknown().transform((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(true|yes|y|1)$/i.test(v.trim());
  return v === 1;
});

/** One of `values`; anything else becomes `fallback`. */
function oneOf<const T extends readonly string[]>(values: T, fallback: T[number]) {
  return z.unknown().transform((v): T[number] => {
    const s = toText(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
    const hit = values.find((x) => x.replace(/-/g, "_") === s);
    return hit ?? fallback;
  });
}

/**
 * A list that never fails the stage: a missing list is [], a lone value is a
 * one-item list, entries that don't parse are dropped, and the result is
 * clamped to `max`.
 */
function list<T extends z.ZodType>(item: T, max = MAX_LIST_ITEMS) {
  return z.unknown().transform((v): Array<z.output<T>> => {
    const raw = Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v];
    const out: Array<z.output<T>> = [];
    for (const entry of raw) {
      const parsed = item.safeParse(entry);
      if (parsed.success) out.push(parsed.data);
      if (out.length >= max) break;
    }
    return out;
  });
}

const lines = (max = MAX_LIST_ITEMS) => list(requiredText(400), max);

/** An object the model may have left out entirely. */
function section<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess(
    (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.object(shape),
  );
}

// ---------------------------------------------------------------------------
// Suppliers.
// ---------------------------------------------------------------------------

export const SOURCING_APPROACHES = [
  "buy", "enclosure", "laser_cut", "print_3d", "pcb", "electronics",
] as const satisfies readonly SourcingApproach[];

/** Where a line goes when the model names a supplier fabware doesn't know. */
export const DEFAULT_SUPPLIER_FOR_APPROACH: Record<SourcingApproach, SupplierId> = {
  buy: "mcmaster",
  enclosure: "polycase",
  laser_cut: "sendcutsend",
  print_3d: "print_self",
  pcb: "jlcpcb",
  electronics: "digikey",
};

function supplierOr(raw: unknown, fallback: SupplierId): SupplierId {
  const id = toText(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return isSupplierId(id) ? id : fallback;
}

// ---------------------------------------------------------------------------
// Stage schemas.
// ---------------------------------------------------------------------------

const IdeaSchema: z.ZodType<IdeaOutput> = z
  .object({
    oneLiner: requiredText(300),
    problem: text(),
    whoItsFor: text(),
    howItWorks: lines(),
    keyFeatures: lines(),
    needsElectronics: bool,
    electronicsReason: text(),
    openQuestions: lines(),
    conceptImagePrompt: text(600),
  })
  // A concept picture can always be drawn from the one-liner.
  .transform((o) => ({ ...o, conceptImagePrompt: o.conceptImagePrompt || o.oneLiner }));

const urlOrNull = z.unknown().transform((v) => {
  const s = toText(v).trim();
  return /^https?:\/\/\S+$/i.test(s) ? s.slice(0, 500) : null;
});

const ValidateSchema: z.ZodType<ValidateOutput> = z.object({
  customer: requiredText(),
  problemStatement: text(),
  alternatives: list(z.object({
    name: requiredText(200),
    kind: oneOf(["direct", "indirect", "diy"] as const, "indirect"),
    note: text(400),
    url: urlOrNull,
  })),
  differentiators: lines(),
  pricing: section({
    targetPriceUsd: positiveOrNull,
    targetCostUsd: positiveOrNull,
    reasoning: text(),
  }),
  experiments: list(z.object({
    name: requiredText(200),
    how: text(600),
    successSignal: text(400),
    costUsd: costOrNull,
    days: positiveOrNull,
  }), 5),
  risks: lines(),
  goSignals: lines(),
  sources: list(z.object({ title: text(200), url: urlOrNull })
    .transform((s) => (s.url ? { title: s.title || s.url, url: s.url } : null)), 20)
    .transform((items) => items.filter((s): s is { title: string; url: string } => s !== null)),
});

const RequirementsSchema: z.ZodType<RequirementsOutput> = z.object({
  summary: requiredText(),
  functional: lines(),
  envelope: section({
    widthIn: positiveOrNull,
    depthIn: positiveOrNull,
    heightIn: positiveOrNull,
    note: text(400),
  }),
  environment: section({
    location: oneOf(["indoor", "outdoor"] as const, "indoor"),
    waterproof: bool,
    notes: text(400),
  }),
  power: text(400),
  quantity: positiveOrNull.transform((n) => (n === null ? null : Math.max(1, Math.round(n)))),
  budgetUsd: positiveOrNull,
  tier: oneOf(["jerry-rigged", "mvp", "commercial"] as const, "mvp"),
  constraints: lines(),
  successCriteria: lines(),
});

const quantity = numberOrNull.transform((n) => (n === null || n < 1 ? 1 : Math.min(10_000, Math.round(n))));

const partNumberOrNull = z.unknown().transform((v) => {
  const s = toText(v).trim();
  return s && !/^(null|none|unknown|n\/a|tbd)$/i.test(s) ? s.slice(0, 60) : null;
});

const SourcingItemSchema: z.ZodType<SourcingItemOutput> = z
  .object({
    need: requiredText(300),
    approach: oneOf(SOURCING_APPROACHES, "buy"),
    supplierId: z.unknown(),
    searchQuery: text(200),
    partNumber: partNumberOrNull,
    qty: quantity,
    estUnitCostUsd: costOrNull,
    why: text(400),
  })
  .transform((o) => ({
    ...o,
    supplierId: supplierOr(o.supplierId, DEFAULT_SUPPLIER_FOR_APPROACH[o.approach]),
    // A line with no query still needs something to search for.
    searchQuery: o.searchQuery || o.need.slice(0, 200),
  }));

const SourcingSchema: z.ZodType<SourcingOutput> = z.object({
  items: list(SourcingItemSchema, MAX_SOURCING_ITEMS)
    .refine((items) => items.length > 0, { message: "has no usable lines" }),
  notes: lines(),
});

const CandidateSchema: z.ZodType<ElectronicsCandidateOutput> = z
  .object({
    part: requiredText(200),
    why: text(400),
    supplierId: z.unknown(),
    searchQuery: text(200),
  })
  .transform((o) => ({
    ...o,
    supplierId: supplierOr(o.supplierId, "digikey"),
    searchQuery: o.searchQuery || o.part,
  }));

const ElectronicsSchema: z.ZodType<ElectronicsOutput> = z.object({
  summary: requiredText(),
  prototypeFirst: text(),
  blocks: list(z.object({
    name: requiredText(200),
    role: text(400),
    candidates: list(CandidateSchema, 4),
  })),
  power: section({
    source: text(400),
    rails: list(z.object({
      name: requiredText(100),
      volts: requiredNumber,
      maxMa: positiveOrNull,
    })),
    runtimeNote: text(400),
  }),
  interfaces: lines(),
  firmware: lines(),
  risks: lines(),
});

const check = z.object({ text: requiredText(400), why: text(400) });

const PcbSchema: z.ZodType<PcbOutput> = z.object({
  board: z.object({
    widthMm: requiredNumber,
    heightMm: requiredNumber,
    cornerRadiusMm: numberOr(0),
    thicknessMm: numberOr(1.6),
    layers: numberOr(2),
    mountingHoles: list(z.object({
      xMm: requiredNumber,
      yMm: requiredNumber,
      diameterMm: requiredNumber,
    })),
    outlineBasis: text(400),
  }),
  fab: section({ supplierId: z.unknown(), why: text(400) }).transform((fab) => {
    const id = supplierOr(fab.supplierId, "jlcpcb");
    // The board house has to be one: a parts distributor here is a mistake.
    return { supplierId: getSupplier(id)?.category === "pcb" ? id : "jlcpcb", why: fab.why };
  }),
  projectChecks: list(check),
  nextSteps: lines(),
});

const BuildSchema: z.ZodType<BuildOutput> = z.object({
  steps: list(z.object({ title: requiredText(200), detail: text(800) }), MAX_BUILD_STEPS)
    .refine((steps) => steps.length > 0, { message: "has no steps" }),
  tests: lines(),
  nextIteration: lines(),
});

const SCHEMAS: { [S in GeneratedStageId]: z.ZodType<StageOutputMap[S]> } = {
  idea: IdeaSchema,
  validate: ValidateSchema,
  requirements: RequirementsSchema,
  sourcing: SourcingSchema,
  electronics: ElectronicsSchema,
  pcb: PcbSchema,
  build: BuildSchema,
};

// ---------------------------------------------------------------------------
// Parsing.
// ---------------------------------------------------------------------------

/**
 * The JSON object in a model reply. Structured output returns bare JSON; the
 * fallbacks cover a fenced block or prose around the object.
 */
export function extractJson(reply: string): unknown {
  const trimmed = reply.trim();
  const candidates: string[] = [trimmed];
  // The last fenced block: the answer comes after any working notes.
  const fences = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fences.length > 0) candidates.push(fences[fences.length - 1][1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next shape
    }
  }
  throw new Error("The reply did not contain a JSON object.");
}

/**
 * Validate one stage's model output. `raw` is the parsed object or the reply
 * text. Throws an Error naming what was wrong.
 */
export function parseStageOutput<S extends GeneratedStageId>(stage: S, raw: unknown): StageOutputMap[S] {
  const value = typeof raw === "string" ? extractJson(raw) : raw;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The ${stage} answer was not a JSON object.`);
  }
  const result = SCHEMAS[stage].safeParse(value);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "answer"} ${i.message}`)
      .join("; ");
    throw new Error(`The ${stage} answer was not usable: ${problems}.`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// JSON Schema for the API's structured output.
//
// Hand-written to stay inside what the API accepts: every object closed with
// additionalProperties:false and all properties required, "unknown" expressed
// as a null union, and no numeric, string-length or array-length keywords.
// The limits are enforced above, after the reply comes back.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema => (description ? { type: "string", description } : { type: "string" });
const num = (description?: string): JsonSchema => (description ? { type: "number", description } : { type: "number" });
const boolean = (description?: string): JsonSchema => (description ? { type: "boolean", description } : { type: "boolean" });
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });
const arr = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: "array", items, description } : { type: "array", items };
const enumOf = (values: readonly string[], description?: string): JsonSchema =>
  description ? { type: "string", enum: [...values], description } : { type: "string", enum: [...values] };
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const supplierEnum = (ids: readonly SupplierId[]) => enumOf(ids, "A supplier id from the registry.");

const JSON_SCHEMAS: Record<GeneratedStageId, () => JsonSchema> = {
  idea: () => obj({
    oneLiner: str("One sentence: what the thing is."),
    problem: str(),
    whoItsFor: str(),
    howItWorks: arr(str()),
    keyFeatures: arr(str()),
    needsElectronics: boolean("True only when the product needs a circuit, power or firmware to do its job."),
    electronicsReason: str(),
    openQuestions: arr(str()),
    conceptImagePrompt: str("One product on a plain background. No text, no logos."),
  }),
  validate: () => obj({
    customer: str(),
    problemStatement: str(),
    alternatives: arr(obj({
      name: str(),
      kind: enumOf(["direct", "indirect", "diy"]),
      note: str(),
      url: nullable(str("Only a page you actually found. Otherwise null.")),
    })),
    differentiators: arr(str()),
    pricing: obj({
      targetPriceUsd: nullable(num()),
      targetCostUsd: nullable(num()),
      reasoning: str(),
    }),
    experiments: arr(obj({
      name: str(),
      how: str(),
      successSignal: str(),
      costUsd: nullable(num()),
      days: nullable(num()),
    }), "3 to 5 cheap experiments."),
    risks: arr(str()),
    goSignals: arr(str()),
    sources: arr(obj({ title: str(), url: str() }), "Pages you read. Empty when you did not search."),
  }),
  requirements: () => obj({
    summary: str(),
    functional: arr(str()),
    envelope: obj({
      widthIn: nullable(num("Inches.")),
      depthIn: nullable(num("Inches.")),
      heightIn: nullable(num("Inches.")),
      note: str(),
    }),
    environment: obj({
      location: enumOf(["indoor", "outdoor"]),
      waterproof: boolean(),
      notes: str(),
    }),
    power: str(),
    quantity: nullable(num()),
    budgetUsd: nullable(num()),
    tier: enumOf(["jerry-rigged", "mvp", "commercial"]),
    constraints: arr(str()),
    successCriteria: arr(str()),
  }),
  sourcing: () => obj({
    items: arr(obj({
      need: str("What this line is for."),
      approach: enumOf(SOURCING_APPROACHES),
      supplierId: supplierEnum(SUPPLIER_IDS),
      searchQuery: str("What to type into the supplier's search."),
      partNumber: nullable(str("Only a part number you are certain is real. Otherwise null.")),
      qty: num(),
      estUnitCostUsd: nullable(num()),
      why: str(),
    }), "One line per thing to obtain. At most 20."),
    notes: arr(str()),
  }),
  electronics: () => obj({
    summary: str(),
    prototypeFirst: str("What to prove on a dev board before a custom PCB."),
    blocks: arr(obj({
      name: str(),
      role: str(),
      candidates: arr(obj({
        part: str(),
        why: str(),
        supplierId: supplierEnum(["digikey", "mouser", "lcsc"]),
        searchQuery: str(),
      })),
    })),
    power: obj({
      source: str(),
      rails: arr(obj({ name: str(), volts: num(), maxMa: nullable(num()) })),
      runtimeNote: str(),
    }),
    interfaces: arr(str()),
    firmware: arr(str()),
    risks: arr(str()),
  }),
  pcb: () => obj({
    board: obj({
      widthMm: num(),
      heightMm: num(),
      cornerRadiusMm: num(),
      thicknessMm: num(),
      layers: { type: "integer", enum: [2, 4] },
      mountingHoles: arr(obj({
        xMm: num("From the board's left edge."),
        yMm: num("From the board's top edge."),
        diameterMm: num(),
      })),
      outlineBasis: str("Where the outline came from."),
    }),
    fab: obj({ supplierId: supplierEnum(["jlcpcb", "oshpark", "pcbway"]), why: str() }),
    projectChecks: arr(obj({ text: str(), why: str() })),
    nextSteps: arr(str()),
  }),
  build: () => obj({
    steps: arr(obj({ title: str(), detail: str() }), "Assembly steps in order."),
    tests: arr(str()),
    nextIteration: arr(str()),
  }),
};

/** Plain JSON Schema for `output_config.format` on the Messages API. */
export function stageJsonSchema(stage: GeneratedStageId): JsonSchema {
  return JSON_SCHEMAS[stage]();
}
