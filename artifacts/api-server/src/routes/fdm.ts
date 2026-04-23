import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, partSpecsTable } from "@workspace/db";
import { PartDslSchema, legacyToDsl } from "../lib/dsl";
import { validateFdm, DEFAULT_FDM_PROFILE } from "../lib/fdmRules";

const router = Router();

const projectIdParam = z.object({ id: z.coerce.number().int().positive() });

router.get("/projects/:id/fdm-validation", async (req, res): Promise<void> => {
  const parsed = projectIdParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, parsed.data.id));
  if (!spec) {
    res.json({ rules: [], hasFailures: false, profile: DEFAULT_FDM_PROFILE });
    return;
  }
  let dsl = null;
  if (spec.dslJson) {
    const tryDsl = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
    if (tryDsl.success) dsl = tryDsl.data;
  }
  if (!dsl) {
    dsl = legacyToDsl(spec);
  }
  const result = validateFdm(dsl);
  res.json(result);
});

router.get("/fdm/profile", (_req, res): void => {
  res.json(DEFAULT_FDM_PROFILE);
});

export default router;
