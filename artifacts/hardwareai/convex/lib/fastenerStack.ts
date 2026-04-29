// FastenerStack — encodes how a single fastener mates two parts. Replaces
// scattered logic in assemblyRules.ts (clearance, tap, PEM, install side) and
// the McMaster-number hardcoding in archetypes. The point is depth: a thin
// type that absorbs the rules of fastening so callers don't reason about
// thread pitch, drill chart, or pilot-hole sizing themselves.
//
// Fastener kinds we model today:
//   - bolt   : machine bolt with a separate nut (or threading into a tapped hole / PEM)
//   - screw  : sheet-metal / self-tapping screw — cuts its own thread on the far side
//   - rivet  : POP / blind rivet — receiving hole sized to rivet shank, no thread
//   - pem    : threaded insert pressed into the far side, bolt threads into it
//
// Each kind requires a specific receiving feature on the far part:
//   - bolt   → clearance hole both sides + nut (or tapped hole / PEM on far side)
//   - screw  → clearance on near side, *pilot* (smaller) hole on far side
//   - rivet  → matched-diameter clearance hole both sides
//   - pem    → clearance on near side, PEM-spec pilot on far side
//
// `receivingFeatureKind` is what the validator looks for on the far part's
// hole feature (via HoleFeature.role).

export type FastenerKind = "bolt" | "screw" | "rivet" | "pem";

export type ReceivingFeatureKind =
  | "clear"        // bolt clearance — bolt passes through, must have nut/PEM/tap on the other side
  | "tap"          // tapped (threaded) hole — bolt threads directly into the part
  | "pem"          // PEM threaded insert pressed into the part — bolt threads into the insert
  | "pilot"        // smaller-than-screw pilot — sheet-metal/self-tapping screws cut their own thread
  | "rivet";       // rivet shank clearance — same diameter both sides

export interface FastenerStack {
  kind: FastenerKind;
  // Nominal thread / shank designation (e.g. "1/4-20", "M6", "#8-32", "1/8 rivet").
  thread: string;
  // Nominal clearance hole diameter on the through-side (inches).
  clearanceDiameter: number;
  // What the receiving feature on the far part must be for this stack to mate.
  receivingFeatureKind: ReceivingFeatureKind;
  // Recommended pilot or tap diameter on the far side (inches). For bolts
  // with a nut this is the same as clearanceDiameter (clearance both sides).
  receivingDiameter: number;
  // Min / max stack thickness the bolt can tolerate (sum of both parts'
  // thicknesses + nut/washer). Reported back as warnings outside the band.
  minStackIn: number;
  maxStackIn: number;
  // Which side of the joint hardware installs from. PEMs press from the
  // far side; rivets pull from the near side; bolts can go either way.
  installAccessSide: "near" | "far" | "either";
  // Source McMaster part number we resolved from (if any). Optional.
  mcmasterPartNumber?: string;
}

// Look up FastenerStack from a McMaster part number. Stub today; expand as
// archetypes start using more part numbers. A prefix lookup keeps it
// resilient to specific letter-suffix variants.
const SEED_TABLE: Array<{ match: (pn: string) => boolean; build: (pn: string) => FastenerStack }> = [
  // 91251A540: socket head cap screw, 1/4"-20, 3/4" length, alloy steel.
  // Common archetype default. Stack height 0.075"+0.075"+nut+washer ~ 0.2" min.
  {
    match: pn => pn.startsWith("91251A540") || pn.startsWith("91251A"),
    build: pn => ({
      kind: "bolt",
      thread: "1/4-20",
      clearanceDiameter: 0.266,
      receivingFeatureKind: "clear",
      receivingDiameter: 0.266,
      minStackIn: 0.05,
      maxStackIn: 0.75,
      installAccessSide: "either",
      mcmasterPartNumber: pn,
    }),
  },
  // 1635A3 etc: hinge hardware (handled by checkHingeGeometry; not a stack).
  // 97525A120: pop rivets — 1/8" dia, 0.126" hole.
  {
    match: pn => pn.startsWith("97525A"),
    build: pn => ({
      kind: "rivet",
      thread: "1/8",
      clearanceDiameter: 0.130,
      receivingFeatureKind: "rivet",
      receivingDiameter: 0.130,
      minStackIn: 0.06,
      maxStackIn: 0.25,
      installAccessSide: "near",
      mcmasterPartNumber: pn,
    }),
  },
  // 95495A — PEM nuts. Receiving side is the PEM hole spec (varies by size).
  {
    match: pn => pn.startsWith("95495A"),
    build: pn => ({
      kind: "pem",
      thread: "M4",
      clearanceDiameter: 0.226,
      receivingFeatureKind: "pem",
      receivingDiameter: 0.236,
      minStackIn: 0.06,
      maxStackIn: 0.5,
      installAccessSide: "far",
      mcmasterPartNumber: pn,
    }),
  },
];

export function fastenerStackFromPartNumber(pn: string): FastenerStack | null {
  for (const row of SEED_TABLE) {
    if (row.match(pn)) return row.build(pn);
  }
  return null;
}

// Hole role → ReceivingFeatureKind. Lets archetypes annotate hole features
// with their semantic purpose ("bolt_clear", "tap_1/4-20", "pem_M4",
// "pilot_8x12", "rivet_1/8") and the validator translates to FastenerStack
// expectations without parsing thread specs.
export function holeRoleToReceivingKind(role: string | null | undefined): ReceivingFeatureKind | null {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r.startsWith("bolt_clear") || r === "clearance" || r === "clear") return "clear";
  if (r.startsWith("tap_") || r === "tapped") return "tap";
  if (r.startsWith("pem_") || r === "pem") return "pem";
  if (r.startsWith("pilot_") || r === "pilot") return "pilot";
  if (r.startsWith("rivet_") || r === "rivet") return "rivet";
  return null;
}

// Validate a hole-feature's diameter + role match the FastenerStack's
// receiving expectations. Returns null on pass; otherwise a description of
// the mismatch suitable for a Rule message.
export function validateReceivingHole(
  stack: FastenerStack,
  holeDiameter: number,
  holeRole: string | null | undefined,
): { fail: false } | { fail: true; reason: string; suggestion: string } {
  const receiving = holeRoleToReceivingKind(holeRole);
  // Tolerance for diameter comparison (drill-chart wiggle).
  const tol = 0.015;
  const wantsThisKind = stack.receivingFeatureKind;
  if (receiving && receiving !== wantsThisKind) {
    return {
      fail: true,
      reason: `Receiving hole role is "${holeRole}" (${receiving}), but ${stack.kind} ${stack.thread} expects a "${wantsThisKind}" feature.`,
      suggestion: `Change the hole's role to a ${wantsThisKind} variant or pick a different fastener kind.`,
    };
  }
  // Diameter check — only for clearance / rivet receivers (tap / pilot are smaller intentionally).
  if (wantsThisKind === "clear" || wantsThisKind === "rivet") {
    if (Math.abs(holeDiameter - stack.receivingDiameter) > tol) {
      return {
        fail: true,
        reason: `Hole Ø${holeDiameter.toFixed(3)}" doesn't match ${stack.kind} ${stack.thread} expected Ø${stack.receivingDiameter.toFixed(3)}".`,
        suggestion: `Resize the hole to Ø${stack.receivingDiameter.toFixed(3)}" or pick a fastener that matches the existing hole.`,
      };
    }
  }
  return { fail: false };
}
