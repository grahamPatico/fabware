// SendCutSend live-rules sync — fetches SCS's two official published feeds,
// parses them with the pure helpers in lib/scsLive.ts, and caches the result
// in the single-row `scsRuleCache` table.
//
// A daily cron (convex/crons.ts) calls `refresh`; `refreshNow` is the manual
// handle (`npx convex run scsSync:refreshNow`). Network failures never throw —
// the caller gets `{ ok: false, error }` and the last good cache row survives,
// so validation degrades to the hand-maintained snapshot in scsRules.ts.

import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  SCS_CATALOG_URL,
  SCS_SPECS_URL,
  parseScsFeeds,
  type ScsLiveRules,
} from "./lib/scsLive";

const CACHE_KEY = "latest";
const REQUEST_TIMEOUT_MS = 20_000;

export type ScsRefreshResult =
  | { ok: true; materialCount: number; skuCount: number }
  | { ok: false; error: string };

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

async function fetchJson(url: string, label: string): Promise<unknown> {
  const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`${label} feed: HTTP ${res.status}`);
  return await res.json();
}

/** `_meta.generated_at` off a raw feed body, when present. */
function feedGeneratedAt(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const meta = (raw as { _meta?: unknown })._meta;
  if (meta == null || typeof meta !== "object") return undefined;
  const at = (meta as { generated_at?: unknown }).generated_at;
  return typeof at === "string" && at.trim() !== "" ? at : undefined;
}

async function runRefresh(store: (a: {
  rulesJson: string;
  catalogGeneratedAt?: string;
  specsGeneratedAt?: string;
}) => Promise<null>): Promise<ScsRefreshResult> {
  try {
    const [catalogJson, specsJson] = await Promise.all([
      fetchJson(SCS_CATALOG_URL, "sendcutsend-catalog.json"),
      fetchJson(SCS_SPECS_URL, "sendcutsend-specs.json"),
    ]);
    const rules = parseScsFeeds(catalogJson, specsJson);
    const materialCount = Object.keys(rules.materials).length;
    const skuCount = Object.values(rules.materials).reduce((n, list) => n + list.length, 0);
    if (skuCount === 0) {
      // A structurally-valid but empty parse means SCS changed the feed shape.
      // Keep the previous cache row rather than blanking live validation.
      return { ok: false, error: "SCS feeds parsed to zero SKUs — feed shape may have changed" };
    }
    await store({
      rulesJson: JSON.stringify(rules),
      catalogGeneratedAt: feedGeneratedAt(catalogJson),
      specsGeneratedAt: feedGeneratedAt(specsJson),
    });
    return { ok: true, materialCount, skuCount };
  } catch (err) {
    return { ok: false, error: `SCS rules refresh failed: ${errText(err)}` };
  }
}

export const store = internalMutation({
  args: {
    rulesJson: v.string(),
    catalogGeneratedAt: v.optional(v.string()),
    specsGeneratedAt: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("scsRuleCache")
      .withIndex("by_key", (q) => q.eq("key", CACHE_KEY))
      .unique();
    const row = {
      key: CACHE_KEY,
      fetchedAt: Date.now(),
      rulesJson: a.rulesJson,
      catalogGeneratedAt: a.catalogGeneratedAt,
      specsGeneratedAt: a.specsGeneratedAt,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("scsRuleCache", row);
    }
    return null;
  },
});

export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<ScsRefreshResult> =>
    runRefresh((a) => ctx.runMutation(internal.scsSync.store, a)),
});

/** Manual handle: `npx convex run scsSync:refreshNow`. */
export const refreshNow = action({
  args: {},
  handler: async (ctx): Promise<ScsRefreshResult> =>
    runRefresh((a) => ctx.runMutation(internal.scsSync.store, a)),
});

/**
 * Read the cached rules from any query/mutation. Returns null when the cron
 * has never run or the cached row doesn't parse — callers then fall back to
 * the static SCS_MATERIALS snapshot.
 */
export async function loadLiveRules(db: DatabaseReader): Promise<ScsLiveRules | null> {
  const row = await db
    .query("scsRuleCache")
    .withIndex("by_key", (q) => q.eq("key", CACHE_KEY))
    .unique();
  if (!row) return null;
  try {
    return JSON.parse(row.rulesJson) as ScsLiveRules;
  } catch {
    return null;
  }
}

export const getLiveRules = internalQuery({
  args: {},
  handler: async (ctx): Promise<ScsLiveRules | null> => loadLiveRules(ctx.db),
});

export const status = query({
  args: {},
  handler: async (ctx): Promise<{
    fetchedAt: number;
    skuCount: number;
    generatedAt: string | null;
  } | null> => {
    const row = await ctx.db
      .query("scsRuleCache")
      .withIndex("by_key", (q) => q.eq("key", CACHE_KEY))
      .unique();
    if (!row) return null;
    const rules = await loadLiveRules(ctx.db);
    const skuCount = rules
      ? Object.values(rules.materials).reduce((n, list) => n + list.length, 0)
      : 0;
    return {
      fetchedAt: row.fetchedAt,
      skuCount,
      generatedAt: rules?.generatedAt ?? row.specsGeneratedAt ?? null,
    };
  },
});
