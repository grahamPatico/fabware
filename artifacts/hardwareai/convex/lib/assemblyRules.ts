import type { PartDsl } from "./dsl";
import type { Pose } from "./positions";
import { holeWorldPositions, type HoleInstance } from "./featuresInWorld";
import { holesPostBend, type BentHole } from "./bentGeometry";
import { distance, transformPoint, type WorldPoint } from "./positions";
import { threadFromPartNumber } from "./fastenerSpecs";
import { fastenerStackFromPartNumber, validateReceivingHole } from "./fastenerStack";
import { SCS_MATERIALS } from "./scsRules";

// Part's local +Z (face-normal / bolt axis) in world coordinates as a unit
// vector. For bent parts the per-flange face-normal lives on `BentHole`.
function partNormalWorld(pose: Pose): { x: number; y: number; z: number } {
  const origin = transformPoint({ x: 0, y: 0, z: 0 }, pose);
  const tip = transformPoint({ x: 0, y: 0, z: 1 }, pose);
  return { x: tip.x - origin.x, y: tip.y - origin.y, z: tip.z - origin.z };
}

// Perpendicular component of (b - a) relative to unit axis n.
// |b - a - ((b-a)·n)n|
function perpDistance(a: WorldPoint, b: WorldPoint, n: { x: number; y: number; z: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dot = dx * n.x + dy * n.y + dz * n.z;
  const px = dx - dot * n.x, py = dy - dot * n.y, pz = dz - dot * n.z;
  return Math.sqrt(px * px + py * py + pz * pz);
}

export interface AssemblyInput {
  parts: Array<{ id: string; role: string; pose: Pose; dsl: PartDsl }>;
  interfaces: Array<{
    kind: "bolted" | "pem_inserted" | "riveted" | "hinged" | "weld_seam" | "weld_joint";
    partA: string; partB: string;
    featureRefs: Array<{ partId: string; featureName: string }>;
    hardwareRefs: Array<{ mcmasterPartNumber: string; quantity: number; role?: string }>;
    accessSide?: "A-to-B" | "B-to-A" | "either";
  }>;
  scope: null | {
    tier: "jerry-rigged" | "mvp" | "commercial";
    environment: { location: "indoor" | "outdoor"; waterproof?: boolean };
    useCase: string;
  };
}

export interface RuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

const POSITION_TOLERANCE = 0.020;

export function validateAssembly(input: AssemblyInput): { rules: RuleResult[]; hasFailures: boolean } {
  const rules: RuleResult[] = [];
  const partsById = new Map(input.parts.map(p => [p.id, p]));

  for (const iface of input.interfaces) {
    if (iface.kind === "bolted" || iface.kind === "riveted" || iface.kind === "pem_inserted") {
      rules.push(checkHolePatternMatch(iface, partsById));
      rules.push(checkHoleAlignment(iface, partsById));
      rules.push(checkFastenerClearance(iface, partsById));
      rules.push(checkFastenerStackMatch(iface, partsById));
    }
    if (iface.kind === "hinged") {
      rules.push(checkHingeGeometry(iface, partsById));
    }
    if (iface.kind === "pem_inserted") {
      rules.push(checkPemInstallSide(iface));
    }
    if (iface.kind === "weld_seam") {
      rules.push({
        id: "weld_seam_ok",
        label: "Weld seam",
        status: "pass",
        message: `Continuous weld between ${iface.partA} and ${iface.partB}.`,
      });
    }
    if (iface.kind === "weld_joint") {
      rules.push(checkWeldJointTabSlot(iface, partsById));
    }
  }

  if (input.scope) {
    rules.push(checkScopeMaterial(input));
    rules.push(checkScopeTierFastener(input));
  }

  // Project-level hard fail: any sheet-metal part whose flat pattern exceeds
  // its material's max sheet. The per-part validators already flag this, but
  // this rule makes it visible in the project rules-status strip without the
  // user having to focus the offending part.
  rules.push(checkAllPartsWithinMaxSheet(input));

  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}

function checkAllPartsWithinMaxSheet(input: AssemblyInput): RuleResult {
  const offenders: Array<{ role: string; w: number; h: number; mw: number; mh: number; mat: string }> = [];
  for (const p of input.parts) {
    const mat = SCS_MATERIALS[p.dsl.material];
    if (!mat) continue;
    if (p.dsl.width > mat.maxSheet.width || p.dsl.height > mat.maxSheet.height) {
      offenders.push({
        role: p.role,
        w: p.dsl.width, h: p.dsl.height,
        mw: mat.maxSheet.width, mh: mat.maxSheet.height,
        mat: mat.name,
      });
    }
  }
  if (offenders.length === 0) {
    return { id: "assembly_max_sheet", label: "All parts within max sheet", status: "pass",
      message: `Checked ${input.parts.length} part${input.parts.length === 1 ? "" : "s"}; all flat patterns fit their material's sheet.` };
  }
  const head = offenders[0];
  const more = offenders.length > 1 ? ` (+${offenders.length - 1} more)` : "";
  return { id: "assembly_max_sheet", label: "Part exceeds max sheet", status: "fail",
    message: `${head.role} (${head.mat}): ${head.w.toFixed(2)}"×${head.h.toFixed(2)}" exceeds ${head.mw}"×${head.mh}"${more}.`,
    suggestion: "Split the part into smaller pieces or pick a material with a larger sheet." };
}

function partHoles(part: { dsl: PartDsl; pose: Pose }, featureName: string): HoleInstance[] {
  // Use post-bend geometry so flanges that fold onto a mating part report
  // their world positions on the bent flange, not the unfolded flat pattern.
  return holesPostBend(part.dsl, part.pose)
    .filter(h => h.featureName === featureName)
    .map(h => ({ featureName: h.featureName, diameter: h.diameter, local: { x: 0, y: 0, z: 0 }, worldPoint: h.worldPoint }));
}

function partBentHoles(part: { dsl: PartDsl; pose: Pose }, featureName: string): BentHole[] {
  return holesPostBend(part.dsl, part.pose).filter(h => h.featureName === featureName);
}

function checkHolePatternMatch(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const a = parts.get(iface.partA);
  const b = parts.get(iface.partB);
  if (!a || !b) {
    return { id: "hole_pattern_match", label: "Hole pattern match", status: "fail",
      message: `Interface references missing part(s): partA=${iface.partA} partB=${iface.partB}` };
  }
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const refB = iface.featureRefs.find(r => r.partId === iface.partB)?.featureName;
  if (!refA || !refB) {
    return { id: "hole_pattern_match", label: "Hole pattern match", status: "fail",
      message: "Interface is missing featureRefs for one or both parts." };
  }
  const holesA = partHoles(a, refA);
  const holesB = partHoles(b, refB);
  if (holesA.length === 0 && holesB.length === 0) {
    return { id: "hole_pattern_match", label: "Hole pattern match", status: "warn",
      message: `No holes found for ${a.role}.${refA} or ${b.role}.${refB}.` };
  }
  if (holesA.length !== holesB.length) {
    return {
      id: "hole_pattern_match", label: "Hole pattern match", status: "fail",
      message: `Hole count mismatch: ${a.role}.${refA} has ${holesA.length}, ${b.role}.${refB} has ${holesB.length}`,
      suggestion: "Make the two hole features have the same count.",
    };
  }
  const diamA = holesA[0].diameter;
  const diamB = holesB[0].diameter;
  if (Math.abs(diamA - diamB) > 0.001) {
    return {
      id: "hole_pattern_match", label: "Hole pattern match", status: "fail",
      message: `Hole diameter mismatch: ${a.role}.${refA} Ø${diamA}", ${b.role}.${refB} Ø${diamB}".`,
      suggestion: "Ensure both features use the same nominal hole diameter.",
    };
  }
  return { id: "hole_pattern_match", label: "Hole pattern match", status: "pass",
    message: `${holesA.length} holes match (count + diameter).` };
}

function checkHoleAlignment(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const a = parts.get(iface.partA);
  const b = parts.get(iface.partB);
  if (!a || !b) {
    return { id: "hole_position_alignment", label: "Hole position alignment", status: "warn",
      message: `Interface references missing part(s) — skipping position check.` };
  }
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const refB = iface.featureRefs.find(r => r.partId === iface.partB)?.featureName;
  if (!refA || !refB) {
    return { id: "hole_position_alignment", label: "Hole position alignment", status: "warn",
      message: "Missing featureRefs — skipping position check." };
  }
  const holesA = partBentHoles(a, refA);
  const holesB = partBentHoles(b, refB);
  if (holesA.length === 0 || holesB.length === 0 || holesA.length !== holesB.length) {
    return { id: "hole_position_alignment", label: "Hole position alignment", status: "warn",
      message: "Hole count differs or zero — skipping position check." };
  }
  // Bolts pass along the flange face-normal of the hole on partA. For an
  // unbent part this is the part's local +Z; for a bent flange we use the
  // per-hole face-normal that bentGeometry computed (the rotated flange has
  // a different normal than the fixed flange after the bend).
  // A bolt threads through both holes when their centers lie on the same
  // line parallel to that axis — i.e. the perpendicular distance between
  // ha.worldPoint and hb.worldPoint, projected away from the bolt axis,
  // is within tolerance. This naturally accommodates stack-up: parts sitting
  // a thickness apart along the bolt axis still pass.
  const unmatched = holesA.filter(ha =>
    !holesB.some(hb => perpDistance(ha.worldPoint, hb.worldPoint, ha.faceNormalWorld) <= POSITION_TOLERANCE)
  );
  if (unmatched.length > 0) {
    return {
      id: "hole_position_alignment", label: "Hole position alignment", status: "fail",
      message: `${unmatched.length} hole(s) on ${a.role} don't coincide with ${b.role} along the bolt axis within ±${POSITION_TOLERANCE}".`,
      suggestion: "Adjust part poses so the mating hole patterns coincide — bolts can't pass through both parts otherwise.",
    };
  }
  return { id: "hole_position_alignment", label: "Hole position alignment", status: "pass",
    message: `${holesA.length} holes coincide in world space within ±${POSITION_TOLERANCE}".` };
}

function checkFastenerClearance(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const a = parts.get(iface.partA);
  if (!a || !refA) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: "Can't check — missing part or featureRef." };
  }
  const holes = partHoles(a, refA);
  if (holes.length === 0) return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: "No holes to check." };
  const firstFastener = iface.hardwareRefs[0];
  if (!firstFastener) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "fail", message: "No hardware specified for this interface." };
  }
  const spec = threadFromPartNumber(firstFastener.mcmasterPartNumber);
  if (!spec) {
    return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "warn", message: `Thread spec unknown for ${firstFastener.mcmasterPartNumber}.` };
  }
  const holeD = holes[0].diameter;
  if (holeD + 0.003 < spec.clearanceIn) {
    return {
      id: "fastener_clearance_ok", label: "Fastener clearance", status: "fail",
      message: `Hole Ø${holeD}" is too small for ${spec.label} (needs ≥Ø${spec.clearanceIn}").`,
      suggestion: `Open the holes to Ø${spec.clearanceIn}".`,
    };
  }
  return { id: "fastener_clearance_ok", label: "Fastener clearance", status: "pass", message: `Ø${holeD}" clears ${spec.label}.` };
}

/**
 * Validates that the receiving feature (hole on the far part) matches the
 * fastener kind: bolt → clearance/tap/PEM, screw → pilot, rivet → matched
 * rivet hole, etc. Reads the FastenerStack for the interface's first
 * hardware ref and checks the role + diameter on the far-side hole.
 *
 * Skips when role tags aren't set (back-compat with archetypes that don't
 * yet annotate); only fails when an explicit role *contradicts* the
 * fastener kind, which is the high-signal case the user asked for
 * ("a bolt might need a nut").
 */
function checkFastenerStackMatch(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const firstFastener = iface.hardwareRefs[0];
  if (!firstFastener) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: "No hardware specified — skipping stack check." };
  }
  const stack = fastenerStackFromPartNumber(firstFastener.mcmasterPartNumber);
  if (!stack) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: `FastenerStack unknown for ${firstFastener.mcmasterPartNumber}; add it to fastenerStack.ts.` };
  }
  const a = parts.get(iface.partA);
  const b = parts.get(iface.partB);
  if (!a || !b) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: "Can't check stack — missing part." };
  }
  const refA = iface.featureRefs.find(r => r.partId === iface.partA)?.featureName;
  const refB = iface.featureRefs.find(r => r.partId === iface.partB)?.featureName;
  if (!refA || !refB) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: "Missing featureRefs — skipping stack check." };
  }
  // Look up role from the DSL feature on the far-side part.
  const farFeature = b.dsl.features.find(f => f.kind === "hole" && f.name === refB);
  const farHole = farFeature?.kind === "hole" ? farFeature : null;
  if (!farHole) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: `Far-side feature ${b.role}.${refB} isn't a hole — skipping.` };
  }
  // Bolt with no role on the far side is the one case the user named:
  // "a bolt might need a nut." When the bolt's far-side feature has no
  // role tag, surface a warn — we can't confirm the bolt has somewhere
  // to thread into.
  if (stack.kind === "bolt" && !farHole.role) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: `Bolt ${stack.thread} on ${b.role}.${refB}: no receiving feature role set. Confirm a nut, tapped hole, or PEM is present.`,
      suggestion: `Tag the far-side hole with role: "bolt_clear" (needs nut), "tap_${stack.thread}", or "pem_${stack.thread}".` };
  }
  const result = validateReceivingHole(stack, farHole.diameter, farHole.role ?? null);
  if (result.fail) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "fail",
      message: `${b.role}.${refB}: ${result.reason}`,
      suggestion: result.suggestion };
  }
  // Stack-up height check: sum thicknesses of A and B, compare to fastener band.
  const aT = a.dsl.thickness ?? 0;
  const bT = b.dsl.thickness ?? 0;
  const stackHeight = aT + bT;
  if (stackHeight > stack.maxStackIn) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "fail",
      message: `Stack-up ${stackHeight.toFixed(3)}" exceeds ${stack.kind} ${stack.thread} max ${stack.maxStackIn}".`,
      suggestion: `Pick a longer fastener or thinner material.` };
  }
  if (stackHeight < stack.minStackIn) {
    return { id: "fastener_stack_ok", label: "Fastener stack", status: "warn",
      message: `Stack-up ${stackHeight.toFixed(3)}" is below ${stack.kind} ${stack.thread} min ${stack.minStackIn}". Bolt may bottom out.`,
      suggestion: `Use a shorter fastener.` };
  }
  return { id: "fastener_stack_ok", label: "Fastener stack", status: "pass",
    message: `${stack.kind} ${stack.thread}: ${b.role}.${refB} role "${farHole.role ?? "(implicit)"}" mates correctly; stack ${stackHeight.toFixed(3)}".` };
}

/**
 * Per-style hinge geometry validator.
 *
 * Style is encoded in the hardwareRefs[0].role string as "pivot:STYLE"
 * (set by hingedEnclosure.generate). Falls back to "butt" when missing so
 * older projects don't trip a phantom failure.
 *
 *   piano     - quantity 1; expect ceil(edgeLen / 3") mounting holes per part
 *               (continuous hinge needs a screw every ~3" for full strength).
 *   butt      - quantity 2 or 3 (typical doors); each leaf needs 2 mounting
 *               holes per part, so total >= 2 * quantity.
 *   concealed - quantity 2 cup hinges per door; each cup needs a 35mm
 *               (1.378") feature on the door; cabinet-side bracket needs 2
 *               mounting holes per hinge. Validator warns if the door has
 *               no slot/hole feature large enough to be the cup bore.
 */
function checkHingeGeometry(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const partA = parts.get(iface.partA);
  const partB = parts.get(iface.partB);
  if (!partA || !partB) {
    return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "warn",
      message: "Can't check hinge - missing part." };
  }
  const hardwareRole = iface.hardwareRefs?.[0]?.role ?? "pivot:butt";
  const styleParts = hardwareRole.split(":");
  const rawStyle = styleParts.length === 2 ? styleParts[1] : "butt";
  const style: "piano" | "butt" | "concealed" =
    rawStyle === "piano" || rawStyle === "concealed" ? rawStyle : "butt";
  const hingeQty = iface.hardwareRefs?.[0]?.quantity ?? 2;

  const refByPart = new Map<string, string>();
  for (const r of iface.featureRefs ?? []) refByPart.set(r.partId, r.featureName);

  function holeCountFor(part: AssemblyInput["parts"][number]): number {
    const featName = refByPart.get(part.id);
    const f = part.dsl.features.find((x: any) => x.kind === "hole" && (!featName || x.name === featName));
    return f && f.kind === "hole" ? f.count : 0;
  }
  const aHoles = holeCountFor(partA);
  const bHoles = holeCountFor(partB);

  if (style === "piano") {
    const edgeLen = Math.max(partA.dsl.width, partA.dsl.height);
    const required = Math.max(4, Math.ceil(edgeLen / 3));
    if (hingeQty !== 1) {
      return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "warn",
        message: `Piano hinge expects quantity 1 (one continuous hinge), got ${hingeQty}.` };
    }
    if (aHoles < required || bHoles < required) {
      return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "fail",
        message: `Piano hinge needs >= ${required} mounting holes per part (one every ~3"); have ${aHoles} / ${bHoles}.`,
        suggestion: `Increase hole count to ${required} on each part.` };
    }
    return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "pass",
      message: `Piano hinge: ${aHoles} / ${bHoles} mounting holes (>= ${required} required).` };
  }

  if (style === "butt") {
    if (hingeQty < 2 || hingeQty > 3) {
      return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "warn",
        message: `Butt hinges typically come in pairs or triples; got quantity ${hingeQty}.` };
    }
    const required = 2 * hingeQty;
    if (aHoles < required || bHoles < required) {
      return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "fail",
        message: `${hingeQty} butt hinges x 2 holes per leaf = ${required} holes per part required; have ${aHoles} / ${bHoles}.`,
        suggestion: `Add holes to reach ${required} per part.` };
    }
    return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "pass",
      message: `${hingeQty} butt hinges: ${aHoles} / ${bHoles} mounting holes (>= ${required} required).` };
  }

  // concealed
  const CUP_DIA_MIN = 1.0;
  const hasCup = (part: AssemblyInput["parts"][number]) => part.dsl.features.some((f: any) =>
    (f.kind === "hole" && f.diameter >= CUP_DIA_MIN) ||
    (f.kind === "slot" && f.length >= CUP_DIA_MIN && f.width >= CUP_DIA_MIN));
  if (!hasCup(partA) && !hasCup(partB)) {
    return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "warn",
      message: `Concealed hinge needs a 35mm+ cup bore on the door - none found.`,
      suggestion: "Add a cup-bore hole feature (35mm = 1.378\") to the door for each concealed hinge." };
  }
  const bracketRequired = 2 * hingeQty;
  if (aHoles < bracketRequired || bHoles < bracketRequired) {
    return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "fail",
      message: `${hingeQty} concealed hinges x 2 mounting screws each = ${bracketRequired} holes per part required; have ${aHoles} / ${bHoles}.`,
      suggestion: `Add holes to reach ${bracketRequired} per part.` };
  }
  return { id: "hinge_geometry_ok", label: "Hinge geometry", status: "pass",
    message: `Concealed hinges: cup bore present, ${aHoles} / ${bHoles} bracket-mounting holes (>= ${bracketRequired} required).` };
}

function checkWeldJointTabSlot(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  const partA = parts.get(iface.partA);
  const partB = parts.get(iface.partB);
  if (!partA || !partB) {
    return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "warn",
      message: "Can't check tab/slot alignment — missing part." };
  }

  const tabsA = partA.dsl.features.filter((f: any) => f.kind === "tab") as Array<{ name: string; count: number; length: number; width: number; edge: string }>;
  const tabsB = partB.dsl.features.filter((f: any) => f.kind === "tab") as Array<{ name: string; count: number; length: number; width: number; edge: string }>;
  const slotsA = partA.dsl.features.filter((f: any) => f.kind === "slot") as Array<{ name: string; count: number; length: number; width: number }>;
  const slotsB = partB.dsl.features.filter((f: any) => f.kind === "slot") as Array<{ name: string; count: number; length: number; width: number }>;

  // Resolve which side is the tab and which is the slot from feature refs.
  const refByPart = new Map<string, string>();
  for (const r of iface.featureRefs ?? []) refByPart.set(r.partId, r.featureName);
  const featA = refByPart.get(iface.partA);
  const featB = refByPart.get(iface.partB);

  const tab =
    (featA && tabsA.find(t => t.name === featA)) ||
    (featB && tabsB.find(t => t.name === featB)) ||
    tabsA[0] || tabsB[0];
  const slot =
    (featA && slotsA.find(s => s.name === featA)) ||
    (featB && slotsB.find(s => s.name === featB)) ||
    slotsA[0] || slotsB[0];

  if (!tab || !slot) {
    return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "fail",
      message: `Need a tab on one side and a slot on the other; found tab=${tab?.name ?? "—"}, slot=${slot?.name ?? "—"}.`,
      suggestion: "Add a tab feature to one part and a matching slot to the other before joining as weld_joint." };
  }
  if (tab.count !== slot.count) {
    return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "fail",
      message: `Tab count ${tab.count} ≠ slot count ${slot.count}.`,
      suggestion: "Match tab and slot counts so each tab passes through one slot." };
  }
  // Slot must be larger than tab on each axis for the tab to pass through with a small clearance.
  const lenSlack = slot.length - tab.length;
  const widSlack = slot.width - tab.width;
  if (lenSlack < 0 || widSlack < 0) {
    return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "fail",
      message: `Slot ${slot.length}"×${slot.width}" is smaller than tab ${tab.length}"×${tab.width}" — won't fit.`,
      suggestion: "Slot must be ≥ tab dimensions plus clearance (recommend +0.010\" each axis)." };
  }
  if (lenSlack > 0.060 || widSlack > 0.060) {
    return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "warn",
      message: `Slot is ${lenSlack.toFixed(3)}"×${widSlack.toFixed(3)}" larger than tab — joint will be sloppy until welded.`,
      suggestion: "Tighten slot to tab + 0.010\" clearance on each axis." };
  }
  return { id: "weld_joint_tab_slot", label: "Weld joint tab/slot", status: "pass",
    message: `Tab ${tab.length}"×${tab.width}" passes through slot ${slot.length}"×${slot.width}" with ${lenSlack.toFixed(3)}"/${widSlack.toFixed(3)}" clearance.` };
}

function checkPemInstallSide(iface: AssemblyInput["interfaces"][number]): RuleResult {
  if (!iface.accessSide || iface.accessSide === "either") {
    return { id: "pem_install_side_ok", label: "PEM install side", status: "warn", message: "PEM install side unspecified — assuming either is fine." };
  }
  return { id: "pem_install_side_ok", label: "PEM install side", status: "pass", message: `PEM installs from ${iface.accessSide}.` };
}

function checkScopeMaterial(input: AssemblyInput): RuleResult {
  if (!input.scope) return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "" };
  const outdoor = input.scope.environment.location === "outdoor";
  if (!outdoor) return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "Indoor — any material OK." };
  const bare = input.parts.filter(p => p.dsl.material === "Mild Steel (CRS)" && !p.dsl.finish);
  if (bare.length > 0) {
    return {
      id: "scope_material_match", label: "Material vs environment", status: "warn",
      message: `${bare.length} part(s) are bare mild steel but project is outdoor.`,
      suggestion: "Switch to galvanized/stainless/aluminum, or add a powder-coat finish.",
    };
  }
  return { id: "scope_material_match", label: "Material vs environment", status: "pass", message: "Materials OK for outdoor use." };
}

function checkScopeTierFastener(_input: AssemblyInput): RuleResult {
  // Commercial-tier starter rule (permissive for v1; tighten later).
  return { id: "scope_tier_fastener_match", label: "Fastener tier", status: "pass", message: "Commercial-tier fasteners check (starter rule: all OK)." };
}
