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

    // Snapshot the project's pre-turn state so the user can undo back to it
    // even if this is the first turn. Only captures when no snapshot exists yet.
    if (!project.currentSnapshotId) {
      await ctx.runMutation(internal.assemblySnapshots.captureInternal, {
        projectId: a.projectId,
        label: "Initial state",
      });
    }
    const parts = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
    const interfaces = await ctx.runQuery(api.interfaces.listForProject, { projectId: a.projectId });
    const history = await ctx.runQuery(internal.messages.listForProjectInternal, { projectId: a.projectId });

    const last = history[history.length - 1];
    const priorHistory = history
      .filter(m => !(m._id === last?._id && m.role === "user"))
      .map(m => ({ role: m.role, content: m.content }));

    // Run current validation BEFORE the agent so it can see what's broken and
    // proactively repair on this turn instead of needing another round-trip.
    const currentValidation = parts.length > 0
      ? await ctx.runQuery(api.validation.getAssemblyValidation, { projectId: a.projectId })
      : { rules: [], hasFailures: false };
    const violations = currentValidation.rules
      .filter((r: any) => r.status === "fail" || r.status === "warn")
      .map((r: any) => ({
        id: r.id, label: r.label, status: r.status,
        message: r.message, suggestion: r.suggestion,
      }));

    const projectState = {
      scope: project.scope ?? null,
      archetypeId: project.archetypeId ?? null,
      archetypeParams: project.archetypeParams ?? null,
      parts: parts.map(p => ({ role: p.role, label: p.label, dslJson: p.dslJson ?? undefined })),
      interfaces: interfaces.map(i => ({
        kind: i.kind, partA: i.partA, partB: i.partB,
        featureRefs: i.featureRefs, hardwareRefs: i.hardwareRefs ?? [],
      })),
      violations,
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

    let livePartsSnapshot = parts;
    // Stream each tool result as its own assistant message so the user sees
    // progress in real time (Convex queries are reactive — frontend updates
    // the moment each insert lands).
    for (const call of agentResult.toolCalls) {
      const result = await applyToolCall(ctx, a.projectId, livePartsSnapshot, interfaces, call);
      if (result && result.trim().length > 0) {
        await ctx.runMutation(internal.messages.insertProjectMessage, {
          projectId: a.projectId, role: "assistant", content: result,
          model: a.model, effort: a.effort,
        });
      }
      if (
        call.name === "select_archetype" ||
        call.name === "update_archetype_params" ||
        call.name === "add_printed_part" ||
        call.name === "add_purchased_part" ||
        call.name === "add_freeform_2d_part"
      ) {
        livePartsSnapshot = await ctx.runQuery(api.parts.listForProject, { projectId: a.projectId });
      }
    }

    // Capture a post-turn snapshot if any tool call landed state changes —
    // gives the user one undo step per agent turn.
    const STATE_CHANGING_TOOLS = new Set([
      "select_archetype", "update_archetype_params",
      "add_sheet_metal_part", "add_printed_part", "add_purchased_part",
      "add_freeform_2d_part", "add_interface", "remove_part",
      "refine_part", "add_feature_to_part", "break_out", "capture_scope",
    ]);
    const stateChanged = agentResult.toolCalls.some(c => STATE_CHANGING_TOOLS.has(c.name));
    if (stateChanged) {
      const summary = a.content.length > 60 ? a.content.slice(0, 57) + "…" : a.content;
      await ctx.runMutation(internal.assemblySnapshots.captureInternal, {
        projectId: a.projectId,
        label: summary,
      });
    }

    const assistantText = agentResult.responseText.trim();
    if (assistantText) {
      await ctx.runMutation(internal.messages.insertProjectMessage, {
        projectId: a.projectId, role: "assistant", content: assistantText,
        model: a.model, effort: a.effort,
      });
    } else if (agentResult.toolCalls.length === 0) {
      await ctx.runMutation(internal.messages.insertProjectMessage, {
        projectId: a.projectId, role: "assistant", content: "Updated.",
        model: a.model, effort: a.effort,
      });
    }

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
      await ctx.runMutation(api.projects.updateScope, { projectId, scope: coerceScope(call.input.scope) });
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

    case "check_manufacturing": {
      const summary: any = await ctx.runQuery(api.manufacturing.summarizeForProject, { projectId });
      const totals = summary?.totals ?? { sheetMetalParts: 0, failures: 0, warnings: 0 };
      const lines: string[] = [];
      lines.push(
        `🛠 Manufacturability check (${summary?.perPart?.length ?? 0} sheet-metal parts): ` +
        `${totals.failures} fail · ${totals.warnings} warn.`,
      );
      const failedParts = (summary?.perPart ?? []).filter((p: any) => p.failures > 0 || p.warnings > 0).slice(0, 6);
      for (const p of failedParts) {
        const stepBits = (p.steps ?? []).filter((s: any) => s.failures > 0 || s.warnings > 0)
          .map((s: any) => `${s.label} (${s.failures}F/${s.warnings}W)`)
          .join(", ");
        lines.push(`  • ${p.label} (${p.role}): ${p.failures}F / ${p.warnings}W` + (stepBits ? ` — ${stepBits}` : ""));
        const top = (p.rules ?? []).filter((r: any) => r.status === "fail").slice(0, 2);
        for (const r of top) {
          const suggestion = r.suggestion ? ` → ${r.suggestion}` : "";
          lines.push(`    - ${r.label}: ${r.message}${suggestion}`);
        }
      }
      if (failedParts.length === 0) {
        lines.push("  All parts pass current manufacturability checks. (Intent: " + (call.input.intent ?? "n/a") + ")");
      }
      return lines.join("\n");
    }

    case "gather_inspiration": {
      const refs = Array.isArray(call.input.references) ? call.input.references : [];
      const recs = Array.isArray(call.input.recommendations) ? call.input.recommendations : [];
      const lines = [
        `🔍 Researched **${call.input.topic ?? "design"}** — ${refs.length} reference${refs.length === 1 ? "" : "s"}, ${recs.length} recommendation${recs.length === 1 ? "" : "s"}.`,
        ...refs.slice(0, 5).map((r: any) => `  • ${r.name} (${r.source}): ${r.features}${r.dimensions ? ` · ${r.dimensions}` : ""}`),
        ...(recs.length > 0 ? ["Will apply:", ...recs.slice(0, 5).map((r: string) => `  → ${r}`)] : []),
      ];
      return lines.join("\n");
    }

    case "add_sheet_metal_part": {
      const TWO_PI = 2 * Math.PI;
      const pos = call.input.position;
      const looksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(pos?.[k] ?? 0) > TWO_PI);
      if (looksDegrees) {
        pos.rotX = (pos.rotX ?? 0) * (Math.PI / 180);
        pos.rotY = (pos.rotY ?? 0) * (Math.PI / 180);
        pos.rotZ = (pos.rotZ ?? 0) * (Math.PI / 180);
      }
      // Coerce common feature-field synonyms to canonical enum values so the
      // agent doesn't trip the Zod validator on near-misses.
      const features = (Array.isArray(call.input.features) ? call.input.features : []).map((f: any) => {
        const out = { ...f };
        if (out.kind === "bend") {
          if (typeof out.axis === "string") {
            const a = out.axis.toLowerCase();
            if (a === "x" || a === "horiz" || a === "h" || a.startsWith("horiz")) out.axis = "horizontal";
            else if (a === "y" || a === "vert" || a === "v" || a.startsWith("vert")) out.axis = "vertical";
          }
        }
        if ((out.kind === "hole" || out.kind === "slot" || out.kind === "tab") && typeof out.pattern === "string") {
          const p = out.pattern.toLowerCase().replace(/-/g, "_");
          if (p === "corners") out.pattern = "corner";
          if (p === "centre") out.pattern = "center";
          if (p === "top") out.pattern = "top_row";
          if (p === "bottom") out.pattern = "bottom_row";
        }
        if (out.kind === "tab" && typeof out.edge === "string") {
          const e = out.edge.toLowerCase();
          if (["top", "bottom", "left", "right"].includes(e)) out.edge = e;
        }
        return out;
      });
      const dsl = {
        version: 1,
        partType: "plate" as const,
        material: call.input.material,
        thickness: call.input.thickness,
        width: call.input.width,
        height: call.input.height,
        depth: null,
        outline: call.input.outline ?? { kind: "rectangle" },
        features,
        finish: call.input.powderCoat
          ? { type: "powder_coat", color: call.input.powderCoatColor ?? "Black" }
          : null,
        assemblyRefs: [],
      };
      try {
        await ctx.runMutation(internal.parts.addPartInternal, {
          projectId, role: call.input.role, label: call.input.label, position: pos,
          dslJson: JSON.stringify(dsl),
        });
      } catch (err: any) {
        return `Couldn't add ${call.input.role}: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      return `🟦 Added sheet-metal part ${call.input.role} (${call.input.label}) — ${dsl.material} ${dsl.thickness}", ${dsl.width}" × ${dsl.height}".`;
    }

    case "add_interface": {
      const all = await ctx.runQuery(api.parts.listForProject, { projectId });
      const partA = all.find(p => p.role === call.input.roleA);
      const partB = all.find(p => p.role === call.input.roleB);
      if (!partA || !partB) {
        return `Couldn't add interface: role not found (${!partA ? call.input.roleA : call.input.roleB}).`;
      }
      try {
        await ctx.runMutation(internal.interfaces.addInterfaceInternal, {
          projectId,
          kind: call.input.kind,
          partA: partA._id,
          partB: partB._id,
          featureRefs: [
            { partId: partA._id, featureName: call.input.featureA },
            { partId: partB._id, featureName: call.input.featureB },
          ],
          hardwareRefs: Array.isArray(call.input.hardwareRefs) ? call.input.hardwareRefs : [],
          accessSide: call.input.accessSide,
        });
      } catch (err: any) {
        return `Couldn't add interface: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      const hwTotal = (call.input.hardwareRefs ?? []).reduce((acc: number, h: any) => acc + (h.quantity ?? 0), 0);
      return `🔗 ${call.input.kind} interface: ${call.input.roleA} ↔ ${call.input.roleB}${hwTotal > 0 ? ` (${hwTotal}× hardware)` : ""}.`;
    }

    case "remove_part": {
      const all = await ctx.runQuery(api.parts.listForProject, { projectId });
      const target = all.find(p => p.role === call.input.role);
      if (!target) return `No part with role ${call.input.role}.`;
      await ctx.runMutation(api.parts.removePart, { partId: target._id });
      return `🗑 Removed ${call.input.role}.`;
    }

    case "add_freeform_2d_part": {
      const TWO_PI = 2 * Math.PI;
      const fpos = call.input.position;
      const fLooksDegrees = ["rotX", "rotY", "rotZ"].some(k => Math.abs(fpos?.[k] ?? 0) > TWO_PI);
      if (fLooksDegrees) {
        fpos.rotX = (fpos.rotX ?? 0) * (Math.PI / 180);
        fpos.rotY = (fpos.rotY ?? 0) * (Math.PI / 180);
        fpos.rotZ = (fpos.rotZ ?? 0) * (Math.PI / 180);
      }
      const outline = call.input.outline;
      const { outlineAabb: aabb } = await import("./lib/dsl");
      const { width: aabbW, height: aabbH } = aabb(outline, 1, 1);
      const dsl = {
        version: 1,
        partType: "plate" as const,
        material: call.input.material ?? "Mild Steel (CRS)",
        thickness: call.input.thickness ?? 0.075,
        width: aabbW,
        height: aabbH,
        depth: null,
        outline,
        features: Array.isArray(call.input.features) ? call.input.features : [],
        finish: null,
        assemblyRefs: [],
      };
      try {
        await ctx.runMutation(internal.parts.addPartInternal, {
          projectId,
          role: call.input.role,
          label: call.input.label,
          position: fpos,
          dslJson: JSON.stringify(dsl),
        });
      } catch (err: any) {
        return `Couldn't add freeform part ${call.input.role}: ${err?.message?.slice(0, 200) ?? "validation failed"}`;
      }
      const shapeDesc =
        outline?.kind === "star" ? `${outline.numPoints}-point star, OR ${outline.outerRadius}", IR ${outline.innerRadius}"` :
        outline?.kind === "circle" ? `Ø${outline.radius * 2}" disk` :
        outline?.kind === "regular_polygon" ? `${outline.sides}-sided polygon, R ${outline.radius}"` :
        outline?.kind === "polygon" ? `${outline.points?.length}-point polygon` :
        "rectangle";
      return `🟦 Added laser-cut: ${call.input.label} (${shapeDesc}) in ${dsl.material} ${dsl.thickness}".`;
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

function coerceScope(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  const out: any = { ...raw };

  const env = out.environment;
  if (typeof env === "string") {
    out.environment = { location: env === "outdoor" ? "outdoor" : "indoor" };
  } else if (env && typeof env === "object" && typeof env.location !== "string") {
    out.environment = { ...env, location: "indoor" };
  }

  const rs = out.referenceScale;
  if (typeof rs === "string") {
    const m = rs.match(/(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/);
    out.referenceScale = m
      ? { kind: rs, dimensions: { w: parseFloat(m[1]), d: parseFloat(m[2]), h: parseFloat(m[3]) } }
      : { kind: rs };
  } else if (rs && typeof rs === "object" && typeof rs.kind !== "string") {
    out.referenceScale = { ...rs, kind: "object" };
  }

  if (typeof out.budgetCeiling === "string") {
    const n = parseFloat(out.budgetCeiling.replace(/[^0-9.]/g, ""));
    out.budgetCeiling = isNaN(n) ? undefined : n;
  }

  return out;
}
