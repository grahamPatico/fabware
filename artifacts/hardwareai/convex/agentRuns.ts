import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { isEffort, isSupportedModel } from "./lib/models";

// A Convex action is killed at 10 minutes. A run still marked "running" after
// this long has no live action behind it, so a new turn may take over.
const STALE_RUN_MS = 11 * 60 * 1000;

// Reference images are stored inline on the message document (1 MiB cap). The
// client downsizes before upload; this is the backstop.
const MAX_IMAGE_BASE64_CHARS = 900_000;

function newRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start one agent turn: record the user's message, mark the project as
 * running, and hand the work to a background action. Returns immediately —
 * the client follows progress through `projects.get` (agentRun) and the
 * message list, both reactive.
 */
export const start = mutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    focusedRole: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    // ConvexError, not Error: production deployments redact plain Error
    // messages to "Server Error", and these are written for the user.
    if (!isSupportedModel(a.model)) throw new ConvexError(`Unsupported model: ${a.model}`);
    if (!isEffort(a.effort)) throw new ConvexError(`Unsupported effort: ${a.effort}`);
    const content = a.content.trim();
    if (!content && !a.imageData) throw new ConvexError("Message is empty.");
    if (a.imageData && a.imageData.length > MAX_IMAGE_BASE64_CHARS) {
      throw new ConvexError("That image is too large. Try a smaller or more compressed one.");
    }

    const project = await ctx.db.get(a.projectId);
    if (!project) throw new ConvexError("Project not found");
    const now = Date.now();
    const current = project.agentRun;
    if (current?.status === "running" && now - current.startedAt < STALE_RUN_MS) {
      throw new ConvexError("The agent is still working on the last message. Wait for it to finish or stop it first.");
    }

    await ctx.db.insert("messages", {
      projectId: a.projectId,
      role: "user",
      content,
      imageData: a.imageData,
      imageMediaType: a.imageMediaType,
      model: a.model,
      effort: a.effort,
      createdAt: now,
    });

    const runId = newRunId();
    await ctx.db.patch(a.projectId, {
      agentRun: { runId, status: "running", startedAt: now, step: "Reading your request", iteration: 0, toolCalls: 0 },
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.projectChat.runTurn, {
      projectId: a.projectId,
      runId,
      content,
      imageData: a.imageData,
      imageMediaType: a.imageMediaType,
      model: a.model,
      effort: a.effort,
      focusedRole: a.focusedRole,
    });
    return { runId };
  },
});

/** Ask the running turn to stop. It halts before its next model call. */
export const cancel = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    const run = project?.agentRun;
    if (!run || run.status !== "running") return { cancelled: false };
    const now = Date.now();
    if (now - run.startedAt >= STALE_RUN_MS) {
      // Nothing is listening any more — close it out directly.
      await ctx.db.patch(projectId, {
        agentRun: { ...run, status: "cancelled", finishedAt: now, step: undefined },
      });
    } else {
      await ctx.db.patch(projectId, {
        agentRun: { ...run, cancelRequested: true, step: "Stopping" },
      });
    }
    return { cancelled: true };
  },
});

/** The action's view of its own run: is it still the live one, and wanted? */
export const getRun = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    return project?.agentRun ?? null;
  },
});

export const setProgress = internalMutation({
  args: {
    projectId: v.id("projects"),
    runId: v.string(),
    step: v.string(),
    iteration: v.optional(v.number()),
    toolCalls: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, runId, step, iteration, toolCalls }) => {
    const project = await ctx.db.get(projectId);
    const run = project?.agentRun;
    // A newer run owns the project now — never clobber its state.
    if (!run || run.runId !== runId || run.status !== "running") return;
    await ctx.db.patch(projectId, {
      agentRun: {
        ...run,
        // Keep "Stopping" visible once the user has asked to stop.
        step: run.cancelRequested ? run.step : step,
        iteration: iteration ?? run.iteration,
        toolCalls: toolCalls ?? run.toolCalls,
      },
    });
  },
});

export const finish = internalMutation({
  args: {
    projectId: v.id("projects"),
    runId: v.string(),
    status: v.union(v.literal("done"), v.literal("error"), v.literal("cancelled")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, runId, status, error }) => {
    const project = await ctx.db.get(projectId);
    const run = project?.agentRun;
    if (!run || run.runId !== runId) return;
    const now = Date.now();
    await ctx.db.patch(projectId, {
      agentRun: { ...run, status, error, finishedAt: now, step: undefined, cancelRequested: undefined },
      updatedAt: now,
    });
  },
});
