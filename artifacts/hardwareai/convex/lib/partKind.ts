import type { PartDsl } from "./dsl";
import type { PrintedDsl } from "./printedDsl";
import type { PurchasedDsl } from "./purchasedDsl";

// Canonical PartKind lives in convex/plugins/types.ts. Re-export here so existing
// callers (convex/lib/partValidator.ts, convex/parts.ts, etc.) keep working.
export type { PartKind } from "../plugins/types";

import type { PartKind } from "../plugins/types";

/** Default to "sheet_metal" for legacy parts that don't carry kind. */
export function readKind(part: { kind?: string | null }): PartKind {
  const k = part.kind;
  if (k === "printed" || k === "purchased") return k;
  return "sheet_metal";
}

export type AnyPartDsl = PartDsl | PrintedDsl | PurchasedDsl;

export const PART_KIND_LABEL: Record<PartKind, string> = {
  sheet_metal: "Sheet metal",
  printed: "3D printed",
  purchased: "Purchased",
};
