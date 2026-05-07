// convex/cad/plugin.ts
//
// cadIrPlugin: ProcessPlugin<CadIr>
//
// Wires together the CAD IR schema, tools, system-prompt fragment, and
// validation pipeline (tiers 1, 2, 3, 4, 5) into the standard ProcessPlugin
// contract.
//
// Phase 19 gap-closure: kind is now "cad_ir" (a dedicated PartKind string,
// distinct from "sheet_metal"), and the plugin is registered via
// _registerPlugin in convex/plugins/index.ts. The orchestrator routes
// useCadIr=true parts through this plugin via registry lookup.
//
// Tier 3 (geometry) is invoked when sandbox results are passed via the
// optional second-arg context. Callers without sandbox data (unit tests,
// pre-compile validation passes) still pass cleanly.

import type { ProcessPlugin, PartContext, Violation } from "../plugins/types";
import type { CadIr, EntityRegistry } from "./ir/types";
import { CadIrSchema } from "./ir/schema";
import { CAD_IR_TOOLS } from "./patch/tools";
import { cadIrSystemPromptFragment } from "./prompts";
import { validateSchemaTier } from "./validate/schemaTier";
import { validateConstraintTier } from "./validate/constraintTier";
import { validateAssemblyTier } from "./validate/assemblyTier";
import { validateGeometryTier } from "./validate/geometryTier";
import { resolveIr } from "./resolve/resolveIr";
import { validateManufacturingTier } from "./validate/manufacturingTier";
import { budgetExceeded } from "./validate/rules/budgetExceeded";

/**
 * Optional sandbox-execution context. When the specialist has run the
 * sandbox, it passes the build123d log + parsed entity registry through
 * `ctx.sandbox` so Tier 3 (geometry) can fire. Callers without a sandbox
 * result omit this and Tier 3 is skipped vacuously.
 */
export interface CadIrPartContext extends PartContext {
  sandbox?: {
    log: string;
    entities: EntityRegistry;
    requestedFaceTags: string[];
  };
}

/**
 * Combined tier-1 → tier-5 validate function.
 *
 * Tier order:
 *   1 schema       — runs first; structural errors short-circuit.
 *   2 constraint   — sketch-constraint contradictions; errors short-circuit.
 *   5 assembly     — floating parts, interference, joint-range collisions.
 *   3 geometry     — sandbox build errors + missing face tags. Skipped when
 *                     no sandbox result is available.
 *   4 manufacturing+ budget — process-gated MFG rules + budget rule.
 */
function validate(ir: CadIr, ctx: PartContext): Violation[] {
  // The CAD IR specialist passes a `sandbox` field on the context to enable
  // Tier 3 (geometry) checks. Other callers (unit tests, future hosts that
  // only know the bare ProcessPlugin contract) omit it and Tier 3 is skipped.
  const sandbox = (ctx as CadIrPartContext).sandbox;
  // Tier 1: schema structural checks
  const schemaViolations = validateSchemaTier(ir);
  if (schemaViolations.length > 0) {
    return schemaViolations;
  }

  // Tier 2: sketch constraint checks (Phase 7)
  const constraintViolations = validateConstraintTier(ir);
  if (constraintViolations.some((v) => v.severity === "error")) {
    return constraintViolations;
  }

  // Tier 5: assembly topology checks
  const assemblyViolations = validateAssemblyTier(ir);
  if (assemblyViolations.length > 0) {
    return assemblyViolations;
  }

  // Tier 3: geometry checks (only when sandbox results are present).
  // Build errors and missing face tags surface here. When no sandbox result
  // is available (unit-test path, pre-compile validate), skip vacuously.
  if (sandbox) {
    const geomViolations = validateGeometryTier({
      log: sandbox.log,
      requestedFaceTags: sandbox.requestedFaceTags,
      entities: sandbox.entities,
    });
    if (geomViolations.length > 0) {
      return geomViolations;
    }
  }

  // Tier 4: manufacturing + budget (requires resolved IR).
  let t2: Violation[] = constraintViolations;
  let mfgAndBudget: Violation[] = [];
  try {
    const resolved = resolveIr(ir);
    mfgAndBudget = [...validateManufacturingTier(resolved, ir), ...budgetExceeded(ir)];
  } catch {
    mfgAndBudget = [
      {
        ruleId: "schema.resolution-error",
        severity: "error",
        message: "Failed to resolve parameter expressions",
        agentMessage:
          "One or more parameter expressions could not be evaluated. Check that all parameter references are defined and there are no circular dependencies.",
      },
    ];
  }

  return [...t2, ...mfgAndBudget];
}

export const cadIrPlugin: ProcessPlugin<CadIr> = {
  // Phase 19 gap-closure: dedicated "cad_ir" kind. The orchestrator looks
  // this up via _registerPlugin / getPlugin(kind) instead of a hardcoded
  // module import.
  kind: "cad_ir",

  dslSchema: CadIrSchema as import("zod/v4").ZodType<CadIr>,

  tools: CAD_IR_TOOLS,
  systemPromptFragment: cadIrSystemPromptFragment,
  defaultModel: { model: "claude-sonnet-4-6", effort: "med" },

  rules: [],
  validate,
  autoRepair: () => null,

  // Preview/export/cost are emitted by the codegen layer (compileToBuild123d,
  // compileToUrdf, compileToMjcf, compileBom, compileCost) and persisted on
  // each revision via _updateRevisionAfterExecution. The plugin contract
  // stubs remain as no-ops; consumers fetch the persisted artifacts via the
  // revisionArtifacts query.
  renderPreview: () => ({ meshes: [] }),
  export: () => [],
  estimateCost: () => ({ totalUsd: 0, breakdown: [] }),

  supportedInterfaces: ["bolted", "pem_inserted"],
};
