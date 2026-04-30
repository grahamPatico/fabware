// convex/cad/plugin.ts
//
// cadIrPlugin: ProcessPlugin<CadIr>
//
// Wires together the CAD IR schema, tools, system-prompt fragment, and
// validation pipeline (tier-1 schema + tier-4 manufacturing) into the
// standard ProcessPlugin contract.
//
// For Phase 1 the plugin's `kind` is "sheet_metal" so the orchestrator's
// existing dispatch path works — the specialist forks on `part.useCadIr`.
// Phase 2+ will introduce a dedicated "cad_ir" kind once all integration
// points support it.

import type { ProcessPlugin, PartContext, Violation } from "../plugins/types";
import type { CadIr } from "./ir/types";
import { CadIrSchema } from "./ir/schema";
import { CAD_IR_TOOLS } from "./patch/tools";
import { cadIrSystemPromptFragment } from "./prompts";
import { validateSchemaTier } from "./validate/schemaTier";
import { resolveIr } from "./resolve/resolveIr";
import { validateManufacturingTier } from "./validate/manufacturingTier";

/**
 * Combined tier-1 (schema) + tier-4 (manufacturing) validate function.
 *
 * Tier-1 runs on the raw CadIr directly — no resolution needed.
 * Tier-4 requires a resolved IR (all expressions evaluated to numbers).
 * If resolution fails (e.g. undefined parameter reference), we skip tier-4
 * and surface only the schema violations.
 */
function validate(ir: CadIr, _ctx: PartContext): Violation[] {
  // Tier 1: schema structural checks
  const schemaViolations = validateSchemaTier(ir);
  if (schemaViolations.length > 0) {
    // Don't attempt resolution when the IR has structural errors;
    // tier-4 results would be unreliable.
    return schemaViolations;
  }

  // Tier 4: manufacturing geometry checks (requires resolved IR)
  let mfgViolations: Violation[] = [];
  try {
    const resolved = resolveIr(ir);
    mfgViolations = validateManufacturingTier(resolved);
  } catch {
    // Resolution error (e.g. undefined parameter). Surface as a schema-tier
    // violation so the agent knows to fix the expression.
    mfgViolations = [
      {
        ruleId: "schema.resolution-error",
        severity: "error",
        message: "Failed to resolve parameter expressions",
        agentMessage:
          "One or more parameter expressions could not be evaluated. Check that all parameter references are defined and there are no circular dependencies.",
      },
    ];
  }

  return [...schemaViolations, ...mfgViolations];
}

export const cadIrPlugin: ProcessPlugin<CadIr> = {
  // Phase 1: keep "sheet_metal" so the orchestrator dispatch path works.
  // The specialist forks on `part.useCadIr` to route to the CAD IR pipeline.
  kind: "sheet_metal",

  dslSchema: CadIrSchema as import("zod/v4").ZodType<CadIr>,

  tools: CAD_IR_TOOLS,
  systemPromptFragment: cadIrSystemPromptFragment,
  defaultModel: { model: "claude-sonnet-4-6", effort: "med" },

  rules: [],
  validate,
  autoRepair: () => null,

  // Phase 2+ wires these through the plugin. Stubs keep the contract typed.
  renderPreview: () => ({ meshes: [] }),
  export: () => [],
  estimateCost: () => ({ totalUsd: 0, breakdown: [] }),

  supportedInterfaces: ["bolted", "pem_inserted"],
};
