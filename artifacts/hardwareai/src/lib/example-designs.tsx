// Canonical example designs used on the landing page demo carousel and the
// BackendPending "what it builds" section. Each entry is a self-contained
// sketch — prompt, spec, BOM, validation notes, partner handoff — so both
// surfaces can render a realistic-looking Fabware output without needing a
// live backend.

import React from "react";

export type ProcessId = "scs" | "fdm";

export interface ExampleDesign {
  id: string;
  partTitle: string;
  process: { id: ProcessId; label: string };
  prompt: string;
  spec: string[];
  bom: string[];
  validation: string[];
  handoff: string;
  preview: React.ReactNode;
}

const SHEET_FILL = "#1a2332";
const SHEET_STROKE = "#e55d21";
const BEND_DASH = "#f59e0b";

const LBracketPreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="30" width="160" height="80" rx="4" fill={SHEET_FILL} stroke={SHEET_STROKE} strokeWidth="1.5" />
    <line x1="20" y1="70" x2="180" y2="70" stroke={BEND_DASH} strokeWidth="1" strokeDasharray="4 3" />
    {[
      [35, 42],
      [165, 42],
      [35, 98],
      [165, 98],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="none" stroke={SHEET_STROKE} strokeWidth="1.4" />
    ))}
    <text x="100" y="68" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="7" fill={BEND_DASH}>
      90° BEND
    </text>
  </svg>
);

const VentPlatePreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="25" width="170" height="90" rx="3" fill={SHEET_FILL} stroke={SHEET_STROKE} strokeWidth="1.5" />
    {Array.from({ length: 4 }).flatMap((_, r) =>
      Array.from({ length: 6 }).map((__, c) => (
        <rect
          key={`slot-${r}-${c}`}
          x={35 + c * 22}
          y={40 + r * 15}
          width="14"
          height="3"
          rx="1.5"
          fill={SHEET_STROKE}
          fillOpacity="0.6"
        />
      )),
    )}
    {[
      [25, 35],
      [175, 35],
      [25, 105],
      [175, 105],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" fill="none" stroke={SHEET_STROKE} strokeWidth="1" />
    ))}
  </svg>
);

const MountingTabPreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="30" width="150" height="80" rx="3" fill={SHEET_FILL} stroke={SHEET_STROKE} strokeWidth="1.5" />
    <line x1="115" y1="30" x2="115" y2="110" stroke={BEND_DASH} strokeWidth="1" strokeDasharray="4 3" />
    <circle cx="68" cy="70" r="16" fill="none" stroke={SHEET_STROKE} strokeWidth="1.6" />
    <circle cx="145" cy="50" r="3" fill="none" stroke={SHEET_STROKE} strokeWidth="1.3" />
    <circle cx="145" cy="90" r="3" fill="none" stroke={SHEET_STROKE} strokeWidth="1.3" />
    <text x="117" y="25" fontFamily="ui-monospace,monospace" fontSize="6" fill={BEND_DASH}>
      BEND
    </text>
  </svg>
);

const CableClipPreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M 40 100 L 40 55 Q 40 35 60 35 L 90 35 Q 105 35 105 55 L 105 70 Q 105 85 90 85 L 75 85 L 75 70 L 90 70 Q 95 70 95 62 L 95 55 Q 95 45 85 45 L 60 45 Q 50 45 50 55 L 50 100 Z"
      fill={SHEET_FILL}
      stroke={SHEET_STROKE}
      strokeWidth="1.5"
    />
    <line x1="115" y1="60" x2="175" y2="60" stroke={SHEET_STROKE} strokeWidth="2" strokeDasharray="2 3" />
    <text x="145" y="78" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="7" fill={BEND_DASH}>
      Ø6mm wire
    </text>
  </svg>
);

const GussetPreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M 40 30 L 40 110 L 160 110 Z"
      fill={SHEET_FILL}
      stroke={SHEET_STROKE}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    {[
      [50, 50],
      [50, 80],
      [90, 100],
      [125, 100],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill="none" stroke={SHEET_STROKE} strokeWidth="1.2" />
    ))}
  </svg>
);

const ChannelPreview = (
  <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="55" width="170" height="35" rx="2" fill={SHEET_FILL} stroke={SHEET_STROKE} strokeWidth="1.5" />
    <line x1="50" y1="55" x2="50" y2="90" stroke={BEND_DASH} strokeWidth="1" strokeDasharray="4 3" />
    <line x1="150" y1="55" x2="150" y2="90" stroke={BEND_DASH} strokeWidth="1" strokeDasharray="4 3" />
    {[65, 82, 99, 117, 133, 150].map((x) => (
      <circle key={x} cx={x} cy="72" r="2.5" fill="none" stroke={SHEET_STROKE} strokeWidth="1.1" />
    ))}
  </svg>
);

export const EXAMPLES: ExampleDesign[] = [
  {
    id: "l-bracket",
    partTitle: "3×5″ L-bracket",
    process: { id: "scs", label: "SendCutSend · Laser + Bend" },
    prompt: '3×5″ steel L-bracket, four 1/4-20 mounting holes, black powder coat',
    spec: [
      "14 ga (0.075″) mild steel CRS",
      "3″ × 5″ flat pattern, single 90° bend",
      "4 × Ø0.266″ corner holes · 0.375″ inset",
      "Powder coat: Black",
    ],
    bom: [
      "4 × 91251A540 — 1/4-20 × 1″ SHCS",
      "4 × 90480A029 — 1/4-20 hex nut",
      "8 × 92141A029 — 1/4″ flat washer",
    ],
    validation: [
      "snapped thickness to nearest stocked gauge (14 ga)",
      "hole Ø matches letter-F clearance for 1/4-20",
      "bend radius R0.062″ — ≥ thickness, OK",
      "passes SendCutSend rules",
    ],
    handoff: "One-click DXF → sendcutsend.com/upload",
    preview: LBracketPreview,
  },
  {
    id: "vent-plate",
    partTitle: "Vented enclosure plate",
    process: { id: "scs", label: "SendCutSend · Laser" },
    prompt: "6×4 inch aluminum vent plate, 24 slots arranged in a grid, M5 mounting holes at the corners",
    spec: [
      "0.063″ (16 ga) aluminum 5052-H32",
      "6″ × 4″ flat plate",
      "24 × 0.25″ × 2.5″ slots · center grid",
      "4 × Ø0.217″ corner holes (M5 clearance)",
    ],
    bom: [
      "4 × 91251A196 — M5 × 16 mm SHCS",
      "4 × 90591A153 — M5 hex nut",
      "4 × 91131A155 — M5 flat washer",
    ],
    validation: [
      "aluminum 0.063″ within stocked range",
      "slot width ≥ 1× thickness — OK",
      "hole spacing satisfies edge-distance rule",
      "passes SendCutSend rules",
    ],
    handoff: "DXF + cut-list → sendcutsend.com/upload",
    preview: VentPlatePreview,
  },
  {
    id: "mounting-tab",
    partTitle: "Sensor mounting tab",
    process: { id: "scs", label: "SendCutSend · Laser + Bend" },
    prompt: "mounting tab for a 608 skate bearing, 90° bend, two #8-32 holes for a sensor",
    spec: [
      "16 ga (0.060″) stainless 304",
      "2″ × 3″ flat, 90° bend at 60% length",
      "1 × Ø0.875″ centered bore (608 bearing ID fit)",
      "2 × Ø0.177″ holes (#8-32 clearance)",
    ],
    bom: [
      "1 × 6383K21 — 608-2RS bearing",
      "2 × 92949A148 — #8-32 × 1/2″ button-head",
      "2 × 91131A155 — #8 washer",
    ],
    validation: [
      "stainless 16 ga — bendable · OK",
      "bore Ø ≥ 4× thickness from edge",
      "bend line clears the bearing bore",
      "passes SendCutSend rules",
    ],
    handoff: "DXF + instructions → sendcutsend.com/upload",
    preview: MountingTabPreview,
  },
  {
    id: "cable-clip",
    partTitle: "Snap-fit cable clip",
    process: { id: "fdm", label: "FDM · Bambu / Prusa" },
    prompt: "cable clip for 6 mm wire, snap-fit, printable without supports",
    spec: [
      "PLA or PETG · 3 mm wall thickness",
      "30 × 18 × 14 mm footprint",
      "Two-finger snap arms, 6 mm gap",
      "0.4 mm nozzle · 0.2 mm layers",
    ],
    bom: ["(print-only — no fasteners required)"],
    validation: [
      "wall ≥ 2× nozzle — OK",
      "no unsupported overhangs > 45°",
      "bridge span < 5 mm — OK",
      "fits 256×256 build plate 8× per run",
    ],
    handoff: "STL + recommended profile (coming)",
    preview: CableClipPreview,
  },
  {
    id: "angle-gusset",
    partTitle: "Triangular reinforcing gusset",
    process: { id: "scs", label: "SendCutSend · Laser" },
    prompt: "triangular gusset for reinforcing a 2020 aluminum extrusion corner",
    spec: [
      "1/8″ (0.125″) aluminum 6061-T6",
      "3″ × 3″ right triangle with hypotenuse fillet",
      "2 × Ø0.217″ holes on each leg (M5 slot-drop)",
    ],
    bom: [
      "4 × 91251A194 — M5 × 10 mm SHCS",
      "4 × 47065T101 — 2020 T-slot nuts",
    ],
    validation: [
      "thickness within aluminum stock",
      "hole inset ≥ 1.5× hole Ø",
      "hypotenuse fillet cleans the inside corner",
      "passes SendCutSend rules",
    ],
    handoff: "DXF → sendcutsend.com/upload",
    preview: GussetPreview,
  },
  {
    id: "channel",
    partTitle: "U-channel cover",
    process: { id: "scs", label: "SendCutSend · Laser + 2 Bends" },
    prompt: "u-channel cover for a 20×20 cable tray, 18 inches long",
    spec: [
      "20 ga (0.036″) stainless 304",
      "3″ wide × 18″ long, two 90° bends",
      "Bent profile: 1″ × 1″ × 1″ channel",
      "6 × Ø0.201″ holes along top face (#10-32)",
    ],
    bom: [
      "6 × 91251A196 — #10-32 × 1/2″ SHCS",
      "6 × 92395A111 — press-fit thread insert",
    ],
    validation: [
      "stainless 20 ga — bendable",
      "bend radius ≥ thickness",
      "hole row within straight section (no bend line intersect)",
      "passes SendCutSend rules",
    ],
    handoff: "DXF + bend diagram → sendcutsend.com/upload",
    preview: ChannelPreview,
  },
];
