import { describe, expect, it } from "vitest";
import { hashIr } from "../hash";
import { emptyIr } from "../../ir/empty";
import type { CadIr } from "../../ir/types";

describe("hashIr", () => {
  it("is deterministic — same IR always produces the same hash", () => {
    const ir = emptyIr("mm");
    expect(hashIr(ir)).toBe(hashIr(ir));
  });

  it("is content-sensitive — different IR produces a different hash", () => {
    const ir1 = emptyIr("mm");
    const ir2: CadIr = {
      ...emptyIr("mm"),
      parameters: {
        width: { id: "width", value: 50, unit: "mm" },
      },
    };
    expect(hashIr(ir1)).not.toBe(hashIr(ir2));
  });

  it("is order-insensitive for parameters — same keys/values in different insertion order hash identically", () => {
    const ir1: CadIr = {
      ...emptyIr("mm"),
      parameters: {
        a: { id: "a", value: 10 },
        b: { id: "b", value: 20 },
      },
    };
    const ir2: CadIr = {
      ...emptyIr("mm"),
      parameters: {
        b: { id: "b", value: 20 },
        a: { id: "a", value: 10 },
      },
    };
    expect(hashIr(ir1)).toBe(hashIr(ir2));
  });
});
