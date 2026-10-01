import { describe, it, expect } from "vitest";
import {
  describeToolCall, formatValidatorNote, isFailureResult, priorTurns, type HistoryMessage,
} from "../agentLoop";

describe("priorTurns", () => {
  it("drops this turn's user message, tool activity and error rows", () => {
    const history: HistoryMessage[] = [
      { role: "user", content: "make a bracket" },
      { role: "assistant", content: "🟦 Added sheet-metal part bracket", kind: "tool" },
      { role: "assistant", content: "Built a 3x5 bracket.", kind: "text" },
      { role: "user", content: "add holes" },
      { role: "assistant", content: "Something went wrong.", kind: "error" },
      { role: "user", content: "add holes please" },
    ];
    expect(priorTurns(history)).toEqual([
      { role: "user", content: "make a bracket" },
      { role: "assistant", content: "Built a 3x5 bracket." },
      { role: "user", content: "add holes" },
    ]);
  });

  it("keeps legacy rows that have no kind", () => {
    const history: HistoryMessage[] = [
      { role: "user", content: "locker" },
      { role: "assistant", content: "Generated 6 parts and 5 interfaces." },
      { role: "user", content: "taller" },
    ];
    expect(priorTurns(history)).toHaveLength(2);
  });

  it("always opens with a user message, even after trimming to the limit", () => {
    const history: HistoryMessage[] = [];
    for (let i = 0; i < 30; i++) {
      history.push({ role: "user", content: `q${i}` });
      history.push({ role: "assistant", content: `a${i}`, kind: "text" });
    }
    history.splice(0, 1); // transcript now starts with an assistant row
    history.push({ role: "user", content: "current" });
    const turns = priorTurns(history);
    expect(turns.length).toBeLessThanOrEqual(40);
    expect(turns[0].role).toBe("user");
    expect(turns.some((t) => t.content === "current")).toBe(false);
  });

  it("returns nothing for a first message", () => {
    expect(priorTurns([{ role: "user", content: "hello" }])).toEqual([]);
  });

  it("truncates very long messages", () => {
    const turns = priorTurns([
      { role: "user", content: "x".repeat(10_000) },
      { role: "user", content: "next" },
    ]);
    expect(turns[0].content.length).toBe(4_001);
  });
});

describe("isFailureResult", () => {
  it.each([
    "Couldn't add bracket: validation failed",
    "Cannot generate archetype without scope. Ask for use case/tier/environment first.",
    "Unknown archetype: cube",
    "Unknown tool: frobnicate",
    "No part with role lid.",
    "Project has no archetype — can't update params.",
    "🔎 step.parts search failed: timeout",
  ])("flags %s", (result) => {
    expect(isFailureResult(result)).toBe(true);
  });

  it.each([
    "🟦 Added sheet-metal part base (Base) — Mild Steel 0.075\", 4\" × 3\".",
    "Generated 6 parts and 5 interfaces from Hinged enclosure.",
    "🔎 step.parts: no match for \"M99 bolt\". Use a curated McMaster number instead.",
    "Scope updated.",
  ])("passes %s", (result) => {
    expect(isFailureResult(result)).toBe(false);
  });
});

describe("formatValidatorNote", () => {
  it("reports a clean assembly", () => {
    expect(formatValidatorNote([])).toBe("Validator: all assembly checks pass.");
  });

  it("counts fails and warns and carries suggestions", () => {
    const note = formatValidatorNote([
      { id: "a", label: "Part intersection", status: "fail", message: "A and B overlap.", suggestion: "Move B." },
      { id: "b", label: "Hole edge distance", status: "warn", message: "Too close." },
    ]);
    expect(note).toContain("1 fail, 1 warn");
    expect(note).toContain("[FAIL] Part intersection: A and B overlap. → Move B.");
    expect(note).toContain("[WARN] Hole edge distance: Too close.");
  });

  it("caps the list and says how many were left out", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      id: `r${i}`, label: `Rule ${i}`, status: "fail", message: "bad",
    }));
    const note = formatValidatorNote(many);
    expect(note.split("\n")).toHaveLength(12);
    expect(note).toContain("…and 4 more.");
  });
});

describe("describeToolCall", () => {
  it("names the part being added", () => {
    expect(describeToolCall("add_sheet_metal_part", { label: "Base plate", role: "base" })).toBe("Adding Base plate");
  });
  it("quotes the catalog query", () => {
    expect(describeToolCall("search_step_parts", { query: "M3 screw" })).toBe('Searching the parts catalog for "M3 screw"');
  });
  it("falls back for unknown tools and missing input", () => {
    expect(describeToolCall("mystery", undefined)).toBe("Working");
    expect(describeToolCall("refine_part", {})).toBe("Refining a part");
  });
});
