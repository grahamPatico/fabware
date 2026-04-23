import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  assemblyPartsTable,
  projectsTable,
  mcmasterProductUrl,
  ASSEMBLY_PART_CATEGORIES,
} from "@workspace/db";
import { MCMASTER_SEED, findSeedPart, lookupSeedPart } from "../lib/mcmasterSeed";

const router = Router();

const projectIdParam = z.object({ id: z.coerce.number().int().positive() });
const partIdParam = z.object({
  id: z.coerce.number().int().positive(),
  partId: z.coerce.number().int().positive(),
});

const PartNumber = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9\-]+$/, "McMaster part numbers are alphanumeric");

const createBody = z.object({
  mcmasterPartNumber: PartNumber,
  name: z.string().min(1).max(200).optional(),
  category: z.enum(ASSEMBLY_PART_CATEGORIES).optional(),
  quantity: z.number().int().min(1).max(10_000).optional(),
  notes: z.string().max(500).optional().nullable(),
});

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(ASSEMBLY_PART_CATEGORIES).optional(),
  quantity: z.number().int().min(1).max(10_000).optional(),
  notes: z.string().max(500).optional().nullable(),
});

function enrich<T extends { mcmasterPartNumber: string }>(row: T) {
  return { ...row, url: mcmasterProductUrl(row.mcmasterPartNumber) };
}

router.get("/projects/:id/assembly-parts", async (req, res): Promise<void> => {
  const parsed = projectIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(assemblyPartsTable)
    .where(eq(assemblyPartsTable.projectId, parsed.data.id))
    .orderBy(asc(assemblyPartsTable.createdAt));
  res.json(rows.map(enrich));
});

router.post("/projects/:id/assembly-parts", async (req, res): Promise<void> => {
  const paramsParsed = projectIdParam.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const bodyParsed = createBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, paramsParsed.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const seed = lookupSeedPart(bodyParsed.data.mcmasterPartNumber);
  const [row] = await db
    .insert(assemblyPartsTable)
    .values({
      projectId: paramsParsed.data.id,
      mcmasterPartNumber: bodyParsed.data.mcmasterPartNumber.trim().toUpperCase(),
      name: bodyParsed.data.name ?? seed?.name ?? bodyParsed.data.mcmasterPartNumber,
      category: bodyParsed.data.category ?? seed?.category ?? "other",
      quantity: bodyParsed.data.quantity ?? 1,
      notes: bodyParsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(enrich(row));
});

router.patch("/projects/:id/assembly-parts/:partId", async (req, res): Promise<void> => {
  const paramsParsed = partIdParam.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const bodyParsed = updateBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const [row] = await db
    .update(assemblyPartsTable)
    .set({ ...bodyParsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(assemblyPartsTable.id, paramsParsed.data.partId),
        eq(assemblyPartsTable.projectId, paramsParsed.data.id),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Assembly part not found" });
    return;
  }
  res.json(enrich(row));
});

router.delete("/projects/:id/assembly-parts/:partId", async (req, res): Promise<void> => {
  const paramsParsed = partIdParam.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const deleted = await db
    .delete(assemblyPartsTable)
    .where(
      and(
        eq(assemblyPartsTable.id, paramsParsed.data.partId),
        eq(assemblyPartsTable.projectId, paramsParsed.data.id),
      ),
    )
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Assembly part not found" });
    return;
  }
  res.json({ ok: true });
});

// Resolve a McMaster part number → link + any known metadata from our seed.
router.get("/assembly-parts/mcmaster/:partNumber", async (req, res): Promise<void> => {
  const parsed = PartNumber.safeParse(req.params.partNumber);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const seed = lookupSeedPart(parsed.data);
  res.json({
    partNumber: parsed.data.trim().toUpperCase(),
    url: mcmasterProductUrl(parsed.data),
    known: !!seed,
    name: seed?.name ?? null,
    category: seed?.category ?? null,
    description: seed?.description ?? null,
  });
});

// Suggest a part from free text (e.g. "1/4-20 cap screw 1 inch").
router.get("/assembly-parts/mcmaster-suggest", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (q.length < 2) {
    res.json({ matches: [] });
    return;
  }
  const hit = findSeedPart(q);
  const matches = hit ? [hit] : [];
  // Cheap fuzzy fallback: any seed whose name contains any word of the query.
  if (matches.length === 0) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    for (const seed of MCMASTER_SEED) {
      if (words.some((w) => seed.name.toLowerCase().includes(w))) matches.push(seed);
      if (matches.length >= 5) break;
    }
  }
  res.json({
    matches: matches.map((m) => ({
      partNumber: m.partNumber,
      name: m.name,
      category: m.category,
      description: m.description,
      url: mcmasterProductUrl(m.partNumber),
    })),
  });
});

export default router;
