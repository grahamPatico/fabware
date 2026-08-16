// Project Bill of Materials emitter. CSV output, two sections:
//
//   1. Sheet-metal parts grouped by (material, thickness) with total area,
//      weight, and estimated SCS cost.
//   2. Hardware grouped by McMaster part number with total quantity, summed
//      across (a) assemblyParts table, (b) interface hardwareRefs, and
//      (c) purchased-kind parts on the parts table.
//
// CSV per RFC 4180 with comma separator. Cells containing comma / quote /
// newline are wrapped in double quotes with internal quotes escaped.

import type { Doc } from "../_generated/dataModel";
import { PartDslSchema } from "./dsl";
import { mcmasterUrl } from "./purchasedDsl";
import { estimatePartWeight } from "./weight";
import { estimatePartCost } from "./cost";

function csvCell(v: string | number): string {
  const s = typeof v === "number" ? String(v) : v;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(...cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

interface SheetGroup {
  material: string;
  thickness: number;
  partCount: number;
  totalAreaIn2: number;
  totalWeightLb: number;
  totalCostUsd: number;
  roles: string[];
}

interface HardwareGroup {
  /** Display form of the part number (see `bump` for the step.parts casing carve-out). */
  partNumber: string;
  quantity: number;
  source: Set<string>;
  notes: string[];
  /** Human name for the line — first non-empty one wins. */
  description: string;
  /** Per-unit price when a purchased part row carried one. */
  unitCostUsd: number | null;
  /** step.parts product page, when the part was resolved from that catalog. */
  stepPageUrl: string;
}

export interface BomInputs {
  projectName: string;
  parts: Doc<"parts">[];
  interfaces: Doc<"interfaces">[];
  assemblyParts: Doc<"assemblyParts">[];
}

export function generateBom(input: BomInputs): string {
  const sheetGroups = new Map<string, SheetGroup>();
  for (const p of input.parts) {
    if ((p.kind ?? "sheet_metal") !== "sheet_metal" || !p.dslJson) continue;
    const parsed = PartDslSchema.safeParse(JSON.parse(p.dslJson));
    if (!parsed.success) continue;
    const material = parsed.data.material;
    const thickness = parsed.data.thickness;
    const key = `${material}|${thickness}`;
    const w = estimatePartWeight(parsed.data);
    const c = estimatePartCost(parsed.data);
    const g = sheetGroups.get(key) ?? {
      material, thickness, partCount: 0, totalAreaIn2: 0, totalWeightLb: 0, totalCostUsd: 0, roles: [],
    };
    g.partCount += 1;
    g.totalAreaIn2 += w.area;
    g.totalWeightLb += w.pounds;
    g.totalCostUsd += c.totalUsd;
    g.roles.push(p.role);
    sheetGroups.set(key, g);
  }

  const hardware = new Map<string, HardwareGroup>();
  const bump = (
    partNumber: string,
    quantity: number,
    source: string,
    note?: string,
    extra?: { description?: string; unitCostUsd?: number; stepPageUrl?: string },
  ) => {
    if (!partNumber) return;
    const trimmed = partNumber.trim();
    const key = trimmed.toUpperCase();
    // McMaster numbers are canonically upper-case, but a "step.parts:<id>"
    // fallback number carries a snake_case catalog id that must survive
    // verbatim — group on the upper-cased key either way, display the raw one.
    const display = /^step\.parts:/i.test(trimmed) ? trimmed : key;
    const g = hardware.get(key) ?? {
      partNumber: display, quantity: 0, source: new Set<string>(), notes: [],
      description: "", unitCostUsd: null, stepPageUrl: "",
    };
    g.quantity += quantity;
    g.source.add(source);
    if (note) g.notes.push(note);
    if (!g.description && extra?.description) g.description = extra.description;
    if (g.unitCostUsd === null && typeof extra?.unitCostUsd === "number") g.unitCostUsd = extra.unitCostUsd;
    if (!g.stepPageUrl && extra?.stepPageUrl) g.stepPageUrl = extra.stepPageUrl;
    hardware.set(key, g);
  };
  for (const ap of input.assemblyParts) {
    bump(ap.mcmasterPartNumber, ap.quantity, "assembly_part", ap.name, { description: ap.name });
  }
  for (const iface of input.interfaces) {
    for (const ref of iface.hardwareRefs ?? []) {
      bump(ref.mcmasterPartNumber, ref.quantity, "interface", `${iface.kind}: ${ref.role ?? "?"}`);
    }
  }
  for (const p of input.parts) {
    if (p.kind === "purchased" && p.purchasedPartNumber) {
      bump(p.purchasedPartNumber, p.purchasedQuantity ?? 1, "purchased_part", p.label, {
        description: p.label,
        unitCostUsd: p.unitCostUsd,
        stepPageUrl: p.stepPageUrl,
      });
    }
  }

  const lines: string[] = [];
  lines.push(`# BOM: ${input.projectName}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Sheet-metal parts");
  lines.push(row("material", "thickness_in", "part_count", "total_area_in2", "total_area_ft2", "total_weight_lb", "total_cost_usd", "roles"));
  for (const g of [...sheetGroups.values()].sort((a, b) => a.material.localeCompare(b.material) || a.thickness - b.thickness)) {
    lines.push(row(
      g.material,
      g.thickness,
      g.partCount,
      g.totalAreaIn2.toFixed(2),
      (g.totalAreaIn2 / 144).toFixed(3),
      g.totalWeightLb.toFixed(3),
      g.totalCostUsd.toFixed(2),
      g.roles.join(" / "),
    ));
  }
  lines.push("");
  lines.push("## Hardware (McMaster)");
  lines.push(row("mcmaster_part_number", "quantity", "source", "notes", "description", "unit_cost_usd", "url"));
  for (const g of [...hardware.values()].sort((a, b) => a.partNumber.localeCompare(b.partNumber))) {
    lines.push(row(
      g.partNumber,
      g.quantity,
      [...g.source].join("+"),
      g.notes.join(" | "),
      g.description,
      g.unitCostUsd === null ? "" : g.unitCostUsd.toFixed(2),
      g.stepPageUrl || mcmasterUrl(g.partNumber),
    ));
  }
  return lines.join("\n") + "\n";
}
