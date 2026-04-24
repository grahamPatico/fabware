"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getArchetype } from "./archetypes";

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
    focusedRole: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!SUPPORTED_MODELS.includes(a.model)) throw new Error(`Unsupported model: ${a.model}`);
    if (!EFFORT_LEVELS.includes(a.effort)) throw new Error(`Unsupported effort: ${a.effort}`);

    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId: a.projectId, role: "user", content: a.content,
      imageData: a.imageData, imageMediaType: a.imageMediaType,
      model: a.model, effort: a.effort,
    });

    const project = await ctx.runQuery(api.projects.get, { projectId: a.projectId });
    if (!project) throw new Error("Project not found");
    const parts = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
    const interfaces = await ctx.runQuery(api.interfaces.listForProject, { projectId: a.projectId });
    const history = await ctx.runQuery(internal.messages.listForProjectInternal, { projectId: a.projectId });

    const last = history[history.length - 1];
    const priorHistory = history
      .filter(m => !(m._id === last?._id && m.role === "user"))
      .map(m => ({ role: m.role, content: m.content }));

    const projectState = {
      scope: project.scope ?? null,
      archetypeId: project.archetypeId ?? null,
      archetypeParams: project.archetypeParams ?? null,
      parts: parts.map(p => ({ role: p.role, label: p.label, dslJson: p.dslJson ?? undefined })),
      interfaces: interfaces.map(i => ({
        kind: i.kind, partA: i.partA, partB: i.partB,
        featureRefs: i.featureRefs, hardwareRefs: i.hardwareRefs,
      })),
    };

    const agentResult = await ctx.runAction(internal.assemblyDesigner.runAgent, {
      projectId: a.projectId,
      userMessage: a.content,
      focusedRole: a.focusedRole,
      model: a.model,
      effort: a.effort,
      history: priorHistory,
      projectState,
    });

    const summaryLines: string[] = [];
    for (const call of agentResult.toolCalls) {
      summaryLines.push(await applyToolCall(ctx, a.projectId, parts, interfaces, call));
    }

    const assistantText = agentResult.responseText.trim() ||
      summaryLines.filter(Boolean).join("\n") ||
      "Updated.";
    await ctx.runMutation(internal.messages.insertProjectMessage, {
      projectId: a.projectId, role: "assistant", content: assistantText,
      model: a.model, effort: a.effort,
    });

    const validation = await ctx.runQuery(api.validation.getAssemblyValidation, { projectId: a.projectId });
    return { validation };
  },
});

async function applyToolCall(
  ctx: any,
  projectId: any,
  partsSnapshot: any[],
  _interfacesSnapshot: any[],
  call: { name: string; input: any },
): Promise<string> {
  switch (call.name) {
    case "capture_scope":
      await ctx.runMutation(api.projects.updateScope, { projectId, scope: call.input.scope });
      return "Scope updated.";

    case "select_archetype": {
      const arch = getArchetype(call.input.archetypeId);
      if (!arch) return `Unknown archetype: ${call.input.archetypeId}`;
      const project = await ctx.runQuery(api.projects.get, { projectId });
      const scope = project?.scope;
      if (!scope) return "Cannot generate archetype without scope. Ask for use case/tier/environment first.";
      const params = arch.paramSchema.parse(call.input.params);
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, scope);

      await ctx.runMutation(internal.parts.replaceAll, {
        projectId,
        parts: genParts.map((gp: any) => ({ role: gp.role, label: gp.label, position: gp.position, dslJson: JSON.stringify(gp.dsl) })),
      });
      await ctx.runMutation(internal.interfaces.replaceAll, {
        projectId,
        interfaces: genInterfaces,
      });
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId,
        archetypeId: call.input.archetypeId,
        archetypeParams: params,
      });
      return `Generated ${genParts.length} parts and ${genInterfaces.length} interfaces from ${arch.label}.`;
    }

    case "refine_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      await ctx.runMutation(internal.parts.updatePartDslInternal, {
        partId: target._id, dslJson: JSON.stringify(call.input.dsl),
      });
      return `Refined ${target.role}.`;
    }

    case "add_feature_to_part": {
      const target = partsSnapshot.find(p => p.role === call.input.role);
      if (!target || !target.dslJson) return `No part with role ${call.input.role}.`;
      const dsl = JSON.parse(target.dslJson);
      dsl.features = [...(dsl.features ?? []), call.input.feature];
      await ctx.runMutation(internal.parts.updatePartDslInternal, {
        partId: target._id, dslJson: JSON.stringify(dsl),
      });
      return `Added feature to ${target.role}.`;
    }

    case "update_archetype_params": {
      const project = await ctx.runQuery(api.projects.get, { projectId });
      if (!project?.archetypeId) return "Project has no archetype — can't update params.";
      const arch = getArchetype(project.archetypeId);
      if (!arch) return `Unknown archetype: ${project.archetypeId}`;
      const merged = { ...(project.archetypeParams ?? {}), ...call.input.paramPatch };
      const params = arch.paramSchema.parse(merged);
      const { parts: genParts, interfaces: genInterfaces } = arch.generate(params, project.scope);

      await ctx.runMutation(internal.parts.replaceAll, {
        projectId,
        parts: genParts.map((gp: any) => ({ role: gp.role, label: gp.label, position: gp.position, dslJson: JSON.stringify(gp.dsl) })),
      });
      await ctx.runMutation(internal.interfaces.replaceAll, {
        projectId,
        interfaces: genInterfaces,
      });
      await ctx.runMutation(internal.projects.setArchetypeInternal, {
        projectId, archetypeId: project.archetypeId, archetypeParams: params,
      });
      return "Archetype params updated.";
    }

    case "break_out":
      await ctx.runMutation(api.projects.breakOut, { projectId });
      return "Broke out of archetype — project is now fully custom.";

    case "decompose_freeform":
      return "Free-form design isn't supported yet in v1. Pick the closest archetype instead (hinged_enclosure, box_with_lid, bracket_plus_panel, divided_tray, shelf_with_brackets, sliding_enclosure).";

    default:
      return `Unknown tool: ${call.name}`;
  }
}
