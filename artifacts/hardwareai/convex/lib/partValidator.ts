import { PartDslSchema, dslToLegacy, type HoleFeature, type PartDsl } from "./dsl";
import { PrintedDslSchema } from "./printedDsl";
import { PurchasedDslSchema } from "./purchasedDsl";
import { validateSpec, type RuleStatus, type ValidationResult } from "./scsRules";
import { citeCutting, type ScsLiveSku } from "./scsLive";
import { holePositionsFor } from "./flatPattern";
import { validatePrinted } from "./printedRules";
import { validatePurchased } from "./purchasedRules";
import { readKind, type PartKind } from "./partKind";
import { bendRulesForPartValidator } from "./bendSim";

export interface UnifiedRuleResult {
  id: string;
  label: string;
  status: RuleStatus;
  message: string;
  suggestion?: string;
}

export interface UnifiedValidationResult {
  kind: PartKind;
  rules: UnifiedRuleResult[];
  hasFailures: boolean;
}

/**
 * Live hole-to-edge check. `validateSpec` only sees the legacy hole *pattern*,
 * but the DSL carries real hole coordinates, so this is where SCS's published
 * `min_hole_to_edge` can actually be measured.
 *
 * Deliberately conservative: rectangle outlines only (a polygon/star outline's
 * nearest edge needs real point-to-segment work), and warn rather than fail
 * since the inset is a design default the agent can move.
 */
function liveHoleToEdgeRules(dsl: PartDsl, live: ScsLiveSku): UnifiedRuleResult[] {
  const minEdge = live.minHoleToEdge;
  if (minEdge == null) return [];
  if (dsl.outline && dsl.outline.kind !== "rectangle") return [];
  const out: UnifiedRuleResult[] = [];
  for (const f of dsl.features) {
    if (f.kind !== "hole") continue;
    const hole = f as HoleFeature;
    const radius = hole.diameter / 2;
    let worst: { gap: number; x: number; y: number } | null = null;
    for (const p of holePositionsFor(hole, dsl.width, dsl.height)) {
      const gap = Math.min(p.x, p.y, dsl.width - p.x, dsl.height - p.y) - radius;
      if (worst == null || gap < worst.gap) worst = { gap, x: p.x, y: p.y };
    }
    if (worst && worst.gap < minEdge) {
      out.push({
        id: "hole-to-edge-live",
        label: "Hole-to-edge ≥ SCS minimum",
        status: "warn",
        message: `Hole "${hole.name}" at (${worst.x.toFixed(3)}, ${worst.y.toFixed(3)}) leaves ${worst.gap.toFixed(3)}" of material to the nearest edge, below the ${minEdge}" minimum for ${live.sku} (${citeCutting(live.sku, "min_hole_to_edge")}).`,
      });
    }
  }
  return out;
}

export function validatePartByKind(
  partRow: { kind?: string | null; dslJson?: string | null; partType?: string },
  live: ScsLiveSku | null = null,
): UnifiedValidationResult {
  const kind = readKind(partRow);
  if (!partRow.dslJson) {
    return { kind, rules: [], hasFailures: false };
  }
  if (kind === "printed") {
    const parsed = PrintedDslSchema.safeParse(JSON.parse(partRow.dslJson));
    if (!parsed.success) {
      return {
        kind: "printed",
        rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
        hasFailures: true,
      };
    }
    return { kind: "printed", ...validatePrinted(parsed.data) };
  }
  if (kind === "purchased") {
    const parsed = PurchasedDslSchema.safeParse(JSON.parse(partRow.dslJson));
    if (!parsed.success) {
      return {
        kind: "purchased",
        rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
        hasFailures: true,
      };
    }
    return { kind: "purchased", ...validatePurchased(parsed.data) };
  }
  // Default: sheet_metal
  const parsed = PartDslSchema.safeParse(JSON.parse(partRow.dslJson));
  if (!parsed.success) {
    return {
      kind: "sheet_metal",
      rules: [{ id: "dsl_parse", label: "DSL parse", status: "fail", message: parsed.error.message.slice(0, 200) }],
      hasFailures: true,
    };
  }
  const legacy = dslToLegacy(parsed.data);
  const sheetResult: ValidationResult = validateSpec({
    partType: legacy.partType,
    material: legacy.material,
    thickness: legacy.thickness,
    width: legacy.width,
    height: legacy.height,
    depth: legacy.depth,
    bendRadius: legacy.bendRadius,
    bendAngles: legacy.bendAngles,
    holePattern: legacy.holePattern,
    powderCoat: legacy.powderCoat,
    powderCoatColor: legacy.powderCoatColor,
    assemblyRefs: legacy.assemblyRefs ?? [],
  }, live);
  const sheetRules = sheetResult.rules.map(r => ({
    id: r.id, label: r.label, status: r.status, message: r.message,
    suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
  }));
  const bendRules = bendRulesForPartValidator(parsed.data);
  const liveRules = live ? liveHoleToEdgeRules(parsed.data, live) : [];
  const merged = [...sheetRules, ...bendRules, ...liveRules];
  return {
    kind: "sheet_metal",
    rules: merged,
    hasFailures: merged.some(r => r.status === "fail"),
  };
}
