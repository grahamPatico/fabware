import { PartDslSchema, dslToLegacy } from "./dsl";
import { PrintedDslSchema } from "./printedDsl";
import { PurchasedDslSchema } from "./purchasedDsl";
import { validateSpec, type ValidationResult } from "./scsRules";
import { validatePrinted } from "./printedRules";
import { validatePurchased } from "./purchasedRules";
import { readKind, type PartKind } from "./partKind";

export interface UnifiedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

export interface UnifiedValidationResult {
  kind: PartKind;
  rules: UnifiedRuleResult[];
  hasFailures: boolean;
}

export function validatePartByKind(
  partRow: { kind?: string | null; dslJson?: string | null; partType?: string },
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
  });
  return {
    kind: "sheet_metal",
    rules: sheetResult.rules.map(r => ({ id: r.id, label: r.label, status: r.status, message: r.message, suggestion: r.suggestion })),
    hasFailures: sheetResult.hasFailures,
  };
}
