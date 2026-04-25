import { describe, it, expect } from "vitest";
import { validateAssembly, type AssemblyInput } from "../assemblyRules";
import type { PartDsl } from "../dsl";

function platePartDsl(width: number, height: number, holeCount = 0, holeDiameter = 0.266): PartDsl {
  return {
    version: 1, partType: "plate", material: "Mild Steel (CRS)",
    thickness: 0.075, width, height, depth: null,
    features: holeCount > 0
      ? [{ kind: "hole", name: "mounting_hole", count: holeCount, diameter: holeDiameter, pattern: "corner", inset: 0.375 }]
      : [],
    finish: null, assemblyRefs: [],
  };
}

describe("validateAssembly", () => {
  it("passes trivially for a project with zero interfaces", () => {
    const input: AssemblyInput = {
      parts: [],
      interfaces: [],
      scope: null,
    };
    const result = validateAssembly(input);
    expect(result.rules).toEqual([]);
    expect(result.hasFailures).toBe(false);
  });

  it("fires hole_pattern_match FAIL when two bolted parts have mismatched hole counts", () => {
    const input: AssemblyInput = {
      parts: [
        { id: "a", role: "plate_a", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3, 4) },
        { id: "b", role: "plate_b", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3, 2) },
      ],
      interfaces: [{
        kind: "bolted",
        partA: "a", partB: "b",
        featureRefs: [
          { partId: "a", featureName: "mounting_hole" },
          { partId: "b", featureName: "mounting_hole" },
        ],
        hardwareRefs: [{ mcmasterPartNumber: "91251A540", quantity: 4 }],
      }],
      scope: null,
    };
    const result = validateAssembly(input);
    const rule = result.rules.find(r => r.id === "hole_pattern_match");
    expect(rule?.status).toBe("fail");
    expect(rule?.message).toContain("count");
  });

  it("fires scope_material_match WARN for outdoor MVP with bare CRS", () => {
    const input: AssemblyInput = {
      parts: [
        { id: "a", role: "base", pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }, dsl: platePartDsl(4, 3) },
      ],
      interfaces: [],
      scope: { tier: "mvp", environment: { location: "outdoor" }, useCase: "test" },
    };
    const result = validateAssembly(input);
    const rule = result.rules.find(r => r.id === "scope_material_match");
    expect(rule?.status).toBe("warn");
  });

  it("passes hole_pattern_match for two parts with matching count + diameter regardless of pose", () => {
    // Simulate archetype-generated assembly: base at z=0, wall rotated π/2 so world-space
    // hole positions never coincide — but count + diameter both match.
    const input: AssemblyInput = {
      parts: [
        {
          id: "base",
          role: "base",
          pose: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 },
          dsl: platePartDsl(6, 4, 4, 0.266),
        },
        {
          id: "wall",
          role: "wall",
          // Rotated π/2 around X axis and offset to z=innerH/2 — world-space holes won't coincide.
          pose: { x: 0, y: 2, z: 3, rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
          dsl: platePartDsl(6, 4, 4, 0.266),
        },
      ],
      interfaces: [{
        kind: "bolted",
        partA: "base",
        partB: "wall",
        featureRefs: [
          { partId: "base", featureName: "mounting_hole" },
          { partId: "wall", featureName: "mounting_hole" },
        ],
        hardwareRefs: [{ mcmasterPartNumber: "91251A540", quantity: 4 }],
      }],
      scope: null,
    };
    const result = validateAssembly(input);
    const rule = result.rules.find(r => r.id === "hole_pattern_match");
    expect(rule?.status).toBe("pass");
    // The alignment check should be a warn (positions won't coincide due to different poses).
    const alignRule = result.rules.find(r => r.id === "hole_position_alignment");
    expect(alignRule?.status).toBe("warn");
  });
});
