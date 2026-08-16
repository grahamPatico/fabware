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

  it("passes with a step.parts id even when the number isn't in the seed", () => {
    const dsl: PurchasedDsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "step.parts:din913_set_screw_m3x3", quantity: 8,
      label: "M3 x 3 set screw", stepPartId: "din913_set_screw_m3x3",
    };
    const r = validatePurchased(dsl);
    const rule = r.rules.find(x => x.id === "catalog_known");
    expect(rule?.status).toBe("pass");
    expect(rule?.message).toBe("resolved from step.parts catalog (din913_set_screw_m3x3)");
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
