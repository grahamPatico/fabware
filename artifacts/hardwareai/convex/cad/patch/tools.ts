// artifacts/hardwareai/convex/cad/patch/tools.ts
import type { AgentTool } from "../../plugins/types";

const SNAKE_PATTERN = "^[a-z][a-z0-9_]{0,31}$";

const setParameter: AgentTool = {
  name: "set_parameter",
  description:
    "Add or update one parameter in the CAD IR. Value may be a literal number or an expression string (e.g. \"length / 2\"). Use snake_case ids.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", pattern: SNAKE_PATTERN, description: "snake_case parameter id" },
      value: { oneOf: [{ type: "number" }, { type: "string" }], description: "literal or expression" },
      unit: { type: "string", enum: ["mm", "in", "deg", "rad"] },
      description: { type: "string", maxLength: 200 },
      bounds: {
        type: "object",
        properties: { min: { type: "number" }, max: { type: "number" } },
      },
    },
    required: ["id", "value"],
  },
};

const addFeature: AgentTool = {
  name: "add_feature",
  description:
    "Append a typed feature to the timeline. Each feature kind has its own required fields. Reference sketches/features by their snake_case id.",
  input_schema: {
    type: "object",
    properties: {
      feature: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "extrude" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
              operation: { enum: ["new_body", "add", "cut", "intersect"] },
            },
            required: ["kind", "id", "profile", "distance", "operation"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "cut_extrude" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
              through: { type: "boolean" },
            },
            required: ["kind", "id", "profile", "distance"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "fillet" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              edges: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    feature: { type: "string", pattern: SNAKE_PATTERN },
                    query: {
                      oneOf: [
                        { enum: ["all", "top_loop", "bottom_loop"] },
                        { type: "object", properties: { tag: { type: "string" } }, required: ["tag"] },
                      ],
                    },
                  },
                  required: ["feature", "query"],
                },
              },
              radius: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "edges", "radius"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "chamfer" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              edges: { type: "array", items: { type: "object" }, minItems: 1 },
              distance: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "edges", "distance"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "hole" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              type: { const: "simple" },
              face: {
                type: "object",
                properties: { feature: { type: "string", pattern: SNAKE_PATTERN }, tag: { type: "string" } },
                required: ["feature", "tag"],
              },
              positions: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    x: { oneOf: [{ type: "number" }, { type: "string" }] },
                    y: { oneOf: [{ type: "number" }, { type: "string" }] },
                  },
                  required: ["x", "y"],
                },
              },
              diameter: { oneOf: [{ type: "number" }, { type: "string" }] },
              depth: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "type", "face", "positions", "diameter"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "pattern" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              source: { type: "string", pattern: SNAKE_PATTERN },
              axis: { enum: ["x", "y", "z"] },
              count: { type: "integer", minimum: 2, maximum: 64 },
              spacing: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            required: ["kind", "id", "source", "axis", "count", "spacing"],
          },
        ],
      },
    },
    required: ["feature"],
  },
};

export const CAD_IR_TOOLS: AgentTool[] = [setParameter, addFeature];
