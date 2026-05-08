// convex/cad/__tests__/integration-phase10.test.ts
//
// Phase 10 Task 4 — Comprehensive integration smoke test.
//
// Scenario: multi-part hinged enclosure with M6 fasteners.
//   - body: inline part with an extrude feature (100×80×30 box)
//   - lid:  inline part with an extrude feature (100×80×10 lid)
//   - hinge: revolute joint, axis Y, 0–120°
//   - 4 × M6 SHCS (McMaster-Carr 91290A115) placed above the assembly
//   - 4 × M6 hex nut (McMaster-Carr 91100A060) placed opposite the screws
//   - bolt connections: screw_i ↔ nut_i (satisfies floating-part rule)
//   - main bolt connection: body ↔ lid
//   - budget: $5.00
//
// Exercises every Phase 1-9 system end-to-end:
//   Phase 1: parameter resolution, single-part codegen
//   Phase 2: schema/patch
//   Phase 3: hole sub-types (no holes in this fixture, but manufacturing tier runs)
//   Phase 4: assembly patches, joints, connections, URDF
//   Phase 5: revolve/shell (extrude only here; mfg tier runs)
//   Phase 6: MJCF compiler
//   Phase 7: constraint tier (no sketch constraints → empty, doesn't short-circuit)
//   Phase 8: AABB interference check
//   Phase 9: BOM compiler, external parts
//   Phase 10: cost compiler, budget rule

import { describe, expect, it } from "vitest";

import { applyPatch } from "../patch/apply";
import { validateSchemaTier } from "../validate/schemaTier";
import { validateConstraintTier } from "../validate/constraintTier";
import { validateAssemblyTier } from "../validate/assemblyTier";
import { validateManufacturingTier } from "../validate/manufacturingTier";
import { resolveIr } from "../resolve/resolveIr";
import { compileToBuild123d } from "../codegen/compileToBuild123d";
import { compileAssembly } from "../codegen/compileAssembly";
import { compileToUrdf } from "../codegen/compileToUrdf";
import { compileToMjcf } from "../codegen/compileToMjcf";
import { compileBom } from "../compile/bom";
import { compileCost, BUILTIN_PRICING } from "../compile/cost";
import { budgetExceeded } from "../validate/rules/budgetExceeded";
import { hashIr } from "../revisions/hash";
import { emptyIr } from "../ir/empty";
import type { CadIr, PartRef } from "../ir/types";

// ── Helper sub-IRs ──────────────────────────────────────────────────────────

function bodyIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {
      body_w: { id: "body_w", value: 100, unit: "mm" },
      body_h: { id: "body_h", value: 80, unit: "mm" },
      body_d: { id: "body_d", value: 30, unit: "mm" },
    },
    sketches: {
      body_sk: {
        id: "body_sk",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "body_rect", center: { x: 0, y: 0 }, width: "body_w", height: "body_h" },
        ],
      },
    },
    features: [
      { kind: "extrude", id: "body_ex", profile: "body_sk", distance: "body_d", operation: "new_body" },
    ],
  };
}

function lidIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    parameters: {
      lid_w: { id: "lid_w", value: 100, unit: "mm" },
      lid_h: { id: "lid_h", value: 80, unit: "mm" },
      lid_d: { id: "lid_d", value: 10, unit: "mm" },
    },
    sketches: {
      lid_sk: {
        id: "lid_sk",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "lid_rect", center: { x: 0, y: 0 }, width: "lid_w", height: "lid_h" },
        ],
      },
    },
    features: [
      { kind: "extrude", id: "lid_ex", profile: "lid_sk", distance: "lid_d", operation: "new_body" },
    ],
  };
}

// ── Integration test ─────────────────────────────────────────────────────────

describe("Phase 10 integration smoke test — hinged enclosure with M6 fasteners", () => {
  it("builds, validates, compiles, and costs a full multi-part assembly", () => {
    // ── Build the assembly IR via patch applier ──────────────────────────────

    let ir: CadIr = emptyIr("mm");

    // Add body inline part (origin at 0,0,0)
    const r1 = applyPatch(ir, {
      kind: "add_part",
      part: { id: "body", ir: bodyIr(), origin: { x: 0, y: 0, z: 0 } },
    });
    expect(r1.schemaViolations).toEqual([]);
    ir = r1.ir;

    // Add lid inline part (origin at 0,0,40 — above body, separated by 10mm gap)
    const r2 = applyPatch(ir, {
      kind: "add_part",
      part: { id: "lid", ir: lidIr(), origin: { x: 0, y: 0, z: 40 } },
    });
    expect(r2.schemaViolations).toEqual([]);
    ir = r2.ir;

    // Add hinge joint (revolute, axis Y, 0–120°)
    const r3 = applyPatch(ir, {
      kind: "add_joint",
      joint: {
        id: "hinge",
        parent: "body",
        child: "lid",
        type: "revolute",
        axis: { kind: "standard", axis: "y" },
        limits: { lower: 0, upper: 120, unit: "deg" },
        origin: { x: 0, y: 0, z: 40 },
      },
    });
    expect(r3.schemaViolations).toEqual([]);
    ir = r3.ir;

    // Add 4 M6 SHCS (McMaster-Carr 91290A115) — placed well above the body/lid
    // x: 30, y: 20, z: 50+i — non-overlapping with body (0,0,0→30) and lid (40→50)
    const screwPartNumber = "91290A115";
    const nutPartNumber = "91100A060";

    for (let i = 0; i < 4; i++) {
      const screwId = `screw_${i}`;
      const rScrew = applyPatch(ir, {
        kind: "add_part",
        part: {
          id: screwId,
          kind: "external",
          vendor: "McMaster-Carr",
          partNumber: screwPartNumber,
          description: "M6×10 SHCS",
          origin: { x: 30, y: 20, z: 60 + i * 15 },
        } as PartRef,
      });
      expect(rScrew.schemaViolations).toEqual([]);
      ir = rScrew.ir;
    }

    // Add 4 M6 hex nuts (McMaster-Carr 91100A060) — x: -30, well separated from screws
    for (let i = 0; i < 4; i++) {
      const nutId = `nut_${i}`;
      const rNut = applyPatch(ir, {
        kind: "add_part",
        part: {
          id: nutId,
          kind: "external",
          vendor: "McMaster-Carr",
          partNumber: nutPartNumber,
          description: "M6 hex nut",
          origin: { x: -30, y: 20, z: 60 + i * 15 },
        } as PartRef,
      });
      expect(rNut.schemaViolations).toEqual([]);
      ir = rNut.ir;
    }

    // Add bolt connections between each screw and its matching nut
    // (satisfies floating-part rule: every screw and nut is connected)
    for (let i = 0; i < 4; i++) {
      const rConn = applyPatch(ir, {
        kind: "add_connection",
        connection: {
          partA: `screw_${i}`,
          featureA: "head",
          partB: `nut_${i}`,
          featureB: "thread",
          type: "bolt_pattern",
        },
      });
      expect(rConn.schemaViolations).toEqual([]);
      ir = rConn.ir;
    }

    // Main bolt connection: body ↔ lid (flange faces)
    const rMainConn = applyPatch(ir, {
      kind: "add_connection",
      connection: {
        partA: "body",
        featureA: "body_ex",
        partB: "lid",
        featureB: "lid_ex",
        type: "bolt_pattern",
      },
    });
    expect(rMainConn.schemaViolations).toEqual([]);
    ir = rMainConn.ir;

    // Set budget
    ir = { ...ir, budget: 5.00 };

    // ── Tier 1: schema validation ────────────────────────────────────────────
    const schemaViolations = validateSchemaTier(ir);
    expect(schemaViolations).toEqual([]);

    // ── Tier 2: constraint validation (no constraints → empty) ───────────────
    const constraintViolations = validateConstraintTier(ir);
    expect(constraintViolations).toEqual([]);

    // ── Tier 5: assembly validation ──────────────────────────────────────────
    // All parts must be connected:
    //   body ↔ lid via hinge joint
    //   screw_i ↔ nut_i via bolt_pattern connections — BUT connections don't satisfy
    //   the floating-part check in assemblyTier (only joints do). We need joints for screws+nuts.
    //
    // The floating-part rule in assemblyTier checks joints, not connections.
    // Add joints between each screw and nut pair to satisfy it.
    for (let i = 0; i < 4; i++) {
      const rJoint = applyPatch(ir, {
        kind: "add_joint",
        joint: {
          id: `pair_${i}`,
          parent: `screw_${i}`,
          child: `nut_${i}`,
          type: "fixed",
          origin: { x: 0, y: 0, z: 0 },
        },
      });
      expect(rJoint.schemaViolations).toEqual([]);
      ir = rJoint.ir;
    }

    // Now all 10 parts have joints
    const assemblyViolations = validateAssemblyTier(ir);
    expect(assemblyViolations.filter(v => v.ruleId === "assembly.floating-part")).toHaveLength(0);
    // No parts-interfere violations (parts are well-separated)
    expect(assemblyViolations.filter(v => v.ruleId === "assembly.parts-interfere")).toHaveLength(0);

    // ── Tier 4: manufacturing validation ────────────────────────────────────
    // Body and lid inline parts resolve cleanly — no manufacturing violations expected
    // (no holes, no thin walls beyond 2 mm).
    // We run manufacturing tier on body sub-IR as a spot-check.
    const bodyResolved = resolveIr(bodyIr());
    const mfgBodyViolations = validateManufacturingTier(bodyResolved, bodyIr());
    expect(mfgBodyViolations).toHaveLength(0);

    const lidResolved = resolveIr(lidIr());
    const mfgLidViolations = validateManufacturingTier(lidResolved, lidIr());
    expect(mfgLidViolations).toHaveLength(0);

    // ── Phase 1: build123d codegen (single-part) ────────────────────────────
    const bodyScript = compileToBuild123d(bodyResolved);
    expect(bodyScript).toContain("from build123d import *");
    expect(bodyScript).toContain("body_ex");

    const lidScript = compileToBuild123d(lidResolved);
    expect(lidScript).toContain("from build123d import *");
    expect(lidScript).toContain("lid_ex");

    // ── Phase 5: compileAssembly (skips externals) ───────────────────────────
    const assemblyScripts = compileAssembly(ir);
    // Only inline parts (body and lid) produce scripts; external parts are skipped
    expect(assemblyScripts["body"]).toBeDefined();
    expect(assemblyScripts["lid"]).toBeDefined();
    expect(assemblyScripts["screw_0"]).toBeUndefined();
    expect(assemblyScripts["nut_0"]).toBeUndefined();

    // ── Phase 4: URDF compiler ───────────────────────────────────────────────
    const urdf = compileToUrdf(ir, "hinged_enclosure");
    expect(urdf).toContain('<robot name="hinged_enclosure">');
    expect(urdf).toContain('<link name="body"/>');
    expect(urdf).toContain('<link name="lid"/>');
    expect(urdf).toContain('<joint name="hinge" type="revolute">');
    expect(urdf).toContain('<axis xyz="0 1 0"/>');
    expect(urdf).toContain("</robot>");

    // ── Phase 6: MJCF compiler ───────────────────────────────────────────────
    const mjcf = compileToMjcf(ir, "hinged_enclosure");
    expect(mjcf).toContain('<mujoco model="hinged_enclosure">');
    expect(mjcf).toContain('<body name="body"');
    expect(mjcf).toContain('<body name="lid"');
    expect(mjcf).toContain('type="hinge"');
    expect(mjcf).toContain("</mujoco>");

    // ── Phase 9: BOM compiler ────────────────────────────────────────────────
    const bom = compileBom(ir);
    // 4 screws + 4 nuts = 2 unique lines
    expect(bom).toHaveLength(2);
    const screwLine = bom.find(l => l.partNumber === screwPartNumber);
    const nutLine = bom.find(l => l.partNumber === nutPartNumber);
    expect(screwLine).toBeDefined();
    expect(screwLine!.quantity).toBe(4);
    expect(nutLine).toBeDefined();
    expect(nutLine!.quantity).toBe(4);

    // ── Phase 10: cost compiler ──────────────────────────────────────────────
    // BOM: 4 × $0.42 (screws) + 4 × $0.15 (nuts) = $1.68 + $0.60 = $2.28
    //
    // Phase 12 fabrication cost (both inline parts default to aluminum 6061):
    //   body: 100×80×30 = 240,000 mm³ = 240 cm³ × 2.7 g/cm³ / 1000 = 0.648 kg × $8/kg = $5.184
    //   lid:  100×80×10 = 80,000 mm³  = 80 cm³  × 2.7 g/cm³ / 1000 = 0.216 kg × $8/kg = $1.728
    //   fabrication total = $5.184 + $1.728 = $6.912
    //
    // totalUsd = $2.28 + $6.912 = $9.192
    const cost = compileCost(ir, BUILTIN_PRICING);
    expect(cost.hasMissingPrices).toBe(false);
    expect(cost.totalKnown).toBeCloseTo(2.28, 6);
    expect(cost.fabricationTotalUsd).toBeCloseTo(6.912, 3);
    expect(cost.totalUsd).toBeCloseTo(9.192, 3);
    // Two cost lines
    expect(cost.lines).toHaveLength(2);

    // ── Phase 10: budget rule (cost < budget → no violation) ─────────────────
    // budget = $5.00, cost = $2.28 → under budget
    const budgetViolations = budgetExceeded(ir);
    expect(budgetViolations).toHaveLength(0);

    // ── Phase 1: revision hash ───────────────────────────────────────────────
    const h1 = hashIr(ir);
    const h2 = hashIr(ir);
    expect(h1).toBe(h2); // deterministic
    expect(h1).toHaveLength(64); // hex SHA-256
    // Mutation changes hash
    const irMutated = { ...ir, budget: 10.00 };
    expect(hashIr(irMutated)).not.toBe(h1);
  });
});
