import { useCallback, useEffect, useState } from "react";
import { type Effort } from "../../../../convex/lib/models";
import { LS_EFFORT, LS_MODEL, validEffort, validModel } from "@/lib/chatPrefs";

export { validEffort, validModel };

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data). The
    // choice still holds for this session.
  }
}

export function effortLabel(effort: Effort): string {
  if (effort === "xhigh") return "X-High";
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

/** Model + effort for the chat, persisted per browser and always valid. */
export function useChatPrefs() {
  const [model, setModelState] = useState<string>(() => validModel(readStored(LS_MODEL)));
  const [effort, setEffortState] = useState<Effort>(() =>
    validEffort(validModel(readStored(LS_MODEL)), readStored(LS_EFFORT)),
  );

  useEffect(() => writeStored(LS_MODEL, model), [model]);
  useEffect(() => writeStored(LS_EFFORT, effort), [effort]);

  const setModel = useCallback((id: string) => {
    const next = validModel(id);
    setModelState(next);
    setEffortState((prev) => validEffort(next, prev));
  }, []);

  const setEffort = useCallback(
    (value: string) => setEffortState(validEffort(model, value)),
    [model],
  );

  return { model, effort, setModel, setEffort };
}
