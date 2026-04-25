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
