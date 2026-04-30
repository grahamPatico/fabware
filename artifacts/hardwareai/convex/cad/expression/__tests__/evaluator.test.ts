import { describe, expect, it } from "vitest";
import { evaluateParameters, EvaluationError } from "../evaluator";
import type { ParameterDef } from "../../ir/types";

const params = (defs: ParameterDef[]): Record<string, ParameterDef> =>
  Object.fromEntries(defs.map(d => [d.id, d]));

describe("evaluateParameters", () => {
  it("evaluates literal values", () => {
    const out = evaluateParameters(params([{ id: "x", value: 12 }]));
    expect(out).toEqual({ x: 12 });
  });
  it("evaluates a reference chain", () => {
    const out = evaluateParameters(params([
      { id: "a", value: 10 },
      { id: "b", value: "a + 5" },
      { id: "c", value: "b * 2" },
    ]));
    expect(out).toEqual({ a: 10, b: 15, c: 30 });
  });
  it("detects cycles", () => {
    expect(() => evaluateParameters(params([
      { id: "a", value: "b + 1" },
      { id: "b", value: "a + 1" },
    ]))).toThrow(EvaluationError);
  });
  it("rejects unknown references", () => {
    expect(() => evaluateParameters(params([{ id: "a", value: "missing + 1" }])))
      .toThrow(/missing/);
  });
  it("enforces bounds", () => {
    expect(() => evaluateParameters(params([
      { id: "x", value: -5, bounds: { min: 0 } },
    ]))).toThrow(/bounds/);
  });
  it("rejects division by zero", () => {
    expect(() => evaluateParameters(params([{ id: "y", value: "1 / 0" }])))
      .toThrow(/division/i);
  });
});
