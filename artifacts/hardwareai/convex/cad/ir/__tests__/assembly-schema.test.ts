// convex/cad/ir/__tests__/assembly-schema.test.ts
// Phase 4 Task 2 — Zod schema tests for PartRef / Joint / Connection
import { describe, expect, it } from "vitest";
import { CadIrSchema } from "../schema";
import { emptyIr } from "../empty";
import type { CadIr } from "../types";

// A minimal child IR (no parts/joints/connections)
const childIr: CadIr = emptyIr("mm");

// Minimal assembly IR with one part
const assemblyWithPart = {
  schemaVersion: 1 as const,
  units: "mm" as const,
  parameters: {},
  sketches: {},
  features: [],
  parts: {
    lid: {
      id: "lid",
      ir: childIr,
    },
  },
};

describe("CadIrSchema — Phase 4 assembly fields", () => {
  it("accepts an IR with no assembly fields (single-part backward compat)", () => {
    expect(() => CadIrSchema.parse(emptyIr("mm"))).not.toThrow();
  });

  it("accepts a valid assembly with parts, joints, and connections", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [],
      parts: {
        base: { id: "base", ir: childIr, origin: { x: 0, y: 0, z: 0 } },
        lid: { id: "lid", ir: childIr, origin: { x: 0, y: 0, z: 50 } },
      },
      joints: {
        hinge: {
          id: "hinge",
          parent: "base",
          child: "lid",
          type: "revolute" as const,
          axis: { kind: "standard" as const, axis: "y" as const },
          limits: { lower: 0, upper: 90, unit: "deg" as const },
        },
      },
      connections: [
        {
          partA: "base",
          featureA: "ex1",
          partB: "lid",
          featureB: "ex1",
          type: "face_mate" as const,
        },
      ],
    };
    expect(() => CadIrSchema.parse(ir)).not.toThrow();
  });

  it("accepts a nested PartRef (ir inside ir)", () => {
    const nested = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [],
      parts: {
        child: {
          id: "child",
          ir: assemblyWithPart, // nested assembly
        },
      },
    };
    expect(() => CadIrSchema.parse(nested)).not.toThrow();
  });

  it("rejects a joint with an invalid type", () => {
    const ir = {
      schemaVersion: 1 as const,
      units: "mm" as const,
      parameters: {},
      sketches: {},
      features: [],
      joints: {
        bad: {
          id: "bad",
          parent: "base",
          child: "lid",
          type: "spinning", // invalid
        },
      },
    };
    expect(() => CadIrSchema.parse(ir)).toThrow();
  });
});
