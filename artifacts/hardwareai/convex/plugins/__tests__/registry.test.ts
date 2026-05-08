import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPlugin, registeredKinds, _resetRegistry } from "../registry";

describe("plugin registry", () => {
  beforeEach(() => _resetRegistry());

  it("returns null for any kind in v1 (no plugins registered yet)", () => {
    expect(getPlugin("sheet_metal")).toBeNull();
    expect(getPlugin("printed")).toBeNull();
    expect(getPlugin("purchased")).toBeNull();
    expect(getPlugin("cad_ir")).toBeNull();
  });

  it("registeredKinds is empty in v1", () => {
    expect(registeredKinds()).toEqual([]);
  });

  it("loading plugins/index.ts registers sheet_metal and cad_ir (Phase 19 gap-closure)", async () => {
    // Reset module cache and re-import everything fresh so the side-effect
    // import inside ../index re-runs _registerPlugin against a freshly
    // re-evaluated registry module.
    vi.resetModules();
    const registryFresh = await import("../registry");
    await import("../index");
    expect(registryFresh.registeredKinds()).toContain("sheet_metal");
    expect(registryFresh.registeredKinds()).toContain("cad_ir");
    expect(registryFresh.getPlugin("sheet_metal")?.kind).toBe("sheet_metal");
    expect(registryFresh.getPlugin("cad_ir")?.kind).toBe("cad_ir");
  });
});
