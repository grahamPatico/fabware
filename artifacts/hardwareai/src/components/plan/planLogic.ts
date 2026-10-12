// Pure helpers for the plan page. No React, no Convex: everything here is
// covered by unit tests.

import {
  getStage,
  isGeneratedStage,
  isStageId,
  type ConceptImage,
  type JourneyView,
  type PcbBoard,
  type PcbChecklistGroup,
  type PcbContent,
  type RequirementsContent,
  type SourcingApproach,
  type SourcingItem,
  type StageId,
  type StageStatus,
} from "../../../convex/lib/journey";
import { getSupplier, type Supplier, type SupplierId } from "../../../convex/lib/suppliers";

export const NOTES_MAX_CHARS = 2000;

// ---------------------------------------------------------------------------
// Stage selection
// ---------------------------------------------------------------------------

/** The stage named by a URL hash ("#sourcing"), or null when it names none. */
export function stageFromHash(hash: string): StageId | null {
  const value = hash.replace(/^#/, "").trim().toLowerCase();
  return isStageId(value) ? value : null;
}

export function hashForStage(stage: StageId): string {
  return `#${stage}`;
}

/** Where the page opens: the next stage to do, else the last one. Null when there are no stages. */
export function defaultStage(view: Pick<JourneyView, "applicable" | "nextStage">): StageId | null {
  if (view.nextStage && view.applicable.includes(view.nextStage)) return view.nextStage;
  return view.applicable[view.applicable.length - 1] ?? null;
}

/** The stage to show: the wanted one when this project has it, else the default. */
export function resolveSelectedStage(
  view: Pick<JourneyView, "applicable" | "nextStage">,
  wanted: StageId | null,
): StageId | null {
  if (wanted && view.applicable.includes(wanted)) return wanted;
  return defaultStage(view);
}

/** The stage after `stage` in this project's list; null on the last one. */
export function nextApplicableStage(applicable: readonly StageId[], stage: StageId): StageId | null {
  const index = applicable.indexOf(stage);
  if (index < 0) return null;
  return applicable[index + 1] ?? null;
}

/** True when moving on to `stage` should also ask the guide to write it. */
export function shouldGenerateOnContinue(view: Pick<JourneyView, "stages">, stage: StageId): boolean {
  if (!isGeneratedStage(stage)) return false;
  const entry = view.stages[stage];
  if (!entry) return true;
  return entry.content === null && entry.status !== "generating";
}

export type RailMark = "todo" | "working" | "review" | "done" | "error";

export function railMark(status: StageStatus | undefined): RailMark {
  switch (status) {
    case "generating":
      return "working";
    case "ready":
      return "review";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return "todo";
  }
}

export const RAIL_MARK_LABEL: Record<RailMark, string> = {
  todo: "To do",
  working: "Working",
  review: "Ready to review",
  done: "Done",
  error: "Needs attention",
};

export function stageLabel(stage: StageId): string {
  return getStage(stage).label;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const UNKNOWN = "unknown";

/** "$12", "$12.50", "$1,250", or "unknown" for null. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  const whole = Number.isInteger(value);
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** A plain number without trailing zeros: 4, 4.5, 0.25. */
export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return UNKNOWN;
  return String(Number(value.toFixed(maxDecimals)));
}

/** `6 × 4 × 2.5 in`, with "unknown" for any side that is null. */
export function formatEnvelope(envelope: RequirementsContent["envelope"]): string {
  const sides = [envelope.widthIn, envelope.depthIn, envelope.heightIn];
  if (sides.every((s) => s === null)) return UNKNOWN;
  return `${sides.map((s) => (s === null ? UNKNOWN : formatNumber(s))).join(" × ")} in`;
}

/** "Oct 12, 2026". Fixed locale so the page reads the same everywhere. */
export function formatDate(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return UNKNOWN;
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A catalog date string ("2026-10-11" or an ISO time) as "Oct 11, 2026"; passed through when unparseable. */
export function formatCatalogDate(asOf: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf.trim());
  if (dateOnly) {
    // Build from the parts so the day doesn't shift with the time zone.
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return formatDate(date.getTime());
  }
  const parsed = Date.parse(asOf);
  return Number.isNaN(parsed) ? asOf : formatDate(parsed);
}

const TIER_LABELS: Record<RequirementsContent["tier"], string> = {
  "jerry-rigged": "Quick and cheap",
  mvp: "Prototype",
  commercial: "Production",
};

/** The composer's name for a build tier. */
export function tierLabel(tier: RequirementsContent["tier"]): string {
  return TIER_LABELS[tier];
}

/** The concept picture as an `<img src>`. An SVG becomes a data URL and is never injected as markup. */
export function conceptImageSrc(image: ConceptImage): string {
  if (image.kind === "svg") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`;
  }
  return image.url;
}

export function supplierName(id: SupplierId): string {
  return getSupplier(id)?.name ?? id;
}

/** Only http(s) links are ever rendered as links. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  const value = (url ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------

export const APPROACH_ORDER: readonly SourcingApproach[] = [
  "buy",
  "enclosure",
  "laser_cut",
  "print_3d",
  "pcb",
  "electronics",
];

export const APPROACH_HEADINGS: Record<SourcingApproach, string> = {
  buy: "Buy off the shelf",
  enclosure: "Enclosure",
  laser_cut: "Laser cut",
  print_3d: "3D print",
  pcb: "Circuit board",
  electronics: "Electronic parts",
};

export interface SourcingGroup {
  approach: SourcingApproach;
  heading: string;
  items: SourcingItem[];
}

/** Lines grouped by approach in a fixed order. Empty groups are left out; line order is kept. */
export function groupSourcingLines(items: readonly SourcingItem[]): SourcingGroup[] {
  return APPROACH_ORDER.map((approach) => ({
    approach,
    heading: APPROACH_HEADINGS[approach],
    items: items.filter((item) => item.approach === approach),
  })).filter((group) => group.items.length > 0);
}

/** Unit cost for a line: the live catalog price when there is one, else the estimate. */
export function sourcingUnitCost(item: Pick<SourcingItem, "estUnitCostUsd" | "live">): number | null {
  return item.live?.priceUsd ?? item.estUnitCostUsd;
}

/** Where the line's button goes: the live product page, else the registry link. Null when there is none. */
export function sourcingLineUrl(item: Pick<SourcingItem, "url" | "live">): string | null {
  return safeHttpUrl(item.live?.productUrl) ?? safeHttpUrl(item.url);
}

/** The suppliers used by these lines, each once, in the order they first appear. */
export function suppliersInLines(items: ReadonlyArray<{ supplierId: SupplierId }>): Supplier[] {
  const seen = new Set<SupplierId>();
  const out: Supplier[] = [];
  for (const item of items) {
    if (seen.has(item.supplierId)) continue;
    seen.add(item.supplierId);
    const supplier = getSupplier(item.supplierId);
    if (supplier) out.push(supplier);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PCB checklist
// ---------------------------------------------------------------------------

export const PROJECT_CHECKS_GROUP = "For this project";

/** The standard groups, then the project's own checks as a last group when there are any. */
export function pcbChecklistGroups(
  content: Pick<PcbContent, "checklist" | "projectChecks">,
): PcbChecklistGroup[] {
  const groups = content.checklist.filter((g) => g.items.length > 0);
  if (content.projectChecks.length === 0) return groups;
  return [...groups, { group: PROJECT_CHECKS_GROUP, items: content.projectChecks }];
}

/** Stable id for one checklist line, used as its saved key. */
export function checklistItemKey(group: string, text: string): string {
  return `${group}::${text}`;
}

/** How many of the current lines are checked. Saved keys for lines that no longer exist are ignored. */
export function checklistProgress(
  groups: readonly PcbChecklistGroup[],
  checked: ReadonlySet<string>,
): { checked: number; total: number } {
  let done = 0;
  let total = 0;
  for (const group of groups) {
    for (const item of group.items) {
      total += 1;
      if (checked.has(checklistItemKey(group.group, item.text))) done += 1;
    }
  }
  return { checked: done, total };
}

export function checklistStorageKey(projectId: string): string {
  return `fabware.plan.pcbChecklist.${projectId}`;
}

/** Saved checklist keys from a stored JSON string. Anything malformed reads as nothing checked. */
export function parseChecklistState(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function serializeChecklistState(checked: ReadonlySet<string>): string {
  return JSON.stringify([...checked].sort());
}

// ---------------------------------------------------------------------------
// PCB outline drawing
// ---------------------------------------------------------------------------

export interface PcbDrawing {
  viewBox: string;
  board: { x: number; y: number; width: number; height: number; radius: number };
  holes: Array<{ cx: number; cy: number; r: number }>;
  /** Stroke width in board millimetres that reads as a hairline at any board size. */
  stroke: number;
}

/**
 * Geometry for the outline sketch, in millimetres with the origin at the
 * board's top-left corner. Holes outside the outline and non-positive sizes
 * are dropped, and the corner radius is capped at half the short side.
 */
export function pcbDrawing(board: PcbBoard): PcbDrawing | null {
  const { widthMm: w, heightMm: h } = board;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const pad = Math.max(w, h) * 0.06;
  const radius = Math.max(0, Math.min(board.cornerRadiusMm || 0, w / 2, h / 2));
  const holes = board.mountingHoles
    .filter(
      (hole) =>
        Number.isFinite(hole.xMm) &&
        Number.isFinite(hole.yMm) &&
        hole.diameterMm > 0 &&
        hole.xMm >= 0 &&
        hole.xMm <= w &&
        hole.yMm >= 0 &&
        hole.yMm <= h,
    )
    .map((hole) => ({ cx: hole.xMm, cy: hole.yMm, r: hole.diameterMm / 2 }));
  return {
    viewBox: `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`,
    board: { x: 0, y: 0, width: w, height: h, radius },
    holes,
    stroke: Math.max(w, h) / 160,
  };
}
