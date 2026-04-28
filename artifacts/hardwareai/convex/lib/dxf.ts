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
//
// All geometry comes from the FlatPattern module — no DSL walking, no
// duplicated hole-pattern enum case statements.

import type { PartDsl } from "./dsl";
import { flatPattern, type FlatPattern } from "./flatPattern";

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

export function generatePartDxf(dsl: PartDsl): string {
  return generatePartDxfFromPattern(flatPattern(dsl));
}

export function generatePartDxfFromPattern(pattern: FlatPattern): string {
  const buf: string[] = [];
  header(buf);
  tables(buf);

  line(buf, 0, "SECTION");
  line(buf, 2, "ENTITIES");

  // Outline on CUT layer
  if (pattern.circle) {
    emitCircle(buf, "CUT", pattern.circle.center.x, pattern.circle.center.y, pattern.circle.radius);
  } else if (pattern.outlineSegments.length >= 2) {
    const pts = pattern.outlineSegments;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      emitLine(buf, "CUT", a.x, a.y, b.x, b.y);
    }
  }

  // Holes on HOLE layer
  for (const h of pattern.holes) {
    emitCircle(buf, "HOLE", h.center.x, h.center.y, h.diameter / 2);
  }

  // Slots: stadium = 2 parallel LINEs + 2 cap CIRCLEs on CUT layer
  for (const s of pattern.slots) {
    const halfL = s.length / 2;
    const r = s.width / 2;
    emitLine(buf, "CUT", s.center.x - halfL, s.center.y - r, s.center.x + halfL, s.center.y - r);
    emitLine(buf, "CUT", s.center.x - halfL, s.center.y + r, s.center.x + halfL, s.center.y + r);
    emitCircle(buf, "CUT", s.center.x - halfL, s.center.y, r);
    emitCircle(buf, "CUT", s.center.x + halfL, s.center.y, r);
  }

  // Bend lines on BEND layer
  for (const b of pattern.bendTangents) {
    emitLine(buf, "BEND", b.start.x, b.start.y, b.end.x, b.end.y);
  }

  line(buf, 0, "ENDSEC");
  line(buf, 0, "EOF");

  return buf.join("\n") + "\n";
}
