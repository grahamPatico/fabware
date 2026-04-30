// convex/cad/revisions/hash.ts
//
// Produces a stable SHA-256 fingerprint of a CadIr object. The hash is:
//   - Deterministic: same logical IR always produces the same hex digest.
//   - Content-sensitive: any value change produces a different hash.
//   - Order-insensitive for object keys: Records are sorted before hashing
//     so that key insertion order never affects the result.

import { createHash } from "node:crypto";
import type { CadIr } from "../ir/types";

/**
 * Recursively sort object keys so that two objects with identical key/value
 * pairs but different insertion orders produce the same JSON string.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Return a hex-encoded SHA-256 digest of the canonicalized CadIr.
 *
 * The `entities` field (kernel output) is deliberately excluded from the hash
 * so that re-running the sandbox does not invalidate the revision identity of
 * an unchanged logical design.
 */
export function hashIr(ir: CadIr): string {
  const { entities: _entities, ...irWithoutEntities } = ir;
  const canonical = JSON.stringify(sortKeys(irWithoutEntities));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
