"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { validateSpec } from "./lib/scsRules";

const SUPPORTED_MODELS = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"];
const EFFORT_LEVELS = ["low", "medium", "high", "max", "xhigh"];

export const send = action({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
  },
  handler: async (ctx, args) => {
    const { projectId, content, imageData, imageMediaType, model, effort } = args;

    if (!SUPPORTED_MODELS.includes(model)) throw new Error(`Unsupported model: ${model}`);
    if (!EFFORT_LEVELS.includes(effort)) throw new Error(`Unsupported effort: ${effort}`);

    // Persist user message
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId,
      role: "user",
      content,
      imageData,
      imageMediaType,
      model,
      effort,
    });

    // Load history + existing spec
    const history = await ctx.runQuery(internal.messages.listForProjectInternal, { projectId });
    const existingSpec = await ctx.runQuery(internal.partSpecs.getForProjectInternal, { projectId });
    const isFirst = history.filter((m) => m.role === "assistant").length === 0;

    const image =
      imageData && imageMediaType ? { data: imageData, mediaType: imageMediaType } : null;

    const designerHistory = history
      .filter((m) => m._id !== history[history.length - 1]?._id || m.role !== "user") // drop the just-saved user msg (added by designer via buildHistoryForLlm)
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageData: m.imageData,
        imageMediaType: m.imageMediaType,
      }));

    const existingSpecSlim = existingSpec
      ? {
          partType: existingSpec.partType,
          material: existingSpec.material,
          thickness: existingSpec.thickness,
          width: existingSpec.width,
          height: existingSpec.height,
          depth: existingSpec.depth,
          bendRadius: existingSpec.bendRadius,
          bendAngles: existingSpec.bendAngles,
          holePattern: existingSpec.holePattern,
          powderCoat: existingSpec.powderCoat,
          powderCoatColor: existingSpec.powderCoatColor,
          dslJson: existingSpec.dslJson,
        }
      : null;

    const result = await ctx.runAction(internal.designer.generateDesign, {
      userMessage: content,
      model,
      effort,
      history: designerHistory,
      existingSpec: existingSpecSlim,
      image,
      isFirst,
    });

    // Persist assistant message
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId,
      role: "assistant",
      content: result.responseText,
      model,
      effort,
    });

    // Persist spec + revision
    if (result.partUpdated && result.partUpdate) {
      await ctx.runMutation(internal.partSpecs.applyDesignResult, {
        projectId,
        patch: result.partUpdate,
        rationale: result.rationale,
      });
    }

    // Return validation for the UI to invalidate
    const refreshedSpec = await ctx.runQuery(api.partSpecs.getForProject, { projectId });
    const validation = refreshedSpec ? validateSpec(refreshedSpec) : null;

    return {
      partUpdated: result.partUpdated,
      validation,
    };
  },
});
