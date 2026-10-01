// Single source of truth for the Claude models the app can call. Imported by
// both Convex functions and the React client (pure data — no node/Convex deps).

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelSpec {
  id: string;
  label: string;
  /** Short hint shown next to the label in pickers. */
  hint: string;
  /** Listed in the model picker. Legacy ids stay callable but unlisted. */
  selectable: boolean;
  /** Effort levels the API accepts for this model; empty = no effort param. */
  efforts: readonly Effort[];
  /**
   * "always" — thinking can't be turned off; omit the param.
   * "adaptive" — send `thinking: {type: "adaptive"}` explicitly.
   * "none" — don't send a thinking param.
   */
  thinking: "always" | "adaptive" | "none";
  /** Supports the server-side refusal `fallbacks: "default"` beta. */
  fallbacks: boolean;
  /** USD per million tokens. */
  pricing: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export const MODELS: readonly ModelSpec[] = [
  {
    id: "claude-opus-5-5",
    label: "Opus 5.5",
    hint: "best designs",
    selectable: true,
    efforts: ALL_EFFORTS,
    thinking: "always",
    fallbacks: true,
    pricing: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Sonnet 5.5",
    hint: "faster",
    selectable: true,
    efforts: ALL_EFFORTS,
    thinking: "always",
    fallbacks: true,
    pricing: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    hint: "fastest",
    selectable: true,
    efforts: [],
    thinking: "none",
    fallbacks: false,
    pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  },
  // Legacy ids — browsers with an older saved preference still send these.
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    hint: "legacy",
    selectable: false,
    efforts: ALL_EFFORTS,
    thinking: "adaptive",
    fallbacks: false,
    pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    hint: "legacy",
    selectable: false,
    efforts: ["low", "medium", "high", "max"],
    thinking: "adaptive",
    fallbacks: false,
    pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
];

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "medium";
export const EFFORT_LEVELS: readonly Effort[] = ALL_EFFORTS;

export const SELECTABLE_MODELS = MODELS.filter((m) => m.selectable);

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function isSupportedModel(id: string): boolean {
  return getModel(id) !== undefined;
}

export function isEffort(value: string): value is Effort {
  return (ALL_EFFORTS as readonly string[]).includes(value);
}

/**
 * The effort to actually send for `model`, or undefined when the model takes
 * no effort param. A level the model doesn't accept steps down to the nearest
 * one it does (xhigh → high on Sonnet 4.6).
 */
export function resolveEffort(model: string, effort: string): Effort | undefined {
  const spec = getModel(model);
  if (!spec || spec.efforts.length === 0) return undefined;
  if (!isEffort(effort)) return DEFAULT_EFFORT;
  if (spec.efforts.includes(effort)) return effort;
  const wanted = ALL_EFFORTS.indexOf(effort);
  for (let i = wanted; i >= 0; i--) {
    if (spec.efforts.includes(ALL_EFFORTS[i])) return ALL_EFFORTS[i];
  }
  return spec.efforts[0];
}

/** Model id → short display name ("Opus 5.5"); unknown ids pass through trimmed. */
export function modelLabel(id: string | undefined | null): string {
  if (!id) return "Fabware";
  return getModel(id)?.label ?? id.replace(/^claude-/, "");
}
