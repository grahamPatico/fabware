// Minimal DXF R12 ASCII emitter for sheet-metal flat patterns.
//
// Entities are placed on three layers:
//   CUT   (color 1 / red)    - outline + slots
//   HOLE  (color 2 / yellow) - circular holes
//   BEND  (color 4 / cyan)   - bend tangent lines (informational, not cut)
//
// SCS accepts R12 ASCII DXF. We emit only LINE and CIRCLE entities, which
// is enough for laser cutting and is the lowest-common-denominator format
// every CAM tool understands.

import type { PartDsl, BendFeature, HoleFeature, SlotFeatureT, Outline } from "./dsl";

interface DxfEntity {
  /** Append the entity's group-code lines to the buffer. */
  emit(buf: string[]): void;
}

function line(buf: string[], code: number, value: string | number) {
  buf.push(String(code));
  buf.push(typeof value === "number" ? value.toFixed(6) : value);
}

function header(buf: string[]) {
  line(buf, 0, "SECTION");
  line(buf, 2, "HEADER");
  line(buf, 9, "$ACADVER");
  line(buf, 1, "AC1009");
  line(buf, 9, "$INSBASE");
  line(buf, 10, 0); line(buf, 20, 0); line(buf, 30, 0);
  line(buf, 0, "ENDSEC");
}

function tables(buf: string[]) {
  line(buf, 0, "SECTION");
  line(buf, 2, "TABLES");
  line(buf, 0, "TABLE");
  line(buf, 2, "LAYER");
  line(buf, 70, 4);
  for (const [name, color] of [["0", 7], ["CUT", 1], ["HOLE", 2], ["BEND", 4]] as const) {
    line(buf, 0, "LAYER");
    line(buf, 2, name);
    line(buf, 70, 0);
    line(buf, 62, color);
    line(buf, 6, "CONTINUOUS");
  }
  line(buf, 0, "ENDTAB");
  line(buf, 0, "ENDSEC");
}

function emitLine(buf: string[], layer: string, x1: number, y1: number, x2: number, y2: number) {
  line(buf, 0, "LINE");
  line(buf, 8, layer);
  line(buf, 10, x1); line(buf, 20, y1); line(buf, 30, 0);
  line(buf, 11, x2); line(buf, 21, y2); line(buf, 31, 0);
}

function emitCircle(buf: string[], layer: string, cx: number, cy: number, r: number) {
  line(buf, 0, "CIRCLE");
  line(buf, 8, layer);
  line(buf, 10, cx); line(buf, 20, cy); line(buf, 30, 0);
  line(buf, 40, r);
}

/**
 * Outline → list of (x, y) vertices in counter-clockwise order. For a
 * rectangle / polygon / star / regular_polygon / circle, returns the
 * boundary points; circle returns [] (caller emits a CIRCLE instead).
 */
function outlinePoints(outline: Outline | undefined, w: number, h: number): { type: "polyline" | "circle"; points: Array<{ x: number; y: number }>; circle?: { cx: number; cy: number; r: number } } {
  if (!outline || outline.kind === "rectangle") {
    return { type: "polyline", points: [
      { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
    ] };
  }
  if (outline.kind === "circle") {
    return { type: "circle", points: [], circle: { cx: outline.radius, cy: outline.radius, r: outline.radius } };
  }
  if (outline.kind === "regular_polygon") {
    const { sides, radius } = outline;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) });
    }
    return { type: "polyline", points: pts };
  }
  if (outline.kind === "star") {
    const { numPoints, outerRadius, innerRadius } = outline;
    const total = numPoints * 2;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < total; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: outerRadius + r * Math.cos(angle), y: outerRadius + r * Math.sin(angle) });
    }
    return { type: "polyline", points: pts };
  }
  // arbitrary polygon — re-anchor to bounding-box origin so all coords are positive
  const ps = outline.points;
  let minX = Infinity, minY = Infinity;
  for (const p of ps) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; }
  return { type: "polyline", points: ps.map(p => ({ x: p.x - minX, y: p.y - minY })) };
}

function holePositions(h: HoleFeature, w: number, height: number): Array<{ x: number; y: number }> {
  const inset = h.inset ?? 0.375;
  const pts: Array<{ x: number; y: number }> = [];
  switch (h.pattern) {
    case "corner": {
      const corners = [
        { x: inset,         y: inset         },
        { x: w - inset,     y: inset         },
        { x: inset,         y: height - inset },
        { x: w - inset,     y: height - inset },
      ];
      const n = Math.min(h.count, 4);
      for (let i = 0; i < n; i++) pts.push(corners[i]);
      if (h.count > 4) {
        const edges = [
          { x: w / 2,     y: inset          },
          { x: w / 2,     y: height - inset },
          { x: inset,     y: height / 2     },
          { x: w - inset, y: height / 2     },
        ];
        for (let i = 0; i < h.count - 4; i++) pts.push(edges[i % 4]);
      }
      break;
    }
    case "center": pts.push({ x: w / 2, y: height / 2 }); break;
    case "top_row": {
      const y = height - inset;
      const step = (w - 2 * inset) / Math.max(h.count - 1, 1);
      for (let i = 0; i < h.count; i++) pts.push({ x: inset + i * step, y });
      break;
    }
    case "bottom_row": {
      const y = inset;
      const step = (w - 2 * inset) / Math.max(h.count - 1, 1);
      for (let i = 0; i < h.count; i++) pts.push({ x: inset + i * step, y });
      break;
    }
  }
  return pts;
}

function slotPositions(s: SlotFeatureT, w: number, height: number): Array<{ x: number; y: number }> {
  const inset = 0.375;
  const pts: Array<{ x: number; y: number }> = [];
  switch (s.pattern) {
    case "corner":
      pts.push(
        { x: inset, y: inset },
        { x: w - inset, y: inset },
        { x: inset, y: height - inset },
        { x: w - inset, y: height - inset },
      );
      break;
    case "center": pts.push({ x: w / 2, y: height / 2 }); break;
    case "top_row": case "bottom_row": {
      const y = s.pattern === "top_row" ? height - inset : inset;
      const step = (w - 2 * inset) / Math.max(s.count - 1, 1);
      for (let i = 0; i < s.count; i++) pts.push({ x: inset + i * step, y });
      break;
    }
  }
  return pts.slice(0, s.count);
}

export function generatePartDxf(dsl: PartDsl): string {
  const buf: string[] = [];
  header(buf);
  tables(buf);

  // Entities section
  line(buf, 0, "SECTION");
  line(buf, 2, "ENTITIES");

  // Outline on CUT layer
  const o = outlinePoints(dsl.outline, dsl.width, dsl.height);
  if (o.type === "circle" && o.circle) {
    emitCircle(buf, "CUT", o.circle.cx, o.circle.cy, o.circle.r);
  } else if (o.points.length >= 2) {
    for (let i = 0; i < o.points.length; i++) {
      const a = o.points[i];
      const b = o.points[(i + 1) % o.points.length];
      emitLine(buf, "CUT", a.x, a.y, b.x, b.y);
    }
  }

  // Holes on HOLE layer
  for (const f of dsl.features) {
    if (f.kind !== "hole") continue;
    const positions = holePositions(f, dsl.width, dsl.height);
    for (const p of positions) {
      emitCircle(buf, "HOLE", p.x, p.y, f.diameter / 2);
    }
  }

  // Slots: emit a stadium (two semicircles + two parallel lines) on CUT layer
  for (const f of dsl.features) {
    if (f.kind !== "slot") continue;
    const positions = slotPositions(f, dsl.width, dsl.height);
    const halfL = f.length / 2;
    const r = f.width / 2;
    for (const p of positions) {
      // Two end semicircles approximated as full circles trimmed by lines.
      // For a SCS-uploadable result, emit two LINEs on the long sides plus
      // a CIRCLE at each cap (the cap arcs simply overlap themselves).
      emitLine(buf, "CUT", p.x - halfL, p.y - r, p.x + halfL, p.y - r);
      emitLine(buf, "CUT", p.x - halfL, p.y + r, p.x + halfL, p.y + r);
      emitCircle(buf, "CUT", p.x - halfL, p.y, r);
      emitCircle(buf, "CUT", p.x + halfL, p.y, r);
    }
  }

  // Bend lines on BEND layer (informational — not cut)
  for (const f of dsl.features) {
    if (f.kind !== "bend") continue;
    const b = f as BendFeature;
    if (b.axis === "horizontal") {
      const y = b.positionRatio * dsl.height;
      emitLine(buf, "BEND", 0, y, dsl.width, y);
    } else {
      const x = b.positionRatio * dsl.width;
      emitLine(buf, "BEND", x, 0, x, dsl.height);
    }
  }

  line(buf, 0, "ENDSEC");
  line(buf, 0, "EOF");

  return buf.join("\n") + "\n";
}
