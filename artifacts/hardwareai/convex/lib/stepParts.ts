// step.parts catalog helpers — pure URL building, defensive record parsing,
// and agent-facing summarization.
//
// The catalog (https://api.step.parts) carries ~16.8k real purchasable parts
// (DIN/ISO fasteners, bearings, motors, standoffs, electronics), each with a
// STEP file, a GLB preview, a PNG, and family-specific dimensional attributes.
// Everything here is pure so it unit-tests without network access; the actual
// fetching lives in convex/stepPartsCatalog.ts.

import { z } from "zod/v4";

/** Catalog API origin. */
export const STEP_PARTS_ORIGIN = "https://api.step.parts";

const DEFAULT_PAGE_SIZE = 8;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 25;

/** Standards body reference (DIN 913, ISO 4032, …). Absent on non-standard parts. */
export interface StepPartStandard {
  body: string;
  number: string;
  designation: string;
}

/** Family-specific scalars, e.g. { thread: "M3", lengthMm: 3, shielded: true }. */
export type StepPartAttributes = Record<string, string | number | boolean>;

/** Trimmed catalog record — the subset fabware stores and shows. */
export interface StepPartRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  family: string;
  tags: string[];
  aliases: string[];
  standard: StepPartStandard | null;
  attributes: StepPartAttributes;
  stepUrl: string;
  glbUrl: string;
  pngUrl: string;
  pageUrl: string;
}

// `standard.number` comes back as a string ("913") today; accept a number too
// so a catalog-side type change doesn't blank out the whole record.
const StandardSchema = z.object({
  body: z.string(),
  number: z.union([z.string(), z.number()]).transform((n) => String(n)),
  designation: z.string(),
});

// Only `id` and `name` are load-bearing; everything else degrades to a default
// so a partially-populated record still reaches the agent.
const RawStepPartSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  category: z.string().nullish(),
  family: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  aliases: z.array(z.string()).nullish(),
  standard: StandardSchema.nullish(),
  attributes: z.record(z.string(), z.unknown()).nullish(),
  stepUrl: z.string().nullish(),
  glbUrl: z.string().nullish(),
  pngUrl: z.string().nullish(),
  pageUrl: z.string().nullish(),
});

/**
 * Build a GET /v1/parts search URL. Every `q` token must match catalog-side;
 * facet params (category / family / standard) are ANDed across facets.
 * `pageSize` defaults to 8 and clamps to 1..25.
 */
export function buildStepPartsSearchUrl(opts: {
  q?: string;
  category?: string;
  family?: string;
  standard?: string;
  pageSize?: number;
}): string {
  const params = new URLSearchParams();
  const push = (key: string, value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    if (trimmed.length > 0) params.set(key, trimmed);
  };
  push("q", opts.q);
  push("category", opts.category);
  push("family", opts.family);
  push("standard", opts.standard);

  const raw = opts.pageSize;
  const size = typeof raw === "number" && Number.isFinite(raw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(raw)))
    : DEFAULT_PAGE_SIZE;
  params.set("pageSize", String(size));

  return `${STEP_PARTS_ORIGIN}/v1/parts?${params.toString()}`;
}

/** Build a GET /v1/parts/{id} URL for a single enriched record. */
export function buildStepPartUrl(id: string): string {
  return `${STEP_PARTS_ORIGIN}/v1/parts/${encodeURIComponent(id.trim())}`;
}

/**
 * Defensively narrow one raw catalog item to a StepPartRecord. Returns null
 * when the shape doesn't match (missing id/name, non-object, wrong types) so
 * callers can drop bad rows instead of throwing mid-response.
 */
export function trimStepPartRecord(raw: unknown): StepPartRecord | null {
  const parsed = RawStepPartSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  // Attributes are free-form; keep only scalars so summaries stay one line.
  const attributes: StepPartAttributes = {};
  for (const [k, val] of Object.entries(d.attributes ?? {})) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      attributes[k] = val;
    }
  }
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? "",
    category: d.category ?? "",
    family: d.family ?? "",
    tags: d.tags ?? [],
    aliases: d.aliases ?? [],
    standard: d.standard ?? null,
    attributes,
    stepUrl: d.stepUrl ?? "",
    glbUrl: d.glbUrl ?? "",
    pngUrl: d.pngUrl ?? "",
    pageUrl: d.pageUrl ?? "",
  };
}

// Dimensional attributes the agent needs first to tell two near-identical
// catalog rows apart. Anything else follows in catalog order.
const PRIORITY_ATTRIBUTE_KEYS = [
  "thread",
  "nominalSize",
  "lengthMm",
  "boreMm",
  "outerDiameterMm",
  "widthMm",
  "heightMm",
  "pitchMm",
  "driveStyle",
  "bearingCode",
];

const MAX_SUMMARY_ATTRIBUTES = 6;

/**
 * One-line summary the agent reads to pick a match: name, id, family, and the
 * key dimensional attributes. Never contains a newline.
 */
export function summarizeStepPartForAgent(rec: StepPartRecord): string {
  const keys = Object.keys(rec.attributes);
  const ordered = [
    ...PRIORITY_ATTRIBUTE_KEYS.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !PRIORITY_ATTRIBUTE_KEYS.includes(k)),
  ].slice(0, MAX_SUMMARY_ATTRIBUTES);
  const attrs = ordered.map((k) => `${k}=${rec.attributes[k]}`).join(", ");

  const bits = [`${rec.name} (id: ${rec.id})`];
  const taxonomy = [rec.category, rec.family].filter((s) => s.length > 0).join(" / ");
  if (taxonomy) bits.push(taxonomy);
  if (rec.standard) bits.push(rec.standard.designation);
  if (attrs) bits.push(attrs);
  return bits.join(" · ").replace(/\s*\n\s*/g, " ");
}
