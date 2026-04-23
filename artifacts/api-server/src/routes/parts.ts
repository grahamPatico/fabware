import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, partSpecsTable, projectsTable } from "@workspace/db";
import {
  GetPartSpecParams,
  UpdatePartSpecParams,
  UpdatePartSpecBody,
  ExportDxfParams,
  GetValidationParams,
  ApplySuggestionParams,
} from "@workspace/api-zod";
import { generateDxf, generateSvgPreview, type FlatPreviewSpec } from "../lib/dxfGenerator";
import { validateSpec, applySnap } from "../lib/scsRules";
import { PartDslSchema, legacyToDsl, type PartDsl } from "../lib/dsl";
import { buildFeatureGraph } from "../lib/featureGraph";

function withGraph(spec: FlatPreviewSpec & { dslJson?: string | null }): FlatPreviewSpec {
  if (spec.dsl && spec.featureGraph) return spec;
  if (spec.dslJson) {
    try {
      const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
      if (parsed.success) {
        const graph = buildFeatureGraph(parsed.data);
        return { ...spec, dsl: parsed.data, featureGraph: graph };
      }
    } catch {
      // fall through to legacy
    }
  }
  const dsl = legacyToDsl(spec);
  return { ...spec, dsl, featureGraph: buildFeatureGraph(dsl) };
}

const router = Router();

router.get("/projects/:id/part", async (req, res): Promise<void> => {
  const parsed = GetPartSpecParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, parsed.data.id));
  if (!spec) {
    res.status(404).json({ error: "No part spec found" });
    return;
  }
  res.json(spec);
});

router.put("/projects/:id/part", async (req, res): Promise<void> => {
  const paramsParsed = UpdatePartSpecParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }
  const bodyParsed = UpdatePartSpecBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...bodyParsed.data, updatedAt: new Date() };

  const [existing] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, paramsParsed.data.id));

  let spec;
  if (existing) {
    const merged = withGraph({ ...existing, ...bodyParsed.data, dsl: null, featureGraph: null });
    updates.svgPreview = generateSvgPreview(merged);
    if (merged.dsl) updates.dslJson = JSON.stringify(merged.dsl);
    if (merged.featureGraph) updates.featureGraphJson = JSON.stringify(merged.featureGraph);
    [spec] = await db
      .update(partSpecsTable)
      .set(updates)
      .where(eq(partSpecsTable.projectId, paramsParsed.data.id))
      .returning();
  } else {
    const merged = withGraph({ ...bodyParsed.data, dsl: null, featureGraph: null });
    updates.svgPreview = generateSvgPreview(merged);
    if (merged.dsl) updates.dslJson = JSON.stringify(merged.dsl);
    if (merged.featureGraph) updates.featureGraphJson = JSON.stringify(merged.featureGraph);
    [spec] = await db
      .insert(partSpecsTable)
      .values({ projectId: paramsParsed.data.id, partType: bodyParsed.data.partType ?? "bracket", ...updates })
      .returning();
  }
  res.json(spec);
});

router.post("/projects/:id/export-dxf", async (req, res): Promise<void> => {
  const parsed = ExportDxfParams.safeParse({ id: req.params.id });
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

  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, parsed.data.id));
  if (!spec) {
    res.status(400).json({ error: "No part spec to export" });
    return;
  }

  const enriched = withGraph(spec);
  const dxfContent = generateDxf(enriched, {
    projectName: project.name,
    revisionNumber: spec.totalRevisions ?? undefined,
  });
  const filename = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${spec.partType}.dxf`;

  await db
    .update(partSpecsTable)
    .set({ sendCutSendUrl: "https://sendcutsend.com/upload", updatedAt: new Date() })
    .where(eq(partSpecsTable.projectId, parsed.data.id));

  await db
    .update(projectsTable)
    .set({ status: "ready_to_order", updatedAt: new Date() })
    .where(eq(projectsTable.id, parsed.data.id));

  const instructions = [
    `Download your DXF file: ${filename}`,
    "Go to https://sendcutsend.com/upload to start your order",
    "Click 'Upload File' and select your DXF",
    `Select material: ${spec.material ?? "Mild Steel"} — ${spec.thickness ? `${spec.thickness}" thick` : "verify thickness"}`,
    spec.powderCoat
      ? `Add Powder Coat finishing: ${spec.powderCoatColor ?? "Black"}`
      : "Add any finishing options (optional)",
    "Review the part preview in the Send Cut Send editor",
    "Set quantity and place order — typical lead time is 3-5 business days",
  ];

  res.json({
    projectId: parsed.data.id,
    filename,
    dxfContent,
    sendCutSendUploadUrl: "https://sendcutsend.com/upload",
    instructions,
    estimatedParts: 1,
  });
});

router.get("/projects/:id/validation", async (req, res): Promise<void> => {
  const parsed = GetValidationParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, parsed.data.id));
  if (!spec) {
    res.json({ rules: [], hasFailures: false, snappedSpec: {} });
    return;
  }
  // The legacy DB columns don't carry assemblyRefs — those live in the DSL
  // JSON. Parse them out so the fastener-clearance rule runs on page load.
  let assemblyRefs: PartDsl["assemblyRefs"] = [];
  if (spec.dslJson) {
    const parsed = PartDslSchema.safeParse(JSON.parse(spec.dslJson));
    if (parsed.success) assemblyRefs = parsed.data.assemblyRefs ?? [];
  }
  const result = validateSpec({ ...spec, assemblyRefs: assemblyRefs ?? [] });
  res.json(result);
});

router.post("/projects/:id/apply-suggestion", async (req, res): Promise<void> => {
  const parsed = ApplySuggestionParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [spec] = await db
    .select()
    .from(partSpecsTable)
    .where(eq(partSpecsTable.projectId, parsed.data.id));
  if (!spec) {
    res.status(404).json({ error: "No part spec to fix" });
    return;
  }
  const validation = validateSpec(spec);
  const snapped = applySnap(spec, validation.snappedSpec);
  const enriched = withGraph({ ...spec, ...snapped, dsl: null, featureGraph: null });
  const svgPreview = generateSvgPreview(enriched);
  const setPayload: Record<string, unknown> = {
    ...validation.snappedSpec,
    svgPreview,
    dslJson: enriched.dsl ? JSON.stringify(enriched.dsl) : null,
    featureGraphJson: enriched.featureGraph ? JSON.stringify(enriched.featureGraph) : null,
    updatedAt: new Date(),
  };
  const [updated] = await db
    .update(partSpecsTable)
    .set(setPayload)
    .where(eq(partSpecsTable.projectId, parsed.data.id))
    .returning();
  const newValidation = validateSpec(updated);
  res.json({ partSpec: updated, validation: newValidation });
});

export default router;
