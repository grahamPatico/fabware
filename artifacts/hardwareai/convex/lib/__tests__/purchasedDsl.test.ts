import { describe, it, expect } from "vitest";
import { PurchasedDslSchema, summarizePurchased } from "../purchasedDsl";

describe("PurchasedDslSchema", () => {
  it("validates a minimal purchased part", () => {
    const dsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    expect(PurchasedDslSchema.safeParse(dsl).success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const dsl = {
      version: 1, kind: "purchased",
      mcmasterPartNumber: "91251A540", quantity: 0, label: "X",
    };
    expect(PurchasedDslSchema.safeParse(dsl).success).toBe(false);
  });

  it("summarizePurchased renders qty × label", () => {
    const dsl = {
      version: 1, kind: "purchased" as const,
      mcmasterPartNumber: "91251A540", quantity: 4, label: "1/4-20 SHCS",
    };
    expect(summarizePurchased(dsl)).toContain("4 ×");
    expect(summarizePurchased(dsl)).toContain("1/4-20");
  });
});
