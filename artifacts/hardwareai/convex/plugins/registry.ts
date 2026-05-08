import type { PluginKind, ProcessPlugin } from "./types";

/**
 * Plugin registry. Plan 2+ will populate this. Today it returns null for
 * every kind — the orchestrator no-ops when a part's plugin is missing.
 *
 * Keys are \`PluginKind\` (\`PartKind\` + dispatch-only identifiers like
 * \`cad_ir\`). \`cad_ir\` is NOT a persisted part-row kind (see HI-03 / the
 * \`PartKind\` doc-comment in ./types.ts) — the orchestrator routes a
 * \`kind: "sheet_metal"\` + \`useCadIr=true\` part to the \`cad_ir\` plugin via
 * dispatch logic in \`orchestrator/tick.ts\`.
 */
const REGISTRY: Partial<Record<PluginKind, ProcessPlugin<unknown>>> = {};

export function getPlugin(kind: PluginKind): ProcessPlugin<unknown> | null {
  return REGISTRY[kind] ?? null;
}

export function registeredKinds(): PluginKind[] {
  return Object.keys(REGISTRY) as PluginKind[];
}

/** Internal — used by future plugin index files to register themselves. */
export function _registerPlugin<TDsl>(plugin: ProcessPlugin<TDsl>): void {
  REGISTRY[plugin.kind] = plugin as ProcessPlugin<unknown>;
}

/** Test-only — clear all registered plugins. Production code must not call this. */
export function _resetRegistry(): void {
  for (const k of Object.keys(REGISTRY) as PluginKind[]) delete REGISTRY[k];
}
