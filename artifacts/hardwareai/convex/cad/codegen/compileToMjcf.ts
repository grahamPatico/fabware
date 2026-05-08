// convex/cad/codegen/compileToMjcf.ts
//
// Phase 6 MJCF (MuJoCo XML Format) compiler: converts a CadIr assembly into
// an MJCF XML string for use in MuJoCo physics simulation.
//
// MJCF uses SI units (meters, radians). CadIr uses mm/in for lengths,
// deg/rad for joint limits. Conversions are applied at compile time.
//
// Joint mapping:
//   CadIr "revolute" → MJCF joint type="hinge"
//   CadIr "linear"   → MJCF joint type="slide"
//   CadIr "fixed"    → no <joint> element (bodies are rigidly attached)
//
// Differences from URDF:
//   - In MJCF, <joint> elements live INSIDE the <body> element for the child part.
//   - Joints reference axis as a 3-vector directly on the joint element.
//   - Limits are expressed as range="lower upper" on the joint element.

import type { CadIr, Joint, AxisRef } from "../ir/types";

// ── Unit conversion helpers ────────────────────────────────────────────────

function toMeters(value: number, unit: "mm" | "in"): number {
  if (unit === "mm") return value / 1000;
  return value * 0.0254; // inches to meters
}

function toRadians(value: number, unit: "deg" | "rad" | "mm" | "in"): number {
  if (unit === "deg") return value * (Math.PI / 180);
  return value; // already radians (length units handled by caller)
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(8)).toString();
}

/**
 * Resolve an AxisRef to an "x y z" xyz string for MJCF joint axis attribute.
 * For "edge" kind, defaults to "0 0 1" (geometry resolution not yet available).
 */
function axisXyz(axis: AxisRef | undefined): string {
  if (!axis) return "0 0 1";
  if (axis.kind === "standard") {
    if (axis.axis === "x") return "1 0 0";
    if (axis.axis === "y") return "0 1 0";
    return "0 0 1";
  }
  // axis.kind === "edge": TODO: edge axis resolution requires geometry
  return "0 0 1";
}

function originPos(
  origin: { x: number; y: number; z: number } | undefined,
  lengthUnit: "mm" | "in",
): string {
  if (!origin) return "0 0 0";
  return [
    fmt(toMeters(origin.x, lengthUnit)),
    fmt(toMeters(origin.y, lengthUnit)),
    fmt(toMeters(origin.z, lengthUnit)),
  ].join(" ");
}

// ── MJCF XML builders ───────────────────────────────────────────────────────

function bodyTag(partId: string, joint: Joint | undefined, lengthUnit: "mm" | "in"): string {
  const lines: string[] = [];

  if (joint) {
    // Compute joint origin position in meters
    const pos = originPos(joint.origin, lengthUnit);
    lines.push(`    <body name="${partId}" pos="${pos}">`);

    if (joint.type === "revolute") {
      // revolute → hinge
      const axisStr = axisXyz(joint.axis);
      let rangeStr = "";
      if (joint.limits) {
        const unit = joint.limits.unit;
        let lower: number;
        let upper: number;
        if (unit === "deg" || unit === "rad") {
          lower = toRadians(joint.limits.lower, unit);
          upper = toRadians(joint.limits.upper, unit);
        } else {
          lower = toMeters(joint.limits.lower, unit as "mm" | "in");
          upper = toMeters(joint.limits.upper, unit as "mm" | "in");
        }
        rangeStr = ` range="${fmt(lower)} ${fmt(upper)}"`;
      }
      lines.push(`      <joint type="hinge" axis="${axisStr}"${rangeStr}/>`);
    } else if (joint.type === "linear") {
      // linear → slide
      const axisStr = axisXyz(joint.axis);
      let rangeStr = "";
      if (joint.limits) {
        const unit = joint.limits.unit;
        let lower: number;
        let upper: number;
        if (unit === "deg" || unit === "rad") {
          lower = toRadians(joint.limits.lower, unit);
          upper = toRadians(joint.limits.upper, unit);
        } else {
          lower = toMeters(joint.limits.lower, unit as "mm" | "in");
          upper = toMeters(joint.limits.upper, unit as "mm" | "in");
        }
        rangeStr = ` range="${fmt(lower)} ${fmt(upper)}"`;
      }
      lines.push(`      <joint type="slide" axis="${axisStr}"${rangeStr}/>`);
    }
    // fixed joints: no <joint> element needed — body is rigidly attached

    lines.push(`    </body>`);
  } else {
    // Part with no joint (e.g. world body / base)
    lines.push(`    <body name="${partId}" pos="0 0 0">`);
    lines.push(`    </body>`);
  }

  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compile a CadIr assembly to an MJCF XML string.
 *
 * @param ir        The CadIr (should have parts + joints defined).
 * @param modelName The MJCF model name attribute.
 * @returns An MJCF XML string.
 */
export function compileToMjcf(ir: CadIr, modelName: string): string {
  const parts = ir.parts ?? {};
  const joints = ir.joints ?? {};
  const lengthUnit = ir.units;

  // Build a lookup: childPartId → Joint
  const jointByChild = new Map<string, Joint>();
  for (const joint of Object.values(joints)) {
    jointByChild.set(joint.child, joint);
  }

  const lines: string[] = [];
  lines.push(`<mujoco model="${modelName}">`);
  lines.push(`  <worldbody>`);

  if (Object.keys(parts).length === 0) {
    // No parts — emit an empty worldbody placeholder body
    lines.push(`    <body name="base_link" pos="0 0 0">`);
    lines.push(`    </body>`);
  } else {
    for (const partId of Object.keys(parts)) {
      const joint = jointByChild.get(partId);
      lines.push(bodyTag(partId, joint, lengthUnit));
    }
  }

  lines.push(`  </worldbody>`);
  lines.push(`</mujoco>`);
  return lines.join("\n");
}
