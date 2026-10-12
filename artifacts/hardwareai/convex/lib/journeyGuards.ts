// Rules for the production journey's queries and mutations (convex/journey.ts),
// kept pure so they are unit-tested without a Convex backend: how a stored
// row reads as a stage view, when a generation may start, and what "done"
// toggles to. The mutations turn a returned message into a ConvexError.

import {
  applicableStages, isGeneratedStage, isStageId,
  type ConceptImage, type JourneyState, type JourneyView, type StageId, type StageStatus, type StageView,
} from "./journey";

// A Convex action is killed at 10 minutes. A stage still "generating" after
// this long has no live action behind it (same rule as agentRuns).
export const STALE_STAGE_MS = 11 * 60 * 1000;
// The concept picture is one image call, or one short model call.
export const STALE_CONCEPT_MS = 3 * 60 * 1000;
export const MAX_CONCEPT_GENERATIONS = 4;
export const MAX_NOTES_CHARS = 2_000;

export const STAGE_TOOK_TOO_LONG = "That took too long and was stopped. Try again.";
export const CONCEPT_TOOK_TOO_LONG = "The picture took too long and was stopped. Try again.";

/** The fields of a `journeyStages` row these rules read. */
export interface StageRow {
  stage: string;
  status: StageStatus;
  content?: unknown;
  notes?: string;
  error?: string;
  generatedAt?: number;
  startedAt?: number;
  runId?: string;
}

/** The fields of `projects.concept` these rules read. */
export interface ConceptState {
  status: "generating" | "ready" | "error";
  kind?: "image" | "svg";
  svg?: string;
  prompt?: string;
  error?: string;
  generations: number;
  startedAt?: number;
}

export function isStageRunFresh(row: Pick<StageRow, "status" | "startedAt"> | null | undefined, now: number): boolean {
  return row?.status === "generating" && now - (row.startedAt ?? 0) < STALE_STAGE_MS;
}

export function isConceptRunFresh(concept: Pick<ConceptState, "status" | "startedAt"> | null | undefined, now: number): boolean {
  return concept?.status === "generating" && now - (concept.startedAt ?? 0) < STALE_CONCEPT_MS;
}

/** One stage as the client sees it. A stage with no row yet reads as "todo". */
export function stageView<S extends StageId>(stage: S, row: StageRow | null | undefined, now: number): StageView<S> {
  const generated = isGeneratedStage(stage);
  if (!row) {
    return { id: stage, status: "todo", content: null, notes: null, error: null, generatedAt: null } as StageView<S>;
  }
  const stuck = row.status === "generating" && !isStageRunFresh(row, now);
  // The studio stage has no generated content and is only ever todo or done.
  const status: StageStatus = generated ? (stuck ? "error" : row.status) : row.status === "done" ? "done" : "todo";
  return {
    id: stage,
    status,
    content: generated ? row.content ?? null : null,
    notes: row.notes ?? null,
    error: stuck ? STAGE_TOOK_TOO_LONG : status === "error" ? row.error ?? "Something went wrong. Try again." : null,
    generatedAt: row.generatedAt ?? null,
  } as StageView<S>;
}

/** The concept picture as the client sees it. `imageUrl` is the stored PNG's URL, when there is one. */
export function conceptView(
  concept: ConceptState | null | undefined,
  imageUrl: string | null,
  now: number,
): JourneyView["concept"] {
  if (!concept) return { status: "none", image: null, error: null, remaining: MAX_CONCEPT_GENERATIONS };
  const prompt = concept.prompt ?? "";
  // The last good picture stays up while a new one is drawn, or after a failure.
  const image: ConceptImage | null =
    concept.kind === "image" && imageUrl ? { kind: "image", url: imageUrl, prompt }
    : concept.kind === "svg" && concept.svg ? { kind: "svg", svg: concept.svg, prompt }
    : null;
  const stuck = concept.status === "generating" && !isConceptRunFresh(concept, now);
  const status = stuck ? "error" : concept.status;
  return {
    status,
    image,
    error: stuck ? CONCEPT_TOOK_TOO_LONG : status === "error" ? concept.error ?? "The picture could not be made. Try again." : null,
    remaining: Math.max(0, MAX_CONCEPT_GENERATIONS - concept.generations),
  };
}

export const EMPTY_JOURNEY_VIEW: JourneyView = {
  journey: null,
  applicable: [],
  stages: {},
  nextStage: null,
  mechanical: { partCount: 0, fails: 0, warns: 0 },
  concept: { status: "none", image: null, error: null, remaining: MAX_CONCEPT_GENERATIONS },
};

/** Assemble what `journey.get` returns from the stored pieces. */
export function buildJourneyView(input: {
  journey: JourneyState | null | undefined;
  rows: readonly StageRow[];
  mechanical: JourneyView["mechanical"];
  concept: JourneyView["concept"];
  now: number;
}): JourneyView {
  const { journey } = input;
  if (!journey) return { ...EMPTY_JOURNEY_VIEW, mechanical: input.mechanical, concept: input.concept };
  const applicable = applicableStages(journey.track, journey.needsElectronics);
  const stages: Partial<Record<StageId, StageView>> = {};
  for (const id of applicable) {
    stages[id] = stageView(id, input.rows.find((r) => r.stage === id), input.now);
  }
  return {
    journey: {
      track: journey.track,
      needsElectronics: journey.needsElectronics,
      ...(journey.electronicsLocked !== undefined ? { electronicsLocked: journey.electronicsLocked } : {}),
      startedAt: journey.startedAt,
    },
    applicable,
    stages: stages as JourneyView["stages"],
    nextStage: applicable.find((id) => stages[id]?.status !== "done") ?? null,
    mechanical: input.mechanical,
    concept: input.concept,
  };
}

/** Why a generation may not start, in words for the user. Null when it may. */
export function generateBlocker(input: {
  journey: JourneyState | null | undefined;
  stage: string;
  notes?: string | null;
  row: StageRow | null | undefined;
  now: number;
}): string | null {
  const { journey, stage } = input;
  if (!journey) return "Start a plan for this project first.";
  if (!isStageId(stage)) return `Unknown step: ${stage}`;
  if (!isGeneratedStage(stage)) return "The mechanical step is done in the design studio. There is nothing to generate.";
  if (!applicableStages(journey.track, journey.needsElectronics).includes(stage)) {
    return "This step is not part of this project's plan.";
  }
  if ((input.notes ?? "").trim().length > MAX_NOTES_CHARS) {
    return `Notes are limited to ${MAX_NOTES_CHARS.toLocaleString("en-US")} characters.`;
  }
  if (isStageRunFresh(input.row, input.now)) return "This step is already being written. Wait for it to finish.";
  return null;
}

/** The status `setDone` moves a stage to, or the reason it can't. */
export function doneTransition(input: {
  journey: JourneyState | null | undefined;
  stage: string;
  done: boolean;
  row: StageRow | null | undefined;
  now: number;
}): { status: StageStatus } | { error: string } {
  const { journey, stage, row } = input;
  if (!journey) return { error: "Start a plan for this project first." };
  if (!isStageId(stage)) return { error: `Unknown step: ${stage}` };
  if (!applicableStages(journey.track, journey.needsElectronics).includes(stage)) {
    return { error: "This step is not part of this project's plan." };
  }
  if (!isGeneratedStage(stage)) return { status: input.done ? "done" : "todo" };
  if (isStageRunFresh(row, input.now)) return { error: "This step is still being written. Wait for it to finish." };
  if (!row || row.content === undefined || row.content === null) {
    return { error: "Write this step first, then mark it done." };
  }
  return { status: input.done ? "done" : "ready" };
}

/** Why a concept picture may not be made, in words for the user. Null when it may. */
export function conceptBlocker(input: {
  ideaHasContent: boolean;
  concept: ConceptState | null | undefined;
  now: number;
}): string | null {
  if (!input.ideaHasContent) return "Shape the idea first. The picture is drawn from it.";
  if (isConceptRunFresh(input.concept, input.now)) return "A picture is already being made. Wait for it to finish.";
  if ((input.concept?.generations ?? 0) >= MAX_CONCEPT_GENERATIONS) {
    return `This project has used all ${MAX_CONCEPT_GENERATIONS} concept pictures.`;
  }
  return null;
}
