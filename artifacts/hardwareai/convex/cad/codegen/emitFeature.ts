// convex/cad/codegen/emitFeature.ts
import type { Feature } from "../ir/types";
import type { ResolvedIr } from "../resolve/resolveIr";
import { emitExtrude } from "./features/extrude";
import { emitCutExtrude } from "./features/cutExtrude";
import { emitFillet } from "./features/fillet";
import { emitChamfer } from "./features/chamfer";
import { emitHole } from "./features/hole";
import { emitPattern } from "./features/pattern";
import { emitRevolve } from "./features/revolve";
import { emitShell } from "./features/shell";
import { emitBendFlange } from "./features/bendFlange";

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

    case "fillet": {
      const lines = emitFillet(f, ir, ctx.parentBodyId);
      // fillet modifies the parent body in-place — keep same parentBodyId
      return { lines, ctxOut: ctx };
    }

    case "chamfer": {
      const lines = emitChamfer(f, ir, ctx.parentBodyId);
      // chamfer modifies the parent body in-place — keep same parentBodyId
      return { lines, ctxOut: ctx };
    }

    case "hole": {
      const lines = emitHole(f, ir, ctx.parentBodyId);
      // hole modifies the parent body in-place — keep same parentBodyId
      return { lines, ctxOut: ctx };
    }

    case "pattern": {
      const lines = emitPattern(f, ir, ctx.parentBodyId);
      // pattern replicates a source feature — keep same parentBodyId
      return { lines, ctxOut: ctx };
    }

    case "revolve": {
      const lines = emitRevolve(f, ir, ctx.parentBodyId);
      // revolve creates a new body
      const ctxOut: EmitContext = { parentBodyId: f.id };
      return { lines, ctxOut };
    }

    case "shell": {
      const lines = emitShell(f, ir, ctx.parentBodyId);
      // shell modifies an existing body in-place
      return { lines, ctxOut: ctx };
    }

    case "bend_flange": {
      const lines = emitBendFlange(f, ir, ctx.parentBodyId);
      // bend_flange modifies an existing body in-place
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
