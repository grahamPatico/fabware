import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_SNAPSHOTS = 50;

type StoredPart = Omit<Doc<"parts">, "_id" | "_creationTime">;
type StoredInterface = Omit<Doc<"interfaces">, "_id" | "_creationTime"> & {
  partARole: string;
  partBRole: string;
  featureRefRoles: Array<{ role: string; featureName: string }>;
};

async function listSnapshots(ctx: any, projectId: Id<"projects">): Promise<Doc<"assemblySnapshots">[]> {
  const rows: Doc<"assemblySnapshots">[] = await ctx.db
    .query("assemblySnapshots")
    .withIndex("by_project_seq", (q: any) => q.eq("projectId", projectId))
    .collect();
  return rows.sort((a, b) => a.sequence - b.sequence);
}

async function captureSnapshot(
  ctx: any,
  projectId: Id<"projects">,
  label: string,
) {
  const project = await ctx.db.get(projectId);
  if (!project) return null;

  const snapshots = await listSnapshots(ctx, projectId);
  const currentIdx = project.currentSnapshotId
    ? snapshots.findIndex((s: Doc<"assemblySnapshots">) => s._id === project.currentSnapshotId)
    : snapshots.length - 1;

  // Drop any redo-future after the current pointer before pushing a new one.
  for (let i = currentIdx + 1; i < snapshots.length; i++) {
    await ctx.db.delete(snapshots[i]._id);
  }

  const parts = await ctx.db
    .query("parts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const interfaces = await ctx.db
    .query("interfaces")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const partsStored: StoredPart[] = parts.map((p: Doc<"parts">) => {
    const { _id, _creationTime, ...rest } = p;
    return rest;
  });

  const idToRole = new Map<Id<"parts">, string>(parts.map((p: Doc<"parts">) => [p._id, p.role]));
  const interfacesStored: StoredInterface[] = interfaces
    .map((i: Doc<"interfaces">) => {
      const partARole = idToRole.get(i.partA);
      const partBRole = idToRole.get(i.partB);
      if (!partARole || !partBRole) return null;
      const featureRefRoles: Array<{ role: string; featureName: string }> = [];
      for (const f of i.featureRefs) {
        const role = idToRole.get(f.partId);
        if (role) featureRefRoles.push({ role, featureName: f.featureName });
      }
      const { _id, _creationTime, partA, partB, featureRefs, ...rest } = i;
      return { ...rest, partARole, partBRole, featureRefRoles } as StoredInterface;
    })
    .filter((x: StoredInterface | null): x is StoredInterface => x !== null);

  const sequence = snapshots.length > 0 ? Math.max(...snapshots.map((s: Doc<"assemblySnapshots">) => s.sequence)) + 1 : 1;
  const newId = await ctx.db.insert("assemblySnapshots", {
    projectId,
    sequence,
    label,
    archetypeId: project.archetypeId ?? undefined,
    archetypeParams: project.archetypeParams ?? undefined,
    isMultiPart: project.isMultiPart ?? undefined,
    partsJson: JSON.stringify(partsStored),
    interfacesJson: JSON.stringify(interfacesStored),
    createdAt: Date.now(),
  });

  await ctx.db.patch(projectId, { currentSnapshotId: newId, updatedAt: Date.now() });

  // Hard cap: trim oldest if exceeded.
  const fresh = await listSnapshots(ctx, projectId);
  if (fresh.length > MAX_SNAPSHOTS) {
    const overflow = fresh.length - MAX_SNAPSHOTS;
    for (let i = 0; i < overflow; i++) {
      await ctx.db.delete(fresh[i]._id);
    }
  }

  return newId;
}

async function restoreSnapshot(
  ctx: any,
  projectId: Id<"projects">,
  snapshotId: Id<"assemblySnapshots">,
) {
  const snap = await ctx.db.get(snapshotId);
  if (!snap || snap.projectId !== projectId) throw new Error("Snapshot not found");

  // Wipe current parts + interfaces.
  const currentParts = await ctx.db
    .query("parts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const currentIfaces = await ctx.db
    .query("interfaces")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  for (const i of currentIfaces) await ctx.db.delete(i._id);
  for (const p of currentParts) await ctx.db.delete(p._id);

  // Re-insert parts; remember role → new id.
  const partsStored = JSON.parse(snap.partsJson) as StoredPart[];
  const roleToId = new Map<string, Id<"parts">>();
  for (const p of partsStored) {
    const newId = await ctx.db.insert("parts", { ...p, projectId });
    roleToId.set(p.role, newId);
  }

  // Re-insert interfaces, remapping role → id.
  const ifacesStored = JSON.parse(snap.interfacesJson) as StoredInterface[];
  for (const i of ifacesStored) {
    const a = roleToId.get(i.partARole);
    const b = roleToId.get(i.partBRole);
    if (!a || !b) continue;
    const featureRefs = i.featureRefRoles
      .map(f => ({ partId: roleToId.get(f.role), featureName: f.featureName }))
      .filter((f): f is { partId: Id<"parts">; featureName: string } => !!f.partId);
    const { partARole: _a, partBRole: _b, featureRefRoles: _f, ...rest } = i;
    await ctx.db.insert("interfaces", {
      ...rest,
      projectId,
      partA: a,
      partB: b,
      featureRefs,
    });
  }

  await ctx.db.patch(projectId, {
    currentSnapshotId: snap._id,
    archetypeId: snap.archetypeId ?? null,
    archetypeParams: snap.archetypeParams ?? null,
    isMultiPart: snap.isMultiPart ?? undefined,
    updatedAt: Date.now(),
  });
}

export const captureInternal = internalMutation({
  args: { projectId: v.id("projects"), label: v.string() },
  handler: async (ctx, { projectId, label }) => {
    return await captureSnapshot(ctx, projectId, label);
  },
});

export const status = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return { canUndo: false, canRedo: false, current: 0, total: 0, label: null };
    const snapshots = await listSnapshots(ctx, projectId);
    if (snapshots.length === 0) {
      return { canUndo: false, canRedo: false, current: 0, total: 0, label: null };
    }
    const idx = project.currentSnapshotId
      ? snapshots.findIndex(s => s._id === project.currentSnapshotId)
      : snapshots.length - 1;
    const safeIdx = idx < 0 ? snapshots.length - 1 : idx;
    return {
      canUndo: safeIdx > 0,
      canRedo: safeIdx < snapshots.length - 1,
      current: safeIdx + 1,
      total: snapshots.length,
      label: snapshots[safeIdx].label,
    };
  },
});

export const undo = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    const snapshots = await listSnapshots(ctx, projectId);
    if (snapshots.length === 0) return { restored: false };
    const idx = project.currentSnapshotId
      ? snapshots.findIndex(s => s._id === project.currentSnapshotId)
      : snapshots.length - 1;
    if (idx <= 0) return { restored: false };
    await restoreSnapshot(ctx, projectId, snapshots[idx - 1]._id);
    return { restored: true };
  },
});

export const redo = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    const snapshots = await listSnapshots(ctx, projectId);
    if (snapshots.length === 0) return { restored: false };
    const idx = project.currentSnapshotId
      ? snapshots.findIndex(s => s._id === project.currentSnapshotId)
      : snapshots.length - 1;
    if (idx < 0 || idx >= snapshots.length - 1) return { restored: false };
    await restoreSnapshot(ctx, projectId, snapshots[idx + 1]._id);
    return { restored: true };
  },
});
