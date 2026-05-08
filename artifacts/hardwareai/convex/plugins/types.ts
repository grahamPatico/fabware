/**
 * Process plugin contract — every manufacturing process (sheet_metal, printed,
 * hardware-assembly, …) implements this shape. Pure TS; no Convex, no Anthropic.
 */

import type { ZodType } from "zod/v4";

// ─── Identity ────────────────────────────────────────────────────────────────

/**
 * Identifiers persistable on a \`parts\` row's \`kind\` column. Must stay in
 * lockstep with the \`v.union(...)\` literals on \`parts.kind\` in
 * \`convex/schema.ts\` — Convex rejects writes that don't match.
 *
 * NOTE: \`cad_ir\` is intentionally NOT a PartKind. Per HI-03 of the v1
 * closure review, \`cad_ir\` is a *plugin* identifier (used by the registry
 * and orchestrator dispatch when \`useCadIr=true\` on a sheet_metal part),
 * not a part-row identifier — there is no \`v.literal("cad_ir")\` slot on
 * \`parts.kind\`, so any attempt to persist a part with \`kind: "cad_ir"\`
 * would be rejected at write time. See \`PluginKind\` below.
 */
export type PartKind = "sheet_metal" | "printed" | "purchased";

/**
 * Plugin-registry identifiers — a strict superset of \`PartKind\` that adds
 * dispatch-only kinds (e.g. \`cad_ir\`) which the orchestrator routes to via
 * a feature flag (\`useCadIr=true\`) rather than persisting on \`parts.kind\`.
 *
 * Code paths that look up plugins (\`getPlugin\`, \`registeredKinds\`,
 * \`_registerPlugin\`) operate on \`PluginKind\`. Code paths that read or
 * persist a part-row's stored kind operate on \`PartKind\`.
 */
export type PluginKind = PartKind | "cad_ir";

export type InterfaceKind = "bolted" | "pem_inserted" | "riveted" | "hinged";

// ─── Validation ──────────────────────────────────────────────────────────────

export type Severity = "error" | "warn";
export type Tier = "auto-fixable" | "requires-judgment";

export interface GeometryRef {
  /** What kind of geometric element this violation points at (used by UI to highlight). */
  kind: "hole" | "slot" | "edge" | "bend" | "face" | "feature" | "interface" | "part";
  /** Stable id within the part DSL (e.g., hole id, bend id). */
  id: string;
}

export interface Violation {
  ruleId: string;
  severity: Severity;
  /** Human-readable for chip UI. */
  message: string;
  /** Imperative for the agent: "Move hole H3 to ≥3.2mm from bend B1". */
  agentMessage: string;
  /** Optional structured proposed change. Schema is rule-specific. */
  suggestedFix?: unknown;
  /** Optional pointer for UI highlighting. */
  location?: GeometryRef;
}

export interface PartContext {
  /** The project's scope answers, if set. */
  scope: unknown | null;
  /** Summaries of peer parts in the same project (label + kind). */
  peerParts: Array<{ partId: string; label: string; kind: PartKind }>;
  /**
   * Plugin-specific extensions. The canonical context only carries
   * \`scope\` + \`peerParts\`; specialists that need to thread additional
   * runtime data through to a plugin's \`validate\` (e.g. CAD IR's sandbox
   * log + parsed entity registry for Tier 3 geometry checks) attach it
   * here under a plugin-owned key.
   *
   * Per HI-04 of the v1 closure review, this replaces the previous
   * pattern of casting a bare \`PartContext\` to a plugin-specific
   * subtype inside \`validate\` (which compiled but was structurally
   * unsound — a future refactor that made the subtype field required
   * would compile fine and crash generic hosts that pass a bare
   * PartContext).
   */
  pluginContext?: Record<string, unknown>;
}

export interface Rule<TDsl> {
  /** Globally unique, dot-namespaced: e.g. "sheet.hole-edge-distance". */
  id: string;
  severity: Severity;
  tier: Tier;
  /** Pure function; returns null if the rule is satisfied. */
  check(dsl: TDsl, ctx: PartContext): Violation | null;
  /** For requires-judgment rules: how to phrase the question to the user. */
  judgmentPrompt?: (v: Violation) => string;
}

/** Pure mechanical fix; returns null if the violation isn't auto-repairable for this DSL. */
export type AutoRepair<TDsl> = (dsl: TDsl, v: Violation) => TDsl | null;

// ─── Outputs ─────────────────────────────────────────────────────────────────

export interface ThreePreview {
  /** Plugin-specific preview data the AssembledView knows how to render. Keep loose for v1. */
  meshes: unknown[];
}

export interface ExportArtifact {
  filename: string;
  contentType: string;
  /** Base64 for binary, plain string for text. */
  payload: string;
  encoding: "base64" | "utf8";
}

export interface CostBreakdown {
  totalUsd: number;
  breakdown: Array<{ label: string; usd: number }>;
}

// ─── Agent surface ───────────────────────────────────────────────────────────

export interface AgentTool {
  /** Anthropic tool name; must be unique across the orchestrator's tool registry. */
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: Record<string, unknown>;
}

export interface ModelDefault {
  model: string;
  effort: "low" | "med" | "high";
}

// ─── The contract ────────────────────────────────────────────────────────────

export interface ProcessPlugin<TDsl> {
  kind: PluginKind;

  dslSchema: ZodType<TDsl>;

  tools: AgentTool[];
  systemPromptFragment: string;
  defaultModel?: ModelDefault;

  rules: Rule<TDsl>[];
  validate(dsl: TDsl, ctx: PartContext): Violation[];
  autoRepair: AutoRepair<TDsl>;

  renderPreview(dsl: TDsl): ThreePreview;
  export(dsl: TDsl): ExportArtifact[];
  estimateCost(dsl: TDsl, ctx: PartContext): CostBreakdown;

  supportedInterfaces: InterfaceKind[];
}

// ─── Phase + plan event types (used by orchestrator) ─────────────────────────

export type ProjectPhase =
  | "scoping"
  | "decomposing"
  | "designing"
  | "validating"
  | "exporting"
  | "done";

export type PlanEventKind =
  | "phase-changed"
  | "noop-logged"
  | "specialist-scheduled"
  | "specialist-completed"
  | "auto-repaired"
  | "violation-opened"
  | "violation-resolved"
  | "escalation-opened"
  | "escalation-answered";

export interface PlanEventPayload {
  message?: string;
  partId?: string;
  ruleId?: string;
  fromPhase?: ProjectPhase;
  toPhase?: ProjectPhase;
  details?: Record<string, unknown>;
}
