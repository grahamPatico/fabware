// artifacts/hardwareai/convex/cad/resolve/resolveIr.ts
import type { CadIr, ParamRef, Point2D, Feature } from "../ir/types";
import { evaluateParameters } from "../expression/evaluator";
import { parseExpression, type ExprNode } from "../expression/parser";

export type ResolvedIr = Omit<CadIr, "parameters" | "features" | "sketches"> & {
  resolvedParameters: Record<string, number>;
  features: Feature[];
  sketches: Record<string, ResolvedSketch>;
};

type ResolvedSketch = {
  id: string;
  plane: CadIr["sketches"][string]["plane"];
  geometry: ResolvedSketchEntity[];
};

type ResolvedSketchEntity =
  | { kind: "rect"; id: string; center: { x: number; y: number }; width: number; height: number; cornerRadius?: number }
  | { kind: "circle"; id: string; center: { x: number; y: number }; radius: number }
  | { kind: "line"; id: string; p1: { x: number; y: number }; p2: { x: number; y: number } };

export function resolveIr(ir: CadIr): ResolvedIr {
  const params = evaluateParameters(ir.parameters);

  const evalRef = (ref: ParamRef): number => {
    if (typeof ref === "number") return ref;
    if (ref in params) return params[ref];
    return walk(parseExpression(ref));
    function walk(n: ExprNode): number {
      switch (n.kind) {
        case "num": return n.value;
        case "ref":
          if (!(n.name in params)) throw new Error(`unknown parameter "${n.name}" in expression "${ref as string}"`);
          return params[n.name];
        case "neg": return -walk(n.inner);
        case "bin": {
          const l = walk(n.lhs), r = walk(n.rhs);
          switch (n.op) {
            case "+": return l + r;
            case "-": return l - r;
            case "*": return l * r;
            case "/": if (r === 0) throw new Error("division by zero"); return l / r;
          }
        }
      }
    }
  };

  const evalP = (p: Point2D) => ({ x: evalRef(p.x), y: evalRef(p.y) });

  const sketches: Record<string, ResolvedSketch> = {};
  for (const [id, s] of Object.entries(ir.sketches)) {
    sketches[id] = {
      id: s.id, plane: s.plane,
      geometry: s.geometry.map((g): ResolvedSketchEntity => {
        switch (g.kind) {
          case "rect":
            return {
              kind: "rect", id: g.id, center: evalP(g.center),
              width: evalRef(g.width), height: evalRef(g.height),
              cornerRadius: g.cornerRadius !== undefined ? evalRef(g.cornerRadius) : undefined,
            };
          case "circle":
            return { kind: "circle", id: g.id, center: evalP(g.center), radius: evalRef(g.radius) };
          case "line":
            return { kind: "line", id: g.id, p1: evalP(g.p1), p2: evalP(g.p2) };
        }
      }),
    };
  }

  const features = ir.features.map((f): Feature => {
    switch (f.kind) {
      case "extrude":
      case "cut_extrude":
        return { ...f, distance: evalRef(f.distance) } as Feature;
      case "fillet":
        return { ...f, radius: evalRef(f.radius) } as Feature;
      case "chamfer":
        return { ...f, distance: evalRef(f.distance) } as Feature;
      case "hole":
        return {
          ...f,
          diameter: evalRef(f.diameter),
          depth: f.depth !== undefined ? evalRef(f.depth) : undefined,
          positions: f.positions.map(evalP),
        } as Feature;
      case "pattern":
        return { ...f, spacing: evalRef(f.spacing) } as Feature;
      case "revolve":
        return { ...f, angle: evalRef(f.angle) } as Feature;
      case "shell":
        return { ...f, thickness: evalRef(f.thickness) } as Feature;
      case "bend_flange":
        return {
          ...f,
          angle: evalRef(f.angle),
          radius: evalRef(f.radius),
          length: evalRef(f.length),
          thickness: evalRef(f.thickness),
        } as Feature;
      case "sweep":
        // No ParamRef fields — pass through unchanged
        return { ...f } as Feature;
      case "loft":
        // No ParamRef fields — pass through unchanged
        return { ...f } as Feature;
      case "weld_tab":
        return {
          ...f,
          length: evalRef(f.length),
          width: evalRef(f.width),
          thickness: evalRef(f.thickness),
          position: evalP(f.position),
        } as Feature;
    }
  });

  return {
    schemaVersion: ir.schemaVersion,
    units: ir.units,
    resolvedParameters: params,
    sketches,
    features,
    entities: ir.entities,
  };
}
