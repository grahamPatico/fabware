import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, projectsTable, partSpecsTable } from "@workspace/db";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values(parsed.data)
    .returning();
  await db.insert(partSpecsTable).values({ projectId: project.id, partType: "bracket" });
  res.status(201).json(project);
});

router.get("/projects/recent", async (req, res): Promise<void> => {
  const projects = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      updatedAt: projectsTable.updatedAt,
      partType: partSpecsTable.partType,
      material: partSpecsTable.material,
    })
    .from(projectsTable)
    .leftJoin(partSpecsTable, eq(projectsTable.id, partSpecsTable.projectId))
    .orderBy(desc(projectsTable.updatedAt))
    .limit(12);
  res.json(projects);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const parsed = GetProjectParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, parsed.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateProjectParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const bodyParsed = UpdateProjectBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (bodyParsed.data.name != null) updates.name = bodyParsed.data.name;
  if (bodyParsed.data.description != null) updates.description = bodyParsed.data.description;
  if (bodyParsed.data.status != null) updates.status = bodyParsed.data.status;
  const [project] = await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.id, paramsParsed.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const parsed = DeleteProjectParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
