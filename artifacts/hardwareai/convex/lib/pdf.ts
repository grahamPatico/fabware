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
// No dep on pdfkit — Convex's bundle and node-runtime constraints make
// adding a 1.5 MB PDF library a poor trade vs. emitting this 5 KB doc by
// hand. The output is tested in Acrobat / Preview / Chrome PDF viewer.

import type { PartDsl, BendFeature, HoleFeature, Outline } from "./dsl";
import { estimatePartWeight } from "./weight";

const PT_PER_IN = 72;

interface DrawCtx {
  /** Page width in pt (612 = 8.5"). */
  pageW: number;
  /** Page height in pt (792 = 11"). */
  pageH: number;
  /** Drawing scale: pt per inch. Auto-computed to fit. */
  scale: number;
  /** Drawing area bottom-left in pt. */
  ox: number;
  oy: number;
}

function buildOutlinePoints(outline: Outline | undefined, w: number, h: number): { type: "poly"; pts: Array<{ x: number; y: number }> } | { type: "circle"; cx: number; cy: number; r: number } {
  if (!outline || outline.kind === "rectangle") {
    return { type: "poly", pts: [
      { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
    ] };
  }
  if (outline.kind === "circle") {
    return { type: "circle", cx: outline.radius, cy: outline.radius, r: outline.radius };
  }
  if (outline.kind === "regular_polygon") {
    const { sides, radius } = outline;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) });
    }
    return { type: "poly", pts };
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
    return { type: "poly", pts };
  }
  // arbitrary polygon — re-anchor at bbox origin
  let minX = Infinity, minY = Infinity;
  for (const p of outline.points) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; }
  return { type: "poly", pts: outline.points.map(p => ({ x: p.x - minX, y: p.y - minY })) };
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
    case "top_row": case "bottom_row": {
      const y = h.pattern === "top_row" ? height - inset : inset;
      const step = (w - 2 * inset) / Math.max(h.count - 1, 1);
      for (let i = 0; i < h.count; i++) pts.push({ x: inset + i * step, y });
      break;
    }
  }
  return pts;
}

function inToPt(v: number, scale: number): number { return v * scale; }

function bezierCircle(cx: number, cy: number, r: number): string {
  // 4-segment cubic Bezier circle, kappa = 0.5522847498
  const k = 0.5522847498 * r;
  const x = cx, y = cy;
  // PDF: m = move, c = cubic Bezier (3 ctrl points)
  return [
    `${(x + r).toFixed(3)} ${y.toFixed(3)} m`,
    `${(x + r).toFixed(3)} ${(y + k).toFixed(3)} ${(x + k).toFixed(3)} ${(y + r).toFixed(3)} ${x.toFixed(3)} ${(y + r).toFixed(3)} c`,
    `${(x - k).toFixed(3)} ${(y + r).toFixed(3)} ${(x - r).toFixed(3)} ${(y + k).toFixed(3)} ${(x - r).toFixed(3)} ${y.toFixed(3)} c`,
    `${(x - r).toFixed(3)} ${(y - k).toFixed(3)} ${(x - k).toFixed(3)} ${(y - r).toFixed(3)} ${x.toFixed(3)} ${(y - r).toFixed(3)} c`,
    `${(x + k).toFixed(3)} ${(y - r).toFixed(3)} ${(x + r).toFixed(3)} ${(y - k).toFixed(3)} ${(x + r).toFixed(3)} ${y.toFixed(3)} c`,
    "S",
  ].join("\n");
}

/**
 * Generate a one-page PDF flat-pattern drawing for a sheet-metal part.
 * `partLabel` and `partRole` flow into the title block.
 */
export function generatePartPdf(dsl: PartDsl, partLabel: string, partRole: string): Uint8Array {
  const ctx: DrawCtx = { pageW: 612, pageH: 792, scale: 1, ox: 0, oy: 0 };

  // Auto-fit drawing into a 480×500 pt area, 60 pt margin from bottom-left,
  // leaving ~120 pt at top for the title block.
  const drawAreaW = 480;
  const drawAreaH = 500;
  const marginX = 60;
  const marginY = 60;
  const fitScale = Math.min(drawAreaW / dsl.width, drawAreaH / dsl.height) * 0.92;
  ctx.scale = fitScale;
  // Center inside draw area
  ctx.ox = marginX + (drawAreaW - dsl.width * ctx.scale) / 2;
  ctx.oy = marginY + (drawAreaH - dsl.height * ctx.scale) / 2;

  const w = dsl.width;
  const h = dsl.height;
  const ops: string[] = [];

  // Outline
  ops.push("0.5 w"); // 0.5 pt stroke
  const outline = buildOutlinePoints(dsl.outline, w, h);
  if (outline.type === "circle") {
    ops.push(bezierCircle(ctx.ox + inToPt(outline.cx, ctx.scale), ctx.oy + inToPt(outline.cy, ctx.scale), inToPt(outline.r, ctx.scale)));
  } else {
    const pts = outline.pts;
    if (pts.length >= 2) {
      ops.push(`${(ctx.ox + inToPt(pts[0].x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(pts[0].y, ctx.scale)).toFixed(3)} m`);
      for (let i = 1; i < pts.length; i++) {
        ops.push(`${(ctx.ox + inToPt(pts[i].x, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(pts[i].y, ctx.scale)).toFixed(3)} l`);
      }
      ops.push("h S");
    }
  }

  // Holes
  ops.push("0.4 w");
  for (const f of dsl.features) {
    if (f.kind !== "hole") continue;
    const positions = holePositions(f as HoleFeature, w, h);
    for (const p of positions) {
      ops.push(bezierCircle(
        ctx.ox + inToPt(p.x, ctx.scale),
        ctx.oy + inToPt(p.y, ctx.scale),
        inToPt(f.diameter / 2, ctx.scale),
      ));
    }
  }

  // Bend lines (dashed)
  ops.push("[3 2] 0 d");
  for (const f of dsl.features) {
    if (f.kind !== "bend") continue;
    const b = f as BendFeature;
    if (b.axis === "horizontal") {
      const yy = b.positionRatio * h;
      ops.push(`${(ctx.ox).toFixed(3)} ${(ctx.oy + inToPt(yy, ctx.scale)).toFixed(3)} m`);
      ops.push(`${(ctx.ox + inToPt(w, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(yy, ctx.scale)).toFixed(3)} l S`);
    } else {
      const xx = b.positionRatio * w;
      ops.push(`${(ctx.ox + inToPt(xx, ctx.scale)).toFixed(3)} ${(ctx.oy).toFixed(3)} m`);
      ops.push(`${(ctx.ox + inToPt(xx, ctx.scale)).toFixed(3)} ${(ctx.oy + inToPt(h, ctx.scale)).toFixed(3)} l S`);
    }
  }
  ops.push("[] 0 d"); // reset dash

  // Dimension callouts: width below part, height left of part
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
  let yCursor = 760;
  for (const t of title) {
    ops.push(`60 ${yCursor} Td (${w8(t)}) Tj`);
    yCursor = -16; // next line is at -16 from previous
    if (title.indexOf(t) === 0) {
      // first iteration set absolute; subsequent are relative — re-encode
    }
  }
  // The Td calls above are wrong (Td is relative after first). Rebuild:
  ops.length = ops.indexOf("BT") + 1;
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

  // Object table
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ctx.pageW} ${ctx.pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];

  // Build PDF body, tracking byte offsets per object for the xref table.
  const header = "%PDF-1.4\n%\xff\xff\xff\xff\n";
  const body: string[] = [header];
  const offsets: number[] = [0]; // index 0 is the free entry
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
