// Pipe DSL — cylindrical structural / plumbing parts. Distinct from
// sheet-metal (PartDsl) because pipes don't unfold to a flat pattern.
// Common uses: structural frames, plumbing runs, conduit, support legs.
//
// Pipe local frame: long axis along local +Z (length direction). Outer
// circumference around local Z. Pose places + rotates the pipe in world.
// End A = local Z=0 face; End B = local Z=length face.

import { z } from "zod/v4";

export const PipeDslSchema = z.object({
  version: z.literal(1),
  kind: z.literal("pipe"),
  // Material vocab matches sheet-metal materials where applicable. PVC and
  // copper are added because plumbing/conduit pipes are common — these are
  // *not* SCS-cuttable but render and weigh as pipes.
  material: z.string(),
  // Outer diameter in inches. Standard sizes: 1/2", 3/4", 1", 1.25", 1.5", 2".
  outerDiameter: z.number().positive(),
  // Wall thickness in inches. Sched 40 / Sched 80 / DOM tubing common.
  wallThickness: z.number().positive(),
  // Pipe length along its axis (inches).
  length: z.number().positive(),
  // End conditions.
  endA: z.enum(["open", "capped", "threaded", "flared"]).default("open"),
  endB: z.enum(["open", "capped", "threaded", "flared"]).default("open"),
});

export type PipeDsl = z.infer<typeof PipeDslSchema>;
