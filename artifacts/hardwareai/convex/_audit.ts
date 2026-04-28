// Deterministic archetype audit. Runs each archetype's paramDefaults +
// generate against a canonical scope and reports any intersection failures.
// Bypasses the agent entirely so results don't depend on LLM behavior.

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { listArchetypes } from "./archetypes";
import { computeIntersectionRules } from "./lib/intersectRules";
import { validateAssembly } from "./lib/assemblyRules";
import { generateBom } from "./lib/bom";
import type { Doc } from "./_generated/dataModel";
import type { PartDsl } from "./lib/dsl";

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

/**
 * Synthetic smoke for the weld_joint validator (chunk 2.2). Builds two parts
 * — one with a tab feature, one with a slot feature — and a single
 * weld_joint interface, then runs validateAssembly and returns the
 * weld_joint_tab_slot rule. Each scenario is a separate call.
 */
export const auditWeldJoint = internalAction({
  args: {
    tabLength: v.optional(v.number()),
    tabWidth: v.optional(v.number()),
    tabCount: v.optional(v.number()),
    slotLength: v.optional(v.number()),
    slotWidth: v.optional(v.number()),
    slotCount: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ status: string; message: string; suggestion?: string }> => {
    const tabLen = args.tabLength ?? 0.5;
    const tabWid = args.tabWidth ?? 0.075;
    const tabCnt = args.tabCount ?? 4;
    const slotLen = args.slotLength ?? tabLen + 0.01;
    const slotWid = args.slotWidth ?? tabWid + 0.01;
    const slotCnt = args.slotCount ?? tabCnt;

    const dslA: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: 6, height: 4, depth: null,
      features: [{ kind: "tab", name: "tab", count: tabCnt, length: tabLen, width: tabWid, edge: "right" }],
      finish: null, assemblyRefs: [],
    };
    const dslB: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: 6, height: 4, depth: null,
      features: [{ kind: "slot", name: "slot", count: slotCnt, length: slotLen, width: slotWid, pattern: "top_row" }],
      finish: null, assemblyRefs: [],
    };

    const result = validateAssembly({
      parts: [
        { id: "A", role: "panel_a", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: dslA },
        { id: "B", role: "panel_b", pose: { x: 6, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: dslB },
      ],
      interfaces: [{
        kind: "weld_joint", partA: "A", partB: "B",
        featureRefs: [{ partId: "A", featureName: "tab" }, { partId: "B", featureName: "slot" }],
        hardwareRefs: [],
      }],
      scope: null,
    });

    const r = result.rules.find(rr => rr.id === "weld_joint_tab_slot");
    if (!r) return { status: "missing", message: "Validator didn't emit weld_joint_tab_slot rule." };
    return {
      status: r.status,
      message: r.message,
      suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
    };
  },
});

export const _bomFor = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<{ csv: string }> => {
    const project = await ctx.db.get(projectId);
    const parts = await ctx.db.query("parts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    const interfaces = await ctx.db.query("interfaces").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    const assemblyParts = await ctx.db.query("assemblyParts").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
    return { csv: generateBom({ projectName: project?.name ?? "Untitled", parts, interfaces, assemblyParts }) };
  },
});

/**
 * Synthetic smoke for the OBJ exporter (chunk 5.5).
 */
export const auditObj = internalAction({
  args: {},
  handler: async (ctx): Promise<{ bytes: number; lines: number; groups: number; vertices: number; faces: number; head: string }> => {
    const pid: any = await ctx.runMutation(internal._audit.createAuditProject, {});
    await ctx.runMutation(internal._audit.generateArchetypeDeterministic, {
      projectId: pid, archetypeId: "hinged_enclosure",
    });
    const result: any = await ctx.runQuery(internal.obj.projectObj, { projectId: pid });
    const lines: string[] = result.obj.split("\n");
    let groups = 0, verts = 0, faces = 0;
    for (const l of lines) {
      if (l.startsWith("g ")) groups += 1;
      else if (l.startsWith("v ")) verts += 1;
      else if (l.startsWith("f ")) faces += 1;
    }
    return {
      bytes: result.obj.length,
      lines: lines.length,
      groups, vertices: verts, faces,
      head: lines.slice(0, 6).join(" | "),
    };
  },
});

/**
 * Synthetic smoke for the SCS upload bundle (chunk 5.4). Generates a default
 * archetype, builds the zip, and reports structural details (entry count,
 * total size, signature presence).
 */
export const auditBundle = internalAction({
  args: {},
  handler: async (ctx): Promise<{ entryCount: number; bytes: number; firstBytes: string; eocdPresent: boolean }> => {
    const pid: any = await ctx.runMutation(internal._audit.createAuditProject, {});
    await ctx.runMutation(internal._audit.generateArchetypeDeterministic, {
      projectId: pid, archetypeId: "hinged_enclosure",
    });
    const result: any = await ctx.runQuery(internal.bundle.projectZip, { projectId: pid });
    if (!result) throw new Error("bundle returned null");
    const bin = atob(result.base64);
    const head = bin.slice(0, 4);
    const sigOk = head === "PK\x03\x04";
    const eocdOk = bin.includes("PK\x05\x06");
    return {
      entryCount: result.entryCount,
      bytes: result.bytes,
      firstBytes: sigOk ? "PK<03><04> ✓" : `unexpected: ${head}`,
      eocdPresent: eocdOk,
    };
  },
});

/**
 * Synthetic smoke for the BOM emitter (chunk 5.3). Generates the default
 * hinged_enclosure deterministically and reports CSV structure.
 */
export const auditBom = internalAction({
  args: {},
  handler: async (ctx): Promise<{ csvBytes: number; csvLines: number; sheetGroups: number; hardwareRows: number; preview: string }> => {
    const pid: any = await ctx.runMutation(internal._audit.createAuditProject, {});
    await ctx.runMutation(internal._audit.generateArchetypeDeterministic, {
      projectId: pid, archetypeId: "hinged_enclosure",
    });
    const result: any = await ctx.runQuery(internal._audit._bomFor, { projectId: pid });
    const lines: string[] = result.csv.split("\n");
    const sheetIdx = lines.findIndex(l => l.startsWith("## Sheet"));
    const hardwareIdx = lines.findIndex(l => l.startsWith("## Hardware"));
    const sheetGroups = Math.max(0, hardwareIdx - sheetIdx - 2);
    const hardwareRows = Math.max(0, lines.length - hardwareIdx - 3);
    return {
      csvBytes: result.csv.length,
      csvLines: lines.length,
      sheetGroups,
      hardwareRows,
      preview: lines.slice(0, 10).join(" | "),
    };
  },
});

export const createAuditProject = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.insert("projects", { name: "audit bom", status: "draft", createdAt: Date.now(), updatedAt: Date.now() });
  },
});

/**
 * Synthetic smoke for PDF generation (chunk 5.2). Returns byte length and
 * a peek at the header / trailer so we can confirm the structure without
 * shipping the whole binary back through the CLI.
 */
export const auditPdf = internalAction({
  args: {
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    holeCount: v.optional(v.number()),
    addBend: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{ bytes: number; head: string; tail: string; objCount: number }> => {
    const features: any[] = [];
    if (args.holeCount && args.holeCount > 0) {
      features.push({ kind: "hole", name: "mount", count: args.holeCount, diameter: 0.266, pattern: "corner", inset: 0.375 });
    }
    if (args.addBend) features.push({ kind: "bend", name: "main", axis: "horizontal", positionRatio: 0.5, angle: 90, radius: 0.1 });
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: args.width ?? 6, height: args.height ?? 4, depth: null,
      features, finish: null, assemblyRefs: [],
    };
    const { generatePartPdf } = await import("./lib/pdf");
    const bytes = generatePartPdf(dsl, "Test Part", "test_part");
    let bin = "";
    for (let i = 0; i < Math.min(40, bytes.length); i++) bin += String.fromCharCode(bytes[i]);
    let tail = "";
    for (let i = Math.max(0, bytes.length - 30); i < bytes.length; i++) tail += String.fromCharCode(bytes[i]);
    let bin2 = "";
    for (let i = 0; i < bytes.length; i++) bin2 += String.fromCharCode(bytes[i]);
    const objCount = (bin2.match(/ obj\n/g) || []).length;
    return { bytes: bytes.length, head: bin.replace(/\n/g, "\\n"), tail: tail.replace(/\n/g, "\\n"), objCount };
  },
});

/**
 * Synthetic smoke for DXF generation (chunk 5.1).
 */
export const auditDxf = internalAction({
  args: {
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    holeCount: v.optional(v.number()),
    addBend: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{
    bytes: number; lines: number; entities: { LINE: number; CIRCLE: number }; sections: number; head: string; tail: string;
  }> => {
    const features: any[] = [
      { kind: "hole", name: "mount", count: args.holeCount ?? 4, diameter: 0.266, pattern: "corner", inset: 0.375 },
    ];
    if (args.addBend) features.push({ kind: "bend", name: "main", axis: "horizontal", positionRatio: 0.5, angle: 90, radius: 0.1 });
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: args.width ?? 6, height: args.height ?? 4, depth: null,
      features, finish: null, assemblyRefs: [],
    };
    const { generatePartDxf } = await import("./lib/dxf");
    const dxf = generatePartDxf(dsl);
    const lines = dxf.split("\n");
    let lineCt = 0, circleCt = 0, sectionCt = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const code = lines[i].trim();
      const val = lines[i + 1].trim();
      if (code === "0" && val === "LINE") lineCt += 1;
      if (code === "0" && val === "CIRCLE") circleCt += 1;
      if (code === "0" && val === "SECTION") sectionCt += 1;
    }
    return {
      bytes: dxf.length,
      lines: lines.length,
      entities: { LINE: lineCt, CIRCLE: circleCt },
      sections: sectionCt,
      head: lines.slice(0, 6).join("|"),
      tail: lines.slice(-3).join("|"),
    };
  },
});

/**
 * Synthetic smoke for the project-level max-sheet rule (chunk 4.5).
 */
export const auditMaxSheet = internalAction({
  args: {
    material: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ status: string; message: string; suggestion?: string }> => {
    const dsl: PartDsl = {
      version: 1, partType: "plate",
      material: args.material ?? "Mild Steel (CRS)",
      thickness: 0.075,
      width: args.width ?? 50, height: args.height ?? 50, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const result = validateAssembly({
      parts: [{ id: "A", role: "panel", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl }],
      interfaces: [],
      scope: null,
    });
    const r = result.rules.find(rr => rr.id === "assembly_max_sheet");
    if (!r) return { status: "missing", message: "assembly_max_sheet rule not emitted." };
    return {
      status: r.status, message: r.message,
      suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
    };
  },
});

/**
 * Synthetic smoke for the cost estimator (chunk 4.4).
 */
export const auditCost = internalAction({
  args: {
    material: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    thickness: v.optional(v.number()),
    addBend: v.optional(v.boolean()),
    addPowderCoat: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{ material: number; cuts: number; bends: number; finish: number; totalUsd: number; perimeterIn: number }> => {
    const features: any[] = [];
    if (args.addBend) features.push({ kind: "bend", name: "main", axis: "horizontal", positionRatio: 0.5, angle: 90, radius: 0.1 });
    const dsl: PartDsl = {
      version: 1, partType: "plate",
      material: args.material ?? "Mild Steel (CRS)",
      thickness: args.thickness ?? 0.075,
      width: args.width ?? 12, height: args.height ?? 12, depth: null,
      features,
      finish: args.addPowderCoat ? { type: "powder_coat", color: "Black" } : null,
      assemblyRefs: [],
    };
    const { estimatePartCost } = await import("./lib/cost");
    return estimatePartCost(dsl);
  },
});

/**
 * Synthetic smoke for the weight estimator (chunk 4.3).
 */
export const auditWeight = internalAction({
  args: {
    material: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    thickness: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ pounds: number; kg: number; area: number }> => {
    const dsl: PartDsl = {
      version: 1, partType: "plate",
      material: args.material ?? "Mild Steel (CRS)",
      thickness: args.thickness ?? 0.075,
      width: args.width ?? 12, height: args.height ?? 12, depth: null,
      features: [], finish: null, assemblyRefs: [],
    };
    const { estimatePartWeight } = await import("./lib/weight");
    const w = estimatePartWeight(dsl);
    return { pounds: w.pounds, kg: w.kg, area: w.area };
  },
});

/**
 * Synthetic smoke for the material vs feature compat rule (chunk 4.2).
 * Builds a one-part DSL with optional bend feature + finish, then reports
 * the `material_compat` rule from the cut step.
 */
export const auditMaterialCompat = internalAction({
  args: {
    material: v.optional(v.string()),
    addBend: v.optional(v.boolean()),
    addPowderCoat: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{ status: string; message: string; suggestion?: string }> => {
    const features: any[] = [];
    if (args.addBend) {
      features.push({ kind: "bend", name: "main_bend", axis: "horizontal", positionRatio: 0.5, angle: 90, radius: 0.1 });
    }
    const dsl: PartDsl = {
      version: 1, partType: "plate",
      material: args.material ?? "Mild Steel (CRS)",
      thickness: 0.075,
      width: 6, height: 6, depth: null,
      features,
      finish: args.addPowderCoat ? { type: "powder_coat", color: "Black" } : null,
      assemblyRefs: [],
    };
    const { simulatePart } = await import("./lib/bendSim");
    const cutStep = simulatePart(dsl).find(s => s.kind === "cut");
    const rule = cutStep?.rules.find(r => r.id === "material_compat");
    if (!rule) return { status: "missing", message: "material_compat rule not emitted." };
    return {
      status: rule.status, message: rule.message,
      suggestion: typeof rule.suggestion === "string" ? rule.suggestion : undefined,
    };
  },
});

/**
 * Synthetic smoke for the hole-to-edge distance check (chunk 4.1). Builds a
 * one-part flat pattern with a hole pattern at a given inset and reports the
 * `hole_to_edge` rule from the simulator's cut step.
 */
export const auditHoleToEdge = internalAction({
  args: {
    thickness: v.optional(v.number()),
    holeDiameter: v.optional(v.number()),
    inset: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<{ status: string; message: string; suggestion?: string }> => {
    const t = args.thickness ?? 0.075;
    const dia = args.holeDiameter ?? 0.266;
    const inset = args.inset ?? 0.375;
    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: t,
      width: 4, height: 4, depth: null,
      features: [{ kind: "hole", name: "mount", count: 4, diameter: dia, pattern: "corner", inset }],
      finish: null, assemblyRefs: [],
    };
    const { simulatePart } = await import("./lib/bendSim");
    const cutStep = simulatePart(dsl).find(s => s.kind === "cut");
    const rule = cutStep?.rules.find(r => r.id === "hole_to_edge");
    if (!rule) return { status: "missing", message: "hole_to_edge rule not emitted." };
    return {
      status: rule.status, message: rule.message,
      suggestion: typeof rule.suggestion === "string" ? rule.suggestion : undefined,
    };
  },
});

/**
 * Synthetic smoke for the per-style hinge validator (chunk 2.3). Builds two
 * sheet-metal panels with N mounting holes and a hinged interface in the
 * named style, then returns the hinge_geometry_ok rule.
 */
export const auditHingeStyle = internalAction({
  args: {
    style: v.union(v.literal("butt"), v.literal("piano"), v.literal("concealed")),
    holesPerPart: v.optional(v.number()),
    hingeQuantity: v.optional(v.number()),
    addCupBore: v.optional(v.boolean()),
  },
  handler: async (_ctx, args): Promise<{ status: string; message: string; suggestion?: string }> => {
    const holes = args.holesPerPart ?? 4;
    const qty = args.hingeQuantity ?? (args.style === "piano" ? 1 : 2);
    const cupBore = args.addCupBore ?? (args.style === "concealed");

    const features: any[] = [{ kind: "hole", name: "mount", count: holes, diameter: 0.166, pattern: "top_row", inset: 0.375 }];
    if (cupBore) features.push({ kind: "hole", name: "cup_bore", count: qty, diameter: 1.378, pattern: "center", inset: 0.5 });

    const dsl: PartDsl = {
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: 24, height: 6, depth: null,
      features, finish: null, assemblyRefs: [],
    };

    const result = validateAssembly({
      parts: [
        { id: "A", role: "lid",       pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl },
        { id: "B", role: "wall_back", pose: { x: 0, y: 1, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl },
      ],
      interfaces: [{
        kind: "hinged", partA: "A", partB: "B",
        featureRefs: [{ partId: "A", featureName: "mount" }, { partId: "B", featureName: "mount" }],
        hardwareRefs: [{ mcmasterPartNumber: "test", quantity: qty, role: `pivot:${args.style}` }],
      }],
      scope: null,
    });
    const r = result.rules.find(rr => rr.id === "hinge_geometry_ok");
    if (!r) return { status: "missing", message: "Validator didn't emit hinge_geometry_ok rule." };
    return {
      status: r.status, message: r.message,
      suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
    };
  },
});

/**
 * Acrylic enclosure construction smoke. Generates a hinged_enclosure with
 * Acrylic Clear and reports per-part mounting-hole counts + interface kinds.
 * Acceptance: body parts (non-hinge walls + base) should have 0 mounting
 * holes; lid + hinge wall keep their hinge holes; body joints are weld_seam.
 */
export const auditAcrylicEnclosure = internalAction({
  args: { material: v.optional(v.string()) },
  handler: async (
    _ctx,
    { material },
  ): Promise<{
    bodyConstruction: string;
    holesByRole: Array<{ role: string; mountingHoles: number }>;
    interfaceKinds: Array<{ kind: string; count: number }>;
  }> => {
    const arch = listArchetypes().find(a => a.id === "hinged_enclosure")!;
    const defaults = arch.paramDefaults(CANONICAL_SCOPE);
    const params = arch.paramSchema.parse({
      ...defaults,
      material: material ?? "Acrylic Clear",
      thickness: 0.236, // 1/4" cast acrylic
    });
    const { parts, interfaces } = arch.generate(params, CANONICAL_SCOPE);
    const holesByRole = parts.map((p: any) => {
      const mh = p.dsl.features.filter((f: any) => f.kind === "hole" && f.name === "mounting_hole");
      const total = mh.reduce((acc: number, h: any) => acc + (h.count ?? 0), 0);
      return { role: p.role, mountingHoles: total };
    });
    const kindCounts = new Map<string, number>();
    for (const i of interfaces) kindCounts.set(i.kind, (kindCounts.get(i.kind) ?? 0) + 1);
    return {
      bodyConstruction: (params as any).bodyConstruction,
      holesByRole,
      interfaceKinds: Array.from(kindCounts, ([kind, count]) => ({ kind, count })),
    };
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
