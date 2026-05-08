import type { AgentTool } from "../types";

export const refinePartTool: AgentTool = {
  name: "refine_part",
  description:
    "Apply a patch to one part's DSL (change dimensions, add a feature, remove a feature). " +
    "Use this for mechanical fixes — moving a hole, bumping a thickness, changing material. " +
    "The dsl input must be a complete updated PartDsl shape.",
  input_schema: {
    type: "object",
    properties: {
      role: { type: "string", description: "The part's role (e.g., 'panel', 'bracket')." },
      dsl: { type: "object", description: "The full updated PartDsl. All fields required." },
      rationale: { type: "string", description: "One sentence — why this change resolves the violation." },
    },
    required: ["role", "dsl", "rationale"],
  },
};

export const addFeatureToPartTool: AgentTool = {
  name: "add_feature_to_part",
  description:
    "Add a single feature (hole/bend/slot/fillet) to the named part without replacing its DSL wholesale. " +
    "Use this for additive fixes — e.g., adding a relief slot near a bend, adding a hole for a fastener.",
  input_schema: {
    type: "object",
    properties: {
      role: { type: "string" },
      feature: {
        type: "object",
        description:
          "The feature object. Must conform to FeatureSchema in convex/lib/dsl.ts: " +
          "{ kind: 'hole'|'bend'|'slot'|'fillet', name, ...kind-specific fields }.",
      },
      rationale: { type: "string" },
    },
    required: ["role", "feature", "rationale"],
  },
};

export const TOOLS: AgentTool[] = [refinePartTool, addFeatureToPartTool];
