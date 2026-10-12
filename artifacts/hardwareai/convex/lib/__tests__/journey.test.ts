import { describe, it, expect } from "vitest";
import {
  GENERATED_STAGE_IDS, PCB_CHECKLIST, SAFE_PCB_RULES, STAGES, STAGE_IDS,
  applicableStages, getStage, isGeneratedStage, isStageId,
} from "../journey";

describe("applicableStages", () => {
  it("walks every stage for a product with electronics", () => {
    expect(applicableStages("product", true)).toEqual([...STAGE_IDS]);
  });

  it("skips electronics and PCB for a product without electronics", () => {
    expect(applicableStages("product", false)).toEqual([
      "idea", "validate", "requirements", "sourcing", "mechanical", "build",
    ]);
  });

  it("skips market validation for a hobby build with electronics", () => {
    expect(applicableStages("hobby", true)).toEqual([
      "idea", "requirements", "sourcing", "mechanical", "electronics", "pcb", "build",
    ]);
  });

  it("keeps only the core path for a hobby build without electronics", () => {
    expect(applicableStages("hobby", false)).toEqual([
      "idea", "requirements", "sourcing", "mechanical", "build",
    ]);
  });
});

describe("stage registry", () => {
  it("defines every stage once, in order", () => {
    expect(STAGES.map((s) => s.id)).toEqual([...STAGE_IDS]);
    expect(getStage("pcb").label).toBe("PCB");
  });

  it("treats only the studio stage as not generated", () => {
    expect(STAGE_IDS.filter((id) => !isGeneratedStage(id))).toEqual(["mechanical"]);
    expect(STAGES.filter((s) => s.kind === "studio").map((s) => s.id)).toEqual(["mechanical"]);
    expect([...GENERATED_STAGE_IDS]).toEqual(STAGE_IDS.filter((id) => id !== "mechanical"));
  });

  it("recognises stage ids", () => {
    expect(isStageId("sourcing")).toBe(true);
    expect(isStageId("shipping")).toBe(false);
  });

  it("keeps user-facing text free of em dashes", () => {
    const text = JSON.stringify([STAGES, PCB_CHECKLIST, SAFE_PCB_RULES]);
    expect(text).not.toContain("—");
  });
});
