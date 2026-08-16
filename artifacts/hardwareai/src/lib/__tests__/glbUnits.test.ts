import { describe, it, expect } from "vitest";
import { glbSceneScale, MM_PER_INCH, INCHES_PER_METER } from "../glbUnits";

describe("glbSceneScale", () => {
  it("treats a normal bbox as millimetres", () => {
    // din913_set_screw_m3x3 measures 3 × 3 × 3 in its GLB.
    expect(glbSceneScale(3)).toBeCloseTo(1 / MM_PER_INCH, 10);
    expect(3 * glbSceneScale(3)).toBeCloseTo(0.11811, 4);
  });

  it("treats an implausibly small bbox as metres", () => {
    expect(glbSceneScale(0.003)).toBe(INCHES_PER_METER);
    // 3mm expressed in metres still comes out ~0.118in after scaling.
    expect(0.003 * glbSceneScale(0.003)).toBeCloseTo(0.11811, 4);
  });

  it("switches at the 0.5 boundary", () => {
    expect(glbSceneScale(0.499)).toBe(INCHES_PER_METER);
    expect(glbSceneScale(0.5)).toBeCloseTo(1 / MM_PER_INCH, 10);
  });

  it("falls back to millimetres for degenerate bboxes", () => {
    expect(glbSceneScale(0)).toBeCloseTo(1 / MM_PER_INCH, 10);
    expect(glbSceneScale(-1)).toBeCloseTo(1 / MM_PER_INCH, 10);
    expect(glbSceneScale(NaN)).toBeCloseTo(1 / MM_PER_INCH, 10);
    expect(glbSceneScale(Infinity)).toBeCloseTo(1 / MM_PER_INCH, 10);
  });
});
