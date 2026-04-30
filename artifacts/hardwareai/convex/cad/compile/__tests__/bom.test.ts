// convex/cad/compile/__tests__/bom.test.ts
// Phase 9 Task 5 — BOM compiler tests

import { describe, expect, it } from "vitest";
import { compileBom } from "../bom";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

function assemblyIr(parts: CadIr["parts"]): CadIr {
  return { ...emptyIr("mm"), parts };
}

describe("compileBom", () => {
  it("returns empty array for a single-part IR with no parts field", () => {
    expect(compileBom(emptyIr("mm"))).toEqual([]);
  });

  it("aggregates external parts by vendor + partNumber", () => {
    const ir = assemblyIr({
      s1: { id: "s1", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115", description: "M3×8" },
      s2: { id: "s2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
    });
    const bom = compileBom(ir);
    expect(bom).toHaveLength(1);
    expect(bom[0]).toMatchObject({ vendor: "McMaster-Carr", partNumber: "91290A115", quantity: 2 });
  });

  it("sorts results by vendor then partNumber", () => {
    const ir = assemblyIr({
      b1: { id: "b1", kind: "external", vendor: "NSK", partNumber: "6002ZZ" },
      b2: { id: "b2", kind: "external", vendor: "McMaster-Carr", partNumber: "91290A115" },
      b3: { id: "b3", kind: "external", vendor: "McMaster-Carr", partNumber: "ABC001" },
    });
    const bom = compileBom(ir);
    expect(bom).toHaveLength(3);
    expect(bom[0].vendor).toBe("McMaster-Carr");
    expect(bom[0].partNumber).toBe("91290A115");
    expect(bom[1].vendor).toBe("McMaster-Carr");
    expect(bom[1].partNumber).toBe("ABC001");
    expect(bom[2].vendor).toBe("NSK");
    expect(bom[2].partNumber).toBe("6002ZZ");
  });

  it("recurses into inline sub-assemblies to find nested external parts", () => {
    // Outer assembly has one inline part whose IR itself has an external part.
    const innerIr = assemblyIr({
      bolt: { id: "bolt", kind: "external", vendor: "Bossard", partNumber: "M4-8" },
    });
    const ir = assemblyIr({
      bracket: { id: "bracket", ir: innerIr },           // inline (no kind)
      nut: { id: "nut", kind: "external", vendor: "Bossard", partNumber: "M4-N" },
    });
    const bom = compileBom(ir);
    expect(bom).toHaveLength(2);
    // Both bolt and nut should appear; sorted Bossard M4-8 < Bossard M4-N
    expect(bom[0]).toMatchObject({ vendor: "Bossard", partNumber: "M4-8", quantity: 1 });
    expect(bom[1]).toMatchObject({ vendor: "Bossard", partNumber: "M4-N", quantity: 1 });
  });
});
