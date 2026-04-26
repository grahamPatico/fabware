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
    let livePartsSnapshot = parts;
    for (const call of agentResult.toolCalls) {
      summaryLines.push(await applyToolCall(ctx, a.projectId, livePartsSnapshot, interfaces, call));
      if (
        call.name === "select_archetype" ||
        call.name === "update_archetype_params" ||
        call.name === "add_printed_part" ||
        call.name === "add_purchased_part"
      ) {
        livePartsSnapshot = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
      }
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
      // Merge agent-supplied params over the archetype's defaults so the
      // agent can omit fields it doesn't care about. paramSchema.parse
      // validates the merged shape — fails informatively if invalid.
      const merged = { ...arch.paramDefaults(scope), ...(call.input.params ?? {}) };
      let params;
      try {
        params = arch.paramSchema.parse(merged);
      } catch (err: any) {
        return `Couldn't generate ${arch.label}: ${err.message?.slice(0, 200) ?? "param validation failed"}`;
      }
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
      // Validate the patched DSL matches the part's kind
      const kind = target.kind ?? "sheet_metal";
      const dslJson = JSON.stringify(call.input.dsl);
      try {
        if (kind === "printed") {
          const { PrintedDslSchema } = await import("./lib/printedDsl");
          PrintedDslSchema.parse(JSON.parse(dslJson));
        } else if (kind === "purchased") {
          const { PurchasedDslSchema } = await import("./lib/purchasedDsl");
          PurchasedDslSchema.parse(JSON.parse(dslJson));
        }
        // sheet_metal: existing validator runs inside updatePartDslByKindInternal
        await ctx.runMutation(internal.parts.updatePartDslByKindInternal, {
          partId: target._id, dslJson,
        });
      } catch (err: any) {
        return `Couldn't refine ${target.role}: ${err?.message?.slice(0, 200) ?? "validation error"}`;
      }
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
      const baseDefaults = project.scope ? arch.paramDefaults(project.scope) : {};
      const merged = { ...baseDefaults, ...(project.archetypeParams ?? {}), ...(call.input.paramPatch ?? {}) };
      let params;
      try {
        params = arch.paramSchema.parse(merged);
      } catch (err: any) {
        return `Couldn't update ${arch.label} params: ${err.message?.slice(0, 200) ?? "validation failed"}`;
      }
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

    case "add_printed_part": {
      // Tolerant defaults: agent often omits version/kind/layerHeight/infill,
      // and sometimes feature.name. Fill them in before validation.
      // Also coerce rotations: if any |rot| > 2π, assume agent gave degrees.
      const TWO_PI = 2 * Math.PI;
      const pos = call.input.position;
      const looksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(pos?.[k] ?? 0) > TWO_PI);
      if (looksDegrees) {
        pos.rotX = (pos.rotX ?? 0) * (Math.PI / 180);
        pos.rotY = (pos.rotY ?? 0) * (Math.PI / 180);
        pos.rotZ = (pos.rotZ ?? 0) * (Math.PI / 180);
      }
      const rawDsl = (call.input.dsl ?? {}) as Record<string, unknown>;
      const rawFeatures = Array.isArray(rawDsl.features) ? rawDsl.features : [];
      const features = rawFeatures.map((f: any, i: number) => {
        const filled: any = {
          name: typeof f?.name === "string" && f.name.length > 0 ? f.name : `${f?.kind ?? "feature"}_${i}`,
          ...f,
        };
        // Pocket: agent often gives `depth` (Y dim) but forgets `depthZ` (cut depth).
        if (filled.kind === "pocket" && typeof filled.depthZ !== "number") {
          filled.depthZ = 3;
        }
        return filled;
      });
      const filledDsl = {
        version: 1,
        kind: "printed",
        material: rawDsl.material ?? "PLA",
        layerHeight: typeof rawDsl.layerHeight === "number" ? rawDsl.layerHeight : 0.2,
        infill: typeof rawDsl.infill === "number" ? rawDsl.infill : 0.2,
        primitive: rawDsl.primitive,
        features,
      };
      const dsl = JSON.stringify(filledDsl);
      try {
        await ctx.runMutation(internal.parts.addPrintedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: call.input.position,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add printed part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      return `Added 3D-printed part: ${call.input.label}.`;
    }

    case "add_purchased_part": {
      // Coerce degree-rotations same as add_printed_part.
      const TWO_PI2 = 2 * Math.PI;
      const ppos = call.input.position;
      const ppLooksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(ppos?.[k] ?? 0) > TWO_PI2);
      if (ppLooksDegrees) {
        ppos.rotX = (ppos.rotX ?? 0) * (Math.PI / 180);
        ppos.rotY = (ppos.rotY ?? 0) * (Math.PI / 180);
        ppos.rotZ = (ppos.rotZ ?? 0) * (Math.PI / 180);
      }
      const dsl = JSON.stringify({
        version: 1,
        kind: "purchased",
        mcmasterPartNumber: call.input.mcmasterPartNumber,
        quantity: call.input.quantity,
        label: call.input.label,
      });
      try {
        await ctx.runMutation(internal.parts.addPurchasedPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: ppos,
          dslJson: dsl,
        });
      } catch (err: any) {
        return `Couldn't add purchased part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "error"}`;
      }
      return `Added purchased: ${call.input.quantity} × ${call.input.label} (${call.input.mcmasterPartNumber}).`;
    }

    case "decide_make_or_buy": {
      const decisionLabel: Record<string, string> = {
        make_sheet_metal: "🔧 Make it (sheet metal)",
        make_printed: "🟪 Make it (3D print)",
        buy: "🛒 Buy it",
      };
      const label = decisionLabel[call.input.decision] ?? call.input.decision;
      return `${label} — ${call.input.item}\n${call.input.reasoning}`;
    }

    default:
      return `Unknown tool: ${call.name}`;
  }
}
