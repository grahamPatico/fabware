// convex/cad/codegen/emitFeature.ts
import type { Feature } from "../ir/types";
import type { ResolvedIr } from "../resolve/resolveIr";
import { emitExtrude } from "./features/extrude";
import { emitCutExtrude } from "./features/cutExtrude";

export type EmitContext = {
  /** The build123d variable name of the current "parent" body, or null if none
   *  has been emitted yet. Set to the feature id after each new_body extrude. */
  parentBodyId: string | null;
};

export type EmitResult = {
  lines: string[];
  ctxOut: EmitContext;
};

/**
 * Dispatch to the appropriate feature emitter and return the emitted lines
 * plus an updated context.
 */
export function emitFeature(
  f: Feature,
  ir: ResolvedIr,
  ctx: EmitContext
): EmitResult {
  switch (f.kind) {
    case "extrude": {
      const lines = emitExtrude(f, ir, ctx.parentBodyId);
      const ctxOut: EmitContext = { parentBodyId: f.id };
      return { lines, ctxOut };
    }

    case "cut_extrude": {
      const lines = emitCutExtrude(f, ir, ctx.parentBodyId);
      // cut_extrude modifies the parent body — keep same parentBodyId
      return { lines, ctxOut: ctx };
    }

    default:
      // Unknown feature kind — emit a comment placeholder
      return {
        lines: [`# TODO: unsupported feature kind "${(f as Feature).kind}"`],
        ctxOut: ctx,
      };
  }
}
