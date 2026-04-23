import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, partRevisionsTable, partSpecsTable } from "@workspace/db";
import { generateSvgPreview } from "../lib/dxfGenerator";
import { PartDslSchema } from "../lib/dsl";
import { buildFeatureGraph } from "../lib/featureGraph";

const router = Router();

router.get("/projects/:id/revisions", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const rows = await db
    .select({
      id: partRevisionsTable.id,
      projectId: partRevisionsTable.projectId,
      revisionNumber: partRevisionsTable.revisionNumber,
      dslJson: partRevisionsTable.dslJson,
      rationale: partRevisionsTable.rationale,
      createdAt: partRevisionsTable.createdAt,
    })
    .from(partRevisionsTable)
    .where(eq(partRevisionsTable.projectId, projectId))
    .orderBy(asc(partRevisionsTable.revisionNumber));
  res.json(rows);
});

function safeJsonParse<T = unknown>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function renderRevisionSpec(revision: { dslJson: string; specSnapshot: string }) {
  const snapshot = safeJsonParse<Record<string, unknown>>(revision.specSnapshot, {});
  const dslRaw = safeJsonParse<unknown>(revision.dslJson, null);
  const dslParse = dslRaw ? PartDslSchema.safeParse(dslRaw) : null;
  const dsl = dslParse?.success ? dslParse.data : null;
  const graph = dsl ? buildFeatureGraph(dsl) : null;
  const svg = dsl
    ? generateSvgPreview({ ...snapshot, dsl, featureGraph: graph })
    : (snapshot as { svgPreview?: string }).svgPreview ?? null;
  return { snapshot, dsl, graph, svg };
}

router.get("/projects/:id/revisions/:revisionId", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const revisionId = Number(req.params.revisionId);
  if (!Number.isFinite(projectId) || !Number.isFinite(revisionId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [revision] = await db
    .select()
    .from(partRevisionsTable)
    .where(eq(partRevisionsTable.id, revisionId));
  if (!revision || revision.projectId !== projectId) {
    res.status(404).json({ error: "Revision not found" });
    return;
  }

  const [activeSpec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, projectId));

  const { snapshot, svg } = renderRevisionSpec(revision);
  const previewSpec = {
    ...(activeSpec ?? {}),
    ...snapshot,
    svgPreview: svg,
    dslJson: revision.dslJson,
    currentRevisionId: activeSpec?.currentRevisionId ?? null,
    totalRevisions: activeSpec?.totalRevisions ?? 0,
    updatedAt: revision.createdAt,
    id: activeSpec?.id ?? -1,
    projectId,
  };

  res.json({
    revision: {
      id: revision.id,
      projectId: revision.projectId,
      revisionNumber: revision.revisionNumber,
      dslJson: revision.dslJson,
      rationale: revision.rationale,
      createdAt: revision.createdAt,
    },
    partSpec: previewSpec,
    isCurrent: activeSpec?.currentRevisionId === revision.id,
  });
});

async function activateRevision(projectId: number, targetIdx: number) {
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, projectId));
  if (!spec) return null;

  const revisions = await db
    .select()
    .from(partRevisionsTable)
    .where(eq(partRevisionsTable.projectId, projectId))
    .orderBy(asc(partRevisionsTable.revisionNumber));
  if (revisions.length === 0) {
    return { spec, currentRevisionId: null, canUndo: false, canRedo: false };
  }

  const clampedIdx = Math.max(0, Math.min(targetIdx, revisions.length - 1));
  const target = revisions[clampedIdx];
  const { snapshot, graph, svg } = renderRevisionSpec(target);

  const [updated] = await db
    .update(partSpecsTable)
    .set({
      ...snapshot,
      dslJson: target.dslJson,
      featureGraphJson: graph ? JSON.stringify(graph) : null,
      svgPreview: svg,
      currentRevisionId: target.id,
      updatedAt: new Date(),
    })
    .where(eq(partSpecsTable.projectId, projectId))
    .returning();

  return {
    spec: updated,
    currentRevisionId: target.id,
    canUndo: clampedIdx > 0,
    canRedo: clampedIdx < revisions.length - 1,
  };
}

async function moveRevision(projectId: number, direction: "undo" | "redo") {
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, projectId));
  if (!spec) return null;

  const revisions = await db
    .select({ id: partRevisionsTable.id })
    .from(partRevisionsTable)
    .where(eq(partRevisionsTable.projectId, projectId))
    .orderBy(asc(partRevisionsTable.revisionNumber));
  if (revisions.length === 0) {
    return { spec, currentRevisionId: null, canUndo: false, canRedo: false };
  }

  const currentIdx = spec.currentRevisionId
    ? revisions.findIndex((r) => r.id === spec.currentRevisionId)
    : revisions.length - 1;
  let targetIdx = currentIdx;
  if (direction === "undo" && currentIdx > 0) targetIdx = currentIdx - 1;
  else if (direction === "redo" && currentIdx < revisions.length - 1) targetIdx = currentIdx + 1;

  if (targetIdx === currentIdx) {
    return {
      spec,
      currentRevisionId: spec.currentRevisionId ?? revisions[currentIdx]?.id ?? null,
      canUndo: currentIdx > 0,
      canRedo: currentIdx < revisions.length - 1,
    };
  }

  return activateRevision(projectId, targetIdx);
}

router.post("/projects/:id/revisions/undo", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const r = await moveRevision(projectId, "undo");
  if (!r) {
    res.status(404).json({ error: "No part to revert" });
    return;
  }
  res.json({ partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo });
});

router.post("/projects/:id/revisions/redo", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const r = await moveRevision(projectId, "redo");
  if (!r) {
    res.status(404).json({ error: "No part to revert" });
    return;
  }
  res.json({ partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo });
});

router.post("/projects/:id/revisions/:revisionId/restore", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const revisionId = Number(req.params.revisionId);
  if (!Number.isFinite(projectId) || !Number.isFinite(revisionId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const revisions = await db
    .select({ id: partRevisionsTable.id, projectId: partRevisionsTable.projectId })
    .from(partRevisionsTable)
    .where(eq(partRevisionsTable.projectId, projectId))
    .orderBy(asc(partRevisionsTable.revisionNumber));
  const idx = revisions.findIndex((r) => r.id === revisionId);
  if (idx < 0) {
    res.status(404).json({ error: "Revision not found" });
    return;
  }

  const r = await activateRevision(projectId, idx);
  if (!r) {
    res.status(404).json({ error: "No part to restore" });
    return;
  }
  res.json({ partSpec: r.spec, currentRevisionId: r.currentRevisionId, canUndo: r.canUndo, canRedo: r.canRedo });
});

export default router;
