// Minimal hand-rolled PDF 1.4 emitter for sheet-metal flat-pattern shop
// drawings. One page (US Letter, 612×792 pt), single-stroke vector content.
//
// We render:
//   - the part outline as a closed polyline / Bezier circle
//   - every hole as a small circle
//   - a title block in the top-left with role, label, material, thickness,
//     W × H, and a "Drawing not to scale" caveat
//   - bounding-box dimension callouts (width along bottom, height along left)
//
// All geometry comes from the FlatPattern module — no DSL walking,
// no duplicated outline / hole-pattern case statements.

import type { PartDsl } from "./dsl";
import { estimatePartWeight } from "./weight";
import { flatPattern, type FlatPattern } from "./flatPattern";

interface DrawCtx {
  pageW: number;
  pageH: number;
  scale: number;
  ox: number;
  oy: number;
}

function inToPt(v: number, scale: number): number { return v * scale; }

function bezierCircle(cx: number, cy: number, r: number): string {
  const k = 0.5522847498 * r;
  const x = cx, y = cy;
  return [
    `${(x + r).toFixed(3)} ${y.toFixed(3)} m`,
    `${(x + r).toFixed(3)} ${(y + k).toFixed(3)} ${(x + k).toFixed(3)} ${(y + r).toFixed(3)} ${x.toFixed(3)} ${(y + r).toFixed(3)} c`,
    `${(x - k).toFixed(3)} ${(y + r).toFixed(3)} ${(x - r).toFixed(3)} ${(y + k).toFixed(3)} ${(x - r).toFixed(3)} ${y.toFixed(3)} c`,
    `${(x - r).toFixed(3)} ${(y - k).toFixed(3)} ${(x - k).toFixed(3)} ${(y - r).toFixed(3)} ${x.toFixed(3)} ${(y - r).toFixed(3)} c`,
    `${(x + k).toFixed(3)} ${(y - r).toFixed(3)} ${(x + r).toFixed(3)} ${(y - k).toFixed(3)} ${(x + r).toFixed(3)} ${y.toFixed(3)} c`,
    "S",
  ].join("\n");
}

export function generatePartPdf(dsl: PartDsl, partLabel: string, partRole: string): Uint8Array {
  return generatePartPdfFromPattern(flatPattern(dsl), dsl, partLabel, partRole);
}

export function generatePartPdfFromPattern(pattern: FlatPattern, dsl: PartDsl, partLabel: string, partRole: string): Uint8Array {
  const ctx: DrawCtx = { pageW: 612, pageH: 792, scale: 1, ox: 0, oy: 0 };

  const drawAreaW = 480;
  const drawAreaH = 500;
  const marginX = 60;
  const marginY = 60;
  const w = pattern.width;
  const h = pattern.height;
  const fitScale = Math.min(drawAreaW / w, drawAreaH / h) * 0.92;
  ctx.scale = fitScale;
  ctx.ox = marginX + (drawAreaW - w * ctx.scale) / 2;
  ctx.oy = marginY + (drawAreaH - h * ctx.scale) / 2;

  const ops: string[] = [];

  // Outline
  ops.push("0.5 w");
  if (pattern.circle) {
    ops.push(bezierCircle(
      ctx.ox + inToPt(pattern.circle.center.x, ctx.scale),
      ctx.oy + inToPt(pattern.circle.center.y, ctx.scale),
      inToPt(pattern.circle.radius, ctx.scale),
    ));
  } else if (pattern.outlineSegments.length >= 2) {
    const pts = pattern.outlineSegments;
    ops.push(`${(ctx.ox + inToPt(pts[0].x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(pts[0].y, ctx.scale)).toFixed(3)} m`);
    for (let i = 1; i < pts.length; i++) {
      ops.push(`${(ctx.ox + inToPt(pts[i].x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(pts[i].y, ctx.scale)).toFixed(3)} l`);
    }
    ops.push("h S");
  }

  // Holes
  ops.push("0.4 w");
  for (const hole of pattern.holes) {
    ops.push(bezierCircle(
      ctx.ox + inToPt(hole.center.x, ctx.scale),
      ctx.oy + inToPt(hole.center.y, ctx.scale),
      inToPt(hole.diameter / 2, ctx.scale),
    ));
  }

  // Bend lines (dashed)
  ops.push("[3 2] 0 d");
  for (const b of pattern.bendTangents) {
    ops.push(`${(ctx.ox + inToPt(b.start.x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(b.start.y, ctx.scale)).toFixed(3)} m`);
    ops.push(`${(ctx.ox + inToPt(b.end.x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(b.end.y, ctx.scale)).toFixed(3)} l S`);
  }
  ops.push("[] 0 d");

  // Dimension callouts
  const dimY = ctx.oy - 14;
  ops.push("0.3 w");
  ops.push(`${ctx.ox.toFixed(3)} ${dimY.toFixed(3)} m ${(ctx.ox + inToPt(w, ctx.scale)).toFixed(3)} ${dimY.toFixed(3)} l S`);
  const dimX = ctx.ox - 14;
  ops.push(`${dimX.toFixed(3)} ${ctx.oy.toFixed(3)} m ${dimX.toFixed(3)} ${(ctx.oy + inToPt(h, ctx.scale)).toFixed(3)} l S`);

  // Title block (top-left)
  const w8 = (s: string) => s.replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\\/g, "\\\\");
  const wt = estimatePartWeight(dsl);
  const title = [
    `${partLabel} (${partRole})`,
    `${dsl.material} - ${dsl.thickness}"`,
    `${w.toFixed(3)}" x ${h.toFixed(3)}"`,
    `Estimated weight: ${wt.pounds.toFixed(2)} lb`,
    `Drawing not to scale - flat pattern`,
  ];
  ops.push("BT");
  ops.push("/F1 11 Tf");
  ops.push(`60 760 Td`);
  ops.push(`(${w8(title[0])}) Tj`);
  for (let i = 1; i < title.length; i++) {
    ops.push(`0 -14 Td (${w8(title[i])}) Tj`);
  }
  ops.push("ET");

  // dimension labels
  ops.push("BT");
  ops.push("/F1 8 Tf");
  ops.push(`${(ctx.ox + inToPt(w / 2, ctx.scale) - 16).toFixed(3)} ${(dimY - 12).toFixed(3)} Td (${w}") Tj`);
  ops.push("ET");
  ops.push("BT");
  ops.push("/F1 8 Tf");
  ops.push(`${(dimX - 28).toFixed(3)} ${(ctx.oy + inToPt(h / 2, ctx.scale)).toFixed(3)} Td (${h}") Tj`);
  ops.push("ET");

  const stream = ops.join("\n") + "\n";

  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ctx.pageW} ${ctx.pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];

  const header = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  const body: string[] = [header];
  const offsets: number[] = [0];
  let currentOffset = encUtf8(header).length;
  objs.forEach((o, i) => {
    offsets.push(currentOffset);
    const bytes = `${i + 1} 0 obj\n${o}\nendobj\n`;
    body.push(bytes);
    currentOffset += encUtf8(bytes).length;
  });
  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  body.push(xref);

  return encUtf8(body.join(""));
}

function encUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
