import type { PurchasedDsl } from "./purchasedDsl";
import { lookupSeedPart } from "./mcmasterSeed";

export interface PurchasedRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function validatePurchased(dsl: PurchasedDsl): {
  rules: PurchasedRuleResult[];
  hasFailures: boolean;
} {
  const rules: PurchasedRuleResult[] = [];
  const seed = lookupSeedPart(dsl.mcmasterPartNumber);
  if (seed) {
    rules.push({
      id: "catalog_known", label: "Catalog match", status: "pass",
      message: `${seed.partNumber} — ${seed.name}`,
    });
  } else {
    rules.push({
      id: "catalog_known", label: "Catalog match", status: "warn",
      message: `${dsl.mcmasterPartNumber} not in curated seed; verify on mcmaster.com.`,
    });
  }
  rules.push({
    id: "qty_sane", label: "Quantity",
    status: dsl.quantity >= 1 && dsl.quantity <= 10000 ? "pass" : "fail",
    message: `Quantity ${dsl.quantity}.`,
  });
  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}
