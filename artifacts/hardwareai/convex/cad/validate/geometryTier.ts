// convex/cad/validate/geometryTier.ts
//
// Tier-3 (geometry-tier) validator. Runs after the sandbox executor has
// produced an EntityRegistry and an exec.log. Checks:
//   1. Build errors in the sandbox log (Python tracebacks / uncaught exceptions).
//   2. Missing face tags: any FaceRef used in the IR that the sandbox didn't
//      materialise in entities.json.

import type { EntityRegistry } from "../ir/types";
import type { Violation } from "../../plugins/types";

export interface GeometryTierInput {
  /** Contents of /out/exec.log from the sandbox run. */
  log: string;
  /** Face-tag ids that the IR references (e.g. "ex1.top"). */
  requestedFaceTags: string[];
  /** Parsed EntityRegistry from parseEntities(). */
  entities: EntityRegistry;
}

const BUILD_ERROR_PATTERNS = [
  /Traceback \(most recent call last\)/,
  /BuildingError/,
  /build123d.*Error/i,
  /Exception:/,
  /Error:/,
];

function hasBuildError(log: string): boolean {
  return BUILD_ERROR_PATTERNS.some((re) => re.test(log));
}

function viol(
  ruleId: string,
  message: string,
  agentMessage: string,
  location?: Violation["location"],
): Violation {
  return { ruleId, severity: "error", message, agentMessage, location };
}

/**
 * Validate geometry-tier concerns: sandbox build errors and missing face tags.
 * Returns an empty array when the build succeeded and all face tags resolve.
 */
export function validateGeometryTier(input: GeometryTierInput): Violation[] {
  const out: Violation[] = [];

  // 1. Build errors take priority — no point checking face tags if build failed.
  if (hasBuildError(input.log)) {
    out.push(viol(
      "geometry.build-error",
      "The build123d script raised an error during execution",
      "Fix the Python build error. Check the exec.log for the traceback and correct the generated script.",
    ));
    return out;
  }

  // 2. Missing face tags
  for (const tag of input.requestedFaceTags) {
    if (!input.entities.faces[tag]) {
      out.push(viol(
        "geometry.missing-face-tag",
        `Face tag "${tag}" was not produced by the sandbox executor`,
        `Ensure the feature that should produce face tag "${tag}" is correctly defined and the tag name matches the build123d output.`,
        { kind: "face", id: tag },
      ));
    }
  }

  return out;
}
