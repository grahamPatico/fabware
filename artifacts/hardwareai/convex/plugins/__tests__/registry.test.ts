import { describe, it, expect, beforeEach } from "vitest";
import { getPlugin, registeredKinds, _resetRegistry } from "../registry";

describe("plugin registry", () => {
  beforeEach(() => _resetRegistry());

  it("returns null for any kind in v1 (no plugins registered yet)", () => {
    expect(getPlugin("sheet_metal")).toBeNull();
    expect(getPlugin("printed")).toBeNull();
    expect(getPlugin("purchased")).toBeNull();
  });

  it("registeredKinds is empty in v1", () => {
    expect(registeredKinds()).toEqual([]);
  });

  it("loading plugins/index.ts registers sheet_metal", async () => {
    _resetRegistry();                  // ensure clean
    await import("../index");          // side-effect import
    expect(registeredKinds()).toContain("sheet_metal");
    expect(getPlugin("sheet_metal")?.kind).toBe("sheet_metal");
  });
});
