// convex/cad/codegen/features/hole.ts
import type { HoleFeature } from "../../ir/types";
import type { ResolvedIr } from "../../resolve/resolveIr";
import { refOrLit } from "../refOrLit";

/**
 * Emit build123d Python for a hole feature.
 *
 * Dispatches on f.type:
 *   simple      → Hole(radius=d/2, depth=...)
 *   countersink → CounterSinkHole(radius=d/2, counter_sink_radius=cs.diameter/2, depth=..., counter_sink_angle=cs.angle)
 *   counterbore → CounterBoreHole(radius=d/2, counter_bore_radius=cb.diameter/2, counter_bore_depth=cb.depth, depth=...)
 *   threaded    → # threaded hole: spec=<spec>\n    Hole(radius=d/2, depth=...)
 *
 * All variants produce:
 *   with Locations((<x>, <y>, 0), ...):
 *       <call>
 *   report_entities("<id>", <parent_body>)
 */
export function emitHole(
  f: HoleFeature,
  ir: ResolvedIr,
  parentBodyId: string | null
): string[] {
  const diamExpr = refOrLit(f.diameter as number, ir);
  const radiusExpr = `${diamExpr} / 2`;
  const lines: string[] = [];

  // Emit Locations context with each position
  const posArgs = (f.positions as Array<{ x: number; y: number }>)
    .map((p) => `(${p.x}, ${p.y}, 0)`)
    .join(", ");

  lines.push(`with Locations(${posArgs}):`);

  const depthPart =
    f.depth !== undefined
      ? `, depth=${refOrLit(f.depth as number, ir)}`
      : "";

  switch (f.type) {
    case "countersink": {
      const cs = f.countersink!;
      const csRadius = `${refOrLit((cs as { angle: number; diameter: number }).diameter, ir)} / 2`;
      const csAngle = refOrLit((cs as { angle: number; diameter: number }).angle, ir);
      lines.push(
        `    CounterSinkHole(radius=${radiusExpr}, counter_sink_radius=${csRadius}${depthPart}, counter_sink_angle=${csAngle})`,
      );
      break;
    }
    case "counterbore": {
      const cb = f.counterbore!;
      const cbRadius = `${refOrLit((cb as { diameter: number; depth: number }).diameter, ir)} / 2`;
      const cbDepth = refOrLit((cb as { diameter: number; depth: number }).depth, ir);
      lines.push(
        `    CounterBoreHole(radius=${radiusExpr}, counter_bore_radius=${cbRadius}, counter_bore_depth=${cbDepth}${depthPart})`,
      );
      break;
    }
    case "threaded": {
      const spec = f.thread!.spec;
      lines.push(`    # threaded hole: spec=${spec}`);
      lines.push(`    Hole(radius=${radiusExpr}${depthPart})`);
      break;
    }
    default: {
      // simple
      if (f.depth !== undefined) {
        lines.push(`    Hole(radius=${radiusExpr}, depth=${refOrLit(f.depth as number, ir)})`);
      } else {
        lines.push(`    Hole(radius=${radiusExpr})`);
      }
    }
  }

  // report_entities references the parent body
  const bodyRef = parentBodyId ?? "None";
  lines.push(`report_entities("${f.id}", ${bodyRef})`);

  return lines;
}
