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
              type: { enum: ["simple", "countersink", "counterbore", "threaded"] },
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
              countersink: {
                type: "object",
                properties: {
                  angle: { oneOf: [{ type: "number" }, { type: "string" }], description: "included angle in degrees, e.g. 82 or 90" },
                  diameter: { oneOf: [{ type: "number" }, { type: "string" }], description: "outer (large) diameter of the countersink" },
                },
                required: ["angle", "diameter"],
              },
              counterbore: {
                type: "object",
                properties: {
                  diameter: { oneOf: [{ type: "number" }, { type: "string" }], description: "counterbore diameter (must be > hole diameter)" },
                  depth: { oneOf: [{ type: "number" }, { type: "string" }], description: "counterbore depth" },
                },
                required: ["diameter", "depth"],
              },
              thread: {
                type: "object",
                properties: {
                  spec: { type: "string", description: "thread specification, e.g. \"M6x1.0\" or \"1/4-20\"" },
                },
                required: ["spec"],
              },
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
          {
            type: "object",
            properties: {
              kind: { const: "revolve" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN, description: "sketch id to revolve" },
              axis: { type: "string", enum: ["x", "y", "z"], description: "axis of revolution" },
              angle: { oneOf: [{ type: "number" }, { type: "string" }], description: "revolution arc in degrees (0 < angle ≤ 360)" },
            },
            required: ["kind", "id", "profile", "axis", "angle"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "shell" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              thickness: { oneOf: [{ type: "number" }, { type: "string" }], description: "shell wall thickness" },
              removedFaces: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    feature: { type: "string", pattern: SNAKE_PATTERN },
                    tag: { type: "string", description: "face tag, e.g. top or bottom" },
                  },
                  required: ["feature", "tag"],
                },
                description: "faces to open (remove) during shelling — at least one required",
              },
            },
            required: ["kind", "id", "thickness", "removedFaces"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "bend_flange" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              face: {
                type: "object",
                properties: {
                  feature: { type: "string", pattern: SNAKE_PATTERN },
                  tag: { type: "string" },
                },
                required: ["feature", "tag"],
                description: "face to bend from",
              },
              angle: { oneOf: [{ type: "number" }, { type: "string" }], description: "bend angle in degrees" },
              radius: { oneOf: [{ type: "number" }, { type: "string" }], description: "inner bend radius (must be ≥ sheet thickness)" },
              length: { oneOf: [{ type: "number" }, { type: "string" }], description: "flange length" },
              thickness: { oneOf: [{ type: "number" }, { type: "string" }], description: "sheet thickness" },
            },
            required: ["kind", "id", "face", "angle", "radius", "length", "thickness"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "sweep" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profile: { type: "string", pattern: SNAKE_PATTERN, description: "cross-section sketch id" },
              path: { type: "string", pattern: SNAKE_PATTERN, description: "sweep-path sketch id (typically contains a line or spline)" },
            },
            required: ["kind", "id", "profile", "path"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "loft" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              profiles: {
                type: "array",
                minItems: 2,
                items: { type: "string", pattern: SNAKE_PATTERN },
                description: "ordered list of ≥ 2 profile sketch ids to loft through",
              },
            },
            required: ["kind", "id", "profiles"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "weld_tab" },
              id: { type: "string", pattern: SNAKE_PATTERN },
              face: {
                type: "object",
                properties: {
                  feature: { type: "string", pattern: SNAKE_PATTERN },
                  tag: { type: "string" },
                },
                required: ["feature", "tag"],
                description: "host face to attach the tab to",
              },
              length: { oneOf: [{ type: "number" }, { type: "string" }], description: "tab length" },
              width: { oneOf: [{ type: "number" }, { type: "string" }], description: "tab width" },
              thickness: { oneOf: [{ type: "number" }, { type: "string" }], description: "tab thickness" },
              position: {
                type: "object",
                properties: {
                  x: { oneOf: [{ type: "number" }, { type: "string" }] },
                  y: { oneOf: [{ type: "number" }, { type: "string" }] },
                },
                required: ["x", "y"],
                description: "2-D offset of tab centre on the face",
              },
            },
            required: ["kind", "id", "face", "length", "width", "thickness", "position"],
          },
        ],
      },
    },
    required: ["feature"],
  },
};

const modifyFeature: AgentTool = {
  name: "modify_feature",
  description:
    "Update fields on an existing feature in the timeline. Only supply the fields you want to change — all others are preserved. Cannot change the feature's kind.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN, description: "id of the feature to modify" },
      changes: {
        type: "object",
        description: "Partial feature fields to merge. Must not include 'kind'.",
        additionalProperties: true,
      },
    },
    required: ["featureId", "changes"],
  },
};

const suppress: AgentTool = {
  name: "suppress",
  description: "Suppress a feature (exclude it from the build without removing it). The feature remains in the timeline but is skipped during execution.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN, description: "id of the feature to suppress" },
    },
    required: ["featureId"],
  },
};

const unsuppress: AgentTool = {
  name: "unsuppress",
  description: "Unsuppress a previously-suppressed feature, restoring it to the active build.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN, description: "id of the feature to unsuppress" },
    },
    required: ["featureId"],
  },
};

const reorderFeature: AgentTool = {
  name: "reorder_feature",
  description:
    "Move a feature to a different position in the timeline. Specify beforeFeatureId to insert before that feature, or afterFeatureId to insert after it. If neither is specified, the feature moves to the end. The validator will reject forward references.",
  input_schema: {
    type: "object",
    properties: {
      featureId: { type: "string", pattern: SNAKE_PATTERN, description: "id of the feature to move" },
      beforeFeatureId: { type: "string", pattern: SNAKE_PATTERN, description: "insert before this feature id" },
      afterFeatureId: { type: "string", pattern: SNAKE_PATTERN, description: "insert after this feature id" },
    },
    required: ["featureId"],
  },
};

const remove: AgentTool = {
  name: "remove",
  description:
    "Remove a parameter, sketch, or feature from the IR. Will be rejected if other entities still reference the removed entity.",
  input_schema: {
    type: "object",
    properties: {
      entityType: { type: "string", enum: ["parameter", "sketch", "feature"] },
      id: { type: "string", pattern: SNAKE_PATTERN, description: "id of the entity to remove" },
    },
    required: ["entityType", "id"],
  },
};

const addSketch: AgentTool = {
  name: "add_sketch",
  description:
    "Add a new sketch to the IR. A sketch defines a 2-D profile on a plane (XY, XZ, YZ, or a face). Features like extrude and cut_extrude reference sketches by id.",
  input_schema: {
    type: "object",
    properties: {
      sketch: {
        type: "object",
        properties: {
          id: { type: "string", pattern: SNAKE_PATTERN, description: "unique snake_case sketch id" },
          plane: {
            oneOf: [
              { type: "string", enum: ["XY", "XZ", "YZ"] },
              {
                type: "object",
                properties: { face: { type: "string", description: "<featureId>.<tag>" } },
                required: ["face"],
              },
            ],
          },
          geometry: {
            type: "array",
            items: {
              type: "object",
              description: "SketchEntity: rect, circle, or line",
            },
          },
        },
        required: ["id", "plane", "geometry"],
      },
    },
    required: ["sketch"],
  },
};

const modifySketch: AgentTool = {
  name: "modify_sketch",
  description:
    "Modify an existing sketch: change its plane, add/remove/update geometry entities. Use op.kind to choose the operation.",
  input_schema: {
    type: "object",
    properties: {
      sketchId: { type: "string", pattern: SNAKE_PATTERN, description: "id of the sketch to modify" },
      op: {
        oneOf: [
          {
            type: "object",
            properties: { kind: { const: "set_plane" }, plane: { oneOf: [{ type: "string", enum: ["XY", "XZ", "YZ"] }, { type: "object", properties: { face: { type: "string" } }, required: ["face"] }] } },
            required: ["kind", "plane"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "add_entity" },
              entity: { type: "object", description: "SketchEntity (rect/circle/line)", additionalProperties: true },
            },
            required: ["kind", "entity"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "remove_entity" },
              entityId: { type: "string", description: "id of the entity to remove" },
            },
            required: ["kind", "entityId"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "modify_entity" },
              entityId: { type: "string", description: "id of the entity to modify" },
              changes: { type: "object", description: "partial entity fields", additionalProperties: true },
            },
            required: ["kind", "entityId", "changes"],
          },
        ],
      },
    },
    required: ["sketchId", "op"],
  },
};

// ── Phase 4: Assembly tools ──────────────────────────────────────────────────

const addPart: AgentTool = {
  name: "add_part",
  description:
    "Add a sub-part to the assembly. Each part has a unique snake_case id and an inline CadIr that defines its geometry. Optionally supply origin (x/y/z translation in assembly units) and rotation (rx/ry/rz Euler angles in degrees).",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", pattern: SNAKE_PATTERN, description: "unique snake_case part id" },
      ir: {
        type: "object",
        description: "Inline CadIr for the sub-part. Must have schemaVersion, units, parameters, sketches, features.",
        additionalProperties: true,
      },
      origin: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
        },
        required: ["x", "y", "z"],
      },
      rotation: {
        type: "object",
        properties: {
          rx: { type: "number", description: "rotation about X axis (degrees)" },
          ry: { type: "number", description: "rotation about Y axis (degrees)" },
          rz: { type: "number", description: "rotation about Z axis (degrees)" },
        },
        required: ["rx", "ry", "rz"],
      },
    },
    required: ["id", "ir"],
  },
};

const addJoint: AgentTool = {
  name: "add_joint",
  description:
    "Add a kinematic joint between two parts in the assembly. Types: fixed (rigid), revolute (rotation), linear (prismatic translation). Supply axis and limits for non-fixed joints.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", pattern: SNAKE_PATTERN, description: "unique snake_case joint id" },
      parent: { type: "string", pattern: SNAKE_PATTERN, description: "parent part id" },
      child: { type: "string", pattern: SNAKE_PATTERN, description: "child part id" },
      type: { type: "string", enum: ["fixed", "revolute", "linear"] },
      axis: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "standard" },
              axis: { type: "string", enum: ["x", "y", "z"] },
            },
            required: ["kind", "axis"],
          },
          {
            type: "object",
            properties: {
              kind: { const: "edge" },
              part: { type: "string", pattern: SNAKE_PATTERN },
              feature: { type: "string", pattern: SNAKE_PATTERN },
              query: { type: "string" },
            },
            required: ["kind", "part", "feature", "query"],
          },
        ],
      },
      limits: {
        type: "object",
        properties: {
          lower: { type: "number" },
          upper: { type: "number" },
          unit: { type: "string", enum: ["deg", "rad", "mm", "in"] },
        },
        required: ["lower", "upper", "unit"],
      },
      origin: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
        },
        required: ["x", "y", "z"],
      },
    },
    required: ["id", "parent", "child", "type"],
  },
};

const addConnection: AgentTool = {
  name: "add_connection",
  description:
    "Declare a geometric/interface connection between two features on different parts. Types: face_mate (mating planar faces), bolt_pattern (bolted joint), snap_fit (snap-fit interface).",
  input_schema: {
    type: "object",
    properties: {
      partA: { type: "string", pattern: SNAKE_PATTERN },
      featureA: { type: "string", pattern: SNAKE_PATTERN },
      partB: { type: "string", pattern: SNAKE_PATTERN },
      featureB: { type: "string", pattern: SNAKE_PATTERN },
      type: { type: "string", enum: ["face_mate", "bolt_pattern", "snap_fit"] },
    },
    required: ["partA", "featureA", "partB", "featureB", "type"],
  },
};

export const CAD_IR_TOOLS: AgentTool[] = [
  setParameter,
  addFeature,
  modifyFeature,
  suppress,
  unsuppress,
  reorderFeature,
  remove,
  addSketch,
  modifySketch,
  // Phase 4: assembly tools
  addPart,
  addJoint,
  addConnection,
];
