// convex/cad/compile/__tests__/materials.test.ts
// Phase 12 Task 1 — Material catalog tests

import { describe, expect, it } from "vitest";
import {
  BUILTIN_MATERIALS,
  DEFAULT_MATERIAL,
  lookupMaterial,
} from "../materials";

describe("BUILTIN_MATERIALS", () => {
  it("contains the 6 required entries", () => {
    const keys = Object.keys(BUILTIN_MATERIALS);
    expect(keys).toContain("aluminum");
    expect(keys).toContain("steel");
    expect(keys).toContain("stainless");
    expect(keys).toContain("pla");
    expect(keys).toContain("abs");
    expect(keys).toContain("nylon");
  });

  it("aluminum entry has correct density and cost", () => {
    const al = BUILTIN_MATERIALS["aluminum"]!;
    expect(al.densityGcm3).toBe(2.7);
    expect(al.costPerKgUsd).toBe(8);
  });
});

describe("lookupMaterial", () => {
  it("resolves exact key (case-insensitive)", () => {
    const result = lookupMaterial("aluminum");
    expect(result.densityGcm3).toBe(2.7);
    expect(result.costPerKgUsd).toBe(8);
  });

  it("resolves mixed-case name", () => {
    const result = lookupMaterial("Steel");
    expect(result.densityGcm3).toBe(7.85);
  });

  it("falls back to DEFAULT_MATERIAL (aluminum) for unknown name", () => {
    const result = lookupMaterial("unobtanium");
    expect(result).toBe(DEFAULT_MATERIAL);
    expect(result.densityGcm3).toBe(2.7);
  });

  it("falls back to DEFAULT_MATERIAL when name is undefined", () => {
    const result = lookupMaterial(undefined);
    expect(result).toBe(DEFAULT_MATERIAL);
  });
});
