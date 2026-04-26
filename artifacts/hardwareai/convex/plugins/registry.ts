import type { PartKind, ProcessPlugin } from "./types";

/**
 * Plugin registry. Plan 2+ will populate this. Today it returns null for
 * every kind — the orchestrator no-ops when a part's plugin is missing.
 */
const REGISTRY: Partial<Record<PartKind, ProcessPlugin<unknown>>> = {};

export function getPlugin(kind: PartKind): ProcessPlugin<unknown> | null {
  return REGISTRY[kind] ?? null;
}

export function registeredKinds(): PartKind[] {
  return Object.keys(REGISTRY) as PartKind[];
}

/** Internal — used by future plugin index files to register themselves. */
export function _registerPlugin<TDsl>(plugin: ProcessPlugin<TDsl>): void {
  REGISTRY[plugin.kind] = plugin as ProcessPlugin<unknown>;
}
