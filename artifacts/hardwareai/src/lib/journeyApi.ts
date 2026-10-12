// Typed references to the `journey` Convex functions.
//
// `convex/_generated/api.d.ts` is generated from the modules that existed at
// the last codegen, so `api.journey` is not in it yet. These references carry
// the same names and the argument and return types from the contract in
// `convex/lib/journey.ts`. Once codegen has run with `convex/journey.ts` in
// place they can be swapped for `api.journey.*` one for one.

import { makeFunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { JourneyView, StageId, Track } from "../../convex/lib/journey";

type ProjectArg = { projectId: Id<"projects"> };

export interface PcbStarterFile {
  filename: string;
  content: string;
}

export const journeyApi = {
  get: makeFunctionReference<"query", ProjectArg, JourneyView>("journey:get"),
  mechanicalBrief: makeFunctionReference<"query", ProjectArg, string>("journey:mechanicalBrief"),
  pcbStarter: makeFunctionReference<"query", ProjectArg, PcbStarterFile | null>("journey:pcbStarter"),
  begin: makeFunctionReference<
    "mutation",
    ProjectArg & { track: Track; model?: string; effort?: string },
    unknown
  >("journey:begin"),
  generate: makeFunctionReference<
    "mutation",
    ProjectArg & { stage: StageId; notes?: string; model?: string; effort?: string },
    unknown
  >("journey:generate"),
  setSettings: makeFunctionReference<
    "mutation",
    ProjectArg & { track?: Track; needsElectronics?: boolean },
    unknown
  >("journey:setSettings"),
  setDone: makeFunctionReference<"mutation", ProjectArg & { stage: StageId; done: boolean }, unknown>(
    "journey:setDone",
  ),
  generateConcept: makeFunctionReference<"mutation", ProjectArg, unknown>("journey:generateConcept"),
};
