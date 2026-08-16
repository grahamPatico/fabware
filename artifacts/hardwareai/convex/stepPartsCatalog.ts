// step.parts catalog actions — thin fetch wrappers around the pure helpers in
// lib/stepParts.ts. Network failures never throw: the caller gets a readable
// error string back so an agent turn degrades instead of dying.

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import {
  buildStepPartsSearchUrl,
  buildStepPartUrl,
  trimStepPartRecord,
  type StepPartRecord,
} from "./lib/stepParts";

const REQUEST_TIMEOUT_MS = 10_000;

export type StepPartsSearchResult =
  | { ok: true; results: StepPartRecord[] }
  | { ok: false; error: string };

export type StepPartsResolveResult =
  | { ok: true; part: StepPartRecord }
  | { ok: false; error: string };

const searchArgs = {
  query: v.string(),
  category: v.optional(v.string()),
  family: v.optional(v.string()),
  limit: v.optional(v.number()),
};

function errText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 200);
}

// AbortSignal.timeout is not guaranteed in the Convex isolate runtime.
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runSearch(a: {
  query: string;
  category?: string;
  family?: string;
  limit?: number;
}): Promise<StepPartsSearchResult> {
  const url = buildStepPartsSearchUrl({
    q: a.query,
    category: a.category,
    family: a.family,
    pageSize: a.limit,
  });
  try {
    const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
    if (!res.ok) {
      return { ok: false, error: `step.parts search failed: HTTP ${res.status}` };
    }
    const body: any = await res.json();
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
    // Drop rows that don't match the expected shape rather than failing the
    // whole search on one bad record.
    const results = items
      .map(trimStepPartRecord)
      .filter((r): r is StepPartRecord => r !== null);
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: `step.parts search failed: ${errText(err)}` };
  }
}

export const search = action({ args: searchArgs, handler: (_ctx, a) => runSearch(a) });
export const searchInternal = internalAction({ args: searchArgs, handler: (_ctx, a) => runSearch(a) });

export const resolveInternal = internalAction({
  args: { id: v.string() },
  handler: async (_ctx, { id }): Promise<StepPartsResolveResult> => {
    const trimmedId = id.trim();
    if (!trimmedId) return { ok: false, error: "step.parts resolve failed: empty id" };
    try {
      const res = await fetchWithTimeout(buildStepPartUrl(trimmedId), REQUEST_TIMEOUT_MS);
      if (!res.ok) {
        return { ok: false, error: `step.parts resolve failed for ${trimmedId}: HTTP ${res.status}` };
      }
      const part = trimStepPartRecord(await res.json());
      if (!part) {
        return { ok: false, error: `step.parts resolve failed for ${trimmedId}: unexpected record shape` };
      }
      return { ok: true, part };
    } catch (err) {
      return { ok: false, error: `step.parts resolve failed for ${trimmedId}: ${errText(err)}` };
    }
  },
});
