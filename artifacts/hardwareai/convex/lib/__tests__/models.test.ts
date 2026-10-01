import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFORT, DEFAULT_MODEL, MODELS, SELECTABLE_MODELS,
  getModel, isSupportedModel, modelLabel, resolveEffort,
} from "../models";

describe("model table", () => {
  it("defaults to a selectable model that accepts the default effort", () => {
    const spec = getModel(DEFAULT_MODEL);
    expect(spec?.selectable).toBe(true);
    expect(spec?.efforts).toContain(DEFAULT_EFFORT);
  });

  it("has unique ids and keeps legacy ids callable but unlisted", () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(isSupportedModel("claude-opus-4-7")).toBe(true);
    expect(SELECTABLE_MODELS.some((m) => m.id === "claude-opus-4-7")).toBe(false);
    expect(isSupportedModel("gpt-4")).toBe(false);
  });
});

describe("resolveEffort", () => {
  it("passes through a level the model accepts", () => {
    expect(resolveEffort("claude-opus-5-5", "xhigh")).toBe("xhigh");
  });
  it("steps down to the nearest accepted level", () => {
    expect(resolveEffort("claude-sonnet-4-6", "xhigh")).toBe("high");
  });
  it("returns undefined for models with no effort param", () => {
    expect(resolveEffort("claude-haiku-4-5", "high")).toBeUndefined();
    expect(resolveEffort("not-a-model", "high")).toBeUndefined();
  });
  it("falls back to the default for an unrecognised level", () => {
    expect(resolveEffort("claude-opus-5-5", "med")).toBe(DEFAULT_EFFORT);
  });
});

describe("modelLabel", () => {
  it("labels known, unknown and missing ids", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-opus-9")).toBe("opus-9");
    expect(modelLabel(undefined)).toBe("Fabware");
  });
});
