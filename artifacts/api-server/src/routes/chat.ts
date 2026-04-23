import { Router } from "express";
import { eq, asc, gt, and, max } from "drizzle-orm";
import {
  db,
  messagesTable,
  partRevisionsTable,
  partSpecsTable,
  projectsTable,
} from "@workspace/db";
import {
  GetProjectMessagesParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { generatePartFromMessage } from "../lib/aiDesigner";

const router = Router();

router.get("/projects/:id/messages", async (req, res): Promise<void> => {
  const parsed = GetProjectMessagesParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.projectId, parsed.data.id))
    .orderBy(asc(messagesTable.createdAt));
  res.json(messages);
});

router.post("/projects/:id/chat", async (req, res): Promise<void> => {
  const paramsParsed = SendMessageParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const bodyParsed = SendMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const projectId = paramsParsed.data.id;

  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project.length) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const imageData = bodyParsed.data.imageData ?? null;
  const imageMediaType = bodyParsed.data.imageMediaType ?? null;

  const [userMessage] = await db
    .insert(messagesTable)
    .values({
      projectId,
      role: "user",
      content: bodyParsed.data.content,
      imageData,
      imageMediaType,
    })
    .returning();

  const existingMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.projectId, projectId))
    .orderBy(asc(messagesTable.createdAt));

  const [existingSpec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, projectId));

  const llmImage =
    imageData && imageMediaType
      ? { data: imageData, mediaType: imageMediaType }
      : null;

  const { responseText, partUpdate, partUpdated, validation, dsl, rationale } =
    await generatePartFromMessage(
      bodyParsed.data.content,
      existingMessages.slice(0, -1),
      existingSpec ?? null,
      llmImage,
    );

  const [assistantMessage] = await db
    .insert(messagesTable)
    .values({ projectId, role: "assistant", content: responseText })
    .returning();

  let updatedSpec = existingSpec;
  if (partUpdated && partUpdate) {
    if (existingSpec) {
      const [updated] = await db
        .update(partSpecsTable)
        .set({ ...partUpdate, updatedAt: new Date() })
        .where(eq(partSpecsTable.projectId, projectId))
        .returning();
      updatedSpec = updated;
    } else {
      const [created] = await db
        .insert(partSpecsTable)
        .values({ projectId, partType: partUpdate.partType ?? "bracket", ...partUpdate })
        .returning();
      updatedSpec = created;
    }

    // Append revision (truncate any "redo" tail past current revision)
    if (updatedSpec && dsl) {
      if (updatedSpec.currentRevisionId != null) {
        const [currentRev] = await db
          .select()
          .from(partRevisionsTable)
          .where(eq(partRevisionsTable.id, updatedSpec.currentRevisionId));
        if (currentRev) {
          await db
            .delete(partRevisionsTable)
            .where(
              and(
                eq(partRevisionsTable.projectId, projectId),
                gt(partRevisionsTable.revisionNumber, currentRev.revisionNumber),
              ),
            );
        }
      }

      const [maxRow] = await db
        .select({ value: max(partRevisionsTable.revisionNumber) })
        .from(partRevisionsTable)
        .where(eq(partRevisionsTable.projectId, projectId));
      const newRevisionNumber = (maxRow?.value ?? 0) + 1;
      const snapshot = {
        partType: updatedSpec.partType,
        material: updatedSpec.material,
        thickness: updatedSpec.thickness,
        width: updatedSpec.width,
        height: updatedSpec.height,
        depth: updatedSpec.depth,
        bendRadius: updatedSpec.bendRadius,
        bendAngles: updatedSpec.bendAngles,
        holePattern: updatedSpec.holePattern,
        powderCoat: updatedSpec.powderCoat,
        powderCoatColor: updatedSpec.powderCoatColor,
        notes: updatedSpec.notes,
        svgPreview: updatedSpec.svgPreview,
        sendCutSendUrl: updatedSpec.sendCutSendUrl,
      };
      const [revision] = await db
        .insert(partRevisionsTable)
        .values({
          projectId,
          revisionNumber: newRevisionNumber,
          dslJson: JSON.stringify(dsl),
          specSnapshot: JSON.stringify(snapshot),
          rationale,
        })
        .returning();
      const [withRev] = await db
        .update(partSpecsTable)
        .set({
          currentRevisionId: revision.id,
          totalRevisions: newRevisionNumber,
          updatedAt: new Date(),
        })
        .where(eq(partSpecsTable.projectId, projectId))
        .returning();
      updatedSpec = withRev;
    }

    await db
      .update(projectsTable)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(projectsTable.id, projectId));
  }

  res.json({
    message: assistantMessage,
    partSpec: updatedSpec ?? null,
    partUpdated,
    validation: validation ?? null,
  });
});

export default router;
