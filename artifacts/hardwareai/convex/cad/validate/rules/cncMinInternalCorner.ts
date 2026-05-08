// convex/cad/validate/rules/cncMinInternalCorner.ts
//
// Rule: mfg.cnc-min-internal-corner
//
// CNC end mills are cylindrical — they cannot cut a perfectly sharp internal
// corner. Every internal corner on a CNC-milled pocket must have a radius at
// least as large as the tool radius (half the tool diameter) so the mill can
// clear the corner without colliding with the wall.
//
// This rule inspects cut_extrude features whose profile sketch contains a rect
// entity. A rect whose cornerRadius is undefined or less than the tool radius
// will leave an internal corner that the mill cannot fully reach.
//
// Phase 17 v0 scope: only declared cornerRadius on rect sketches is checked.
// Sharp corners formed by the intersection of multiple features (e.g. two
// overlapping extrudes) are not detected — use solid-model analysis for that.
//
// Only fires when original.process === "cnc".
// Severity: error (unmachinable corner is a real fabrication failure).
//
// DEFAULT_TOOL_D = 6.35 mm (1/4" end mill) — used when cncToolDiameter is absent.

import type { ResolvedIr } from "../../resolve/resolveIr";
import type { CadIr } from "../../ir/types";
import type { Violation } from "../../../plugins/types";
import type { CutExtrudeFeature } from "../../ir/types";

/** Default CNC end-mill diameter in mm (1/4" end mill). */
export const DEFAULT_TOOL_D = 6.35;

/**
 * mfg.cnc-min-internal-corner
 *
 * Emits an error for every cut_extrude whose profile sketch contains a rect
 * entity with cornerRadius < toolRadius (or cornerRadius missing).
 * Only active when `original.process` is "cnc".
 */
export function cncMinInternalCorner(
  resolved: ResolvedIr,
  original: CadIr,
): Violation[] {
  if (original.process !== "cnc") return [];

  const toolDiameter = (original.cncToolDiameter ?? DEFAULT_TOOL_D) as number;
  const toolRadius = toolDiameter / 2;

  const out: Violation[] = [];

  for (const f of resolved.features) {
    if (f.kind !== "cut_extrude" || f.suppressed) continue;
    const cut = f as CutExtrudeFeature;

    const sketch = resolved.sketches[cut.profile];
    if (!sketch) continue;

    for (const g of sketch.geometry) {
      if (g.kind !== "rect") continue;

      const cr = g.cornerRadius;
      const cornerR = cr === undefined ? 0 : (cr as number);

      if (cornerR < toolRadius) {
        out.push({
          ruleId: "mfg.cnc-min-internal-corner",
          severity: "error",
          message: `Cut extrude "${cut.id}" rect corner radius ${cornerR}mm is less than tool radius ${toolRadius}mm (tool Ø${toolDiameter}mm). CNC end mills cannot cut sharp internal corners.`,
          agentMessage: `Add a cornerRadius of at least ${toolRadius}mm to the rect sketch in cut extrude "${cut.id}" so the ${toolDiameter}mm end mill can reach the corner. Note: only declared cornerRadius on rect sketches is checked — sharp corners formed by intersecting features require solid-model analysis.`,
          location: { kind: "feature", id: cut.id },
        });
        break; // one violation per cut_extrude is enough
      }
    }
  }

  return out;
}
