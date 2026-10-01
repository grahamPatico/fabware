import { DEFAULT_EFFORT, DEFAULT_MODEL, SELECTABLE_MODELS, getModel, type Effort } from "../../convex/lib/models";

export const LS_MODEL = "fabware.chat.model";
export const LS_EFFORT = "fabware.chat.effort";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A saved model id, or the default when it is missing or no longer offered. */
export function validModel(id: string | null | undefined): string {
  return SELECTABLE_MODELS.some((m) => m.id === id) ? (id as string) : DEFAULT_MODEL;
}

/**
 * A saved effort level, or the default when the model doesn't accept it.
 * Models with no effort setting still get the default: the API ignores it and
 * the backend requires a valid level.
 */
export function validEffort(model: string, effort: string | null | undefined): Effort {
  const efforts = getModel(model)?.efforts ?? [];
  return efforts.includes(effort as Effort) ? (effort as Effort) : DEFAULT_EFFORT;
}

/** The model + effort the user last picked in the chat, validated. */
export function readChatPrefs(): { model: string; effort: Effort } {
  const model = validModel(read(LS_MODEL));
  return { model, effort: validEffort(model, read(LS_EFFORT)) };
}
