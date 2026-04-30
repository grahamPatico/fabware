import { describe, expect, it } from "vitest";
import { validateGeometryTier } from "../geometryTier";
import type { EntityRegistry } from "../../ir/types";

const emptyEntities: EntityRegistry = { faces: {}, edges: {}, vertices: {} };

describe("validateGeometryTier", () => {
  it("returns no violations when all requested face tags are present", () => {
    const entities: EntityRegistry = {
      faces: {
        "ex1.top": { feature: "ex1", tag: "top", topologyHash: "abc" },
      },
      edges: {},
      vertices: {},
    };
    const violations = validateGeometryTier({
      log: "",
      requestedFaceTags: ["ex1.top"],
      entities,
    });
    expect(violations).toEqual([]);
  });

  it("returns a violation when a requested face tag is missing from entities", () => {
    const violations = validateGeometryTier({
      log: "",
      requestedFaceTags: ["ex1.missing_face"],
      entities: emptyEntities,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("geometry.missing-face-tag");
    expect(violations[0].location?.kind).toBe("face");
  });

  it("returns a violation when the sandbox log contains a Python error", () => {
    const violations = validateGeometryTier({
      log: "Traceback (most recent call last):\n  ...\nBuildingError: shape failed",
      requestedFaceTags: [],
      entities: emptyEntities,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("geometry.build-error");
    expect(violations[0].severity).toBe("error");
  });
});
