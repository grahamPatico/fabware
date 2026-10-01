// Pure helpers for the assembly-design agent loop (convex/projectChat.ts).
// Kept free of Convex and SDK imports so they can be unit-tested directly.

// Prior turns replayed to the model. The project-state block already carries
// the outcome of older turns, so the transcript only needs recent context.
const HISTORY_MESSAGE_LIMIT = 40;
const HISTORY_MESSAGE_CHARS = 4_000;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  kind?: "text" | "tool" | "error";
}

/**
 * Earlier turns as plain text. Tool-activity rows are left out: the
 * project-state block is the ground truth for what they did, and replaying
 * them as assistant prose teaches the model to narrate actions instead of
 * calling tools.
 */
export function priorTurns(history: HistoryMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  // The last row is this turn's user message, inserted by agentRuns.start.
  const last = history[history.length - 1];
  const earlier = last?.role === "user" ? history.slice(0, -1) : history;
  const turns = earlier
    .filter((m) => m.kind !== "tool" && m.kind !== "error" && m.content.trim().length > 0)
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((m) => ({
      role: m.role,
      content: m.content.length > HISTORY_MESSAGE_CHARS
        ? m.content.slice(0, HISTORY_MESSAGE_CHARS) + "…"
        : m.content,
    }));
  // The API requires the transcript to open with a user message.
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

export type Violation = { id: string; label: string; status: string; message: string; suggestion?: string };

export function formatValidatorNote(violations: Violation[]): string {
  if (violations.length === 0) return "Validator: all assembly checks pass.";
  const shown = violations.slice(0, 10).map((v) =>
    `- [${v.status.toUpperCase()}] ${v.label}: ${v.message}` + (v.suggestion ? ` → ${v.suggestion}` : ""));
  const more = violations.length > shown.length ? [`- …and ${violations.length - shown.length} more.`] : [];
  const fails = violations.filter((v) => v.status === "fail").length;
  return [`Validator after these changes — ${fails} fail, ${violations.length - fails} warn:`, ...shown, ...more].join("\n");
}

/** Tool results are prose; these openers are how applyToolCall reports failure. */
export function isFailureResult(result: string): boolean {
  return /^(Couldn't|Cannot|Unknown (tool|archetype)|No part with role|Project has no archetype)/.test(result)
    || result.includes("search failed");
}

export function describeToolCall(name: string, input: any): string {
  const label = typeof input?.label === "string" ? input.label : typeof input?.role === "string" ? input.role : "";
  switch (name) {
    case "gather_inspiration": return "Researching reference designs";
    case "capture_scope": return "Capturing project scope";
    case "select_archetype": return "Generating the base assembly";
    case "update_archetype_params": return "Resizing the assembly";
    case "refine_part": return `Refining ${label || "a part"}`;
    case "add_feature_to_part": return `Adding a feature to ${label || "a part"}`;
    case "add_sheet_metal_part": return `Adding ${label || "a sheet-metal part"}`;
    case "add_freeform_2d_part": return `Cutting ${label || "a custom outline"}`;
    case "add_printed_part": return `Adding ${label || "a printed part"}`;
    case "add_purchased_part": return `Adding ${label || "hardware"}`;
    case "add_pipe": return `Adding ${label || "a pipe"}`;
    case "add_interface": return "Connecting parts";
    case "remove_part": return `Removing ${label || "a part"}`;
    case "search_step_parts": return `Searching the parts catalog${input?.query ? ` for "${input.query}"` : ""}`;
    case "check_manufacturing": return "Checking manufacturability";
    case "decide_make_or_buy": return "Deciding make vs. buy";
    case "break_out": return "Switching to a custom assembly";
    default: return "Working";
  }
}

