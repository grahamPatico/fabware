import { describe, it, expect } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import { computeIntersectionRules } from "../intersectRules";

const ORIGIN = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };

function plate(id: string, role: string, position = ORIGIN): Doc<"parts"> {
  return {
    _id: id, role, label: role, position, kind: "sheet_metal", partType: "plate",
    material: "Mild Steel (CRS)", thickness: 0.075, width: 4, height: 3,
    dslJson: JSON.stringify({
      version: 1, partType: "plate", material: "Mild Steel (CRS)", thickness: 0.075,
      width: 4, height: 3, depth: null, outline: { kind: "rectangle" }, features: [],
      finish: null, assemblyRefs: [],
    }),
  } as unknown as Doc<"parts">;
}

function screw(id: string, position = ORIGIN): Doc<"parts"> {
  return {
    _id: id, role: "screw", label: "M3 x 10 SHCS", position, kind: "purchased", partType: "purchased",
  } as unknown as Doc<"parts">;
}

describe("computeIntersectionRules", () => {
  it("fails two fabricated parts that share volume", () => {
    const rules = computeIntersectionRules([plate("a", "base"), plate("b", "lid")]);
    expect(rules.some((r) => r.status === "fail")).toBe(true);
  });

  it("ignores purchased hardware sitting inside a fabricated part", () => {
    const rules = computeIntersectionRules([plate("a", "base"), screw("s")]);
    expect(rules).toHaveLength(1);
    expect(rules[0].status).toBe("pass");
  });

  it("still catches fabricated overlaps when hardware is present", () => {
    const rules = computeIntersectionRules([plate("a", "base"), screw("s"), plate("b", "lid")]);
    expect(rules.some((r) => r.status === "fail")).toBe(true);
  });
});
