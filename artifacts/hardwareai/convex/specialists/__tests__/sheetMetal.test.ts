import { describe, it, expect } from "vitest";
import { runSpecialistOnce, type SpecialistResult } from "../_helpers";
import { sheetMetalPlugin } from "../../plugins/sheet_metal";

const baseDsl = {
  version: 1 as const,
  partType: "bracket" as const,
  material: "Mild Steel (CRS)",
  thickness: 0.075, width: 4, height: 3, depth: null,
  features: [], finish: null, assemblyRefs: [],
};

describe("runSpecialistOnce (pure)", () => {
  it("returns status='ok' with no violations on a clean DSL", () => {
    const result: SpecialistResult<typeof baseDsl> = runSpecialistOnce(sheetMetalPlugin, baseDsl, { scope: null, peerParts: [] });
    expect(result.violations.length).toBe(0);
    expect(result.status).toBe("ok");
    expect(result.repairedDsl).toBe(baseDsl); // unchanged
  });

  it("returns status='escalated' with violations on a non-stocked thickness", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.status).toBe("escalated");
  });

  it("attempts autoRepair (always null in Plan 2) — repairedDsl stays equal to input", () => {
    const result = runSpecialistOnce(sheetMetalPlugin, { ...baseDsl, thickness: 0.999 }, { scope: null, peerParts: [] });
    expect(result.repairedDsl).toEqual({ ...baseDsl, thickness: 0.999 });
  });
});
