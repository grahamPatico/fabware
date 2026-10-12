// A starter KiCad board for the PCB stage: the outline, the mounting holes
// and a title block, ready to open in KiCad 7 or later and lay out on.
// Pure string building. Positions are millimetres; KiCad's Y axis points
// down, which matches the stage's "from the top edge" hole coordinates.

import type { PcbBoard } from "./journey";

// Where the board's top-left corner sits on the A4 sheet.
const ORIGIN_X_MM = 100;
const ORIGIN_Y_MM = 100;
const EDGE_WIDTH_MM = 0.1;
// KiCad 7.0 board format. Later versions open it and upgrade on save.
const FILE_VERSION = 20221018;

/** A coordinate as KiCad writes it: up to 4 decimals, no trailing zeros. */
function n(value: number): string {
  const s = value.toFixed(4).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function quote(value: string): string {
  return `"${value.replace(/[\r\n\t]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function layerTable(layers: 2 | 4): string[] {
  const copper = layers === 4
    ? ['(0 "F.Cu" signal)', '(1 "In1.Cu" signal)', '(2 "In2.Cu" signal)', '(31 "B.Cu" signal)']
    : ['(0 "F.Cu" signal)', '(31 "B.Cu" signal)'];
  return [
    ...copper,
    '(32 "B.Adhes" user "B.Adhesive")',
    '(33 "F.Adhes" user "F.Adhesive")',
    '(34 "B.Paste" user)',
    '(35 "F.Paste" user)',
    '(36 "B.SilkS" user "B.Silkscreen")',
    '(37 "F.SilkS" user "F.Silkscreen")',
    '(38 "B.Mask" user)',
    '(39 "F.Mask" user)',
    '(40 "Dwgs.User" user "User.Drawings")',
    '(41 "Cmts.User" user "User.Comments")',
    '(44 "Edge.Cuts" user)',
    '(45 "Margin" user)',
    '(46 "B.CrtYd" user "B.Courtyard")',
    '(47 "F.CrtYd" user "F.Courtyard")',
    '(48 "B.Fab" user)',
    '(49 "F.Fab" user)',
  ];
}

const STROKE = `(stroke (width ${n(EDGE_WIDTH_MM)}) (type solid))`;

function edgeLine(x1: number, y1: number, x2: number, y2: number): string | null {
  // A corner radius of half the side leaves no straight run on that side.
  if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) return null;
  return `(gr_line (start ${n(x1)} ${n(y1)}) (end ${n(x2)} ${n(y2)}) ${STROKE} (layer "Edge.Cuts"))`;
}

/** A quarter-circle corner around (cx, cy) from angle `from` to `from + 90`, in degrees, Y down. */
function edgeArc(cx: number, cy: number, r: number, from: number): string {
  const at = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${n(cx + r * Math.cos(rad))} ${n(cy + r * Math.sin(rad))}`;
  };
  return `(gr_arc (start ${at(from)}) (mid ${at(from + 45)}) (end ${at(from + 90)}) ${STROKE} (layer "Edge.Cuts"))`;
}

/** The outline as Edge.Cuts segments, clockwise from the top edge. */
export function outlineSegments(board: Pick<PcbBoard, "widthMm" | "heightMm" | "cornerRadiusMm">): string[] {
  const x0 = ORIGIN_X_MM;
  const y0 = ORIGIN_Y_MM;
  const x1 = x0 + board.widthMm;
  const y1 = y0 + board.heightMm;
  const r = Math.max(0, Math.min(board.cornerRadiusMm, board.widthMm / 2, board.heightMm / 2));
  const lines = [
    edgeLine(x0 + r, y0, x1 - r, y0),
    edgeLine(x1, y0 + r, x1, y1 - r),
    edgeLine(x1 - r, y1, x0 + r, y1),
    edgeLine(x0, y1 - r, x0, y0 + r),
  ].filter((s): s is string => s !== null);
  if (r <= 0) return lines;
  return [
    ...lines,
    edgeArc(x1 - r, y0 + r, r, -90), // top right
    edgeArc(x1 - r, y1 - r, r, 0),   // bottom right
    edgeArc(x0 + r, y1 - r, r, 90),  // bottom left
    edgeArc(x0 + r, y0 + r, r, 180), // top left
  ];
}

function mountingHole(index: number, hole: PcbBoard["mountingHoles"][number]): string {
  const d = n(hole.diameterMm);
  const labelOffset = hole.diameterMm / 2 + 1.2;
  const font = "(effects (font (size 1 1) (thickness 0.15)))";
  return [
    `  (footprint "fabware:MountingHole_${d}mm" (layer "F.Cu")`,
    `    (at ${n(ORIGIN_X_MM + hole.xMm)} ${n(ORIGIN_Y_MM + hole.yMm)})`,
    `    (descr ${quote(`Mounting hole, ${d} mm, not plated`)})`,
    "    (attr exclude_from_pos_files exclude_from_bom)",
    `    (fp_text reference "H${index + 1}" (at 0 ${n(-labelOffset)}) (layer "F.SilkS") ${font})`,
    `    (fp_text value "MountingHole" (at 0 ${n(labelOffset)}) (layer "F.Fab") ${font})`,
    // Not plated: a hole for a screw, with no copper and no net.
    `    (pad "" np_thru_hole circle (at 0 0) (size ${d} ${d}) (drill ${d}) (layers "*.Cu" "*.Mask"))`,
    "  )",
  ].join("\n");
}

/**
 * A minimal `.kicad_pcb`: layer stack for 2 or 4 copper layers, the outline
 * on Edge.Cuts (rounded when the board has a corner radius), one unplated
 * footprint per mounting hole, and a title block.
 */
export function boardOutlineKicadPcb(board: PcbBoard, title: string): string {
  const layers: 2 | 4 = board.layers === 4 ? 4 : 2;
  const size = `${n(board.widthMm)} x ${n(board.heightMm)} mm, ${layers} layers, ${n(board.thicknessMm)} mm thick`;
  return [
    `(kicad_pcb (version ${FILE_VERSION}) (generator "fabware")`,
    `  (general (thickness ${n(board.thicknessMm)}))`,
    '  (paper "A4")',
    "  (title_block",
    `    (title ${quote(title.trim() || "Board")})`,
    '    (rev "A")',
    `    (comment 1 ${quote(`Starter outline from fabware: ${size}.`)})`,
    `    (comment 2 ${quote(board.outlineBasis.trim().slice(0, 200) || "Check the outline against your enclosure before layout.")})`,
    "  )",
    "  (layers",
    ...layerTable(layers).map((l) => `    ${l}`),
    "  )",
    "  (setup (pad_to_mask_clearance 0))",
    '  (net 0 "")',
    ...board.mountingHoles.map((hole, i) => mountingHole(i, hole)),
    ...outlineSegments(board).map((s) => `  ${s}`),
    ")",
    "",
  ].join("\n");
}

/** A safe file name for the starter board. */
export function kicadFilename(projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${slug || "board"}-outline.kicad_pcb`;
}
