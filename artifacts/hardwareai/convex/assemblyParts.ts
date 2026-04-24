import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MCMASTER_SEED, lookupSeedPart, findSeedPart } from "./lib/mcmasterSeed";

const ASSEMBLY_PART_CATEGORIES = [
  "fastener",
  "nut",
  "washer",
  "bearing",
  "bushing",
  "extrusion",
  "fitting",
  "spring",
  "magnet",
  "spacer",
  "insert",
  "other",
] as const;

function mcmasterProductUrl(partNumber: string): string {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.mcmaster.com/${clean}/`;
}

function enrich<T extends { mcmasterPartNumber: string }>(part: T) {
  return { ...part, mcmasterProductUrl: mcmasterProductUrl(part.mcmasterPartNumber) };
}

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("assemblyParts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.map(enrich);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    mcmasterPartNumber: v.string(),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const seed = lookupSeedPart(args.mcmasterPartNumber);
    const name = args.name ?? seed?.name ?? args.mcmasterPartNumber;
    let category = args.category ?? seed?.category ?? "other";
    if (!(ASSEMBLY_PART_CATEGORIES as readonly string[]).includes(category)) {
      category = "other";
    }
    const now = Date.now();
    const id = await ctx.db.insert("assemblyParts", {
      projectId: args.projectId,
      mcmasterPartNumber: args.mcmasterPartNumber,
      name,
      category,
      quantity: args.quantity ?? 1,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    return enrich(created!);
  },
});

export const update = mutation({
  args: {
    partId: v.id("assemblyParts"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { partId, ...patch }) => {
    const existing = await ctx.db.get(partId);
    if (!existing) return null;
    await ctx.db.patch(partId, { ...patch, updatedAt: Date.now() });
    const updated = await ctx.db.get(partId);
    return enrich(updated!);
  },
});

export const remove = mutation({
  args: { partId: v.id("assemblyParts") },
  handler: async (ctx, { partId }) => {
    const existing = await ctx.db.get(partId);
    if (!existing) return { ok: false };
    await ctx.db.delete(partId);
    return { ok: true };
  },
});

export const mcmasterLookup = query({
  args: { partNumber: v.string() },
  handler: async (_ctx, { partNumber }) => {
    const seed = lookupSeedPart(partNumber);
    return {
      partNumber,
      url: mcmasterProductUrl(partNumber),
      known: !!seed,
      name: seed?.name ?? null,
      category: seed?.category ?? null,
      description: seed?.description ?? null,
    };
  },
});

export const mcmasterSuggest = query({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const q = query.trim();
    if (!q) return { matches: [] };
    const matches: typeof MCMASTER_SEED = [];
    const direct = lookupSeedPart(q);
    if (direct) matches.push(direct);
    const fuzzy = findSeedPart(q);
    if (fuzzy && !matches.some((m) => m.partNumber === fuzzy.partNumber)) {
      matches.push(fuzzy);
    }
    if (matches.length < 5) {
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
      for (const seed of MCMASTER_SEED) {
        if (matches.length >= 5) break;
        if (matches.some((m) => m.partNumber === seed.partNumber)) continue;
        if (
          words.some(
            (w) =>
              seed.name.toLowerCase().includes(w) ||
              seed.keywords.some((k) => k.includes(w)),
          )
        ) {
          matches.push(seed);
        }
      }
    }
    return {
      matches: matches.slice(0, 5).map((m) => ({
        partNumber: m.partNumber,
        name: m.name,
        category: m.category,
        description: m.description,
        url: mcmasterProductUrl(m.partNumber),
      })),
    };
  },
});
