import type { ProcessPlugin } from "../types";
import { DslSchema, type Dsl } from "./dsl";
import { validate } from "./validator";
import { TOOLS } from "./tools";
import { systemPromptFragment } from "./prompts";

export const sheetMetalPlugin: ProcessPlugin<Dsl> = {
  kind: "sheet_metal",

  dslSchema: DslSchema,

  tools: TOOLS,
  systemPromptFragment,

  // Plan 4 ports each scsRules rule into its own Rule<Dsl> file. Until then, validate()
  // bypasses rules[] entirely and calls the adapter directly.
  rules: [],
  validate,
  autoRepair: () => null,

  // Plan 5+ wires preview, export, cost through the plugin. AssembledView and Export.tsx
  // currently read parts directly; this stub keeps the contract typed without changing UI.
  renderPreview: () => ({ meshes: [] }),
  export: () => [],
  estimateCost: () => ({ totalUsd: 0, breakdown: [] }),

  supportedInterfaces: ["bolted", "pem_inserted", "riveted", "hinged"],
};
