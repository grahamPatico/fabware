// Thread specs for the fasteners used in Fabware's curated McMaster catalog.
// Clearance sizes are "normal / close fit" (ASME B18.2.8 and ISO 273 medium):
// big enough for easy assembly but not sloppy. Override per-design if you
// want a free fit or a press fit.

import { lookupSeedPart } from "./mcmasterSeed";

export interface ThreadSpec {
  label: string; // e.g. "1/4-20 UNC" or "M5 x 0.8"
  system: "unified" | "metric";
  nominalIn: number; // major diameter in inches
  clearanceIn: number; // "normal fit" clearance-hole diameter in inches
}

export const THREAD_TABLE: Record<string, ThreadSpec> = {
  // ----- Unified (imperial) -----
  "#4-40": { label: "#4-40", system: "unified", nominalIn: 0.112, clearanceIn: 0.116 },
  "#6-32": { label: "#6-32", system: "unified", nominalIn: 0.138, clearanceIn: 0.144 },
  "#8-32": { label: "#8-32", system: "unified", nominalIn: 0.164, clearanceIn: 0.177 },
  "#10-24": { label: "#10-24", system: "unified", nominalIn: 0.190, clearanceIn: 0.201 },
  "#10-32": { label: "#10-32", system: "unified", nominalIn: 0.190, clearanceIn: 0.201 },
  "1/4-20": { label: "1/4-20", system: "unified", nominalIn: 0.25, clearanceIn: 0.266 },
  "5/16-18": { label: "5/16-18", system: "unified", nominalIn: 0.3125, clearanceIn: 0.332 },
  "3/8-16": { label: "3/8-16", system: "unified", nominalIn: 0.375, clearanceIn: 0.397 },

  // ----- Metric (ISO) -----
  M3: { label: "M3", system: "metric", nominalIn: 0.1181, clearanceIn: 0.1339 },
  M4: { label: "M4", system: "metric", nominalIn: 0.1575, clearanceIn: 0.1772 },
  M5: { label: "M5", system: "metric", nominalIn: 0.1969, clearanceIn: 0.2165 },
  M6: { label: "M6", system: "metric", nominalIn: 0.2362, clearanceIn: 0.2598 },
  M8: { label: "M8", system: "metric", nominalIn: 0.315, clearanceIn: 0.3543 },
  M10: { label: "M10", system: "metric", nominalIn: 0.3937, clearanceIn: 0.4331 },
};

const IMPERIAL_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /#?4[\s\-]?40/, key: "#4-40" },
  { re: /#?6[\s\-]?32/, key: "#6-32" },
  { re: /#?8[\s\-]?32/, key: "#8-32" },
  { re: /#?10[\s\-]?24/, key: "#10-24" },
  { re: /#?10[\s\-]?32/, key: "#10-32" },
  { re: /1\/4[\s"\-]*20/, key: "1/4-20" },
  { re: /5\/16[\s"\-]*18/, key: "5/16-18" },
  { re: /3\/8[\s"\-]*16/, key: "3/8-16" },
];

const METRIC_PATTERN = /\bM(\d{1,2})\b/;

// Best-effort extraction of a thread spec from free text. Returns null when
// the thread can't be identified (e.g. a bearing or magnet).
export function threadFromText(text: string): ThreadSpec | null {
  const t = text.replace(/\s+/g, " ");
  for (const p of IMPERIAL_PATTERNS) {
    if (p.re.test(t)) return THREAD_TABLE[p.key] ?? null;
  }
  const metricMatch = t.match(METRIC_PATTERN);
  if (metricMatch) {
    const key = `M${metricMatch[1]}`;
    if (THREAD_TABLE[key]) return THREAD_TABLE[key];
  }
  return null;
}

// Resolve a McMaster part number → thread spec by looking up the seed entry
// and parsing its name.
export function threadFromPartNumber(partNumber: string): ThreadSpec | null {
  const seed = lookupSeedPart(partNumber);
  if (!seed) return null;
  if (!["fastener", "nut"].includes(seed.category)) return null;
  return threadFromText(seed.name) ?? threadFromText(seed.keywords.join(" "));
}

// Minimum material thickness recommended to tap threads directly (vs using a
// nut or press-fit insert). Rule of thumb: at least 1.5x the thread pitch.
export function minThicknessForTappedThread(spec: ThreadSpec): number {
  const pitchLookup: Record<string, number> = {
    "#4-40": 1 / 40,
    "#6-32": 1 / 32,
    "#8-32": 1 / 32,
    "#10-24": 1 / 24,
    "#10-32": 1 / 32,
    "1/4-20": 1 / 20,
    "5/16-18": 1 / 18,
    "3/8-16": 1 / 16,
    M3: 0.5 / 25.4,
    M4: 0.7 / 25.4,
    M5: 0.8 / 25.4,
    M6: 1.0 / 25.4,
    M8: 1.25 / 25.4,
    M10: 1.5 / 25.4,
  };
  const pitch = pitchLookup[spec.label] ?? 0.05;
  return pitch * 1.5;
}
