import { Router } from "express";
import { z } from "zod/v4";
import { db, waitlistTable, isDatabaseConfigured } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "invalid email");

const createBody = z.object({
  email: EmailSchema,
  source: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

// POST /api/waitlist — stores a pre-beta signup. When the database isn't
// provisioned yet we log the entry to the request log so Vercel captures it
// (and so the caller still gets a 200 with persisted=false).
router.post("/waitlist", async (req, res): Promise<void> => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const entry = {
    email: parsed.data.email,
    source: parsed.data.source ?? "landing",
    note: parsed.data.note ?? null,
    userAgent: (req.headers["user-agent"] ?? "").slice(0, 300),
  };

  if (!isDatabaseConfigured) {
    logger.info({ waitlist: entry }, "waitlist signup (no db — logged only)");
    res.json({ persisted: false, queued: true });
    return;
  }

  try {
    const [row] = await db.insert(waitlistTable).values(entry).returning();
    res.status(201).json({ persisted: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Still 200 — the signup isn't lost, it's in the request log. Follow-up
    // sweep can reconcile if the DB came back up later.
    logger.error({ err: message, waitlist: entry }, "waitlist insert failed");
    res.json({ persisted: false, queued: true, error: "storage-unavailable" });
  }
});

export default router;
