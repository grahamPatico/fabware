// Server-owned fields for the production journey. The model writes the plan
// (journeySchemas.ts); these pure functions add everything it must not be
// trusted with: supplier links, the `verified` flag, PCB rules and checklist,
// order totals. They also turn stage content into the shapes other parts of
// fabware expect (project scope, the design agent's first message).

import {
  PCB_CHECKLIST, SAFE_PCB_RULES,
  type BuildOrderGroup, type ElectronicsContent, type IdeaContent, type PcbBoard, type PcbContent,
  type RequirementsContent, type SourcingContent, type SourcingItem, type SourcingLive,
} from "./journey";
import type { ElectronicsOutput, PcbOutput, SourcingOutput } from "./journeySchemas";
import { MCMASTER_SEED } from "./mcmasterSeed";
import { SUPPLIER_IDS, getSupplier, mayShowGeometry, supplierLink } from "./suppliers";

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------

/**
 * Add the link, the `verified` flag and any live catalog data to each line.
 * `liveByIndex[i]` is the live record for `items[i]`, when one was fetched.
 */
function isSeedPartNumber(partNumber: string): boolean {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MCMASTER_SEED.some((p) => p.partNumber.toUpperCase() === clean);
}

export function enrichSourcing(
  output: SourcingOutput,
  liveByIndex: { readonly [index: number]: SourcingLive | null | undefined } = {},
): SourcingContent {
  const items: SourcingItem[] = output.items.map((item, i) => {
    // The registry decides what may be attached. A link-only supplier
    // (McMaster) never carries catalog data, whatever the caller passed.
    const supplier = getSupplier(item.supplierId);
    const fetched = supplier && supplier.dataAccess !== "link_only" ? liveByIndex[i] ?? null : null;
    const live: SourcingLive | null = fetched
      ? { ...fetched, modelGlbUrl: mayShowGeometry(item.supplierId) ? fetched.modelGlbUrl : null }
      : null;
    // McMaster can't be queried, so a part number is only as good as the
    // model's memory. Keep the ones in the hand-checked seed; anything else
    // becomes a search, which can't dead-end on a number that doesn't exist.
    const partNumber =
      item.supplierId === "mcmaster" && item.partNumber && !isSeedPartNumber(item.partNumber)
        ? null
        : item.partNumber;
    return {
      ...item,
      partNumber,
      url: supplierLink(item.supplierId, { partNumber, query: item.searchQuery }),
      verified: live !== null,
      live,
    };
  });
  return { items, notes: output.notes };
}

// ---------------------------------------------------------------------------
// Electronics
// ---------------------------------------------------------------------------

export function enrichElectronics(output: ElectronicsOutput): ElectronicsContent {
  return {
    ...output,
    blocks: output.blocks.map((block) => ({
      ...block,
      candidates: block.candidates.map((c) => ({
        ...c,
        url: supplierLink(c.supplierId, { query: c.searchQuery }),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// PCB
// ---------------------------------------------------------------------------

export const PCB_MIN_SIDE_MM = 10;
export const PCB_MAX_SIDE_MM = 500;
const PCB_DEFAULT_THICKNESS_MM = 1.6;

/**
 * Distance from a point to the nearest edge of a rounded rectangle whose
 * top-left corner is the origin. Negative when the point is outside.
 */
function distanceToOutline(x: number, y: number, w: number, h: number, r: number): number {
  const straight = Math.min(x, w - x, y, h - y);
  if (r <= 0) return straight;
  // Inside a corner square the edge is the arc, not the two straight sides.
  const cx = x < r ? r : x > w - r ? w - r : null;
  const cy = y < r ? r : y > h - r ? h - r : null;
  if (cx === null || cy === null) return straight;
  return r - Math.hypot(x - cx, y - cy);
}

/** Clamp the outline to what a board house makes and drop holes that can't be drilled where asked. */
export function enrichBoard(board: PcbOutput["board"]): PcbBoard {
  const widthMm = round(clamp(board.widthMm, PCB_MIN_SIDE_MM, PCB_MAX_SIDE_MM), 2);
  const heightMm = round(clamp(board.heightMm, PCB_MIN_SIDE_MM, PCB_MAX_SIDE_MM), 2);
  const cornerRadiusMm = round(clamp(board.cornerRadiusMm, 0, Math.min(widthMm, heightMm) / 2), 2);
  const thicknessMm = board.thicknessMm > 0 && Number.isFinite(board.thicknessMm)
    ? round(clamp(board.thicknessMm, 0.4, 3.2), 2)
    : PCB_DEFAULT_THICKNESS_MM;
  const mountingHoles = board.mountingHoles
    .filter((hole) => {
      if (!(hole.diameterMm > 0)) return false;
      const edge = distanceToOutline(hole.xMm, hole.yMm, widthMm, heightMm, cornerRadiusMm);
      // Measured from the hole's centre: the drilled edge needs the margin.
      return edge >= SAFE_PCB_RULES.minHoleToEdgeMm + hole.diameterMm / 2;
    })
    .map((hole) => ({
      xMm: round(hole.xMm, 2),
      yMm: round(hole.yMm, 2),
      diameterMm: round(hole.diameterMm, 2),
    }));
  return {
    widthMm,
    heightMm,
    cornerRadiusMm,
    thicknessMm,
    layers: board.layers >= 3 ? 4 : 2,
    mountingHoles,
    outlineBasis: board.outlineBasis,
  };
}

export function enrichPcb(output: PcbOutput): PcbContent {
  return {
    board: enrichBoard(output.board),
    fab: output.fab,
    rules: { ...SAFE_PCB_RULES },
    checklist: PCB_CHECKLIST.map((g) => ({ group: g.group, items: g.items.map((i) => ({ ...i })) })),
    projectChecks: output.projectChecks,
    nextSteps: output.nextSteps,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * One order list per supplier, in registry order. A live catalog price and
 * product page win over the guide's estimate and the search link. Totals add
 * only the lines with a known cost and are null when no line has one.
 */
export function buildOrderGroups(
  sourcing: SourcingContent | null,
): { orderGroups: BuildOrderGroup[]; estTotalUsd: number | null } {
  const orderGroups: BuildOrderGroup[] = [];
  for (const supplierId of SUPPLIER_IDS) {
    const items = (sourcing?.items ?? []).filter((item) => item.supplierId === supplierId);
    if (items.length === 0) continue;
    const lines = items.map((item) => ({
      need: item.need,
      qty: item.qty,
      url: item.live?.productUrl || item.url,
      estUnitCostUsd: item.live?.priceUsd ?? item.estUnitCostUsd,
    }));
    const priced = lines.filter((l) => l.estUnitCostUsd !== null);
    orderGroups.push({
      supplierId,
      lines,
      subtotalUsd: priced.length > 0
        ? round(priced.reduce((sum, l) => sum + l.qty * (l.estUnitCostUsd ?? 0), 0), 2)
        : null,
    });
  }
  const known = orderGroups.filter((g) => g.subtotalUsd !== null);
  return {
    orderGroups,
    estTotalUsd: known.length > 0 ? round(known.reduce((sum, g) => sum + (g.subtotalUsd ?? 0), 0), 2) : null,
  };
}

// ---------------------------------------------------------------------------
// Requirements -> project scope
// ---------------------------------------------------------------------------

/** The shape `projects.scope` stores (see convex/schema.ts). */
export interface ProjectScope {
  tier: "jerry-rigged" | "mvp" | "commercial";
  environment: { location: "indoor" | "outdoor"; waterproof?: boolean; uv?: boolean; freeze?: boolean };
  useCase: string;
  userInteraction?: string;
  referenceScale?: { kind: string; dimensions?: { w: number; d: number; h: number }; quantity?: number };
  budgetCeiling?: number;
}

/**
 * The design studio's scope, taken from the requirements stage. The envelope
 * becomes the reference scale only when all three dimensions are known.
 */
export function scopeFromRequirements(req: RequirementsContent): ProjectScope {
  const scope: ProjectScope = {
    tier: req.tier,
    environment: { location: req.environment.location, waterproof: req.environment.waterproof },
    useCase: req.summary,
  };
  if (req.budgetUsd !== null) scope.budgetCeiling = req.budgetUsd;
  const { widthIn, depthIn, heightIn } = req.envelope;
  if (widthIn !== null && depthIn !== null && heightIn !== null) {
    scope.referenceScale = {
      kind: "envelope",
      dimensions: { w: widthIn, d: depthIn, h: heightIn },
      ...(req.quantity !== null ? { quantity: req.quantity } : {}),
    };
  }
  return scope;
}

// ---------------------------------------------------------------------------
// Mechanical brief
// ---------------------------------------------------------------------------

export const MECHANICAL_BRIEF_MAX_CHARS = 1_800;

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

function boughtLine(item: SourcingItem): string {
  const supplier = getSupplier(item.supplierId)?.name ?? item.supplierId;
  if (item.live) {
    // Live catalog data carries the real part and its published size.
    const size = item.live.fitSummary.split(/(?<=\.)\s/)[0] ?? "";
    return clip(`- ${item.qty} x ${item.live.productName} (${supplier} ${item.live.partNumber}). ${size}`.trim(), 260);
  }
  const part = item.partNumber ? ` ${item.partNumber}` : "";
  return clip(`- ${item.qty} x ${item.need} (${supplier}${part})`, 160);
}

/**
 * The first message sent to the design-studio agent: what the product is,
 * the targets it has to hit, what is bought (and so must be designed around)
 * and which custom parts to design. Plain text, under 1,800 characters.
 */
export function mechanicalBrief(pieces: {
  projectName: string;
  idea: IdeaContent | null;
  requirements: RequirementsContent | null;
  sourcing: SourcingContent | null;
}): string {
  const { projectName, idea, requirements: req, sourcing } = pieces;
  const out: string[] = [];
  out.push(`Design the custom mechanical parts for: ${clip(idea?.oneLiner || projectName, 240)}`);

  if (req) {
    const targets: string[] = [];
    const { widthIn, depthIn, heightIn } = req.envelope;
    if (widthIn !== null && depthIn !== null && heightIn !== null) {
      targets.push(`- Overall size: ${widthIn} x ${depthIn} x ${heightIn} in (width x depth x height).`);
    } else if (req.envelope.note) {
      targets.push(`- Size: ${clip(req.envelope.note, 140)}`);
    }
    targets.push(
      `- Environment: ${req.environment.location}${req.environment.waterproof ? ", waterproof" : ""}.` +
      (req.environment.notes ? ` ${clip(req.environment.notes, 120)}` : ""),
    );
    targets.push(`- Build quality: ${req.tier}.`);
    if (req.quantity !== null) targets.push(`- Quantity: ${req.quantity}.`);
    for (const c of req.constraints.slice(0, 4)) targets.push(`- ${clip(c, 140)}`);
    out.push("", "Targets:", ...targets);
  }

  const items = sourcing?.items ?? [];
  const bought = items.filter((i) => i.approach === "buy" || i.approach === "enclosure");
  const custom = items.filter((i) => i.approach === "laser_cut" || i.approach === "print_3d");
  if (bought.length > 0) {
    out.push("", "Bought parts. Do not design these, design around them:", ...bought.slice(0, 8).map(boughtLine));
  }
  if (custom.length > 0) {
    out.push(
      "",
      "Custom parts to design:",
      ...custom.slice(0, 8).map((i) =>
        clip(`- ${i.need} (${i.approach === "laser_cut" ? "laser-cut sheet metal" : "3D printed"}, qty ${i.qty})`, 180)),
    );
  } else {
    out.push("", "Custom parts to design: work out which laser-cut and 3D printed parts this needs.");
  }
  out.push(
    "",
    "Start with the parts list and the main dimensions, then build the parts. " +
    "Add the bought hardware as purchased parts so the fit can be checked.",
  );

  // Trim whole lines from the middle sections until it fits; the opening and
  // the closing instruction always survive.
  while (out.join("\n").length > MECHANICAL_BRIEF_MAX_CHARS && out.length > 4) {
    out.splice(out.length - 3, 1);
  }
  return clip(out.join("\n"), MECHANICAL_BRIEF_MAX_CHARS);
}
