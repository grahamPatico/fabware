// artifacts/hardwareai/convex/cad/ir/__tests__/schema.test.ts
import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";

describe("CadIrSchema", () => {
  it("accepts a minimal valid IR", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { length: { id: "length", value: 120, unit: "mm" } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects camelCase parameter ids", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { holeSpacing: { id: "holeSpacing", value: 90 } },
      sketches: {},
      features: [],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow(/snake_case/);
  });

  it("rejects unknown feature kinds", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [{ kind: "loft", id: "x", profiles: [] }],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

import { emptyIr } from "../empty";

describe("emptyIr", () => {
  it("returns a valid IR that round-trips through CadIrSchema", () => {
    const ir = emptyIr("mm");
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
    expect(ir.schemaVersion).toBe(1);
    expect(ir.units).toBe("mm");
    expect(ir.features).toEqual([]);
  });
});

// ── Phase 5: RevolveFeature schema tests ─────────────────────────────────────

describe("RevolveFeature schema — Phase 5", () => {
  it("accepts a valid revolve feature with literal angle", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "revolve", id: "rev1", profile: "sk1", axis: "y", angle: 180 },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a revolve feature with param-ref angle", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { sweep_angle: { id: "sweep_angle", value: 270 } },
      sketches: {},
      features: [
        { kind: "revolve", id: "rev1", profile: "sk1", axis: "z", angle: "sweep_angle" },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a revolve feature with angle = 0", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "revolve", id: "rev1", profile: "sk1", axis: "x", angle: 0 },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow(/revolve angle must be > 0/);
  });

  it("rejects a revolve feature with angle > 360", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "revolve", id: "rev1", profile: "sk1", axis: "x", angle: 361 },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow(/revolve angle must be > 0/);
  });
});

// ── Phase 5: ShellFeature schema tests ───────────────────────────────────────

describe("ShellFeature schema — Phase 5", () => {
  it("accepts a valid shell feature", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "shell",
          id: "shell1",
          thickness: 2,
          removedFaces: [{ feature: "extrude_base", tag: "top" }],
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a shell feature with empty removedFaces array", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "shell",
          id: "shell1",
          thickness: 2,
          removedFaces: [],
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });

  it("accepts shell with param-ref thickness and multiple removed faces", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { wall_t: { id: "wall_t", value: 1.5 } },
      sketches: {},
      features: [
        {
          kind: "shell",
          id: "shell1",
          thickness: "wall_t",
          removedFaces: [
            { feature: "box1", tag: "top" },
            { feature: "box1", tag: "bottom" },
          ],
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });
});

// ── Phase 5: BendFlangeFeature schema tests ──────────────────────────────────

describe("BendFlangeFeature schema — Phase 5", () => {
  it("accepts a valid bend_flange feature", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "bend_flange",
          id: "flange1",
          face: { feature: "plate1", tag: "east" },
          angle: 90,
          radius: 1.5,
          length: 20,
          thickness: 2,
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a bend_flange feature missing required fields", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "bend_flange",
          id: "flange1",
          face: { feature: "plate1", tag: "east" },
          angle: 90,
          // missing radius, length, thickness
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });

  it("accepts bend_flange with param-ref radius", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: { bend_r: { id: "bend_r", value: 2 }, sheet_t: { id: "sheet_t", value: 1 } },
      sketches: {},
      features: [
        {
          kind: "bend_flange",
          id: "flange1",
          face: { feature: "plate1", tag: "top" },
          angle: 45,
          radius: "bend_r",
          length: 15,
          thickness: "sheet_t",
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });
});

// ── Phase 6: SweepFeature schema tests ───────────────────────────────────────

describe("SweepFeature schema — Phase 6", () => {
  it("accepts a valid sweep feature with profile and path sketch ids", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "sweep", id: "sweep1", profile: "profile_sk", path: "path_sk" },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a sweep feature missing path", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "sweep", id: "sweep1", profile: "profile_sk" },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

// ── Phase 6: LoftFeature schema tests ────────────────────────────────────────

describe("LoftFeature schema — Phase 6", () => {
  it("accepts a loft feature with ≥ 2 profiles", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "loft", id: "loft1", profiles: ["sk_bot", "sk_top"] },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a loft feature with fewer than 2 profiles", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        { kind: "loft", id: "loft1", profiles: ["sk_only"] },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

// ── Phase 6: WeldTabFeature schema tests ──────────────────────────────────────

describe("WeldTabFeature schema — Phase 6", () => {
  it("accepts a valid weld_tab feature", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "weld_tab",
          id: "tab1",
          face: { feature: "base_body", tag: "north" },
          length: 20,
          width: 10,
          thickness: 3,
          position: { x: 0, y: 15 },
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a weld_tab feature missing thickness", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [
        {
          kind: "weld_tab",
          id: "tab1",
          face: { feature: "base_body", tag: "north" },
          length: 20,
          width: 10,
          // missing thickness
          position: { x: 0, y: 15 },
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

// ── Phase 13: process field schema tests ────────────────────────────────────

describe("CadIr process field — Phase 13", () => {
  it("accepts a valid process value 'laser_cut'", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [],
      process: "laser_cut",
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects an invalid process value", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [],
      process: "plasma_cut", // not in the enum
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

// ── Phase 3: HoleFeature sub-type schema tests ───────────────────────────────

const baseHoleIr = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  sketches: {},
};

function makeHoleFeature(overrides: Record<string, unknown>) {
  return {
    ...baseHoleIr,
    features: [
      {
        kind: "hole",
        id: "h1",
        face: { feature: "ex1", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
        type: "simple",
        ...overrides,
      },
    ],
  };
}

describe("HoleFeature schema — Phase 3 sub-types", () => {
  it("accepts type=simple with no sub-objects", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "simple" }))).not.toThrow();
  });

  it("accepts type=countersink with countersink sub-object", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "countersink", countersink: { angle: 90, diameter: 12 } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=countersink without countersink sub-object", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "countersink" }))).toThrow(
      /countersink sub-object is required/,
    );
  });

  it("accepts type=counterbore with counterbore sub-object", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "counterbore", counterbore: { diameter: 10, depth: 4 } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=threaded without thread sub-object", () => {
    expect(() => CadIrSchema.parse(makeHoleFeature({ type: "threaded" }))).toThrow(
      /thread sub-object is required/,
    );
  });

  it("accepts type=threaded with valid thread spec M6x1.0", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "M6x1.0" } }),
      ),
    ).not.toThrow();
  });

  it("accepts type=threaded with valid thread spec 1/4-20", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "1/4-20" } }),
      ),
    ).not.toThrow();
  });

  it("rejects type=threaded with invalid thread spec", () => {
    expect(() =>
      CadIrSchema.parse(
        makeHoleFeature({ type: "threaded", thread: { spec: "bad-spec" } }),
      ),
    ).toThrow(/thread spec must match/);
  });
});

// ── Phase 15: SketchEntity new kinds ────────────────────────────────────────

const baseSketchIr = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  features: [],
};

describe("SketchEntity arc — Phase 15", () => {
  it("accepts a valid arc entity with center, radius, startAngle, endAngle (degrees)", () => {
    const ir = {
      ...baseSketchIr,
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "arc",
              id: "a1",
              center: { x: 0, y: 0 },
              radius: 10,
              startAngle: 0,
              endAngle: 90,
            },
          ],
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });
});

describe("SketchEntity polygon — Phase 15", () => {
  it("accepts a valid polygon entity with sides in [3, 64]", () => {
    const ir = {
      ...baseSketchIr,
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "polygon",
              id: "p1",
              center: { x: 0, y: 0 },
              sides: 6,
              radius: 20,
            },
          ],
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects polygon with sides < 3", () => {
    const ir = {
      ...baseSketchIr,
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "polygon",
              id: "p1",
              center: { x: 0, y: 0 },
              sides: 2,
              radius: 20,
            },
          ],
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});

describe("SketchEntity spline — Phase 15", () => {
  it("accepts a valid spline entity with ≥ 2 points", () => {
    const ir = {
      ...baseSketchIr,
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "spline",
              id: "sp1",
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 5 },
                { x: 20, y: 0 },
              ],
            },
          ],
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("rejects a spline with fewer than 2 points", () => {
    const ir = {
      ...baseSketchIr,
      sketches: {
        sk: {
          id: "sk",
          plane: "XY",
          geometry: [
            {
              kind: "spline",
              id: "sp1",
              points: [{ x: 0, y: 0 }],
            },
          ],
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
