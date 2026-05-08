// convex/cad/compile/__tests__/processes.test.ts
// Phase 13 Task 1 — process catalog tests

import { describe, expect, it } from "vitest";
import { BUILTIN_PROCESSES, lookupProcess } from "../processes";
import type { ProcessName } from "../processes";

describe("BUILTIN_PROCESSES", () => {
  it("contains exactly the 5 expected process keys", () => {
    const keys = Object.keys(BUILTIN_PROCESSES).sort();
    expect(keys).toEqual(["cnc", "laser_cut", "none", "print_3d", "sheet_metal_bend"]);
  });

  it("laser_cut has setupUsd=15 and cutUsdPerMm=0.005", () => {
    const p = BUILTIN_PROCESSES.laser_cut;
    expect(p.setupUsd).toBe(15);
    expect(p.cutUsdPerMm).toBe(0.005);
    expect(p.buildUsdPerMm3).toBe(0);
    expect(p.bendUsdEach).toBe(0);
  });

  it("print_3d has setupUsd=5 and buildUsdPerMm3=0.0002", () => {
    const p = BUILTIN_PROCESSES.print_3d;
    expect(p.setupUsd).toBe(5);
    expect(p.buildUsdPerMm3).toBe(0.0002);
    expect(p.cutUsdPerMm).toBe(0);
  });

  it("sheet_metal_bend has setupUsd=20 and bendUsdEach=2", () => {
    const p = BUILTIN_PROCESSES.sheet_metal_bend;
    expect(p.setupUsd).toBe(20);
    expect(p.bendUsdEach).toBe(2);
  });

  it("none has all zeros", () => {
    const p = BUILTIN_PROCESSES.none;
    expect(p.setupUsd).toBe(0);
    expect(p.cutUsdPerMm).toBe(0);
    expect(p.buildUsdPerMm3).toBe(0);
    expect(p.bendUsdEach).toBe(0);
    expect(p.removeUsd).toBe(0);
  });
});

describe("lookupProcess", () => {
  it("returns laser_cut entry for 'laser_cut'", () => {
    const p = lookupProcess("laser_cut");
    expect(p.setupUsd).toBe(15);
    expect(p.name).toBe("Laser Cut");
  });

  it("falls back to none when name is undefined", () => {
    const p = lookupProcess(undefined);
    expect(p).toBe(BUILTIN_PROCESSES.none);
  });

  it("falls back to none for an unknown process name (cast)", () => {
    const p = lookupProcess("unknown_process" as ProcessName);
    expect(p).toBe(BUILTIN_PROCESSES.none);
  });

  it("returns cnc entry for 'cnc'", () => {
    const p = lookupProcess("cnc");
    expect(p.setupUsd).toBe(50);
    expect(p.name).toBe("CNC Milling");
  });

  it("returns none entry for 'none'", () => {
    const p = lookupProcess("none");
    expect(p).toBe(BUILTIN_PROCESSES.none);
  });
});
