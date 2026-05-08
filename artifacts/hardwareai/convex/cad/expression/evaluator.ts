// artifacts/hardwareai/convex/cad/expression/evaluator.ts
import type { ParameterDef } from "../ir/types";
import { parseExpression, type ExprNode } from "./parser";

export class EvaluationError extends Error {}

export function evaluateParameters(
  defs: Record<string, ParameterDef>,
): Record<string, number> {
  const trees: Record<string, ExprNode> = {};
  for (const [id, def] of Object.entries(defs)) {
    trees[id] = typeof def.value === "number"
      ? { kind: "num", value: def.value }
      : parseExpression(def.value);
  }

  const resolved: Record<string, number> = {};
  const visiting = new Set<string>();

  function eval_(id: string): number {
    if (id in resolved) return resolved[id];
    if (visiting.has(id)) {
      throw new EvaluationError(`cycle detected involving parameter "${id}"`);
    }
    if (!(id in trees)) {
      throw new EvaluationError(`unknown reference "${id}"`);
    }
    visiting.add(id);
    const v = walk(trees[id]);
    visiting.delete(id);
    resolved[id] = v;
    const def = defs[id];
    if (def?.bounds) {
      if (def.bounds.min !== undefined && v < def.bounds.min) {
        throw new EvaluationError(`parameter "${id}" = ${v} below bounds.min ${def.bounds.min}`);
      }
      if (def.bounds.max !== undefined && v > def.bounds.max) {
        throw new EvaluationError(`parameter "${id}" = ${v} above bounds.max ${def.bounds.max}`);
      }
    }
    return v;
  }

  function walk(n: ExprNode): number {
    switch (n.kind) {
      case "num": return n.value;
      case "ref": return eval_(n.name);
      case "neg": return -walk(n.inner);
      case "bin": {
        const l = walk(n.lhs), r = walk(n.rhs);
        switch (n.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/":
            if (r === 0) throw new EvaluationError("division by zero");
            return l / r;
        }
      }
    }
  }

  for (const id of Object.keys(defs)) eval_(id);
  return resolved;
}
