import {
  internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { DEFAULT_EFFORT, DEFAULT_MODEL, isEffort, isSupportedModel } from "./lib/models";
import {
  isGeneratedStage, isStageId,
  type GeneratedStageId, type IdeaContent, type JourneyView, type PcbContent,
  type RequirementsContent, type StageContentMap, type Track,
} from "./lib/journey";
import {
  EMPTY_JOURNEY_VIEW, buildJourneyView, conceptBlocker, conceptView, doneTransition, generateBlocker,
} from "./lib/journeyGuards";
import { mechanicalBrief as buildMechanicalBrief, scopeFromRequirements } from "./lib/journeyEnrich";
import { boardOutlineKicadPcb, kicadFilename } from "./lib/kicadPcb";

// The production journey: the guided path from an idea to parts in hand.
// This file is the reactive surface (what the plan page reads and the buttons
// it presses). The model calls live in journeyAgent.ts; the rules these
// functions apply live in lib/journeyGuards.ts, where they are unit-tested.

const trackValidator = v.union(v.literal("hobby"), v.literal("product"));

function newRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function stageRows(ctx: QueryCtx, projectId: Id<"projects">): Promise<Doc<"journeyStages">[]> {
  return await ctx.db
    .query("journeyStages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
}

async function stageRow(ctx: QueryCtx, projectId: Id<"projects">, stage: string): Promise<Doc<"journeyStages"> | null> {
  return await ctx.db
    .query("journeyStages")
    .withIndex("by_project_stage", (q) => q.eq("projectId", projectId).eq("stage", stage))
    .first();
}

/** Stage content by id, for the stages that have been written. */
function contentByStage(rows: Doc<"journeyStages">[]): Partial<StageContentMap> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    if (isStageId(row.stage) && isGeneratedStage(row.stage) && row.content) out[row.stage] = row.content;
  }
  return out as Partial<StageContentMap>;
}

/**
 * Part count and current validator findings for the mechanical stage. The
 * findings come from `validation.getAssemblyValidation`, the same query the
 * workspace's rules strip reads, so the two always agree.
 */
async function mechanicalCounts(ctx: QueryCtx, projectId: Id<"projects">): Promise<JourneyView["mechanical"]> {
  const parts = await ctx.db
    .query("parts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  if (parts.length === 0) return { partCount: 0, fails: 0, warns: 0 };
  try {
    const validation: { rules: Array<{ status: string }> } = await ctx.runQuery(
      api.validation.getAssemblyValidation, { projectId },
    );
    return {
      partCount: parts.length,
      fails: validation.rules.filter((r) => r.status === "fail").length,
      warns: validation.rules.filter((r) => r.status === "warn").length,
    };
  } catch (err) {
    // A part the validator can't read must not take the whole plan page down.
    console.error(`[journey.get ${projectId}] validation failed`, err);
    return { partCount: parts.length, fails: 0, warns: 0 };
  }
}

/** The whole plan for a project, as the plan page renders it. */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<JourneyView> => {
    const project = await ctx.db.get(projectId);
    if (!project) return EMPTY_JOURNEY_VIEW;
    // Date.now() in a query is not reactive: a stuck stage flips to "error"
    // the next time anything this query reads changes, or on reload.
    const now = Date.now();
    const concept = project.concept;
    const imageUrl = concept?.kind === "image" && concept.storageId
      ? await ctx.storage.getUrl(concept.storageId)
      : null;
    if (!project.journey) {
      return { ...EMPTY_JOURNEY_VIEW, concept: conceptView(concept, imageUrl, now) };
    }
    return buildJourneyView({
      journey: project.journey,
      rows: await stageRows(ctx, projectId),
      mechanical: await mechanicalCounts(ctx, projectId),
      concept: conceptView(concept, imageUrl, now),
      now,
    });
  },
});

/** Mark a stage as being written and hand the work to the background action. */
async function startGeneration(
  ctx: MutationCtx,
  a: { projectId: Id<"projects">; stage: GeneratedStageId; notes?: string; model?: string; effort?: string },
): Promise<{ runId: string }> {
  const model = a.model ?? DEFAULT_MODEL;
  const effort = a.effort ?? DEFAULT_EFFORT;
  // ConvexError, not Error: production redacts plain Error messages, and
  // these are written for the user.
  if (!isSupportedModel(model)) throw new ConvexError(`Unsupported model: ${model}`);
  if (!isEffort(effort)) throw new ConvexError(`Unsupported effort: ${effort}`);

  const now = Date.now();
  const runId = newRunId();
  const notes = a.notes?.trim() || undefined;
  const row = await stageRow(ctx, a.projectId, a.stage);
  if (row) {
    // The last good content stays in place until the new answer is saved.
    await ctx.db.patch(row._id, { status: "generating", notes, error: undefined, startedAt: now, runId, model });
  } else {
    await ctx.db.insert("journeyStages", {
      projectId: a.projectId, stage: a.stage, status: "generating", notes, startedAt: now, runId, model,
    });
  }
  await ctx.scheduler.runAfter(0, internal.journeyAgent.runStage, {
    projectId: a.projectId, stage: a.stage, runId, notes, model, effort,
  });
  return { runId };
}

/**
 * Start a plan for a project. Safe to call twice: a project that already has
 * a plan is left as it is.
 */
export const begin = mutation({
  args: {
    projectId: v.id("projects"),
    track: trackValidator,
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ started: boolean }> => {
    const project = await ctx.db.get(a.projectId);
    if (!project) throw new ConvexError("Project not found");
    if (project.journey) return { started: false };
    const now = Date.now();
    await ctx.db.patch(a.projectId, {
      // The idea stage decides whether electronics are needed.
      journey: { track: a.track, needsElectronics: false, startedAt: now },
      updatedAt: now,
    });
    await startGeneration(ctx, { projectId: a.projectId, stage: "idea", model: a.model, effort: a.effort });
    return { started: true };
  },
});

/** Write, or rewrite, one stage of the plan. Returns at once; `get` follows the progress. */
export const generate = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.string(),
    notes: v.optional(v.string()),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ runId: string }> => {
    const project = await ctx.db.get(a.projectId);
    if (!project) throw new ConvexError("Project not found");
    const blocker = generateBlocker({
      journey: project.journey,
      stage: a.stage,
      notes: a.notes,
      row: await stageRow(ctx, a.projectId, a.stage),
      now: Date.now(),
    });
    if (blocker) throw new ConvexError(blocker);
    return await startGeneration(ctx, { ...a, stage: a.stage as GeneratedStageId });
  },
});

/** Change the track or whether the project needs electronics. */
export const setSettings = mutation({
  args: {
    projectId: v.id("projects"),
    track: v.optional(trackValidator),
    needsElectronics: v.optional(v.boolean()),
  },
  handler: async (ctx, { projectId, track, needsElectronics }): Promise<null> => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new ConvexError("Project not found");
    if (!project.journey) throw new ConvexError("Start a plan for this project first.");
    await ctx.db.patch(projectId, {
      journey: {
        ...project.journey,
        ...(track !== undefined ? { track } : {}),
        // Set by hand: from now on the idea stage leaves it alone.
        ...(needsElectronics !== undefined ? { needsElectronics, electronicsLocked: true } : {}),
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Tick a stage off, or untick it. */
export const setDone = mutation({
  args: { projectId: v.id("projects"), stage: v.string(), done: v.boolean() },
  handler: async (ctx, { projectId, stage, done }): Promise<null> => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new ConvexError("Project not found");
    const row = await stageRow(ctx, projectId, stage);
    const next = doneTransition({ journey: project.journey, stage, done, row, now: Date.now() });
    if ("error" in next) throw new ConvexError(next.error);
    if (row) {
      await ctx.db.patch(row._id, { status: next.status, error: undefined });
    } else {
      // Only the studio stage gets here without a row.
      await ctx.db.insert("journeyStages", { projectId, stage, status: next.status });
    }
    return null;
  },
});

/** Draw a new concept picture from the idea. */
export const generateConcept = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<null> => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new ConvexError("Project not found");
    const idea = await stageRow(ctx, projectId, "idea");
    const now = Date.now();
    const blocker = conceptBlocker({ ideaHasContent: Boolean(idea?.content), concept: project.concept, now });
    if (blocker) throw new ConvexError(blocker);
    await startConcept(ctx, project, now);
    return null;
  },
});

async function startConcept(ctx: MutationCtx, project: Doc<"projects">, now: number): Promise<void> {
  await ctx.db.patch(project._id, {
    // The last picture stays on the document so it keeps showing meanwhile.
    concept: {
      ...project.concept,
      status: "generating",
      generations: project.concept?.generations ?? 0,
      error: undefined,
      startedAt: now,
    },
  });
  await ctx.scheduler.runAfter(0, internal.journeyAgent.runConcept, { projectId: project._id, startedAt: now });
}

/** The first message for the design-studio agent, built from the plan so far. */
export const mechanicalBrief = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<string> => {
    const project = await ctx.db.get(projectId);
    if (!project) return "";
    const content = contentByStage(await stageRows(ctx, projectId));
    return buildMechanicalBrief({
      projectName: project.name,
      idea: content.idea ?? null,
      requirements: content.requirements ?? null,
      sourcing: content.sourcing ?? null,
    });
  },
});

/** A starter KiCad board with the outline and mounting holes. Null until the PCB stage is written. */
export const pcbStarter = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{ filename: string; content: string } | null> => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const row = await stageRow(ctx, projectId, "pcb");
    const pcb = row?.content as PcbContent | undefined;
    if (!pcb?.board) return null;
    return {
      filename: kicadFilename(project.name),
      content: boardOutlineKicadPcb(pcb.board, project.name),
    };
  },
});

// ---------------------------------------------------------------------------
// Internal: what the actions in journeyAgent.ts read and write.
// ---------------------------------------------------------------------------

export interface StageRunContext {
  project: { name: string; description: string | null };
  track: Track;
  needsElectronics: boolean;
  /** Content of every stage written so far, this one included. */
  content: Partial<StageContentMap>;
  /** False when a newer generation has taken this stage over. */
  isCurrent: boolean;
}

export const loadContext = internalQuery({
  args: { projectId: v.id("projects"), stage: v.string(), runId: v.string() },
  handler: async (ctx, { projectId, stage, runId }): Promise<StageRunContext | null> => {
    const project = await ctx.db.get(projectId);
    if (!project?.journey) return null;
    const rows = await stageRows(ctx, projectId);
    const row = rows.find((r) => r.stage === stage);
    return {
      project: { name: project.name, description: project.description ?? null },
      track: project.journey.track,
      needsElectronics: project.journey.needsElectronics,
      content: contentByStage(rows),
      isCurrent: row?.status === "generating" && row.runId === runId,
    };
  },
});

/**
 * Save a finished stage. A run that is no longer the stage's current one
 * (the user asked again, or the project is gone) saves nothing.
 */
export const saveResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    stage: v.string(),
    runId: v.string(),
    content: v.any(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, stage, runId, content, model }): Promise<boolean> => {
    const row = await stageRow(ctx, projectId, stage);
    if (!row || row.runId !== runId || row.status !== "generating") return false;
    const project = await ctx.db.get(projectId);
    if (!project?.journey) return false;
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "ready", content, error: undefined, generatedAt: now, model });

    if (stage === "idea") {
      const idea = content as IdeaContent;
      if (!project.journey.electronicsLocked && project.journey.needsElectronics !== idea.needsElectronics) {
        await ctx.db.patch(projectId, { journey: { ...project.journey, needsElectronics: idea.needsElectronics } });
      }
      // The first idea gets a picture without being asked. Later ones are the
      // user's call, and count against the project's limit.
      if (!project.concept) await startConcept(ctx, project, now);
    }
    if (stage === "requirements") {
      // The studio designs against the scope; keep the fields only it sets.
      const derived = scopeFromRequirements(content as RequirementsContent);
      await ctx.db.patch(projectId, {
        scope: {
          ...project.scope,
          ...derived,
          environment: { ...project.scope?.environment, ...derived.environment },
        },
      });
      // Same nudge `projects.updateScope` gives the new harness.
      if (project.useNewHarness === true) {
        await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId });
      }
    }
    await ctx.db.patch(projectId, { updatedAt: now });
    return true;
  },
});

export const saveError = internalMutation({
  args: { projectId: v.id("projects"), stage: v.string(), runId: v.string(), error: v.string() },
  handler: async (ctx, { projectId, stage, runId, error }): Promise<boolean> => {
    const row = await stageRow(ctx, projectId, stage);
    if (!row || row.runId !== runId || row.status !== "generating") return false;
    await ctx.db.patch(row._id, { status: "error", error });
    return true;
  },
});

export const loadConceptContext = internalQuery({
  args: { projectId: v.id("projects"), startedAt: v.number() },
  handler: async (ctx, { projectId, startedAt }): Promise<{ prompt: string; isCurrent: boolean } | null> => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const idea = (await stageRow(ctx, projectId, "idea"))?.content as IdeaContent | undefined;
    if (!idea) return null;
    return {
      prompt: idea.conceptImagePrompt || idea.oneLiner,
      isCurrent: project.concept?.status === "generating" && project.concept.startedAt === startedAt,
    };
  },
});

/**
 * Save the concept picture, or the reason there isn't one. Every attempt
 * counts against the project's limit, failed ones included: each one cost a
 * model call.
 */
export const saveConcept = internalMutation({
  args: {
    projectId: v.id("projects"),
    startedAt: v.number(),
    prompt: v.optional(v.string()),
    image: v.optional(v.union(
      v.object({ kind: v.literal("image"), storageId: v.id("_storage") }),
      v.object({ kind: v.literal("svg"), svg: v.string() }),
    )),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, startedAt, prompt, image, error }): Promise<boolean> => {
    const project = await ctx.db.get(projectId);
    const concept = project?.concept;
    if (!concept || concept.status !== "generating" || concept.startedAt !== startedAt) {
      // Nobody is waiting for this picture any more; don't leave the blob behind.
      if (image?.kind === "image") await ctx.storage.delete(image.storageId);
      return false;
    }
    const generations = concept.generations + 1;
    if (!image) {
      await ctx.db.patch(projectId, {
        concept: { ...concept, status: "error", error: error ?? "The picture could not be made. Try again.", generations },
      });
      return true;
    }
    if (concept.storageId && (image.kind !== "image" || image.storageId !== concept.storageId)) {
      await ctx.storage.delete(concept.storageId);
    }
    await ctx.db.patch(projectId, {
      concept: {
        status: "ready",
        kind: image.kind,
        storageId: image.kind === "image" ? image.storageId : undefined,
        svg: image.kind === "svg" ? image.svg : undefined,
        prompt,
        generations,
        startedAt,
      },
    });
    return true;
  },
});
