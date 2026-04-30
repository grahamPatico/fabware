// convex/cad/codegen/__tests__/compile-sketch-entities-phase15.test.ts
//
// Phase 15 Task 3 — codegen tests for polygon, spline, and arc sketch entities.

import { describe, expect, it } from "vitest";
import { compileToBuild123d } from "../compileToBuild123d";
import { emptyIr } from "../../ir/empty";
import { resolveIr } from "../../resolve/resolveIr";

describe("compileToBuild123d — polygon sketch entity (Phase 15)", () => {
  it("emits RegularPolygon(radius=r, side_count=n) for a polygon entity", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "polygon" as const,
              id: "hex",
              center: { x: 0, y: 0 },
              sides: 6,
              radius: 20,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "hex_body",
          profile: "sk",
          distance: 5,
          operation: "new_body" as const,
        },
      ],
    });

    const py = compileToBuild123d(ir);
    expect(py).toContain("RegularPolygon(radius=20, side_count=6)");
    expect(py).toContain("with BuildPart() as hex_body:");
  });
});

describe("compileToBuild123d — spline sketch entity (Phase 15)", () => {
  it("emits Spline([(x1,y1), ...]) for a spline entity", () => {
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "spline" as const,
              id: "curve",
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 5 },
                { x: 20, y: 0 },
              ],
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "spline_body",
          profile: "sk",
          distance: 3,
          operation: "new_body" as const,
        },
      ],
    });

    const py = compileToBuild123d(ir);
    expect(py).toContain("Spline([(0,0), (10,5), (20,0)])");
    expect(py).toContain("with BuildPart() as spline_body:");
  });
});

describe("compileToBuild123d — arc sketch entity (Phase 15)", () => {
  it("emits a comment placeholder for an arc entity", () => {
    // Phase 15 v0: exact build123d arc construction is deferred;
    // the emitter emits a comment so the script is still parseable.
    const ir = resolveIr({
      ...emptyIr("mm"),
      parameters: {},
      sketches: {
        sk: {
          id: "sk",
          plane: "XY" as const,
          geometry: [
            {
              kind: "arc" as const,
              id: "a1",
              center: { x: 0, y: 0 },
              radius: 15,
              startAngle: 0,
              endAngle: 90,
            },
          ],
        },
      },
      features: [
        {
          kind: "extrude" as const,
          id: "arc_body",
          profile: "sk",
          distance: 4,
          operation: "new_body" as const,
        },
      ],
    });

    const py = compileToBuild123d(ir);
    // The comment placeholder includes the arc id and angle range
    expect(py).toContain("# arc a1:");
    expect(py).toContain("r=15");
    expect(py).toContain("angle=[0..90]deg");
    expect(py).toContain("with BuildPart() as arc_body:");
  });
});
