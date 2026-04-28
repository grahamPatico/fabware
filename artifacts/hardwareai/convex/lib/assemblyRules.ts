import type { PartDsl } from "./dsl";
import type { Pose } from "./positions";
import { holeWorldPositions, type HoleInstance } from "./featuresInWorld";
import { distance } from "./positions";
import { threadFromPartNumber } from "./fastenerSpecs";

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

  return { rules, hasFailures: rules.some(r => r.status === "fail") };
}

function partHoles(part: { dsl: PartDsl; pose: Pose }, featureName: string): HoleInstance[] {
  return holeWorldPositions(part.dsl, part.pose).filter(h => h.featureName === featureName);
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
  const holesA = partHoles(a, refA);
  const holesB = partHoles(b, refB);
  if (holesA.length === 0 || holesB.length === 0 || holesA.length !== holesB.length) {
    return { id: "hole_position_alignment", label: "Hole position alignment", status: "warn",
      message: "Hole count differs or zero — skipping position check." };
  }
  const unmatched = holesA.filter(ha => !holesB.some(hb => distance(ha.worldPoint, hb.worldPoint) <= POSITION_TOLERANCE));
  if (unmatched.length > 0) {
    return {
      id: "hole_position_alignment", label: "Hole position alignment", status: "warn",
      message: `${unmatched.length} hole(s) on ${a.role} don't coincide with ${b.role} in world space within ±${POSITION_TOLERANCE}".`,
      suggestion: "Adjust part poses so the mating hole patterns coincide. (Geometric alignment is a future-slice concern.)",
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

function checkHingeGeometry(
  iface: AssemblyInput["interfaces"][number],
  parts: Map<string, AssemblyInput["parts"][number]>,
): RuleResult {
  return { ...checkHolePatternMatch(iface, parts), id: "hinge_geometry_ok", label: "Hinge geometry" };
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
