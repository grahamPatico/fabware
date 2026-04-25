import { describe, it, expect } from "vitest";
import { validatePurchased } from "../purchasedRules";
import type { PurchasedDsl } from "../purchasedDsl";

describe("validatePurchased", () => {
  it("passes for a known McMaster part", () => {
    const dsl: PurchasedDsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    const r = validatePurchased(dsl);
    expect(r.rules.find(x => x.id === "catalog_known")?.status).toBe("pass");
    expect(r.hasFailures).toBe(false);
  });

  it("WARNs for an unknown McMaster part", () => {
    const dsl: PurchasedDsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "00000000", quantity: 1, label: "Unknown",
    };
    const r = validatePurchased(dsl);
    expect(r.rules.find(x => x.id === "catalog_known")?.status).toBe("warn");
  });
});
