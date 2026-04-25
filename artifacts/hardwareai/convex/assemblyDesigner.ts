"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { listArchetypes } from "./archetypes";

const TOOLS = [
  {
    name: "capture_scope",
    description: "Store the project's scope (tier, environment, use case, reference scale). Call on new-project creation and whenever the user updates intent.",
    input_schema: { type: "object", properties: { scope: { type: "object" } }, required: ["scope"] },
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
    description: "Add a 3D-printed part to the project. Use for small custom shapes (bezels, knobs, brackets that don't justify sheet metal, complex geometries). Provide a PrintedDsl with primitive (box/cylinder/plate_with_holes) and a material (PLA/PETG/Nylon/ABS/Resin).",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Snake-case role like 'keypad_bezel' or 'cable_grommet'." },
        label: { type: "string", description: "Human label." },
        dsl: { type: "object", description: "PrintedDsl JSON." },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, rotX: { type: "number" }, rotY: { type: "number" }, rotZ: { type: "number" } },
          required: ["x", "y", "z", "rotX", "rotY", "rotZ"],
        },
        rationale: { type: "string" },
      },
      required: ["role", "label", "dsl", "position", "rationale"],
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
  const focusedClause = focusedRole
    ? `The user currently has part "${focusedRole}" focused. Interpret refinement requests as targeting this part unless the message says otherwise.`
    : "No part is focused. Messages apply to the whole project.";
  return `You are Fabware's assembly designer. You design multi-part sheet-metal assemblies from user intent.

## Workflow

1. If the project has no archetype yet and the user is describing a new thing: call \`capture_scope\` first (if scope is missing), then \`select_archetype\` with the closest-matching archetype from the library.
2. If the project already has an archetype and the user is refining: call \`refine_part\`, \`add_feature_to_part\`, or \`update_archetype_params\`.
3. If the user asks something you can't do (e.g., "add an electromagnetic lock", "switch to 3D printing"): explain politely what's not yet supported.
4. Never output a final assistant message summarizing what you did — tools carry the rationale. Keep spoken output short.

## Params for select_archetype / update_archetype_params

Every archetype param has a sensible default derived from project scope (tier, environment, reference scale). You only need to specify fields the user actually constrained. Example for "tennis-ball locker, ~12 inch interior, hinged top":

\`\`\`json
{
  "archetypeId": "hinged_enclosure",
  "params": { "innerWidth": 12, "innerDepth": 12, "innerHeight": 12, "hingeSide": "back" },
  "rationale": "Standard locker with hinged top, sized for tennis balls."
}
\`\`\`

Don't specify material, thickness, fastenerCount, etc. unless the user explicitly asked for a specific value — defaults come from scope.

## Archetype library (pick from these)

${archList}

## Current project state

${JSON.stringify(state, null, 2)}

## Focused part

${focusedClause}

## Rules

- Numbers are in inches, degrees, or dimensionless counts. Never millimeters.
- Use your own knowledge for sheet-metal manufacturing rules and McMaster-Carr part conventions; the orchestrator validates assemblies after each change and surfaces issues in the rules strip.
- \`decompose_freeform\` is a stub in this version; if you call it, you'll get back a message to the user to pick an archetype instead.

## Choosing a part kind

Every custom part you add is one of three kinds:

- **sheet_metal** — flat-pattern parts laser-cut by Send Cut Send. Use for panels, brackets, enclosures, anything dominated by 2D geometry with optional bends. Already covered by archetypes.
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
    }),
  },
  handler: async (_ctx, args): Promise<{ toolCalls: Array<{ name: string; input: any }>; responseText: string }> => {
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

    const toolCalls: Array<{ name: string; input: any }> = [];
    let responseText = "";
    for (const block of response.content) {
      if (block.type === "tool_use") toolCalls.push({ name: block.name, input: block.input });
      else if (block.type === "text") responseText += block.text;
    }
    return { toolCalls, responseText };
  },
});
