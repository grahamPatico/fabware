import { describe, expect, it } from "vitest";
import { parseExpression } from "../parser";

describe("parseExpression", () => {
  it("parses a number", () => {
    expect(parseExpression("42")).toEqual({ kind: "num", value: 42 });
  });
  it("parses an identifier", () => {
    expect(parseExpression("length")).toEqual({ kind: "ref", name: "length" });
  });
  it("parses arithmetic with precedence", () => {
    expect(parseExpression("a + b * 2")).toEqual({
      kind: "bin", op: "+",
      lhs: { kind: "ref", name: "a" },
      rhs: { kind: "bin", op: "*", lhs: { kind: "ref", name: "b" }, rhs: { kind: "num", value: 2 } },
    });
  });
  it("respects parentheses", () => {
    const tree = parseExpression("(a + b) * 2");
    expect(tree).toEqual({
      kind: "bin", op: "*",
      lhs: { kind: "bin", op: "+", lhs: { kind: "ref", name: "a" }, rhs: { kind: "ref", name: "b" } },
      rhs: { kind: "num", value: 2 },
    });
  });
  it("parses unary minus", () => {
    expect(parseExpression("-x")).toEqual({ kind: "neg", inner: { kind: "ref", name: "x" } });
  });
  it("rejects unknown tokens", () => {
    expect(() => parseExpression("a $ b")).toThrow();
  });
});
