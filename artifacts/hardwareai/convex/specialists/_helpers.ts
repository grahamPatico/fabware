import type { ProcessPlugin, PartContext, Violation, AgentTool } from "../plugins/types";

export interface SpecialistResult<TDsl> {
  status: "ok" | "escalated";
  violations: Violation[];
  repairedDsl: TDsl;
  autoRepairedCount: number;
}

/**
 * One pass of validate → auto-repair (single attempt per violation) → re-validate.
 * Plan 3 will extend this into the full two-tier loop with R repair turns and
 * cascade re-validation; Plan 2 keeps it single-pass because no autoRepair functions
 * exist yet (every plugin.autoRepair returns null today).
 */
export function runSpecialistOnce<TDsl>(
  plugin: ProcessPlugin<TDsl>,
  dsl: TDsl,
  ctx: PartContext,
): SpecialistResult<TDsl> {
  let current = dsl;
  let autoRepairedCount = 0;
  const initial = plugin.validate(current, ctx);
  for (const v of initial) {
    const repaired = plugin.autoRepair(current, v);
    if (repaired !== null) {
      current = repaired;
      autoRepairedCount += 1;
    }
  }
  const remaining = autoRepairedCount > 0 ? plugin.validate(current, ctx) : initial;
  return {
    status: remaining.length === 0 ? "ok" : "escalated",
    violations: remaining,
    repairedDsl: current,
    autoRepairedCount,
  };
}

export interface RepairTurnPrompt {
  system: string;
  tools: AgentTool[];
  /**
   * Single user message containing the part DSL JSON + the open violations to fix.
   * The model is expected to respond with one or more tool_use blocks (refine_part
   * or add_feature_to_part) targeting the violations.
   */
  userMessage: string;
}

interface BuildPromptInput {
  scope: unknown | null;
  partLabel: string;
  partDsl: unknown;
  violations: Violation[];
  pluginSystemPromptFragment: string;
  pluginTools: AgentTool[];
}

/**
 * Assemble the prompt for one repair turn. The orchestrator/specialist constructs
 * this from layered fragments — see spec section 4 ("Agent layer").
 *
 * Layered shape: [global preamble] + [role preamble] + [scope summary] +
 * [plugin systemPromptFragment] + [local context (DSL + violations)] +
 * [turn intent (repair)].
 */
export function buildRepairPrompt(input: BuildPromptInput): RepairTurnPrompt {
  const scopeLine = input.scope
    ? `Project scope: ${JSON.stringify(input.scope)}`
    : "Project scope: not yet set.";

  const violationLines = input.violations
    .map((v, i) => `${i + 1}. [${v.ruleId}] ${v.agentMessage}${v.suggestedFix ? ` (suggestedFix: ${JSON.stringify(v.suggestedFix)})` : ""}`)
    .join("\n");

  const system =
    "You are Fabware's harness specialist running a focused repair turn.\n\n" +
    "Role: specialist:sheet-metal\n\n" +
    scopeLine + "\n\n" +
    input.pluginSystemPromptFragment + "\n\n" +
    "Repair-turn instructions:\n" +
    "- Apply minimal mechanical fixes via your tools (refine_part or add_feature_to_part).\n" +
    "- Do NOT redesign the part. Patch only.\n" +
    "- If a violation cannot be fixed mechanically (e.g. requires a material change\n" +
    "  the user must approve), leave it for the orchestrator to escalate.\n";

  const userMessage =
    `Part: ${input.partLabel}\n\n` +
    `Current DSL:\n\`\`\`json\n${JSON.stringify(input.partDsl, null, 2)}\n\`\`\`\n\n` +
    `Open violations to fix this turn (${input.violations.length}):\n${violationLines}\n\n` +
    "Respond with one or more tool calls that resolve the violations.";

  return { system, tools: input.pluginTools, userMessage };
}

/**
 * Apply a single tool call to a DSL. Returns { dsl, applied } where `applied` is
 * true iff the tool name was recognized AND the call's input was structurally valid.
 *
 * `refine_part` replaces the entire DSL. `add_feature_to_part` appends one feature.
 * Any other tool name returns the input DSL unchanged with applied=false.
 *
 * The DSL is validated by the plugin's dslSchema after applying — if parsing fails,
 * the change is rejected (returns input DSL unchanged, applied=false).
 */
export function applyToolCallToDsl<TDsl>(
  dsl: TDsl,
  toolCall: { name: string; input: unknown },
  dslSchema: { safeParse: (v: unknown) => { success: boolean; data?: TDsl } },
): { dsl: TDsl; applied: boolean } {
  const input = toolCall.input as Record<string, unknown>;

  if (toolCall.name === "refine_part") {
    if (!input || typeof input !== "object" || !("dsl" in input)) return { dsl, applied: false };
    const candidate = input.dsl;
    const parsed = dslSchema.safeParse(candidate);
    if (parsed.success && parsed.data !== undefined) {
      return { dsl: parsed.data, applied: true };
    }
    return { dsl, applied: false };
  }

  if (toolCall.name === "add_feature_to_part") {
    if (!input || typeof input !== "object" || !("feature" in input)) return { dsl, applied: false };
    const dslAsRecord = dsl as unknown as { features?: unknown[] };
    if (!Array.isArray(dslAsRecord.features)) return { dsl, applied: false };
    const candidate = { ...dslAsRecord, features: [...dslAsRecord.features, input.feature] };
    const parsed = dslSchema.safeParse(candidate);
    if (parsed.success && parsed.data !== undefined) {
      return { dsl: parsed.data, applied: true };
    }
    return { dsl, applied: false };
  }

  return { dsl, applied: false };
}
