// artifacts/hardwareai/convex/cad/ir/empty.ts
import type { CadIr, Units } from "./types";

export function emptyIr(units: Units = "mm"): CadIr {
  return {
    schemaVersion: 1,
    units,
    parameters: {},
    sketches: {},
    features: [],
  };
}
