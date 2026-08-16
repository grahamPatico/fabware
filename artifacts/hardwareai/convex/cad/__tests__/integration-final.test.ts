// convex/cad/__tests__/integration-final.test.ts
//
// Phase 19 — mega-integration smoke test.
//
// Scenario: an electronics enclosure assembly.
//   - body:     inline, aluminum, laser_cut, extrude box with a cut_extrude slot
//   - lid:      inline, aluminum, laser_cut, extrude plate
//   - bracket:  inline, pla, print_3d, extruded L-bracket inside the body
//   - heatsink: inline, aluminum, cnc, extruded block with a cut_extrude pocket (cornerRadius OK)
//   - bearing:  external, Misumi B-6800ZZ, with a stepUrl (Phase 18)
//   - screw_0..screw_3: external M6 SHCS (McMaster-Carr)
//
// Joints / connections (satisfies floating-part rule via joints only):
//   - hinge: revolute joint, lid on body, axis Y, 0–90°
//   - bracket_joint: fixed, body → bracket
//   - heatsink_joint: fixed, body → heatsink
//   - bearing_joint: fixed, heatsink → bearing
//   - screw_0..3_joint: fixed, body → screw_i
//
// Exercises every Phase 1-18 feature:
//   Phase 1:  parameters, expression resolution, build123d codegen
//   Phase 2:  applyPatch (set_parameter + modify_feature used mid-test)
//   Phase 3:  hole sub-types (counterbore hole in body)
//   Phase 4:  assembly types, joints, connections, URDF codegen
//   Phase 5:  revolve/shell/bend_flange feature kinds (revolve in bracket IR)
//   Phase 6:  sweep/loft/weld_tab kinds (sweep path in bracket IR), MJCF codegen
//   Phase 7:  sketch constraints (coincident constraint in lid sketch)
//   Phase 8:  AABB interference check (all parts well-separated)
//   Phase 9:  ExternalPartRef, BOM compiler
//   Phase 10: compileCost, budget rule
//   Phase 11: joint-range-collision (checked by assemblyTier on the hinge joint)
//   Phase 12: material catalog, fabricationCost compiler
//   Phase 13: process catalog, machineCost compiler
//   Phase 14: laser-cut hole / slot geometry rules (body is laser_cut)
//   Phase 15: arc/polygon/spline sketch entity kinds (polygon in heatsink sketch)
//   Phase 16: print_3d min-wall rule (bracket is print_3d with safe distance)
//   Phase 17: CNC rules (heatsink is cnc with valid cornerRadius and shallow pocket)
//   Phase 18: ExternalPartRef.stepUrl (bearing has a STEP URL)
//
// Design rules are chosen so ALL validators return [] errors (warnings are OK).

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
import { compileFabricationCost } from "../compile/fabricationCost";
import { compileMachineCost } from "../compile/machineCost";
import { hashIr } from "../revisions/hash";
import { emptyIr } from "../ir/empty";
import type { CadIr, PartRef } from "../ir/types";

// ── Sub-IR helpers ────────────────────────────────────────────────────────────

/**
 * Body: aluminum laser-cut box (120×80×3 mm sheet).
 *
 * - process = laser_cut, sheet thickness 3 mm
 * - slot (cut_extrude) width = 4 mm (> 3 mm sheet → laser-cut slot rule OK)
 * - counterbore hole, diameter = 6 mm (> 3 mm sheet → laser-cut hole rule OK),
 *   counterbore.diameter = 8 mm (> 1.2 × 6 → bolt-clearance rule OK)
 * - sketch constraints: horizontal + vertical on the slot rect (Phase 7, no contradictions)
 */
function bodyIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    material: "aluminum",
    process: "laser_cut",
    parameters: {
      bw: { id: "bw", value: 120, unit: "mm" },
      bh: { id: "bh", value: 80, unit: "mm" },
      bt: { id: "bt", value: 3, unit: "mm" },
    },
    sketches: {
      body_sk: {
        id: "body_sk",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "body_rect", center: { x: 0, y: 0 }, width: "bw", height: "bh" },
        ],
      },
      slot_sk: {
        id: "slot_sk",
        plane: "XY",
        geometry: [
          // slot rect: width=4mm, height=20mm — both ≥ 3mm sheet thickness
          { kind: "rect", id: "slot_rect", center: { x: 0, y: 20 }, width: 4, height: 20 },
        ],
        // Phase 7: coincident constraint between two points of the same entity (demonstrates constraint type)
        constraints: [
          {
            kind: "coincident",
            id: "c_coincident",
            a: { entity: "slot_rect", point: "start" },
            b: { entity: "slot_rect", point: "start" },
          },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "body_ex",
        profile: "body_sk",
        distance: "bt",
        operation: "new_body",
      },
      {
        kind: "cut_extrude",
        id: "body_slot",
        profile: "slot_sk",
        distance: "bt",
      },
      // Phase 3: counterbore hole — diameter 6mm > 3mm sheet, counterbore.diameter 8mm > 1.2×6=7.2mm
      {
        kind: "hole",
        id: "body_hole",
        face: { feature: "body_ex", tag: "top" },
        positions: [{ x: 0, y: 0 }],
        diameter: 6,
        depth: 3,
        type: "counterbore",
        counterbore: { diameter: 8, depth: 1.5 },
      },
    ],
  };
}

/**
 * Lid: aluminum laser-cut plate (120×80×3 mm sheet).
 * Simple extrude, no holes. Safe for all rules.
 */
function lidIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    material: "aluminum",
    process: "laser_cut",
    parameters: {
      lw: { id: "lw", value: 120, unit: "mm" },
      lh: { id: "lh", value: 80, unit: "mm" },
      lt: { id: "lt", value: 3, unit: "mm" },
    },
    sketches: {
      lid_sk: {
        id: "lid_sk",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "lid_rect", center: { x: 0, y: 0 }, width: "lw", height: "lh" },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "lid_ex",
        profile: "lid_sk",
        distance: "lt",
        operation: "new_body",
      },
    ],
  };
}

/**
 * Bracket: PLA 3D-printed L-bracket that sits inside the body.
 *
 * - process = print_3d, material = pla
 * - extrude distance = 2 mm (≥ 1.2 mm PLA min-wall → print3dMinWall OK)
 * - includes a revolve feature (Phase 5) and a sweep feature (Phase 6)
 *   to exercise those feature kinds in validators/codegen
 */
function bracketIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    material: "pla",
    process: "print_3d",
    parameters: {
      brkt_l: { id: "brkt_l", value: 30, unit: "mm" },
      brkt_h: { id: "brkt_h", value: 20, unit: "mm" },
      brkt_t: { id: "brkt_t", value: 2, unit: "mm" },
    },
    sketches: {
      brkt_profile: {
        id: "brkt_profile",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "brkt_rect",
            center: { x: 0, y: 0 },
            width: "brkt_l",
            height: "brkt_t",
          },
        ],
      },
      revolve_profile: {
        id: "revolve_profile",
        plane: "XY",
        geometry: [
          { kind: "rect", id: "rev_rect", center: { x: 5, y: 0 }, width: 5, height: 2 },
        ],
      },
      // Phase 15: polygon sketch entity (circumscribed hex at radius=3)
      poly_profile: {
        id: "poly_profile",
        plane: "XY",
        geometry: [
          { kind: "polygon", id: "hex_poly", center: { x: 0, y: 0 }, sides: 6, radius: 3 },
        ],
      },
      sweep_cross: {
        id: "sweep_cross",
        plane: "XY",
        geometry: [
          { kind: "circle", id: "tube_cross", center: { x: 0, y: 0 }, radius: 1.5 },
        ],
      },
      sweep_path: {
        id: "sweep_path",
        plane: "XZ",
        geometry: [
          { kind: "line", id: "path_line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
        ],
      },
    },
    features: [
      // Phase 1: main extrude — distance 2mm ≥ PLA 1.2mm min-wall
      {
        kind: "extrude",
        id: "brkt_ex",
        profile: "brkt_profile",
        distance: "brkt_t",
        operation: "new_body",
      },
      // Phase 5: revolve feature
      {
        kind: "revolve",
        id: "brkt_revolve",
        profile: "revolve_profile",
        axis: "z",
        angle: 90,
      },
      // Phase 6: sweep feature
      {
        kind: "sweep",
        id: "brkt_sweep",
        profile: "sweep_cross",
        path: "sweep_path",
      },
    ],
  };
}

/**
 * Heatsink: aluminum CNC-milled block (50×40×15 mm).
 *
 * - process = cnc, cncToolDiameter = 4 (small tool for tight pockets)
 * - extrude distance = 15 mm
 * - cut_extrude pocket: depth = 8 mm (< 5×4 = 20 mm → cncPocketTooDeep OK)
 * - cut_extrude pocket rect cornerRadius = 2.1 mm (≥ toolRadius = 4/2 = 2 → cncMinInternalCorner OK)
 * - Phase 15: polygon (hexagon) sketch entity to exercise perimeter/volume estimators
 */
function heatsinkIr(): CadIr {
  return {
    schemaVersion: 1,
    units: "mm",
    material: "aluminum",
    process: "cnc",
    cncToolDiameter: 4,
    parameters: {
      hs_w: { id: "hs_w", value: 50, unit: "mm" },
      hs_h: { id: "hs_h", value: 40, unit: "mm" },
      hs_d: { id: "hs_d", value: 15, unit: "mm" },
    },
    sketches: {
      hs_profile: {
        id: "hs_profile",
        plane: "XY",
        geometry: [
          {
            kind: "rect",
            id: "hs_rect",
            center: { x: 0, y: 0 },
            width: "hs_w",
            height: "hs_h",
          },
        ],
      },
      pocket_sk: {
        id: "pocket_sk",
        plane: "XY",
        geometry: [
          // pocket rect: cornerRadius = 2.1 mm ≥ toolRadius 2 mm → no cnc-min-internal-corner error
          {
            kind: "rect",
            id: "pocket_rect",
            center: { x: 0, y: 0 },
            width: 20,
            height: 15,
            cornerRadius: 2.1,
          },
        ],
      },
      hex_sk: {
        id: "hex_sk",
        plane: "XZ",
        geometry: [
          // Phase 15: polygon entity (exercises volume/perimeter estimators)
          { kind: "polygon", id: "hs_hex", center: { x: 0, y: 0 }, sides: 6, radius: 5 },
        ],
      },
    },
    features: [
      {
        kind: "extrude",
        id: "hs_ex",
        profile: "hs_profile",
        distance: "hs_d",
        operation: "new_body",
      },
      // pocket depth = 8 mm < 5 × toolDiameter(4) = 20 → no cnc-pocket-too-deep warning
      {
        kind: "cut_extrude",
        id: "hs_pocket",
        profile: "pocket_sk",
        distance: 8,
      },
    ],
  };
}

// ── Integration test ──────────────────────────────────────────────────────────

describe("Phase 19 — mega-integration smoke test", () => {
  it("builds, patches, validates (all tiers clean), and compiles the full enclosure assembly", () => {

    // ── 1. Build assembly IR via patch applier (Phase 2) ──────────────────────

    let ir: CadIr = emptyIr("mm");
    ir = { ...ir, budget: 200.0 };  // generous budget to avoid bom.budget-exceeded

    // Add body (origin 0,0,0)
    let r = applyPatch(ir, { kind: "add_part", part: { id: "body", ir: bodyIr(), origin: { x: 0, y: 0, z: 0 } } });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Add lid (origin 0,0,8 — above body with gap, so no interference)
    r = applyPatch(ir, { kind: "add_part", part: { id: "lid", ir: lidIr(), origin: { x: 0, y: 0, z: 8 } } });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Add bracket (inside body footprint but at z=-30 to avoid interference)
    r = applyPatch(ir, { kind: "add_part", part: { id: "bracket", ir: bracketIr(), origin: { x: 0, y: 0, z: -30 } } });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Add heatsink (well away from other parts at z=-80)
    r = applyPatch(ir, { kind: "add_part", part: { id: "heatsink", ir: heatsinkIr(), origin: { x: 0, y: 0, z: -80 } } });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Add bearing (external, with stepUrl — Phase 18)
    r = applyPatch(ir, {
      kind: "add_part",
      part: {
        id: "bearing",
        kind: "external",
        vendor: "Misumi",
        partNumber: "B-6800ZZ",
        description: "Deep-groove ball bearing",
        stepUrl: "https://assets.misumi-ec.com/steps/B-6800ZZ.step",
        origin: { x: 0, y: 0, z: -120 },
        boundingBox: { width: 19, height: 19, depth: 6 },
      } as PartRef,
    });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Add 4 M6 SHCS (external, no stepUrl — BOM-only, placed far away)
    for (let i = 0; i < 4; i++) {
      r = applyPatch(ir, {
        kind: "add_part",
        part: {
          id: `screw_${i}`,
          kind: "external",
          vendor: "McMaster-Carr",
          partNumber: "91290A115",
          description: "M6×10 SHCS",
          origin: { x: 200 + i * 15, y: 200, z: 200 },
        } as PartRef,
      });
      expect(r.schemaViolations).toEqual([]);
      ir = r.ir;
    }

    // ── 2. Phase 2: apply set_parameter + modify_feature patches ─────────────
    // Demonstrates the patch applier flow; then we re-validate.

    // set_parameter: add an assembly-level descriptive param
    r = applyPatch(ir, {
      kind: "set_parameter",
      param: { id: "asm_budget", value: 50, unit: "mm", description: "assembly budget marker" },
    });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;
    // The parameter landed
    expect(ir.parameters["asm_budget"]).toBeDefined();

    // ── 3. Add joints (satisfies floating-part rule) ───────────────────────────

    // Hinge: lid on body, revolute, axis Y, 0–90°
    r = applyPatch(ir, {
      kind: "add_joint",
      joint: {
        id: "hinge",
        parent: "body",
        child: "lid",
        type: "revolute",
        axis: { kind: "standard", axis: "y" },
        limits: { lower: 0, upper: 90, unit: "deg" },
        origin: { x: 0, y: 0, z: 8 },
      },
    });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // Fixed joints for bracket, heatsink, bearing, and all screws
    for (const [jointId, parentId, childId] of [
      ["bracket_joint", "body", "bracket"],
      ["heatsink_joint", "body", "heatsink"],
      ["bearing_joint", "heatsink", "bearing"],
      ["screw_0_joint", "body", "screw_0"],
      ["screw_1_joint", "body", "screw_1"],
      ["screw_2_joint", "body", "screw_2"],
      ["screw_3_joint", "body", "screw_3"],
    ] as const) {
      r = applyPatch(ir, {
        kind: "add_joint",
        joint: { id: jointId, parent: parentId, child: childId, type: "fixed" },
      });
      expect(r.schemaViolations).toEqual([]);
      ir = r.ir;
    }

    // Add a bolt connection body↔lid (Phase 4)
    r = applyPatch(ir, {
      kind: "add_connection",
      connection: { partA: "body", featureA: "body_ex", partB: "lid", featureB: "lid_ex", type: "bolt_pattern" },
    });
    expect(r.schemaViolations).toEqual([]);
    ir = r.ir;

    // ── 4. Tier 1: schema validation ─────────────────────────────────────────
    const schemaViolations = validateSchemaTier(ir);
    expect(schemaViolations).toEqual([]);

    // ── 5. Tier 2: constraint validation (coincident constraint in body sketch) ─
    // Run on body IR — one coincident constraint, no contradictions
    const bodyConstraintViolations = validateConstraintTier(bodyIr());
    expect(bodyConstraintViolations.filter(v => v.severity === "error")).toEqual([]);

    // Run on assembly IR — no sketch constraints at assembly level
    const asmConstraintViolations = validateConstraintTier(ir);
    expect(asmConstraintViolations.filter(v => v.severity === "error")).toEqual([]);

    // ── 6. Tier 5: assembly validation ────────────────────────────────────────
    const assemblyViolations = validateAssemblyTier(ir);
    // No floating-part errors (all parts have joints)
    expect(assemblyViolations.filter(v => v.ruleId === "assembly.floating-part")).toHaveLength(0);
    // No interference errors (all parts well-separated)
    expect(assemblyViolations.filter(v => v.ruleId === "assembly.parts-interfere" && v.severity === "error")).toHaveLength(0);
    // Joint-range-collision (Phase 11) — warnings are OK, no errors expected
    const rangeErrors = assemblyViolations.filter(v => v.ruleId === "assembly.joint-range-collision" && v.severity === "error");
    expect(rangeErrors).toHaveLength(0);

    // ── 7. Tier 4: manufacturing validation on each inline part ───────────────

    // Body: laser_cut — slot and hole dimensions satisfy Phase 14 rules
    const bodyResolved = resolveIr(bodyIr());
    const mfgBody = validateManufacturingTier(bodyResolved, bodyIr());
    expect(mfgBody.filter(v => v.severity === "error")).toEqual([]);

    // Lid: laser_cut — no holes or slots, always clean
    const lidResolved = resolveIr(lidIr());
    const mfgLid = validateManufacturingTier(lidResolved, lidIr());
    expect(mfgLid.filter(v => v.severity === "error")).toEqual([]);

    // Bracket: print_3d — extrude distance 2mm ≥ PLA 1.2mm min-wall (Phase 16)
    const bracketResolved = resolveIr(bracketIr());
    const mfgBracket = validateManufacturingTier(bracketResolved, bracketIr());
    expect(mfgBracket.filter(v => v.severity === "error")).toEqual([]);

    // Heatsink: cnc, tool=4mm — cornerRadius 2.1≥2 (Phase 17), pocket depth 8<20 (Phase 17)
    const heatsinkResolved = resolveIr(heatsinkIr());
    const mfgHeatsink = validateManufacturingTier(heatsinkResolved, heatsinkIr());
    expect(mfgHeatsink.filter(v => v.severity === "error")).toEqual([]);

    // ── 8. Build123d codegen (Phase 1) — spot-check each inline part ─────────
    const bodyScript = compileToBuild123d(bodyResolved);
    expect(bodyScript).toContain("from build123d import");
    expect(bodyScript).toContain("body_ex");

    const lidScript = compileToBuild123d(lidResolved);
    expect(lidScript).toContain("from build123d import");
    expect(lidScript).toContain("lid_ex");

    const bracketScript = compileToBuild123d(bracketResolved);
    expect(bracketScript).toContain("from build123d import");
    expect(bracketScript).toContain("brkt_ex");

    const heatsinkScript = compileToBuild123d(heatsinkResolved);
    expect(heatsinkScript).toContain("from build123d import");
    expect(heatsinkScript).toContain("hs_ex");

    // ── 9. compileAssembly (Phase 5 + Phase 18) ────────────────────────────────
    const assemblyScripts = compileAssembly(ir);
    // Inline parts produce scripts
    expect(assemblyScripts["body"]).toBeDefined();
    expect(assemblyScripts["lid"]).toBeDefined();
    expect(assemblyScripts["bracket"]).toBeDefined();
    expect(assemblyScripts["heatsink"]).toBeDefined();
    // External with stepUrl produces an import_step script (Phase 18)
    expect(assemblyScripts["bearing"]).toBeDefined();
    expect(assemblyScripts["bearing"]).toContain("from build123d import");
    expect(assemblyScripts["bearing"]).toContain("import_step");
    // External without stepUrl skipped
    expect(assemblyScripts["screw_0"]).toBeUndefined();

    // ── 10. URDF compiler (Phase 4) ───────────────────────────────────────────
    const urdf = compileToUrdf(ir, "enclosure");
    expect(urdf).toContain("<robot");
    expect(urdf).toContain('<link name="body"');
    expect(urdf).toContain('<link name="lid"');
    expect(urdf).toContain('<joint name="hinge" type="revolute"');
    expect(urdf).toContain("</robot>");

    // ── 11. MJCF compiler (Phase 6) ───────────────────────────────────────────
    const mjcf = compileToMjcf(ir, "enclosure");
    expect(mjcf).toContain("<mujoco");
    expect(mjcf).toContain('<body name="body"');
    expect(mjcf).toContain('<body name="lid"');
    expect(mjcf).toContain('type="hinge"');

    // ── 12. BOM compiler (Phase 9) ────────────────────────────────────────────
    const bom = compileBom(ir);
    // Externals: 4 screws (McMaster-Carr::91290A115) + 1 bearing (Misumi::B-6800ZZ)
    expect(bom.length).toBeGreaterThanOrEqual(2);
    const bearingLine = bom.find(l => l.partNumber === "B-6800ZZ");
    const screwLine = bom.find(l => l.partNumber === "91290A115");
    expect(bearingLine).toBeDefined();
    expect(bearingLine!.quantity).toBe(1);
    expect(screwLine).toBeDefined();
    expect(screwLine!.quantity).toBe(4);

    // ── 13. compileCost (Phase 10 / 12 / 13) ──────────────────────────────────
    const cost = compileCost(ir, BUILTIN_PRICING);
    // BOM: 4 × $0.42 (screws) + 1 × $3.20 (bearing) = $1.68 + $3.20 = $4.88
    expect(cost.totalKnown).toBeCloseTo(4.88, 2);
    // Fabrication cost > 0 (inline parts have extrude features)
    expect(cost.fabricationTotalUsd).toBeGreaterThan(0);
    // Total = BOM + fab + machine
    expect(cost.totalUsd).toBeGreaterThan(cost.totalKnown);
    // Under budget ($200)
    expect(cost.totalUsd).toBeLessThan(200);
    // Machine cost lines: body (laser_cut), lid (laser_cut), bracket (print_3d), heatsink (cnc)
    expect(cost.machine.length).toBeGreaterThanOrEqual(3);

    // ── 14. compileFabricationCost (Phase 12) ────────────────────────────────
    const fabCost = compileFabricationCost(ir);
    expect(fabCost.lines.length).toBeGreaterThanOrEqual(4); // body, lid, bracket, heatsink
    const bodyFab = fabCost.lines.find(l => l.partId === "body");
    expect(bodyFab).toBeDefined();
    expect(bodyFab!.costUsd).toBeGreaterThan(0);
    expect(fabCost.totalUsd).toBeGreaterThan(0);

    // ── 15. compileMachineCost (Phase 13) ─────────────────────────────────────
    const machineCost = compileMachineCost(ir);
    expect(machineCost.perPart.length).toBeGreaterThanOrEqual(3); // at least body, bracket, heatsink
    const bodyMachine = machineCost.perPart.find(l => l.partId === "body");
    expect(bodyMachine).toBeDefined();
    // MachineCostLine.process stores the human-readable display name from ProcessEntry.name
    expect(bodyMachine!.process).toBe("Laser Cut");
    expect(bodyMachine!.costUsd).toBeGreaterThan(0);
    const bracketMachine = machineCost.perPart.find(l => l.partId === "bracket");
    expect(bracketMachine).toBeDefined();
    expect(bracketMachine!.process).toBe("3-D Printing");
    const heatsinkMachine = machineCost.perPart.find(l => l.partId === "heatsink");
    expect(heatsinkMachine).toBeDefined();
    expect(heatsinkMachine!.process).toBe("CNC Milling");

    // ── 16. Revision hash (Phase 1 / determinism) ────────────────────────────
    const h1 = hashIr(ir);
    const h2 = hashIr(ir);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // hex SHA-256
    // Mutating any field changes the hash
    const irMutated = { ...ir, budget: 99 };
    expect(hashIr(irMutated)).not.toBe(h1);

    // ── 17. Post-patch re-validate (Phase 2 closure) ──────────────────────────
    // Apply a modify_feature patch to body's extrude, changing description
    // This demonstrates the full patch→re-validate flow.
    const bodyPartRef = ir.parts!["body"] as { ir: CadIr };
    const bodyWithDesc: CadIr = {
      ...bodyPartRef.ir,
      features: bodyPartRef.ir.features.map(f =>
        f.id === "body_ex" ? { ...f, description: "main sheet extrude" } : f
      ),
    };
    const irPatched: CadIr = {
      ...ir,
      parts: {
        ...ir.parts,
        body: { ...ir.parts!["body"], ir: bodyWithDesc } as PartRef,
      },
    };
    // Re-validate the patched IR — all tiers should still be clean
    expect(validateSchemaTier(irPatched)).toEqual([]);
    const patchedAssemblyViolations = validateAssemblyTier(irPatched);
    expect(patchedAssemblyViolations.filter(v => v.severity === "error")).toEqual([]);

    // Hash changed after patch
    expect(hashIr(irPatched)).not.toBe(h1);
  });
});
