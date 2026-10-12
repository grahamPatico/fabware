import { describe, it, expect } from "vitest";
import type { JourneyState } from "../journey";
import {
  CONCEPT_TOOK_TOO_LONG, MAX_CONCEPT_GENERATIONS, MAX_NOTES_CHARS, STAGE_TOOK_TOO_LONG, STALE_CONCEPT_MS,
  STALE_STAGE_MS, buildJourneyView, conceptBlocker, conceptView, doneTransition, generateBlocker, stageView,
  type StageRow,
} from "../journeyGuards";

const NOW = 1_800_000_000_000;
const product: JourneyState = { track: "product", needsElectronics: true, startedAt: NOW - 1000 };
const hobby: JourneyState = { track: "hobby", needsElectronics: false, startedAt: NOW - 1000 };
const row = (over: Partial<StageRow>): StageRow => ({ stage: "idea", status: "ready", ...over });
const NO_CONCEPT = conceptView(null, null, NOW);
const NO_PARTS = { partCount: 0, fails: 0, warns: 0 };

describe("stageView", () => {
  it("reads a stage with no row as todo", () => {
    expect(stageView("sourcing", null, NOW)).toEqual({
      id: "sourcing", status: "todo", content: null, notes: null, error: null, generatedAt: null,
    });
  });

  it("returns a written stage with its content and notes", () => {
    const view = stageView("idea", row({ content: { oneLiner: "x" }, notes: "smaller", generatedAt: 5 }), NOW);
    expect(view).toEqual({
      id: "idea", status: "ready", content: { oneLiner: "x" }, notes: "smaller", error: null, generatedAt: 5,
    });
  });

  it("shows a fresh generation as generating, keeping the last content on screen", () => {
    const view = stageView("idea", row({ status: "generating", startedAt: NOW - 60_000, content: { oneLiner: "old" } }), NOW);
    expect(view.status).toBe("generating");
    expect(view.content).toEqual({ oneLiner: "old" });
    expect(view.error).toBeNull();
  });

  it("turns a generation stuck past 11 minutes into an error", () => {
    const stuck = row({ status: "generating", startedAt: NOW - STALE_STAGE_MS - 1 });
    expect(stageView("idea", stuck, NOW)).toMatchObject({ status: "error", error: STAGE_TOOK_TOO_LONG });
    const almost = row({ status: "generating", startedAt: NOW - STALE_STAGE_MS + 1000 });
    expect(stageView("idea", almost, NOW).status).toBe("generating");
  });

  it("passes a saved error through", () => {
    expect(stageView("idea", row({ status: "error", error: "Rate limited." }), NOW))
      .toMatchObject({ status: "error", error: "Rate limited." });
  });

  it("never returns content for the studio stage", () => {
    expect(stageView("mechanical", row({ stage: "mechanical", status: "done", content: { x: 1 } }), NOW))
      .toMatchObject({ status: "done", content: null });
    expect(stageView("mechanical", row({ stage: "mechanical", status: "ready" }), NOW).status).toBe("todo");
  });
});

describe("buildJourneyView", () => {
  it("is empty when the project has no plan", () => {
    const view = buildJourneyView({ journey: null, rows: [row({})], mechanical: NO_PARTS, concept: NO_CONCEPT, now: NOW });
    expect(view).toMatchObject({ journey: null, applicable: [], stages: {}, nextStage: null });
    expect(view.concept).toEqual({ status: "none", image: null, error: null, remaining: MAX_CONCEPT_GENERATIONS });
  });

  it("returns only the applicable stages and points at the first one not done", () => {
    const view = buildJourneyView({
      journey: hobby,
      rows: [
        row({ stage: "idea", status: "done", content: {} }),
        row({ stage: "requirements", status: "ready", content: {} }),
        row({ stage: "validate", status: "done", content: {} }), // not on a hobby track
        row({ stage: "pcb", status: "ready", content: {} }),     // no electronics
      ],
      mechanical: { partCount: 3, fails: 1, warns: 2 },
      concept: NO_CONCEPT,
      now: NOW,
    });
    expect(view.applicable).toEqual(["idea", "requirements", "sourcing", "mechanical", "build"]);
    expect(Object.keys(view.stages)).toEqual(view.applicable);
    expect(view.stages.sourcing?.status).toBe("todo");
    expect(view.nextStage).toBe("requirements");
    expect(view.mechanical).toEqual({ partCount: 3, fails: 1, warns: 2 });
    expect(view.journey).toEqual(hobby);
  });

  it("has no next stage once everything is done", () => {
    const rows = ["idea", "requirements", "sourcing", "mechanical", "build"]
      .map((stage) => row({ stage, status: "done", content: {} }));
    expect(buildJourneyView({ journey: hobby, rows, mechanical: NO_PARTS, concept: NO_CONCEPT, now: NOW }).nextStage)
      .toBeNull();
  });
});

describe("generateBlocker", () => {
  const base = { journey: product, stage: "sourcing", row: null, now: NOW };

  it("allows an applicable generated stage", () => {
    expect(generateBlocker(base)).toBeNull();
    expect(generateBlocker({ ...base, row: row({ status: "ready" }), notes: "use aluminium" })).toBeNull();
  });

  it("needs a plan", () => {
    expect(generateBlocker({ ...base, journey: null })).toMatch(/Start a plan/);
  });

  it("refuses unknown, studio and inapplicable stages", () => {
    expect(generateBlocker({ ...base, stage: "shipping" })).toMatch(/Unknown step/);
    expect(generateBlocker({ ...base, stage: "mechanical" })).toMatch(/design studio/);
    expect(generateBlocker({ ...base, journey: hobby, stage: "validate" })).toMatch(/not part of this project/);
    expect(generateBlocker({ ...base, journey: hobby, stage: "pcb" })).toMatch(/not part of this project/);
  });

  it("limits notes to 2,000 characters", () => {
    expect(generateBlocker({ ...base, notes: "x".repeat(MAX_NOTES_CHARS) })).toBeNull();
    expect(generateBlocker({ ...base, notes: "x".repeat(MAX_NOTES_CHARS + 1) })).toMatch(/2,000 characters/);
  });

  it("refuses while a fresh generation is running, and allows taking over a stale one", () => {
    expect(generateBlocker({ ...base, row: row({ status: "generating", startedAt: NOW - 5000 }) }))
      .toMatch(/already being written/);
    expect(generateBlocker({ ...base, row: row({ status: "generating", startedAt: NOW - STALE_STAGE_MS - 1 }) }))
      .toBeNull();
  });
});

describe("doneTransition", () => {
  const base = { journey: product, stage: "idea", now: NOW };

  it("toggles a written stage between ready and done", () => {
    const written = row({ status: "ready", content: { oneLiner: "x" } });
    expect(doneTransition({ ...base, done: true, row: written })).toEqual({ status: "done" });
    expect(doneTransition({ ...base, done: false, row: { ...written, status: "done" } })).toEqual({ status: "ready" });
  });

  it("refuses a stage with nothing written, or one being written", () => {
    expect(doneTransition({ ...base, done: true, row: null })).toEqual({ error: expect.stringMatching(/Write this step first/) });
    expect(doneTransition({ ...base, done: true, row: row({ status: "error" }) })).toHaveProperty("error");
    expect(doneTransition({ ...base, done: true, row: row({ status: "generating", startedAt: NOW, content: {} }) }))
      .toEqual({ error: expect.stringMatching(/still being written/) });
  });

  it("toggles the studio stage between todo and done without content", () => {
    expect(doneTransition({ ...base, stage: "mechanical", done: true, row: null })).toEqual({ status: "done" });
    expect(doneTransition({ ...base, stage: "mechanical", done: false, row: row({ stage: "mechanical", status: "done" }) }))
      .toEqual({ status: "todo" });
  });

  it("refuses stages outside the plan", () => {
    expect(doneTransition({ ...base, journey: null, done: true, row: null })).toHaveProperty("error");
    expect(doneTransition({ ...base, journey: hobby, stage: "pcb", done: true, row: null })).toHaveProperty("error");
    expect(doneTransition({ ...base, stage: "nope", done: true, row: null })).toHaveProperty("error");
  });
});

describe("concept picture", () => {
  it("blocks until the idea is written, while one is being made, and when none remain", () => {
    expect(conceptBlocker({ ideaHasContent: false, concept: null, now: NOW })).toMatch(/Shape the idea first/);
    expect(conceptBlocker({ ideaHasContent: true, concept: null, now: NOW })).toBeNull();
    expect(conceptBlocker({
      ideaHasContent: true, concept: { status: "generating", generations: 1, startedAt: NOW - 1000 }, now: NOW,
    })).toMatch(/already being made/);
    expect(conceptBlocker({
      ideaHasContent: true, concept: { status: "generating", generations: 1, startedAt: NOW - STALE_CONCEPT_MS - 1 }, now: NOW,
    })).toBeNull();
    expect(conceptBlocker({
      ideaHasContent: true, concept: { status: "ready", generations: MAX_CONCEPT_GENERATIONS }, now: NOW,
    })).toMatch(/used all 4/);
  });

  it("counts down the remaining pictures", () => {
    expect(conceptView({ status: "ready", kind: "svg", svg: "<svg/>", prompt: "p", generations: 1 }, null, NOW))
      .toEqual({ status: "ready", image: { kind: "svg", svg: "<svg/>", prompt: "p" }, error: null, remaining: 3 });
    expect(conceptView({ status: "ready", generations: 9 }, null, NOW).remaining).toBe(0);
  });

  it("returns a stored image by URL, and nothing when the blob is gone", () => {
    const concept = { status: "ready" as const, kind: "image" as const, prompt: "p", generations: 1 };
    expect(conceptView(concept, "https://files.example/a.png", NOW).image)
      .toEqual({ kind: "image", url: "https://files.example/a.png", prompt: "p" });
    expect(conceptView(concept, null, NOW).image).toBeNull();
  });

  it("keeps the last picture up while a new one is drawn, and flags a stuck run", () => {
    const drawing = { status: "generating" as const, kind: "svg" as const, svg: "<svg/>", generations: 1, startedAt: NOW - 1000 };
    expect(conceptView(drawing, null, NOW)).toMatchObject({ status: "generating", image: { kind: "svg" }, error: null });
    expect(conceptView({ ...drawing, startedAt: NOW - STALE_CONCEPT_MS - 1 }, null, NOW))
      .toMatchObject({ status: "error", error: CONCEPT_TOOK_TOO_LONG });
    expect(conceptView({ status: "error", error: "No budget.", generations: 2 }, null, NOW))
      .toMatchObject({ status: "error", error: "No budget.", image: null, remaining: 2 });
  });
});
