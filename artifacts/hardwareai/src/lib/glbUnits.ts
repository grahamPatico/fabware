// Unit reconciliation for imported GLB geometry.
//
// step.parts ships its GLB previews in MILLIMETERS (a DIN 913 M3x3 set screw
// measures 3 × 3 × 3 in its own file) while the fabware assembly frame is in
// INCHES. A handful of GLB exporters emit metres instead, which would land a
// 3mm screw at 0.003 units — so a bounding box that comes out implausibly
// small is treated as metres rather than shrunk into invisibility.

/** Millimetres per inch. */
export const MM_PER_INCH = 25.4;

/** Inches per metre. */
export const INCHES_PER_METER = 39.3701;

/**
 * Below this bounding-box max dimension (in the file's own units) the model is
 * assumed to be authored in metres, not millimetres. The smallest catalog
 * parts are ~1mm, so no millimetre-authored file lands under 0.5.
 */
export const METERS_HEURISTIC_MAX_DIMENSION = 0.5;

/**
 * Scale factor to apply to a loaded GLB scene so it lands in inches, given the
 * max dimension of its untransformed bounding box.
 */
export function glbSceneScale(maxDimension: number): number {
  if (Number.isFinite(maxDimension) && maxDimension > 0 && maxDimension < METERS_HEURISTIC_MAX_DIMENSION) {
    return INCHES_PER_METER;
  }
  return 1 / MM_PER_INCH;
}
