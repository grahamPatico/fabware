import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { sheetMetalPlugin } from "../plugins/sheet_metal";
import { runSpecialistOnce, type SpecialistResult } from "./_helpers";
import type { PartKind } from "../plugins/types";
import type { Doc } from "../_generated/dataModel";

/**
 * Sheet-metal specialist. Validates a part's stored DSL, attempts auto-repair,
 * writes any remaining violations + escalations, sets the part's status, logs
 * a specialist-completed plan event, and re-ticks the orchestrator.
 *
 * Plan 3 will add an Anthropic agent loop on top of this so the specialist can
 * also DESIGN parts from intent (not just validate existing ones).
 */
export const run = internalAction({
  args: { projectId: v.id("projects"), partId: v.id("parts") },
  handler: async (ctx, args) => {
    // 1. Load the part + project.
    // Type annotation required to break TypeScript circularity (same-file ctx.runQuery call).
    type LoadedPart = (Doc<"parts"> & { scope: unknown; peerParts: Array<{ partId: string; label: string; kind: PartKind }> }) | null;
    const part = await ctx.runQuery(internal.specialists.sheetMetal._loadPartAndProject, {
      partId: args.partId,
    }) as LoadedPart;
    if (!part) {
      // Part deleted between scheduling and dispatch. Re-tick so the phase machine
      // re-evaluates without it.
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "skipped", reason: "part not found" } as const;
    }

    // 2. Parse DSL. Bail to 'failed' if the part has no DSL (Plan 3 will design from scratch).
    if (!part.dslJson) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: "no DSL — Plan 3 will design from intent" },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "no DSL" } as const;
    }
    const parsed = sheetMetalPlugin.dslSchema.safeParse(JSON.parse(part.dslJson));
    if (!parsed.success) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
        partId: args.partId, status: "failed",
      });
      await ctx.runMutation(internal.orchestrator.planEvents.append, {
        projectId: args.projectId, kind: "specialist-completed",
        payload: { partId: String(args.partId), message: `DSL parse failed: ${parsed.error.message}` },
      });
      await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
      return { status: "failed", reason: "DSL parse error" } as const;
    }

    // 3. Run the pure specialist loop.
    const result: SpecialistResult<typeof parsed.data> = runSpecialistOnce(sheetMetalPlugin, parsed.data, {
      scope: part.scope ?? null,
      peerParts: part.peerParts,
    });

    // 4. If the auto-repair loop changed the DSL, persist the new dslJson.
    if (result.autoRepairedCount > 0) {
      await ctx.runMutation(internal.specialists.sheetMetal._setPartDsl, {
        partId: args.partId, dslJson: JSON.stringify(result.repairedDsl),
      });
    }

    // 5. Write all violations + escalations in one atomic batch.
    if (result.violations.length > 0) {
      await ctx.runMutation(internal.orchestrator.violations.processViolations, {
        projectId: args.projectId,
        partId: args.partId,
        entries: result.violations.map((v) => ({
          violation: v,
          tier: "requires-judgment" as const,
          escalate: true,
        })),
      });
    }

    // 6. Set part status + log completion.
    await ctx.runMutation(internal.specialists.sheetMetal._setPartStatus, {
      partId: args.partId, status: result.status,
    });
    await ctx.runMutation(internal.orchestrator.planEvents.append, {
      projectId: args.projectId, kind: "specialist-completed",
      payload: {
        partId: String(args.partId),
        details: { status: result.status, violations: result.violations.length, autoRepaired: result.autoRepairedCount },
      },
    });

    // 7. Re-tick so the phase machine re-evaluates with the part's new status.
    await ctx.scheduler.runAfter(0, internal.orchestrator.tick.tick, { projectId: args.projectId });
    return { status: result.status, violations: result.violations.length } as const;
  },
});

// ─── Internal helpers (separate functions because actions can't touch ctx.db) ──

import { internalQuery, internalMutation } from "../_generated/server";

export const _loadPartAndProject = internalQuery({
  args: { partId: v.id("parts") },
  handler: async (ctx, { partId }) => {
    const part = await ctx.db.get(partId);
    if (!part) return null;
    const project = await ctx.db.get(part.projectId);
    const peerRows = await ctx.db
      .query("parts")
      .withIndex("by_project", (q) => q.eq("projectId", part.projectId))
      .collect();
    const peerParts = peerRows
      .filter((p) => p._id !== partId)
      .map((p) => ({
        partId: String(p._id),
        label: p.label,
        kind: (p.kind ?? "sheet_metal") as "sheet_metal" | "printed" | "purchased",
      }));
    return {
      ...part,
      scope: project?.scope ?? null,
      peerParts,
    };
  },
});

export const _setPartStatus = internalMutation({
  args: {
    partId: v.id("parts"),
    status: v.union(
      v.literal("pending"), v.literal("designing"),
      v.literal("ok"), v.literal("escalated"), v.literal("failed"),
    ),
  },
  handler: async (ctx, { partId, status }) => {
    await ctx.db.patch(partId, { status, lastValidationAt: Date.now(), updatedAt: Date.now() });
  },
});

export const _setPartDsl = internalMutation({
  args: { partId: v.id("parts"), dslJson: v.string() },
  handler: async (ctx, { partId, dslJson }) => {
    await ctx.db.patch(partId, { dslJson, updatedAt: Date.now() });
  },
});
