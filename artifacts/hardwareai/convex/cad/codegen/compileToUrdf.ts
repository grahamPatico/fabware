// convex/cad/codegen/compileToUrdf.ts
//
// Tier-5 URDF compiler: converts a CadIr assembly into a URDF XML string.
//
// URDF uses SI units (meters, radians). CadIr uses mm/in for lengths,
// deg/rad for joint limits. Conversions are applied at compile time.
//
// Limitations:
// - AxisRef.kind === "edge" requires geometry resolution — defaults to 0 0 1.
// - Part meshes are not included (no geometry in CadIr yet; placeholder comment).

import type { CadIr, Joint, AxisRef } from "../ir/types";

// ── Unit conversion helpers ────────────────────────────────────────────────

function toMeters(value: number, unit: "mm" | "in"): number {
  if (unit === "mm") return value / 1000;
  return value * 0.0254; // inches to meters
}

function toRadians(value: number, unit: "deg" | "rad" | "mm" | "in"): number {
  if (unit === "deg") return value * (Math.PI / 180);
  return value; // already radians (or length — handled by caller)
}

/**
 * Resolve an AxisRef to an "x y z" xyz string for URDF <axis xyz="..."/>.
 * For "edge" kind, geometry is required — defaults to "0 0 1" with a comment.
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

function fmt(n: number): string {
  // Avoid excessive trailing zeros but keep enough precision for URDF
  return parseFloat(n.toPrecision(8)).toString();
}

function originXyz(
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

// ── URDF XML builders ───────────────────────────────────────────────────────

function linkTag(name: string): string {
  return `  <link name="${name}"/>`;
}

function jointTag(joint: Joint, lengthUnit: "mm" | "in"): string {
  const lines: string[] = [];
  lines.push(`  <joint name="${joint.id}" type="${joint.type === "linear" ? "prismatic" : joint.type}">`);
  lines.push(`    <parent link="${joint.parent}"/>`);
  lines.push(`    <child link="${joint.child}"/>`);

  // Origin
  const xyz = originXyz(joint.origin, lengthUnit);
  lines.push(`    <origin xyz="${xyz}" rpy="0 0 0"/>`);

  // Axis (only for revolute / prismatic / linear)
  if (joint.type !== "fixed") {
    lines.push(`    <axis xyz="${axisXyz(joint.axis)}"/>`);
  }

  // Limits (required for revolute and prismatic per URDF spec)
  if (joint.limits && joint.type !== "fixed") {
    const unit = joint.limits.unit;
    let lower: number;
    let upper: number;
    if (unit === "deg" || unit === "rad") {
      lower = toRadians(joint.limits.lower, unit);
      upper = toRadians(joint.limits.upper, unit);
    } else {
      // mm or in — prismatic (linear) joint limits in meters
      lower = toMeters(joint.limits.lower, unit as "mm" | "in");
      upper = toMeters(joint.limits.upper, unit as "mm" | "in");
    }
    lines.push(`    <limit lower="${fmt(lower)}" upper="${fmt(upper)}" effort="0" velocity="0"/>`);
  }

  lines.push("  </joint>");
  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compile a CadIr assembly to a URDF XML string.
 *
 * @param ir        The CadIr (should have parts + joints defined).
 * @param robotName The URDF robot name attribute.
 * @returns A URDF XML string (not pretty-printed beyond basic indentation).
 */
export function compileToUrdf(ir: CadIr, robotName: string): string {
  const parts = ir.parts ?? {};
  const joints = ir.joints ?? {};
  const lengthUnit = ir.units;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0"?>`);
  lines.push(`<robot name="${robotName}">`);

  // Emit one <link> per part
  for (const partId of Object.keys(parts)) {
    lines.push(linkTag(partId));
  }

  // If there are no parts but there are no joints either, emit a base_link
  if (Object.keys(parts).length === 0) {
    lines.push(linkTag("base_link"));
  }

  // Emit one <joint> per joint
  for (const [, joint] of Object.entries(joints)) {
    lines.push(jointTag(joint, lengthUnit));
  }

  lines.push("</robot>");
  return lines.join("\n");
}
