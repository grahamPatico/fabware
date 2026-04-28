// Deterministic archetype audit. Runs each archetype's paramDefaults +
// generate against a canonical scope and reports any intersection failures.
// Bypasses the agent entirely so results don't depend on LLM behavior.

import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { listArchetypes } from "./archetypes";
import { computeIntersectionRules } from "./lib/intersectRules";
import type { Doc } from "./_generated/dataModel";

const CANONICAL_SCOPE = {
  tier: "mvp" as const,
  environment: { location: "indoor" as const },
  useCase: "audit",
  referenceScale: { kind: "12-inch cube", dimensions: { w: 12, d: 12, h: 12 } },
};

export const auditAllArchetypes = internalAction({
  args: {},
  handler: async (ctx): Promise<Array<{
    archetypeId: string;
    parts: number;
    failures: Array<{ message: string; depth: number; status: string }>;
  }>> => {
    const out: Array<{
      archetypeId: string;
      parts: number;
      failures: Array<{ message: string; depth: number; status: string }>;
    }> = [];

    for (const arch of listArchetypes()) {
      const params = arch.paramSchema.parse(arch.paramDefaults(CANONICAL_SCOPE));
      const { parts: gen } = arch.generate(params, CANONICAL_SCOPE);
      // Build minimal Doc<"parts"> shapes — we only need the fields the
      // intersection check reads.
      const fakeParts = gen.map((p: any, idx: number) => ({
        _id: `audit-${arch.id}-${idx}` as any,
        _creationTime: 0,
        projectId: "audit" as any,
        role: p.role,
        label: p.label,
        position: p.position,
        partType: p.dsl.partType,
        material: p.dsl.material,
        thickness: p.dsl.thickness,
        width: p.dsl.width,
        height: p.dsl.height,
        depth: p.dsl.depth ?? undefined,
        kind: "sheet_metal" as const,
        dslJson: JSON.stringify(p.dsl),
        createdAt: 0,
        updatedAt: 0,
      })) as unknown as Doc<"parts">[];

      const rules = computeIntersectionRules(fakeParts);
      const failures = rules
        .filter(r => r.status === "fail" || r.status === "warn")
        .map(r => ({ message: r.message, depth: 0, status: r.status }));
      out.push({ archetypeId: arch.id, parts: gen.length, failures });
    }
    return out;
  },
});

// Convenience: generate an archetype's default geometry into a real project so
// it can be inspected in the UI. Used during iterative audit sessions.
export const generateArchetypeDeterministic = internalMutation({
  args: {
    projectId: v.id("projects"),
    archetypeId: v.string(),
    overrideParams: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, archetypeId, overrideParams }) => {
    const arch = listArchetypes().find(a => a.id === archetypeId);
    if (!arch) throw new Error(`Unknown archetype: ${archetypeId}`);
    const merged = { ...arch.paramDefaults(CANONICAL_SCOPE), ...(overrideParams ?? {}) };
    const params = arch.paramSchema.parse(merged);
    const { parts: gen, interfaces: genInterfaces } = arch.generate(params, CANONICAL_SCOPE);

    // Reuse the same mutations the production flow uses.
    await ctx.runMutation(internal.parts.replaceAll, {
      projectId,
      parts: gen.map((gp: any) => ({
        role: gp.role, label: gp.label, position: gp.position,
        dslJson: JSON.stringify(gp.dsl),
      })),
    });
    await ctx.runMutation(internal.interfaces.replaceAll, {
      projectId,
      interfaces: genInterfaces,
    });
    await ctx.db.patch(projectId, {
      archetypeId: archetypeId as any,
      archetypeParams: params,
      updatedAt: Date.now(),
    });
    return { partsGenerated: gen.length, interfacesGenerated: genInterfaces.length };
  },
});
