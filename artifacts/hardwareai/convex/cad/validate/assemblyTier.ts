// convex/cad/validate/assemblyTier.ts
//
// Tier 5: assembly topology validator.
// Checks that every part in an assembly is reachable from at least one joint
// (no floating parts) and that no rigid group is over-constrained.
//
// "Over-constrained rigid group": two parts connected only by fixed joints
// but connected more than once (cycle of fixed joints = over-constrained).

import type { CadIr } from "../ir/types";
import type { Violation } from "../../plugins/types";
import { partsInterfere } from "./rules/partsInterfere";

function v(ruleId: string, message: string, agent: string): Violation {
  return { ruleId, severity: "error", message, agentMessage: agent };
}

export function validateAssemblyTier(ir: CadIr): Violation[] {
  const out: Violation[] = [];

  const parts = ir.parts ?? {};
  const joints = ir.joints ?? {};
  const partIds = Object.keys(parts);

  // Nothing to check if there are no parts
  if (partIds.length === 0) return out;

  // Build adjacency: for each part, collect the joints it participates in
  const adjacency = new Map<string, { neighbor: string; jointId: string; jointType: string }[]>();
  for (const id of partIds) adjacency.set(id, []);

  for (const [, joint] of Object.entries(joints)) {
    const parentEntry = adjacency.get(joint.parent);
    const childEntry = adjacency.get(joint.child);
    if (parentEntry) parentEntry.push({ neighbor: joint.child, jointId: joint.id, jointType: joint.type });
    if (childEntry) childEntry.push({ neighbor: joint.parent, jointId: joint.id, jointType: joint.type });
  }

  // ── Rule 1: floating parts ────────────────────────────────────────────────
  // A part is "floating" if it appears in no joint. Exception: if there is only
  // one part in the assembly, it is an assembly of one and is not floating.
  if (partIds.length > 1) {
    for (const partId of partIds) {
      const edges = adjacency.get(partId) ?? [];
      if (edges.length === 0) {
        out.push(v(
          "assembly.floating-part",
          `Part "${partId}" is not connected to any joint`,
          `Add a joint that connects "${partId}" to another part, or remove the part from the assembly.`,
        ));
      }
    }
  }

  // ── Rule 2: over-constrained rigid groups ─────────────────────────────────
  // Consider only FIXED joints. A set of parts connected only by fixed joints
  // forms a "rigid group". A rigid group is over-constrained if it has a cycle
  // (i.e., there are more fixed-joint edges than (nodes - 1) within the group).
  //
  // We use Union-Find on fixed joints, checking for back-edges (cycles).
  const parent = new Map<string, string>(partIds.map(id => [id, id]));

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false; // already in same group → cycle
    parent.set(ra, rb);
    return true;
  }

  for (const [, joint] of Object.entries(joints)) {
    if (joint.type !== "fixed") continue;
    // Only check if both parts exist
    if (!parts[joint.parent] || !parts[joint.child]) continue;
    const merged = union(joint.parent, joint.child);
    if (!merged) {
      // Cycle detected in fixed joints = over-constrained
      out.push(v(
        "assembly.over-constrained-rigid-group",
        `Fixed joint "${joint.id}" creates an over-constrained rigid group between "${joint.parent}" and "${joint.child}"`,
        `Remove the redundant fixed joint "${joint.id}" or change one of the joints to a non-fixed type.`,
      ));
    }
  }

  // ── Rule 3: parts interference (AABB check) ───────────────────────────────
  out.push(...partsInterfere(ir));

  return out;
}
