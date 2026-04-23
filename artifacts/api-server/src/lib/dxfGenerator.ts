import type { PartDsl } from "./dsl";
import { legacyToDsl, type LegacyPartShape } from "./dsl";
import { buildFeatureGraph, type FeatureGraph, type GraphEdge } from "./featureGraph";

export interface FlatPreviewSpec extends LegacyPartShape {
  dsl?: PartDsl | null;
  featureGraph?: FeatureGraph | null;
}

const POWDER_COAT_HEX: Record<string, string> = {
  Black: "#1a1a1a",
  White: "#e8e8e8",
  Red: "#b3261e",
  Blue: "#1e4fb3",
  Green: "#2c7a3a",
  Yellow: "#d8b400",
  Orange: "#d35400",
  Gray: "#6b6f73",
  Silver: "#c0c4c9",
  Bronze: "#7a5a2c",
};

function lighten(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const r = Math.min(255, parseInt(m.substring(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(m.substring(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(m.substring(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function materialFillDef(spec: LegacyPartShape): { defs: string; fill: string; baseColor: string } {
  const material = spec.material ?? "";
  if (spec.powderCoat) {
    const color = POWDER_COAT_HEX[spec.powderCoatColor ?? "Black"] ?? POWDER_COAT_HEX.Black;
    const lighter = lighten(color, 25);
    return {
      defs: `<linearGradient id="matFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${lighter}"/>
        <stop offset="100%" stop-color="${color}"/>
      </linearGradient>`,
      fill: "url(#matFill)",
      baseColor: color,
    };
  }
  if (material.includes("Aluminum")) {
    return {
      defs: `<linearGradient id="matFill" x1="0" y1="0" x2="1" y2="0">
        ${Array.from({ length: 12 }, (_, i) => `<stop offset="${(i / 11) * 100}%" stop-color="${i % 2 ? "#c8ccd2" : "#9ea4ad"}"/>`).join("")}
      </linearGradient>`,
      fill: "url(#matFill)",
      baseColor: "#a9b0b8",
    };
  }
  if (material.includes("Stainless")) {
    return {
      defs: `<linearGradient id="matFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d4dae0"/>
        <stop offset="50%" stop-color="#9ba3ad"/>
        <stop offset="100%" stop-color="#c4cad1"/>
      </linearGradient>`,
      fill: "url(#matFill)",
      baseColor: "#bac2cc",
    };
  }
  if (material.includes("Galvanized")) {
    return {
      defs: `<pattern id="matFill" patternUnits="userSpaceOnUse" width="14" height="14">
        <rect width="14" height="14" fill="#a8aab0"/>
        <path d="M0 0 L14 14 M-3 11 L3 17 M11 -3 L17 3" stroke="#7d8087" stroke-width="0.6" opacity="0.6"/>
        <circle cx="3" cy="9" r="1.2" fill="#888c92" opacity="0.5"/>
        <circle cx="11" cy="4" r="1.5" fill="#bcbec4" opacity="0.5"/>
      </pattern>`,
      fill: "url(#matFill)",
      baseColor: "#a8aab0",
    };
  }
  if (material.includes("Copper")) {
    return {
      defs: `<linearGradient id="matFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d98c5b"/>
        <stop offset="100%" stop-color="#a85a2e"/>
      </linearGradient>`,
      fill: "url(#matFill)",
      baseColor: "#b9682f",
    };
  }
  if (material.includes("Brass")) {
    return {
      defs: `<linearGradient id="matFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d4b85c"/>
        <stop offset="100%" stop-color="#937a30"/>
      </linearGradient>`,
      fill: "url(#matFill)",
      baseColor: "#a9923f",
    };
  }
  return {
    defs: `<linearGradient id="matFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7a7d82"/>
      <stop offset="100%" stop-color="#525559"/>
    </linearGradient>
    <pattern id="matOverlay" patternUnits="userSpaceOnUse" width="40" height="40">
      <path d="M0 20 Q10 18 20 20 T40 20" stroke="#3a3c3f" stroke-width="0.4" fill="none" opacity="0.4"/>
    </pattern>`,
    fill: "url(#matFill)",
    baseColor: "#5e6166",
  };
}

function ensureGraph(spec: FlatPreviewSpec): { dsl: PartDsl; graph: FeatureGraph } {
  const dsl = spec.dsl ?? legacyToDsl(spec);
  const graph = spec.featureGraph ?? buildFeatureGraph(dsl);
  return { dsl, graph };
}

function escXml(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateSvgPreview(spec: FlatPreviewSpec): string {
  const { dsl, graph } = ensureGraph(spec);
  const w = graph.bbox.width;
  const h = graph.bbox.height;

  const scale = 40;
  const padX = 90;
  const padY = 90;
  const svgWidth = Math.max(w * scale + padX * 2 + 60, 480);
  const svgHeight = Math.max(h * scale + padY * 2 + 100, 320);
  const offsetX = padX;
  const offsetY = padY;

  const toSvgX = (x: number) => offsetX + x * scale;
  const toSvgY = (y: number) => offsetY + y * scale;

  const { defs, fill, baseColor } = materialFillDef(spec);

  const overlay = (spec.material ?? "").includes("Mild Steel") && !spec.powderCoat
    ? `<rect x="${offsetX}" y="${offsetY}" width="${w * scale}" height="${h * scale}" fill="url(#matOverlay)"/>`
    : "";

  const cutEdges: string[] = [];
  const bendEdges: string[] = [];
  const holeMarks: string[] = [];
  const slotEdges: string[] = [];

  for (const e of graph.edges) {
    if (e.type === "cut") {
      const [a, b] = e.points;
      cutEdges.push(
        `<line data-edge="${escXml(e.id)}" data-vars="${escXml(e.matched_parameters.join(","))}" x1="${toSvgX(a.x)}" y1="${toSvgY(a.y)}" x2="${toSvgX(b.x)}" y2="${toSvgY(b.y)}" stroke="#3a6ea5" stroke-width="1.6"/>`,
      );
    } else if (e.type === "bend") {
      const [a, b] = e.points;
      bendEdges.push(
        `<line data-edge="${escXml(e.id)}" data-vars="${escXml(e.matched_parameters.join(","))}" x1="${toSvgX(a.x)}" y1="${toSvgY(a.y)}" x2="${toSvgX(b.x)}" y2="${toSvgY(b.y)}" stroke="#f90" stroke-width="1.4" stroke-dasharray="6,3"/>`,
      );
    } else if (e.type === "hole") {
      const p = e.points[0];
      const r = ((e.metadata?.diameter as number | undefined) ?? 0.25) / 2 * scale;
      holeMarks.push(
        `<circle data-edge="${escXml(e.id)}" data-vars="${escXml(e.matched_parameters.join(","))}" cx="${toSvgX(p.x)}" cy="${toSvgY(p.y)}" r="${r}" fill="#0a0e14" stroke="#4af" stroke-width="1.2"/>`,
        `<line x1="${toSvgX(p.x) - r - 4}" y1="${toSvgY(p.y)}" x2="${toSvgX(p.x) + r + 4}" y2="${toSvgY(p.y)}" stroke="#4af" stroke-width="0.5" opacity="0.6"/>`,
        `<line x1="${toSvgX(p.x)}" y1="${toSvgY(p.y) - r - 4}" x2="${toSvgX(p.x)}" y2="${toSvgY(p.y) + r + 4}" stroke="#4af" stroke-width="0.5" opacity="0.6"/>`,
      );
    } else if (e.type === "slot") {
      const d = e.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${toSvgX(p.x)},${toSvgY(p.y)}`)
        .join(" ");
      slotEdges.push(
        `<path data-edge="${escXml(e.id)}" data-vars="${escXml(e.matched_parameters.join(","))}" d="${d}" fill="none" stroke="#4af" stroke-width="1.2"/>`,
      );
    }
  }

  // Dimension lines: width below, height left
  const dimLines: string[] = [];
  dimLines.push(
    `<line x1="${offsetX}" y1="${offsetY + h * scale + 26}" x2="${offsetX + w * scale}" y2="${offsetY + h * scale + 26}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<line x1="${offsetX}" y1="${offsetY + h * scale + 20}" x2="${offsetX}" y2="${offsetY + h * scale + 32}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<line x1="${offsetX + w * scale}" y1="${offsetY + h * scale + 20}" x2="${offsetX + w * scale}" y2="${offsetY + h * scale + 32}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<text data-var="width" x="${offsetX + w * scale / 2}" y="${offsetY + h * scale + 44}" fill="#e1e4e8" font-size="11" text-anchor="middle" font-family="monospace">WIDTH = ${w}"</text>`,
  );
  dimLines.push(
    `<line x1="${offsetX - 26}" y1="${offsetY}" x2="${offsetX - 26}" y2="${offsetY + h * scale}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<line x1="${offsetX - 32}" y1="${offsetY}" x2="${offsetX - 20}" y2="${offsetY}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<line x1="${offsetX - 32}" y1="${offsetY + h * scale}" x2="${offsetX - 20}" y2="${offsetY + h * scale}" stroke="#cfd3d8" stroke-width="0.8"/>`,
    `<text data-var="height" x="${offsetX - 38}" y="${offsetY + h * scale / 2}" fill="#e1e4e8" font-size="11" text-anchor="middle" transform="rotate(-90, ${offsetX - 38}, ${offsetY + h * scale / 2})" font-family="monospace">HEIGHT = ${h}"</text>`,
  );

  // Callouts from feature graph (holes, bends, slots, fillets)
  const calloutTexts: string[] = [];
  for (const a of graph.annotations) {
    if (a.type !== "callout") continue;
    calloutTexts.push(
      `<text data-var="${escXml(a.variableName ?? "")}" x="${offsetX + w * scale + 8}" y="${toSvgY(0) + calloutTexts.length * 14 + 12}" fill="#4af" font-size="10" font-family="monospace">${escXml(a.text)}</text>`,
    );
  }

  const titleBlock = `<text x="${svgWidth / 2}" y="22" fill="#9da4ad" font-size="11" text-anchor="middle" font-family="monospace">${escXml(dsl.partType.toUpperCase())} — ${escXml(dsl.material.toUpperCase())} @ ${escXml(dsl.thickness)}"</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background:#0a0e14">
  <defs>${defs}</defs>
  <rect x="${offsetX}" y="${offsetY}" width="${w * scale}" height="${h * scale}" fill="${fill}" stroke="${baseColor}" stroke-width="1"/>
  ${overlay}
  ${cutEdges.join("\n  ")}
  ${bendEdges.join("\n  ")}
  ${slotEdges.join("\n  ")}
  ${holeMarks.join("\n  ")}
  ${dimLines.join("\n  ")}
  ${calloutTexts.join("\n  ")}
  ${titleBlock}
</svg>`;
}

export interface DxfMeta {
  projectName?: string;
  revisionNumber?: number;
}

export interface DxfOptions {
  /** Emit dimension lines, callouts, title block, and notes as TEXT entities. Default true. */
  includeAnnotations?: boolean;
  /** Emit a small layer/color legend so the recipient can decode the file. Default false. */
  includeLegend?: boolean;
}

// Sanitize a string for DXF text fields. DXF text uses ASCII-ish encoding;
// non-printable / non-ASCII characters can crash strict translators.
function dxfSafeText(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f-\uffff]/g, "?")
    .replace(/\n|\r/g, " ")
    .substring(0, 250);
}

// DXF group codes are emitted as: <code>\n<value>\n  (LF terminators).
// We build the output as an array of "code\nvalue" pairs joined by \n, and
// terminate the file with a final newline. AC1009 (AutoCAD R12) is by far
// the most permissive and widely-supported DXF flavor for laser-cutting
// translators (Send Cut Send, OMAX, etc).
export function generateDxf(
  spec: FlatPreviewSpec,
  meta: DxfMeta = {},
  opts: DxfOptions = {},
): string {
  const { dsl, graph } = ensureGraph(spec);
  const includeAnnotations = opts.includeAnnotations ?? true;
  const includeLegend = opts.includeLegend ?? false;

  // --- ENTITIES ----------------------------------------------------------
  const entities: string[] = [];

  const addLine = (x1: number, y1: number, x2: number, y2: number, layer = "CUT") => {
    entities.push(
      "0", "LINE",
      "8", layer,
      "10", x1.toFixed(6),
      "20", y1.toFixed(6),
      "30", "0.0",
      "11", x2.toFixed(6),
      "21", y2.toFixed(6),
      "31", "0.0",
    );
  };

  const addCircle = (cx: number, cy: number, r: number, layer = "CUT") => {
    entities.push(
      "0", "CIRCLE",
      "8", layer,
      "10", cx.toFixed(6),
      "20", cy.toFixed(6),
      "30", "0.0",
      "40", r.toFixed(6),
    );
  };

  const addText = (x: number, y: number, h: number, text: string, layer = "DIMENSION") => {
    entities.push(
      "0", "TEXT",
      "8", layer,
      "10", x.toFixed(6),
      "20", y.toFixed(6),
      "30", "0.0",
      "40", h.toFixed(6),
      "1", dxfSafeText(text),
      "7", "STANDARD",
    );
  };

  const layerForEdge = (e: GraphEdge): string => {
    if (e.type === "bend") return "BEND";
    return "CUT";
  };

  // Compute extents while we emit entities.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of graph.edges) {
    const layer = layerForEdge(e);
    if (e.type === "hole") {
      const p = e.points[0];
      const d = (e.metadata?.diameter as number | undefined) ?? 0.25;
      addCircle(p.x, p.y, d / 2, layer);
      grow(p.x - d / 2, p.y - d / 2);
      grow(p.x + d / 2, p.y + d / 2);
    } else if (e.type === "slot") {
      for (let i = 0; i < e.points.length - 1; i++) {
        const a = e.points[i];
        const b = e.points[i + 1];
        addLine(a.x, a.y, b.x, b.y, layer);
        grow(a.x, a.y);
        grow(b.x, b.y);
      }
    } else {
      const [a, b] = e.points;
      addLine(a.x, a.y, b.x, b.y, layer);
      grow(a.x, a.y);
      grow(b.x, b.y);
    }
  }

  if (includeAnnotations) {
    for (const a of graph.annotations) {
      let layer = "DIMENSION";
      let height = 0.14;
      if (a.type === "callout") {
        layer = "HOLE_CALLOUT";
        height = 0.12;
      } else if (a.type === "title") {
        layer = "TITLE_BLOCK";
        height = 0.14;
      } else if (a.type === "notes") {
        layer = "NOTES";
        height = 0.12;
      }
      addText(a.position.x, a.position.y, height, a.text, layer);
    }

    const project = dxfSafeText((meta.projectName ?? "PROJECT").substring(0, 60));
    const rev = meta.revisionNumber ? ` REV ${meta.revisionNumber}` : "";
    const tbY = graph.bbox.height + 1.4;
    addText(0, tbY, 0.16, `PROJECT = ${project}${rev}`, "TITLE_BLOCK");
    addText(0, tbY + 0.25, 0.12, `UNITS = INCHES - GENERATED BY FABWARE`, "TITLE_BLOCK");

    const notesX = graph.bbox.width + 0.2;
    addText(notesX, graph.bbox.height - 0.1, 0.12, "ALL DIMENSIONS IN INCHES", "NOTES");
    addText(notesX, graph.bbox.height - 0.3, 0.12, "BREAK ALL SHARP EDGES", "NOTES");
    if (graph.edges.some((e) => e.type === "bend")) {
      addText(notesX, graph.bbox.height - 0.5, 0.12, "BEND TOLERANCE +/- 1 DEG", "NOTES");
    }
  }

  if (includeLegend) {
    // Layer legend so the recipient can decode color → meaning at a glance.
    // Placed below the part with a small leader. Each entry is on its own
    // layer so its color is the same color the cutter will see for that role.
    const legendX = 0;
    const legendY = -0.6;
    const lh = 0.18;
    const legendEntries: Array<{ text: string; layer: string }> = [
      { text: "LEGEND:", layer: "TITLE_BLOCK" },
      { text: "  WHITE = CUT (outer profile, holes, slots)", layer: "CUT" },
      { text: "  RED   = BEND (fold lines, do not cut)",     layer: "BEND" },
    ];
    if (includeAnnotations) {
      legendEntries.push(
        { text: "  GREEN = DIMENSION (reference only)", layer: "DIMENSION" },
        { text: "  BLUE  = HOLE / FEATURE CALLOUT",     layer: "HOLE_CALLOUT" },
        { text: "  CYAN  = TITLE BLOCK / META",         layer: "TITLE_BLOCK" },
        { text: "  GRAY  = NOTES",                       layer: "NOTES" },
      );
    }
    legendEntries.forEach((entry, i) => {
      addText(legendX, legendY - i * lh, 0.13, entry.text, entry.layer);
    });
  }

  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = graph.bbox.width; maxY = graph.bbox.height; }

  // --- HEADER ------------------------------------------------------------
  // Minimal R12 header + drawing extents. $INSUNITS = 1 means inches.
  const header: string[] = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",   "1", "AC1009",
    "9", "$INSUNITS",  "70", "1",
    "9", "$MEASUREMENT", "70", "0",
    "9", "$EXTMIN",    "10", minX.toFixed(6), "20", minY.toFixed(6), "30", "0.0",
    "9", "$EXTMAX",    "10", maxX.toFixed(6), "20", maxY.toFixed(6), "30", "0.0",
    "9", "$LIMMIN",    "10", minX.toFixed(6), "20", minY.toFixed(6),
    "9", "$LIMMAX",    "10", maxX.toFixed(6), "20", maxY.toFixed(6),
    "0", "ENDSEC",
  ];

  // --- TABLES ------------------------------------------------------------
  // R12 requires LTYPE, LAYER, and STYLE tables to be defined before use.
  // Each TABLE block needs an accurate "70" count of entries inside it.
  const layers: { name: string; color: number; ltype: string }[] = [
    { name: "0",             color: 7, ltype: "CONTINUOUS" }, // mandatory default layer
    { name: "CUT",           color: 7, ltype: "CONTINUOUS" },
    { name: "BEND",          color: 1, ltype: "DASHED" },
    { name: "DIMENSION",     color: 3, ltype: "CONTINUOUS" },
    { name: "HOLE_CALLOUT",  color: 5, ltype: "CONTINUOUS" },
    { name: "BEND_LABEL",    color: 2, ltype: "CONTINUOUS" },
    { name: "TITLE_BLOCK",   color: 4, ltype: "CONTINUOUS" },
    { name: "NOTES",         color: 8, ltype: "CONTINUOUS" },
  ];

  const tables: string[] = [
    "0", "SECTION",
    "2", "TABLES",

    // LTYPE table
    "0", "TABLE",
    "2", "LTYPE",
    "70", "2",
    // CONTINUOUS
    "0", "LTYPE",
    "2", "CONTINUOUS",
    "70", "0",
    "3", "Solid line",
    "72", "65",
    "73", "0",
    "40", "0.0",
    // DASHED
    "0", "LTYPE",
    "2", "DASHED",
    "70", "0",
    "3", "Dashed __ __ __ __",
    "72", "65",
    "73", "2",
    "40", "0.75",
    "49", "0.5",
    "49", "-0.25",
    "0", "ENDTAB",

    // LAYER table
    "0", "TABLE",
    "2", "LAYER",
    "70", String(layers.length),
    ...layers.flatMap((l) => [
      "0", "LAYER",
      "2", l.name,
      "70", "0",
      "62", String(l.color),
      "6", l.ltype,
    ]),
    "0", "ENDTAB",

    // STYLE table — TEXT entities reference STANDARD
    "0", "TABLE",
    "2", "STYLE",
    "70", "1",
    "0", "STYLE",
    "2", "STANDARD",
    "70", "0",
    "40", "0.0",
    "41", "1.0",
    "50", "0.0",
    "71", "0",
    "42", "0.2",
    "3", "txt",
    "4", "",
    "0", "ENDTAB",

    "0", "ENDSEC",
  ];

  // Empty BLOCKS section (R12 requires it to be present).
  const blocks: string[] = [
    "0", "SECTION",
    "2", "BLOCKS",
    "0", "ENDSEC",
  ];

  const entitiesSection: string[] = [
    "0", "SECTION",
    "2", "ENTITIES",
    ...entities,
    "0", "ENDSEC",
  ];

  const footer: string[] = ["0", "EOF"];

  // DXF parsers expect each group code and value on its own line, and the
  // file should end with a newline. CRLF is also widely accepted; LF is fine.
  return [...header, ...tables, ...blocks, ...entitiesSection, ...footer].join("\n") + "\n";
}

// Re-export for compatibility with existing imports
export type { PartDsl };
