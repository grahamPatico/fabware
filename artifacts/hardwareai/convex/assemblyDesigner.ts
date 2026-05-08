"use node";

/**
 * @deprecated Legacy agent loop. Used only for projects where useNewHarness !== true.
 * Plan 9 removes this file once the new harness reaches feature parity.
 *
 * The Anthropic call has been extracted to convex/lib/anthropicClient.ts.
 * The sheet-metal-specific tools are being ported to convex/plugins/sheet_metal/tools.ts (Plan 3).
 * Decomposition / archetype tools (capture_scope, select_archetype) will move to the
 * orchestrator's decomposition agent (Plan 4+).
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { listArchetypes } from "./archetypes";
import { MCMASTER_SEED } from "./lib/mcmasterSeed";

const TOOLS = [
  {
    name: "capture_scope",
    description: "Store the project's scope. Call on new-project creation and whenever the user updates intent.",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "object",
          properties: {
            tier: {
              type: "string",
              enum: ["jerry-rigged", "mvp", "commercial"],
              description: "Build quality target. jerry-rigged = quick prototype, mvp = working demo, commercial = production-ready.",
            },
            environment: {
              type: "object",
              properties: {
                location: { type: "string", enum: ["indoor", "outdoor"] },
                waterproof: { type: "boolean" },
                uv: { type: "boolean" },
                freeze: { type: "boolean" },
              },
              required: ["location"],
            },
            useCase: { type: "string", description: "Short description of what the part is for." },
            userInteraction: { type: "string" },
            referenceScale: {
              type: "object",
              description: "Reference object the user named (e.g. 'tennis ball', 'iPhone', 'shoebox') and optional dimensions in inches.",
              properties: {
                kind: { type: "string" },
                dimensions: {
                  type: "object",
                  properties: { w: { type: "number" }, d: { type: "number" }, h: { type: "number" } },
                  required: ["w", "d", "h"],
                },
                quantity: { type: "number" },
              },
              required: ["kind"],
            },
            budgetCeiling: { type: "number", description: "Total budget ceiling in USD." },
          },
          required: ["tier", "environment", "useCase"],
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "select_archetype",
    description: "Pick an archetype from the library and fill its params. Returns the starter PartList + InterfaceList to generate.",
    input_schema: {
      type: "object",
      properties: {
        archetypeId: { type: "string", enum: ["hinged_enclosure", "sliding_enclosure", "bracket_plus_panel", "divided_tray", "shelf_with_brackets", "box_with_lid"] },
        params: { type: "object" },
        rationale: { type: "string" },
      },
      required: ["archetypeId", "params", "rationale"],
    },
  },
  {
    name: "refine_part",
    description: "Apply a patch to one part's DSL (change dimensions, add a feature, remove a feature).",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" }, dsl: { type: "object" }, rationale: { type: "string" } },
      required: ["role", "dsl", "rationale"],
    },
  },
  {
    name: "add_feature_to_part",
    description: "Add a feature (hole/bend/slot/fillet) to the named part without replacing its DSL wholesale.",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" }, feature: { type: "object" }, rationale: { type: "string" } },
      required: ["role", "feature", "rationale"],
    },
  },
  {
    name: "update_archetype_params",
    description: "Adjust the current archetype's params. Regenerates affected parts.",
    input_schema: {
      type: "object",
      properties: { paramPatch: { type: "object" }, rationale: { type: "string" } },
      required: ["paramPatch", "rationale"],
    },
  },
  {
    name: "break_out",
    description: "Detach the project from its archetype. User can then freely add/remove/edit parts but the agent can't regenerate from intent.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "decompose_freeform",
    description: "[STUB — returns unsupported message in v1.] Propose a free-form part breakdown from intent without using an archetype.",
    input_schema: {
      type: "object",
      properties: { intent: { type: "string" } },
      required: ["intent"],
    },
  },
  {
    name: "add_printed_part",
    description: "Add a 3D-printed part to the project. Use for small custom shapes (bezels, knobs, brackets that don't justify sheet metal, complex geometries). All dimensions in MILLIMETERS (not inches).",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Snake-case role like 'keypad_bezel' or 'cable_grommet'." },
        label: { type: "string", description: "Human label." },
        dsl: {
          type: "object",
          description: "PrintedDsl. Required fields: material, primitive. Optional: layerHeight (default 0.2), infill (default 0.2). The wrapper fields version=1 and kind='printed' are added automatically.",
          properties: {
            material: { type: "string", enum: ["PLA", "PETG", "Nylon", "ABS", "Resin"] },
            layerHeight: { type: "number", description: "Layer height in mm. Typical: 0.2 for PLA/PETG, 0.05–0.1 for resin." },
            infill: { type: "number", description: "Fractional infill 0..1. Typical: 0.15–0.3." },
            primitive: {
              description: "One of three primitive kinds: box, cylinder, or plate_with_holes.",
              oneOf: [
                { type: "object", properties: { kind: { const: "box" }, width: { type: "number" }, depth: { type: "number" }, height: { type: "number" } }, required: ["kind", "width", "depth", "height"] },
                { type: "object", properties: { kind: { const: "cylinder" }, radius: { type: "number" }, height: { type: "number" } }, required: ["kind", "radius", "height"] },
                { type: "object", properties: { kind: { const: "plate_with_holes" }, width: { type: "number" }, depth: { type: "number" }, thickness: { type: "number" }, holes: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, diameter: { type: "number" } }, required: ["x", "y", "diameter"] } } }, required: ["kind", "width", "depth", "thickness"] },
              ],
            },
            features: {
              type: "array",
              description: "Optional features. Each one of hole_through, boss, or pocket.",
              items: { type: "object" },
            },
          },
          required: ["material", "primitive"],
        },
        position: {
          type: "object",
          description: "Position in INCHES (assembly frame). Rotations rotX/rotY/rotZ in RADIANS (e.g., 90° = 1.5708, 180° = 3.1416). Use 0 for no rotation. Even though printed part dimensions are in mm, position is shared with sheet-metal parts in inches.",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "dsl", "position", "rationale"],
    },
  },
  {
    name: "add_sheet_metal_part",
    description: "Add a sheet-metal part with full control over its DSL — outline, thickness, material, holes/bends/slots/tabs/fillets, and pose. Use this when no archetype fits and you need to build piece-by-piece. All dimensions in INCHES. Pose `position` is in the assembly frame; rotation is Euler XYZ in radians (use π/2 for a 90° rotation). The part is inserted directly into the project's parts table; subsequent calls to `add_interface` connect it to other parts.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Snake-case role like 'side_panel_left' — must be unique within the project." },
        label: { type: "string" },
        material: { type: "string", description: "One of the SCS materials: Mild Steel (CRS), Galvanized Steel, Stainless Steel 304, Stainless Steel 316, Aluminum 5052, Aluminum 6061, Copper, Brass, Acrylic Clear, Acrylic Black." },
        thickness: { type: "number", description: "Inches. Pick from the material's stocked gauges." },
        width: { type: "number", description: "Bounding-box width in inches. Used as fallback for non-polygon outlines." },
        height: { type: "number", description: "Bounding-box height in inches." },
        outline: {
          type: "object",
          description: "Optional outline; defaults to rectangle of width × height when omitted. Same shape as add_freeform_2d_part.",
          oneOf: [
            { type: "object", properties: { kind: { const: "rectangle" } }, required: ["kind"] },
            { type: "object", properties: { kind: { const: "polygon" }, points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] }, minItems: 3 } }, required: ["kind", "points"] },
            { type: "object", properties: { kind: { const: "star" }, numPoints: { type: "integer" }, outerRadius: { type: "number" }, innerRadius: { type: "number" } }, required: ["kind", "numPoints", "outerRadius", "innerRadius"] },
            { type: "object", properties: { kind: { const: "circle" }, radius: { type: "number" } }, required: ["kind", "radius"] },
            { type: "object", properties: { kind: { const: "regular_polygon" }, sides: { type: "integer" }, radius: { type: "number" } }, required: ["kind", "sides", "radius"] },
          ],
        },
        features: {
          type: "array",
          description: "Holes / bends / slots / tabs / fillets. Each entry must have a `kind` and a `name`; other fields per kind. For HOLE features that receive a fastener, set `role` so the FastenerStack validator can confirm the joint mates correctly: 'bolt_clear' (bolt passes through, needs nut/PEM/tap on far side), 'tap_1/4-20' (tapped hole, bolt threads in), 'pem_M4' (PEM threaded insert), 'pilot_8x12' (sheet-metal-screw pilot, smaller than clearance), 'rivet_1/8' (rivet shank). Untagged holes get a warn telling the agent the bolt has no confirmed nut.",
          items: { type: "object" },
        },
        powderCoat: { type: "boolean" },
        powderCoatColor: { type: "string" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
      },
      required: ["role", "label", "material", "thickness", "width", "height", "position"],
    },
  },
  {
    name: "add_interface",
    description: "Connect two existing parts. Call after `add_sheet_metal_part` to declare how the parts join. The validator checks the connection per-kind: bolted/riveted/PEM check holes; hinged checks per-style hole counts; weld_seam is just informational; weld_joint validates tab+slot pairing.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["bolted", "pem_inserted", "riveted", "hinged", "weld_seam", "weld_joint"] },
        roleA: { type: "string", description: "First part's role." },
        roleB: { type: "string", description: "Second part's role." },
        featureA: { type: "string", description: "Feature on roleA that anchors the joint (e.g. 'mounting_hole', 'edge', 'tab')." },
        featureB: { type: "string", description: "Feature on roleB." },
        hardwareRefs: {
          type: "array",
          description: "McMaster hardware. Empty for weld_seam. For 'hinged', encode style as role 'pivot:butt' / 'pivot:piano' / 'pivot:concealed'.",
          items: {
            type: "object",
            properties: { mcmasterPartNumber: { type: "string" }, quantity: { type: "integer" }, role: { type: "string" } },
            required: ["mcmasterPartNumber", "quantity"],
          },
        },
        accessSide: { type: "string", enum: ["A-to-B", "B-to-A", "either"], description: "For pem_inserted only." },
      },
      required: ["kind", "roleA", "roleB", "featureA", "featureB", "hardwareRefs"],
    },
  },
  {
    name: "remove_part",
    description: "Delete a part by role. Cascades to its interfaces. Use to prune a part the user changed their mind about.",
    input_schema: {
      type: "object",
      properties: { role: { type: "string" } },
      required: ["role"],
    },
  },
  {
    name: "add_freeform_2d_part",
    description: "Add a sheet-metal part with a non-rectangular laser-cut outline (star, polygon, circle, regular polygon, or arbitrary polygon). Use this when the user asks for shapes a press brake can't bend into existence — sheet metal lasers cut ANY 2D outline from a flat sheet. All dimensions in INCHES.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Snake-case role like 'gusset_star' or 'logo_plate'." },
        label: { type: "string", description: "Human label." },
        material: { type: "string", description: "e.g. 'Mild Steel (CRS)', 'Aluminum 5052', 'Stainless Steel 304'." },
        thickness: { type: "number", description: "Sheet thickness in inches." },
        outline: {
          type: "object",
          description: "Outline shape. Use 'star' for n-pointed stars; 'circle' for disks; 'regular_polygon' for hexagons/octagons/etc.; 'polygon' for arbitrary outlines (xy points in inches relative to outline AABB origin).",
          oneOf: [
            { type: "object", properties: { kind: { const: "star" }, numPoints: { type: "integer", minimum: 3, maximum: 64 }, outerRadius: { type: "number" }, innerRadius: { type: "number" } }, required: ["kind", "numPoints", "outerRadius", "innerRadius"] },
            { type: "object", properties: { kind: { const: "circle" }, radius: { type: "number" } }, required: ["kind", "radius"] },
            { type: "object", properties: { kind: { const: "regular_polygon" }, sides: { type: "integer", minimum: 3, maximum: 64 }, radius: { type: "number" } }, required: ["kind", "sides", "radius"] },
            { type: "object", properties: { kind: { const: "polygon" }, points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] }, minItems: 3 } }, required: ["kind", "points"] },
          ],
        },
        features: {
          type: "array",
          description: "Optional holes/slots/etc. (same schema as other sheet-metal parts).",
          items: { type: "object" },
        },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
      },
      required: ["role", "label", "material", "thickness", "outline", "position"],
    },
  },
  {
    name: "check_manufacturing",
    description: "Pull the current per-part manufacturability report (sheet-metal validators + bend simulator) for this project. Returns a compact summary keyed by part role: total failures/warnings, per-step status from the simulator (cut / each bend / interference), and a short list of the top failing rules with suggestions. Call this between tool calls when the user asks to fix a manufacturability issue, or proactively after a refine_part / select_archetype to see what the latest validators flagged. The result is text you should surface to the user as a brief summary, then act on by calling refine_part / update_archetype_params with the suggested fix.",
    input_schema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "Why you're calling this — 'preflight after archetype switch', 'investigating user complaint about bends', etc. One sentence.",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "gather_inspiration",
    description: "Before picking an archetype or designing a custom part, call this to think out loud about reference designs that match the user's intent — what does a typical [thing] look like in McMaster, IKEA, Grainger, Home Depot, or industrial catalogs? What are the common dimensions, hinge orientations, latch styles, vent patterns, fastener patterns? Use the returned guidance to inform select_archetype / refine_part / add_freeform_2d_part calls. The result is your own structured reasoning — surface the highlights to the user in your rationale.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What you're researching, e.g. 'tennis-ball vending machine', 'school locker', 'control panel for outdoor pump', 'hex-pattern speaker grille'." },
        references: {
          type: "array",
          description: "Reference products / designs you're recalling. Each entry: name, where you'd find it, key dimensional ranges, distinctive design features. Aim for 3–5.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              source: { type: "string", description: "e.g. 'McMaster 1812K12', 'IKEA HEMNES wardrobe', 'Pelican 1500 case'." },
              dimensions: { type: "string", description: "Typical range, e.g. '12-14\" wide × 18-24\" deep × 60-72\" tall'." },
              features: { type: "string", description: "Distinctive features: 'piano hinge full height', 'louvered vents top/bottom', 'recessed handle', etc." },
            },
            required: ["name", "source", "features"],
          },
        },
        recommendations: {
          type: "array",
          description: "Concrete design choices for THIS project drawn from the references above. e.g. 'Use front-hinged door with piano hinge; vent the top with 6 louvered slots; use recessed pull handle.'",
          items: { type: "string" },
        },
      },
      required: ["topic", "references", "recommendations"],
    },
  },
  {
    name: "add_purchased_part",
    description: "Add a purchased part referencing a McMaster part number. Use for fasteners, bearings, hinges, rubber feet, and other off-the-shelf hardware that's cheaper to buy than to make.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        label: { type: "string" },
        mcmasterPartNumber: { type: "string" },
        quantity: { type: "number" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "mcmasterPartNumber", "quantity", "position", "rationale"],
    },
  },
  {
    name: "add_pipe",
    description: "Add a pipe / tube part — cylindrical structural or plumbing piece. Use for frame supports, plumbing runs, conduit, table legs. The pipe's long axis runs along its local +Z; pose places + rotates it in world. Standard sizes: 1/2\", 3/4\", 1\", 1-1/4\", 1-1/2\", 2\" outer diameter; common materials = Mild Steel (CRS), Stainless Steel 304, Aluminum 6061, Copper, PVC.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        label: { type: "string" },
        material: { type: "string" },
        outerDiameter: { type: "number", description: "Outer diameter in inches. Pick a stocked size." },
        wallThickness: { type: "number", description: "Wall thickness in inches. Sched 40 for steel/PVC; DOM tube for aluminum." },
        length: { type: "number", description: "Length along the pipe axis (inches)." },
        endA: { type: "string", enum: ["open", "capped", "threaded", "flared"], description: "Far end (local Z=0). Default open." },
        endB: { type: "string", enum: ["open", "capped", "threaded", "flared"], description: "Near end (local Z=length). Default open." },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "material", "outerDiameter", "wallThickness", "length", "position", "rationale"],
    },
  },
  {
    name: "decide_make_or_buy",
    description: "Reason out loud about whether something the user wants should be a custom part (sheet metal or 3D print) or a purchased off-the-shelf item. The 'decision' field is shown to the user verbatim.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "What the user is asking for (e.g. 'rubber foot', '12mm bearing')." },
        decision: { type: "string", enum: ["make_sheet_metal", "make_printed", "buy"], description: "The recommendation." },
        reasoning: { type: "string", description: "Short rationale shown to the user." },
      },
      required: ["item", "decision", "reasoning"],
    },
  },
] as const;

function buildSystemPrompt(
  archetypes: Array<{ id: string; label: string; description: string; tags: string[] }>,
  state: any,
  focusedRole: string | undefined,
): string {
  const archList = archetypes.map(a => `- ${a.id}: ${a.label} — ${a.description} [tags: ${a.tags.join(", ")}]`).join("\n");
  const mcmasterCatalog = MCMASTER_SEED.map(
    p => `- ${p.partNumber}: ${p.name} — ${p.description}`
  ).join("\n");
  const focusedClause = focusedRole
    ? `The user currently has part "${focusedRole}" focused. Interpret refinement requests as targeting this part unless the message says otherwise.`
    : "No part is focused. Messages apply to the whole project.";
  const violations: any[] = (state?.violations ?? []).filter((v: any) => v && (v.status === "fail" || v.status === "warn"));
  const violationsBlock = violations.length === 0
    ? "No active validation violations."
    : violations.map((v: any) =>
        `- [${v.status.toUpperCase()}] ${v.label} (${v.id}): ${v.message}` +
        (v.suggestion ? `\n  → suggested: ${v.suggestion}` : "")
      ).join("\n");
  return `You are Fabware's assembly designer. You design multi-part sheet-metal assemblies from user intent.

## Workflow

1. **Gather inspiration FIRST** when the user describes a new thing (or a meaningful redesign). Before \`select_archetype\` or any \`add_*\` call, invoke \`gather_inspiration\` with the topic — recall 3–5 reference products / designs (McMaster, IKEA, Grainger, Pelican, industrial catalogs, common consumer items), the dimensional ranges they live in, and their distinctive features (hinge style, vent pattern, latch, handle). The recommendations you produce should drive the archetype + param choices and any custom shapes.
2. If the project has no archetype yet and the user is describing a new thing: call \`gather_inspiration\` → \`capture_scope\` (if scope is missing) → \`select_archetype\` with the closest-matching archetype.
3. If the project already has an archetype and the user is refining: call \`refine_part\`, \`add_feature_to_part\`, or \`update_archetype_params\`.
4. If the user asks for a shape that isn't a rectangle (star, hexagon, disc, logo, custom outline): use \`add_freeform_2d_part\`. Lasers cut **any** 2D outline from a flat sheet — there is no shape constraint as long as the outline is a single closed polygon.
5. **If no archetype fits at all** (custom multi-part assembly, weird geometry, novel category like a kayak rack or a soldering-iron stand): build piece-by-piece with \`add_sheet_metal_part\` for each plate, then call \`add_interface\` to connect them. After each batch of \`add_sheet_metal_part\` + \`add_interface\` calls, call \`check_manufacturing\` to surface any rule failures and refine. \`remove_part\` cleans up if you change your mind. Use this path when "select an archetype" feels like jamming a square peg into a round hole — the agent should reach for primitives, not stretch the existing archetypes.

   **Default to standard gauges.** Mild Steel and Stainless Steel stock at 0.030, 0.036, 0.048, 0.060, 0.075, 0.090, 0.105, 0.120, 0.135, 0.187, 0.250"; Aluminum 5052 stocks 0.030, 0.048, 0.060, 0.075, 0.090, 0.105, 0.135". Pick the closest stocked gauge — never an arbitrary thickness like 0.080" or 0.111". Non-stock plate adds lead time and minimum-order surcharges and is only justified when a production run absolutely requires the exact thickness; even then, ask the user first.

   **Feature vocabulary** (to avoid Zod rejections):
   - \`hole\`: \`{ kind: "hole", name, count, diameter, pattern: "corner"|"center"|"top_row"|"bottom_row", inset?: number, insetX?: number, insetY?: number, positions?: [{x,y}], role?: string }\`
     **Hole role**: tag the receiving hole on a fastener interface so the FastenerStack validator can confirm the joint actually mates. Use \`role: "bolt_clear"\` (bolt passes through, needs nut/PEM/tap on far side), \`role: "tap_1/4-20"\` (threaded), \`role: "pem_M4"\` (PEM insert receiver), \`role: "pilot_8x12"\` (sheet-metal screw pilot), \`role: "rivet_1/8"\`. **A bolt without a nut, tapped hole, or PEM is a structural failure** — set the role on both sides of every bolted joint.
     **Bend awareness**: when a part has a \`bend\` feature, holes above the bend tangent (positionRatio splits the part) end up on the rotated flange — they live in a different plane after folding. Place the receiving holes on the *fixed* flange (below positionRatio for horizontal bends, left of positionRatio for vertical) when bolting that flange to a flat mating part.
   - \`bend\`: \`{ kind: "bend", name, axis: "horizontal"|"vertical", positionRatio: 0..1, angle, radius }\`
   - \`slot\`: \`{ kind: "slot", name, count, length, width, pattern: same as hole }\`
   - \`tab\`:  \`{ kind: "tab", name, count, length, width, edge: "top"|"bottom"|"left"|"right" }\`
   - \`fillet\`: \`{ kind: "fillet", name, radius, corners: "all"|"top"|"bottom" }\`
5. If the user asks something you can't do (e.g., "add an electromagnetic lock", "switch to 3D printing"): explain politely what's not yet supported.
6. Never output a final assistant message summarizing what you did — tools carry the rationale. Keep spoken output short.

## Params for select_archetype / update_archetype_params

Every archetype param has a sensible default derived from project scope (tier, environment, reference scale). You only need to specify fields the user actually constrained.

Example for "trunk for storing tennis balls, ~12 inch interior":

\`\`\`json
{
  "archetypeId": "hinged_enclosure",
  "params": { "innerWidth": 12, "innerDepth": 12, "innerHeight": 12, "doorFace": "top", "hingeSide": "back" },
  "rationale": "Standard top-hinged trunk, 12-inch interior cube."
}
\`\`\`

Example for "locker for a school, 12 wide × 18 deep × 60 tall, hinged on the right":

\`\`\`json
{
  "archetypeId": "hinged_enclosure",
  "params": { "innerWidth": 12, "innerDepth": 18, "innerHeight": 60, "doorFace": "front", "hingeSide": "right" },
  "rationale": "Tall locker with right-hinged front door."
}
\`\`\`

Don't specify material, thickness, fastenerCount, etc. unless the user explicitly asked for a specific value — defaults come from scope. \`doorFace\` defaults to "top" for boxy interiors and "front" for tall narrow interiors or anything described as a locker/cabinet.

## Archetype library (pick from these)

${archList}

## Current project state

${JSON.stringify(state, null, 2)}

## Focused part

${focusedClause}

## Active validation violations (from the post-tool-call validator)

These are the rules currently failing or warning on the assembly. **If the
user asks you to "fix the intersection", "fix the geometry", or similar,
this list is what you should act on.** Each \`fail\` violation must be
resolved before the assembly is considered correct.

${violationsBlock}

## Rules

- Numbers are in inches, degrees, or dimensionless counts. Never millimeters.
- Use your own knowledge for sheet-metal manufacturing rules and SCS part conventions; the orchestrator validates assemblies after each change and surfaces issues in the rules strip.
- \`decompose_freeform\` is a stub in this version; if you call it, you'll get back a message to the user to pick an archetype instead.

## Sheet-metal manufacturing primer

Read this before picking an archetype or refining a part:

**Bends vs. assembly.** Sheet metal can be folded along straight lines on a
press brake. A simple box body is usually ONE bent plate (base + 4 walls
folded up) joined by **welds**, not 5 bolted plates — fewer parts, no
fasteners on visible faces, stronger. The \`hinged_enclosure\` archetype's
\`bodyConstruction\` param controls this: \`"single_bend"\` (default for
jerry-rigged + mvp) emits weld-seam interfaces between body parts and zero
body fasteners; \`"bolted_plates"\` (default for commercial / serviceable
boxes) keeps the four base↔wall joints as bolted. Use bolted plates when:
the part is too big to fit in one flat pattern, the bend pattern would
self-collide, or the customer needs to disassemble it.

**Bend rules of thumb.**
- Min bend radius ≈ 1× material thickness for steel/aluminum (so 0.075"
  thickness → 0.075" inside radius). Tighter cracks the outer fiber.
- Min flange length ≈ 4× thickness past the bend tangent.
- Holes should be ≥ 2× thickness away from a bend's tangent line, otherwise
  they distort.

**Hinge orientations and what they mean for a "shape".**
- Top-hinged lid → trunk, chest, tool box, jewelry box, ammo can.
  ${'`doorFace: "top"`'} with ${'`hingeSide: "back"`'} (default) — lid pivots
  open from the front.
- Front-hinged door, hinged on a vertical edge → locker, cabinet,
  electrical-equipment box, mini fridge, wardrobe, control panel.
  ${'`doorFace: "front"`'} with ${'`hingeSide: "left"`'} or
  ${'`"right"`'}. Use this when the user's word is "locker", "cabinet",
  "wardrobe", "cupboard", or anything you'd open by reaching out, not by
  lifting up.
- Tall + narrow + has a front access face → almost always a locker.
- The renderer shows top-hinged lids on top of the box and front-hinged
  doors on the front; if the user complains the door looks wrong, double-check
  ${'`doorFace`'}.

**Fastener / interface conventions in this codebase.**
- "bolted" = pass-through screw + nut OR threaded insert; the screw lives in
  a clearance hole. 1/4-20 → Ø0.266" hole.
- "pem_inserted" = press-fit threaded insert in one part, screw in the
  other. Specify ${'`accessSide`'} so the validator knows which side gets
  the insert.
- "hinged" = mechanical hinge. The hinge axis must be parallel to the
  contact edge between roleA and roleB. Three styles, each with its own
  hole-count expectations (validator enforces them):
    * butt — 1635A3, qty 2-3 leaves; 2 mounting holes per leaf per part
      (so qty 2 -> 4 holes/part, qty 3 -> 6/part). Cheapest, most
      serviceable. Default for jerry-rigged + mvp non-locker boxes.
    * piano — 1598A12, qty 1 (one continuous hinge); needs a mounting
      hole every ~3" along the edge (so a 12" edge wants 4 per part, a
      24" edge wants 8 per part). Cleanest look, most rigidity. Default
      for tall lockers and any commercial hinged_enclosure unless the
      use case mentions kitchen / euro / cabinet.
    * concealed — 1559A14, qty 2 (Euro cup hinges); the door needs a
      35mm (1.378") cup bore feature; the cabinet side needs 2 mounting
      holes per hinge. Default for "kitchen" / "cabinet" use cases on
      commercial tier. Encode style in hardwareRefs.role as
      "pivot:STYLE" so the validator can read it.
- "weld_seam" = continuous weld along a shared edge. No hardware. Use for
  body-to-body joints when the assembly is built from a single bent plate
  or welded together post-cut. Default for jerry-rigged + mvp body joints.
- "weld_joint" = tab-and-slot mechanical interlock plus spot-welds. The
  male part has a \`tab\` feature; the female part has a \`slot\` feature
  with the same count and slightly larger length × width (typical
  clearance: +0.010" each axis). Use when you want a self-jigging joint
  that holds itself in alignment before welding — production-volume
  enclosures, panel-to-frame joins, and anywhere you'd otherwise need
  fixturing. Validator checks tab/slot pairing, count match, and
  clearance.

**Common mistakes to avoid.**
- Don't make every box a "hinged_enclosure" with a top lid. Lockers,
  cabinets, fridges, control panels need ${'`doorFace: "front"`'}.
- Don't stack walls so two walls share volume at a corner — left/right walls
  go BETWEEN front/back walls (this archetype already does it correctly).
- Don't ask the user for sheet-metal rules they don't know — pick sensible
  defaults from the tier and call them out in your rationale.

## McMaster-Carr catalog (curated — use these part numbers verbatim)

When you need a fastener, nut, washer, bearing, hinge, etc., pick the closest match from this curated catalog rather than asking the user for a part number:

${mcmasterCatalog}

Hole-clearance reminders:
- 1/4-20 screws need a Ø0.266" clearance hole (or Ø0.250" for a "free fit").
- M5 screws need a Ø0.217" (5.5mm) clearance hole.
- #8-32 screws need a Ø0.177" clearance hole.

If the user asks for an item the catalog doesn't have (e.g. a specific 3" OD aluminum washer), pick the closest curated entry and call it out in the rationale: "I used 92141A029 — a 1/4" steel zinc washer — which is the closest curated match; if you need exactly a 3" OD aluminum washer, paste the McMaster part number and I'll swap it in."

**If the user pastes a McMaster part number** (e.g. "use 95475A150 instead"), accept it as-is and call \`add_purchased_part\` with that number — the user has just verified it on mcmaster.com. The post-action validator will WARN that it's not in the curated seed, which is informational only.

**Never** invent or guess part numbers that aren't either in the curated list above OR pasted by the user.

## Choosing a part kind

Every custom part you add is one of three kinds:

- **sheet_metal** — flat-pattern parts laser-cut by Send Cut Send. Use for panels, brackets, enclosures, anything dominated by 2D geometry with optional bends. Multi-part bolted assemblies come from archetypes; single non-rectangular parts (star, disc, hex, logo, custom polygon) come from \`add_freeform_2d_part\`. Lasers can cut any closed 2D outline — don't tell the user "we can't make that shape" just because it's not a rectangle.

  Available materials: **Mild Steel (CRS)**, **Galvanized Steel**, **Stainless Steel 304/316**, **Aluminum 5052/6061**, **Copper**, **Brass**, **Acrylic Clear**, **Acrylic Black**. SCS laser-cuts acrylic too — when the user asks for a clear cover, transparent door, viewing window, or display top, use **"Acrylic Clear"** (renders semi-transparent in the viewer). Acrylic and 6061 don't bend, so don't put bends on them.

  **Acrylic joinery** — acrylic enclosures are *solvent-welded* (Weld-On 4 / 16 capillary cement chemically fuses the panel edges; no fasteners, no through-holes), not bolted around the perimeter. The \`hinged_enclosure\` archetype detects acrylic and uses \`bodyConstruction: "solvent_welded"\` automatically — only the lid hinge has real fasteners. Don't override this with \`bolted_plates\` for acrylic unless the user explicitly asks for through-bolted corners (e.g. for serviceability). Mitered corners + solvent are even cleaner if the user wants display-case quality, but plain butt-edges + solvent is structurally fine.
- **printed** — 3D-printed parts (FDM/resin). Use for small custom shapes with complex 3D geometry: bezels, knobs, cable grommets, snap-fit clips, mounting standoffs. Add via \`add_printed_part\`.
- **purchased** — off-the-shelf parts from McMaster. Use for fasteners, bearings, hinges, rubber feet, springs, magnets — anything where buying is cheaper, faster, and higher quality than making. Add via \`add_purchased_part\`.

When the user asks for something and it's not obvious which kind to use, call \`decide_make_or_buy\` first. Defaults:

- If it's a fastener/bearing/spring/hinge → buy.
- If it's a 2D-dominant flat panel or bracket → sheet metal (use the existing archetype tools or refine_part).
- If it's a small 3D shape with curves, snap fits, or features that don't unfold cleanly → printed.
- If the user explicitly says "3D print", "PLA", "STL" → printed.
- If the user says "stainless 304" or "powder coat" → sheet metal.

Never invent McMaster part numbers; ask the user or use only numbers from the curated catalog you've already seen in the system prompt.
`;
}

export const runAgent = internalAction({
  args: {
    projectId: v.id("projects"),
    userMessage: v.string(),
    focusedRole: v.optional(v.string()),
    model: v.string(),
    effort: v.string(),
    history: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() })),
    projectState: v.object({
      scope: v.any(),
      archetypeId: v.optional(v.any()),
      archetypeParams: v.optional(v.any()),
      parts: v.array(v.object({ role: v.string(), label: v.string(), dslJson: v.optional(v.string()) })),
      interfaces: v.array(v.any()),
      violations: v.optional(v.array(v.any())),
    }),
  },
  handler: async (ctx, args): Promise<{ toolCalls: Array<{ name: string; input: any }>; responseText: string }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const archetypeList = listArchetypes().map(a => ({ id: a.id, label: a.label, description: a.description, tags: a.tags }));
    const system = buildSystemPrompt(archetypeList, args.projectState, args.focusedRole);
    const client = new Anthropic({ apiKey });

    const messages: Anthropic.Messages.MessageParam[] = [
      ...args.history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: args.userMessage },
    ];

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: args.model,
      max_tokens: 8192,
      system,
      tools: TOOLS as unknown as Anthropic.Messages.Tool[],
      messages,
    };
    if ((args.model === "claude-opus-4-7" || args.model === "claude-sonnet-4-6") && args.effort) {
      (params as any).output_config = { effort: args.effort };
    }
    const response = await client.messages.create(params);

    await ctx.runMutation(internal.tokenUsage.record, {
      feature: "assembly_designer",
      model: args.model,
      effort: args.effort,
      projectId: args.projectId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
    });

    const toolCalls: Array<{ name: string; input: any }> = [];
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "tool_use") toolCalls.push({ name: block.name, input: block.input });
      else if (block.type === "text") responseText += block.text;
    }
    return { toolCalls, responseText };
  },
});
