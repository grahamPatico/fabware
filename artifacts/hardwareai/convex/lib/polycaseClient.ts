// Polycase enclosure lookups for the sourcing stage.
//
// The data comes from fabware's own Polycase catalog service
// (polycase-mcp.vercel.app), never from polycase.com: this module must not
// fetch Polycase's site. Two rules from the supplier registry apply here:
//   - Product photos are Polycase's. `imageUrl` in the response is never read
//     or stored.
//   - The 3D model is a simplified solid the catalog service builds from the
//     published dimensions, not Polycase's own CAD.
//
// `buildEnclosureRequirements` and `mapRecommendation` are pure and tested
// against a saved response; `fetchEnclosure` is the only network code.

import type { RequirementsContent, SourcingLive } from "./journey";
import { supplierLink } from "./suppliers";

export const POLYCASE_CATALOG_ORIGIN = "https://polycase-mcp.vercel.app";
const RECOMMEND_URL = `${POLYCASE_CATALOG_ORIGIN}/api/tools/recommend_enclosure`;
const RECOMMEND_TIMEOUT_MS = 20_000;
const MODEL_CHECK_TIMEOUT_MS = 8_000;
const MM_PER_INCH = 25.4;

/**
 * The plain-text request the catalog service parses. Sizes are sent in
 * millimetres with the unit written out so the parser never has to guess.
 */
export function buildEnclosureRequirements(
  requirements: RequirementsContent | null,
  item: { need: string; searchQuery: string },
): string {
  const parts: string[] = [`Enclosure for: ${item.need.trim()}.`];
  const query = item.searchQuery.trim();
  if (query && query.toLowerCase() !== item.need.trim().toLowerCase()) parts.push(`${query}.`);
  if (requirements) {
    const { widthIn, depthIn, heightIn } = requirements.envelope;
    if (widthIn !== null && depthIn !== null && heightIn !== null) {
      const mm = [widthIn, depthIn, heightIn].map((inches) => Math.round(inches * MM_PER_INCH));
      parts.push(`Minimum internal size ${mm[0]} x ${mm[1]} x ${mm[2]} mm.`);
    }
    parts.push(requirements.environment.location === "outdoor" ? "Outdoor use." : "Indoor use.");
    if (requirements.environment.waterproof) parts.push("Must be waterproof.");
  }
  return parts.join(" ");
}

/** Where the catalog service serves the simplified solid for a part. */
export function polycaseModelGlbUrl(partNumber: string): string {
  return `${POLYCASE_CATALOG_ORIGIN}/api/models/${encodeURIComponent(partNumber)}/model.glb`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function priceOf(price: unknown): number | null {
  if (!isRecord(price)) return null;
  // Real shape: { basePriceUsd, priceBreaks: [{ minQty, maxQty, unitPriceUsd }] }.
  if (typeof price.basePriceUsd === "number" && Number.isFinite(price.basePriceUsd)) return price.basePriceUsd;
  const first = Array.isArray(price.priceBreaks) ? price.priceBreaks[0] : null;
  if (isRecord(first) && typeof first.unitPriceUsd === "number" && Number.isFinite(first.unitPriceUsd)) {
    return first.unitPriceUsd;
  }
  return null;
}

/** "0.2.0-20260822" -> "2026-08-22". */
function dateFromCatalogVersion(version: string): string {
  const m = version.match(/(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : version;
}

function asOfDate(result: Record<string, unknown>, productUrl: string): string {
  const sources = Array.isArray(result.sources) ? result.sources.filter(isRecord) : [];
  // The page this record was read from knows its own date best.
  const own = sources.find((s) => s.url === productUrl);
  const verified = asString(own?.lastVerified) || asString(sources[0]?.lastVerified);
  return verified || dateFromCatalogVersion(asString(result.catalogVersion));
}

/** Only ever link to Polycase's own site; anything else falls back to a search. */
function safeProductUrl(raw: string, partNumber: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && (host === "polycase.com" || host.endsWith(".polycase.com"))) return url.toString();
  } catch {
    // fall through
  }
  return supplierLink("polycase", { query: partNumber });
}

/**
 * The top-ranked recommendation as live sourcing data, or null when the
 * response has nothing usable. `modelGlbUrl` is always null here: it is set
 * only after `fetchEnclosure` has seen the model load.
 */
export function mapRecommendation(response: unknown): SourcingLive | null {
  if (!isRecord(response) || response.ok !== true || !isRecord(response.result)) return null;
  const result = response.result;
  const recs = Array.isArray(result.recommendations) ? result.recommendations.filter(isRecord) : [];
  if (recs.length === 0) return null;
  const rankOf = (r: Record<string, unknown>) => (typeof r.rank === "number" ? r.rank : Number.MAX_SAFE_INTEGER);
  const top = [...recs].sort((a, b) => rankOf(a) - rankOf(b))[0];

  const partNumber = asString(top.partNumber);
  const productName = asString(top.productName);
  if (!partNumber || !productName) return null;

  const productUrl = safeProductUrl(asString(top.productUrl), partNumber);
  const why = Array.isArray(top.whySelected) ? top.whySelected.map(asString).filter(Boolean) : [];
  return {
    productName,
    partNumber,
    productUrl,
    priceUsd: priceOf(top.price),
    fitSummary: why.join(" ").slice(0, 600),
    purchaseNote: asString(result.purchaseNote),
    modelGlbUrl: null,
    asOf: asOfDate(result, asString(top.productUrl)),
  };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// AbortSignal.timeout is not guaranteed in the Convex isolate runtime.
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** True when the catalog service can build a model for this part (some records answer 422). */
async function modelLoads(url: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    return await withTimeout(MODEL_CHECK_TIMEOUT_MS, async (signal) => {
      const res = await fetchImpl(url, { method: "GET", signal });
      // Drain the small body so the connection is released.
      await res.arrayBuffer().catch(() => undefined);
      return res.status === 200;
    });
  } catch {
    return false;
  }
}

/**
 * Ask the catalog service for an enclosure. Never throws: any failure
 * (timeout, bad status, unexpected shape) returns null and the sourcing line
 * simply stays unverified.
 */
export async function fetchEnclosure(text: string, fetchImpl: FetchLike = fetch): Promise<SourcingLive | null> {
  try {
    const body = await withTimeout(RECOMMEND_TIMEOUT_MS, async (signal) => {
      const res = await fetchImpl(RECOMMEND_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ requirements: text }),
        signal,
      });
      if (!res.ok) return null;
      return (await res.json()) as unknown;
    });
    const live = mapRecommendation(body);
    if (!live) return null;
    // The model route takes the orderable part number as returned.
    const glb = polycaseModelGlbUrl(live.partNumber);
    return { ...live, modelGlbUrl: (await modelLoads(glb, fetchImpl)) ? glb : null };
  } catch (err) {
    console.error("[polycase] enclosure lookup failed", err);
    return null;
  }
}
