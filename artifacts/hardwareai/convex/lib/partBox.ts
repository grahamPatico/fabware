// Resolve a part record (sheet_metal | printed | purchased) into the OBB the
// intersection check uses. All extents are in INCHES so they can be compared
// directly. Printed-part DSL uses millimetres internally; we convert here.

import type { Doc } from "../_generated/dataModel";
import type { Obb, Vec3 } from "./intersect";
import { poseObb } from "./intersect";

const MM_PER_INCH = 25.4;

interface PrintedPrimitive {
  kind: "box" | "cylinder" | "plate_with_holes";
  width?: number;
  depth?: number;
  height?: number;
  radius?: number;
  thickness?: number;
}

function printedSizeInches(dslJson?: string | null): Vec3 {
  if (!dslJson) return [25 / MM_PER_INCH, 5 / MM_PER_INCH, 25 / MM_PER_INCH];
  try {
    const dsl = JSON.parse(dslJson);
    const prim: PrintedPrimitive | undefined = dsl.primitive;
    if (prim?.kind === "box" && prim.width != null && prim.height != null && prim.depth != null) {
      return [prim.width / MM_PER_INCH, prim.depth / MM_PER_INCH, prim.height / MM_PER_INCH];
    }
    if (prim?.kind === "cylinder" && prim.radius != null && prim.height != null) {
      const d = (prim.radius * 2) / MM_PER_INCH;
      return [d, prim.height / MM_PER_INCH, d];
    }
    if (prim?.kind === "plate_with_holes" && prim.width != null && prim.depth != null && prim.thickness != null) {
      return [prim.width / MM_PER_INCH, prim.thickness / MM_PER_INCH, prim.depth / MM_PER_INCH];
    }
  } catch {
    // fall through
  }
  return [25 / MM_PER_INCH, 5 / MM_PER_INCH, 25 / MM_PER_INCH];
}

/** Local-axis size [width(x), thickness(y), height(z)] in inches. */
export function partLocalSize(part: Doc<"parts">): Vec3 {
  const kind = part.kind ?? "sheet_metal";
  if (kind === "printed") return printedSizeInches(part.dslJson);
  if (kind === "purchased") return [0.5, 0.5, 0.5];
  return [part.width ?? 1, part.thickness ?? 0.075, part.height ?? 1];
}

export function partToObb(part: Doc<"parts">): Obb {
  return poseObb(part.position, partLocalSize(part));
}
