"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import {
  PartDslSchema,
  emptyDsl,
  dslToLegacy,
  legacyToDsl,
  summarizeDsl,
  type PartDsl,
} from "./lib/dsl";
import {
  validateSpec,
  applySnap,
  SCS_MATERIALS,
  POWDER_COAT_COLORS,
  type ValidationResult,
} from "./lib/scsRules";
import { MCMASTER_SEED, lookupSeedPart, findSeedPart } from "./lib/mcmasterSeed";
import { buildFeatureGraph } from "./lib/featureGraph";
import { generateSvgPreview, type FlatPreviewSpec } from "./lib/dxfGenerator";

const MAX_TOOL_ITERATIONS = 6;

interface ImageInput {
  data: string;
  mediaType: string;
}

interface PartUpdate {
  partType?: string;
  material?: string;
  thickness?: number;
  width?: number;
  height?: number;
  depth?: number;
  bendRadius?: number;
  bendAngles?: string;
  holePattern?: string;
  powderCoat?: boolean;
  powderCoatColor?: string;
  notes?: string;
  svgPreview?: string;
  sendCutSendUrl?: string;
  dslJson?: string;
  featureGraphJson?: string;
}

export interface DesignResult {
  responseText: string;
  partUpdate: PartUpdate | null;
  partUpdated: boolean;
  rationale: string;
  dsl: PartDsl | null;
}

function buildSystemPrompt(existingDsl: PartDsl | null): string {
  const materialList = Object.values(SCS_MATERIALS)
    .map(
      (m) =>
        `- ${m.name} (${m.category}): thicknesses [${m.thicknesses.join(", ")}]", max sheet ${m.maxSheet.width}"×${m.maxSheet.height}", ${m.canBend ? "bendable" : "no bending"}, ${m.canPowderCoat ? "powder-coatable" : "no powder coat"}`,
    )
    .join("\n");
  const colors = POWDER_COAT_COLORS.join(", ");
  const existing = existingDsl ? JSON.stringify(existingDsl, null, 2) : "null";
  const mcmasterCatalog = MCMASTER_SEED.map(
    (p) => `- ${p.partNumber}: ${p.name} — ${p.description}`,
  ).join("\n");
  return `You are the design engine for Fabware. You convert user requests into a parametric DSL for flat-pattern sheet-metal parts.

## Send Cut Send catalog
${materialList}

Powder coat colors: ${colors}.

## Units
All DSL numbers are in inches, dimensionless integers, or degrees. Convert mm → in (1 mm = 0.03937").

## Standard gauges (steel)
26ga=0.018", 24ga=0.024", 22ga=0.030", 20ga=0.036", 18ga=0.048", 16ga=0.060", 14ga=0.075", 13ga=0.090", 12ga=0.105", 11ga=0.120", 10ga=0.135", 7ga=0.187", 3ga=0.250".

## Part types
bracket, plate, enclosure, angle, channel, tab, gusset.

## DSL schema
{
  "version": 1,
  "partType": <type>,
  "material": <catalog name>,
  "thickness": <inches>,
  "width": <inches>,
  "height": <inches>,
  "depth": <number or null>,
  "features": [...],
  "finish": null | { "type": "powder_coat", "color": <color> },
  "assemblyRefs": [{ "mcmasterPartNumber": <str>, "quantity": <int>, "role": <snake_case optional> }]
}

## Feature objects
- Hole: { "kind": "hole", "name": <snake>, "count": 1..64, "diameter": inches, "pattern": "corner"|"center"|"top_row"|"bottom_row" }
- Bend: { "kind": "bend", "name": <snake>, "axis": "horizontal"|"vertical", "positionRatio": 0..1, "angle": 1..180, "radius": >=thickness }
- Slot: { "kind": "slot", "name": <snake>, "count": int, "length": in, "width": in, "pattern": ... }
- Fillet: { "kind": "fillet", "name": <snake>, "radius": in, "corners": "all"|"top"|"bottom" }

## McMaster-Carr curated parts
${mcmasterCatalog}

Hole diameters must match fastener clearances (1/4-20 → 0.266"; M5 → 0.217"). Never invent part numbers.

## Workflow
1. Compose candidate DSL, snapped to the catalog.
2. Call validate_dsl. If any rule fails, revise (max 3 iterations).
3. Call submit_final with the DSL + 1-3 sentence rationale.

## Existing DSL
${existing}

You MUST end with submit_final. Do not return a final assistant text message.`;
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "validate_dsl",
    description: "Validate a candidate DSL against Send Cut Send rules.",
    input_schema: {
      type: "object",
      properties: { dsl: { type: "object" } },
      required: ["dsl"],
    },
  },
  {
    name: "lookup_mcmaster",
    description: "Look up a McMaster-Carr part by free-text or part number.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "submit_final",
    description: "Submit the final accepted DSL with a short user-facing rationale.",
    input_schema: {
      type: "object",
      properties: {
        dsl: { type: "object" },
        rationale: { type: "string" },
      },
      required: ["dsl", "rationale"],
    },
  },
];

function validateForLlm(rawDsl: unknown): {
  parsed: PartDsl | null;
  validation: ValidationResult | null;
  parseError?: string;
} {
  const parseResult = PartDslSchema.safeParse(rawDsl);
  if (!parseResult.success) {
    return { parsed: null, validation: null, parseError: parseResult.error.message.slice(0, 600) };
  }
  const dsl = parseResult.data;
  const legacy = dslToLegacy(dsl);
  const validation = validateSpec({
    partType: legacy.partType,
    material: legacy.material,
    thickness: legacy.thickness,
    width: legacy.width,
    height: legacy.height,
    depth: legacy.depth,
    bendRadius: legacy.bendRadius,
    bendAngles: legacy.bendAngles,
    holePattern: legacy.holePattern,
    powderCoat: legacy.powderCoat,
    powderCoatColor: legacy.powderCoatColor,
    assemblyRefs: legacy.assemblyRefs ?? [],
  });
  return { parsed: dsl, validation };
}

function buildHistoryForLlm(
  history: Array<{ role: "user" | "assistant"; content: string; imageData?: string; imageMediaType?: string }>,
  currentMessage: string,
  image: ImageInput | null,
): Anthropic.Messages.MessageParam[] {
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const m of history.slice(-8)) {
    messages.push({ role: m.role, content: m.content });
  }
  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [];
  if (image) {
    userBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: image.data,
      },
    });
  }
  userBlocks.push({ type: "text", text: currentMessage });
  messages.push({ role: "user", content: userBlocks });
  return messages;
}

async function runAgentLoop(
  client: Anthropic,
  model: string,
  effort: string | null,
  systemPrompt: string,
  initialMessages: Anthropic.Messages.MessageParam[],
  fallbackDsl: PartDsl,
): Promise<{
  finalDsl: PartDsl;
  rationale: string;
  finalValidation: ValidationResult;
  iterations: number;
}> {
  const conversation: Anthropic.Messages.MessageParam[] = [...initialMessages];
  let iter = 0;
  let lastValidatedDsl: PartDsl | null = null;
  let lastValidation: ValidationResult | null = null;

  while (iter < MAX_TOOL_ITERATIONS) {
    iter += 1;
    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages: conversation,
    };
    if (effort && (model === "claude-opus-4-7" || model === "claude-sonnet-4-6")) {
      (params as unknown as { output_config: { effort: string } }).output_config = { effort };
    }
    const response = await client.messages.create(params);

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    conversation.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let finalSubmitted: { dsl: PartDsl; rationale: string; validation: ValidationResult } | null = null;

    for (const tu of toolUses) {
      if (tu.name === "validate_dsl") {
        const input = tu.input as { dsl: unknown };
        const { parsed, validation, parseError } = validateForLlm(input.dsl);
        if (!parsed || !validation) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `DSL did not parse: ${parseError ?? "unknown"}.`,
          });
        } else {
          lastValidatedDsl = parsed;
          lastValidation = validation;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({
              hasFailures: validation.hasFailures,
              rules: validation.rules.map((r) => ({
                id: r.id,
                status: r.status,
                message: r.message,
                suggestion: r.suggestion,
              })),
              snappedSpec: validation.snappedSpec,
            }),
          });
        }
      } else if (tu.name === "lookup_mcmaster") {
        const q = ((tu.input as { query?: string }).query ?? "").trim();
        const matches: typeof MCMASTER_SEED = [];
        if (q) {
          const direct = lookupSeedPart(q);
          if (direct) matches.push(direct);
          const fuzzy = findSeedPart(q);
          if (fuzzy && !matches.some((m) => m.partNumber === fuzzy.partNumber)) matches.push(fuzzy);
          if (matches.length === 0) {
            const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
            for (const seed of MCMASTER_SEED) {
              if (matches.length >= 5) break;
              if (words.some((w) => seed.name.toLowerCase().includes(w) || seed.keywords.some((k) => k.includes(w)))) {
                matches.push(seed);
              }
            }
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({
            query: q,
            matches: matches.slice(0, 5).map((m) => ({
              partNumber: m.partNumber,
              name: m.name,
              category: m.category,
              description: m.description,
            })),
          }),
        });
      } else if (tu.name === "submit_final") {
        const input = tu.input as { dsl: unknown; rationale: string };
        const { parsed, validation, parseError } = validateForLlm(input.dsl);
        if (!parsed || !validation) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `Final DSL did not parse: ${parseError ?? "unknown"}.`,
          });
        } else {
          finalSubmitted = { dsl: parsed, rationale: input.rationale ?? "", validation };
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "Submitted." });
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: `Unknown tool: ${tu.name}`,
        });
      }
    }

    conversation.push({ role: "user", content: toolResults });

    if (finalSubmitted) {
      const legacy = dslToLegacy(finalSubmitted.dsl);
      const snapped = applySnap(legacy, finalSubmitted.validation.snappedSpec);
      const finalDsl = legacyToDsl(snapped);
      finalDsl.assemblyRefs = finalSubmitted.dsl.assemblyRefs ?? [];
      return {
        finalDsl,
        rationale: finalSubmitted.rationale,
        finalValidation: validateSpec(snapped),
        iterations: iter,
      };
    }
  }

  if (lastValidatedDsl && lastValidation) {
    const legacy = dslToLegacy(lastValidatedDsl);
    const snapped = applySnap(legacy, lastValidation.snappedSpec);
    const finalDsl = legacyToDsl(snapped);
    finalDsl.assemblyRefs = lastValidatedDsl.assemblyRefs ?? [];
    return {
      finalDsl,
      rationale: "Snapped your design to Send Cut Send's catalog (model didn't finalize, used last validated draft).",
      finalValidation: validateSpec(snapped),
      iterations: iter,
    };
  }

  const legacyFallback = dslToLegacy(fallbackDsl);
  return {
    finalDsl: fallbackDsl,
    rationale: "Couldn't fully understand the request — kept the existing design.",
    finalValidation: validateSpec(legacyFallback),
    iterations: iter,
  };
}

function buildAssistantText(
  dsl: PartDsl,
  rationale: string,
  validation: ValidationResult,
  isFirst: boolean,
): string {
  const violations = validation.rules.filter((r) => r.status === "fail" || r.status === "warn");
  const violationLines = violations.length
    ? ["", "**Send Cut Send rules adjusted:**", ...violations.map((v) => `- ${v.label}: ${v.message}`)].join("\n")
    : "";
  const summary = summarizeDsl(dsl);
  const intro = isFirst ? `Here's the design I built:` : `Updated design:`;
  return [intro, "", rationale, "", `**Spec:** ${summary}`, violationLines]
    .filter((s) => s !== "")
    .join("\n");
}

function safeParseDsl(json: string): PartDsl | null {
  try {
    const parsed = PartDslSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const generateDesign = internalAction({
  args: {
    userMessage: v.string(),
    model: v.string(),
    effort: v.string(),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        imageData: v.optional(v.string()),
        imageMediaType: v.optional(v.string()),
      }),
    ),
    existingSpec: v.union(
      v.null(),
      v.object({
        partType: v.optional(v.string()),
        material: v.optional(v.string()),
        thickness: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        depth: v.optional(v.number()),
        bendRadius: v.optional(v.number()),
        bendAngles: v.optional(v.string()),
        holePattern: v.optional(v.string()),
        powderCoat: v.optional(v.boolean()),
        powderCoatColor: v.optional(v.string()),
        dslJson: v.optional(v.string()),
      }),
    ),
    image: v.union(
      v.null(),
      v.object({ data: v.string(), mediaType: v.string() }),
    ),
    isFirst: v.boolean(),
  },
  handler: async (_ctx, args): Promise<DesignResult> => {
    const { userMessage, model, effort, history, existingSpec, image, isFirst } = args;

    const lower = userMessage.toLowerCase().trim();
    const isSmallTalk =
      !image &&
      !existingSpec &&
      lower.length < 12 &&
      !/(inch|mm|steel|aluminum|brass|copper|bracket|plate|hole|bend)/.test(lower);
    if (isSmallTalk) {
      return {
        responseText:
          "Welcome. Describe the part you want laser-cut — e.g. 'Steel mounting bracket, 4x3 inches, 14ga, four corner holes for #10 screws, 90 degree bend.'",
        partUpdate: null,
        partUpdated: false,
        rationale: "",
        dsl: null,
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        responseText: "ANTHROPIC_API_KEY is not set on the Convex deployment.",
        partUpdate: null,
        partUpdated: false,
        rationale: "",
        dsl: null,
      };
    }

    const existingDsl =
      existingSpec?.dslJson != null
        ? safeParseDsl(existingSpec.dslJson)
        : existingSpec
          ? legacyToDsl(existingSpec)
          : null;
    const fallback = existingDsl ?? emptyDsl();
    const systemPrompt = buildSystemPrompt(existingDsl);
    const llmHistory = buildHistoryForLlm(history, userMessage, image);

    const client = new Anthropic({ apiKey });

    let result;
    try {
      result = await runAgentLoop(client, model, effort, systemPrompt, llmHistory, fallback);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return {
        responseText: `I couldn't reach the design model (${message}). Please try again.`,
        partUpdate: null,
        partUpdated: false,
        rationale: "",
        dsl: null,
      };
    }

    const { finalDsl, rationale, finalValidation } = result;
    const legacy = dslToLegacy(finalDsl);
    const featureGraph = buildFeatureGraph(finalDsl);
    const previewSpec: FlatPreviewSpec = { ...legacy, dsl: finalDsl, featureGraph };
    const svgPreview = generateSvgPreview(previewSpec);

    const update: PartUpdate = {
      partType: legacy.partType ?? finalDsl.partType,
      material: legacy.material ?? undefined,
      thickness: legacy.thickness ?? undefined,
      width: legacy.width ?? undefined,
      height: legacy.height ?? undefined,
      depth: legacy.depth ?? undefined,
      bendAngles: legacy.bendAngles ?? undefined,
      bendRadius: legacy.bendRadius ?? undefined,
      holePattern: legacy.holePattern ?? undefined,
      powderCoat: legacy.powderCoat ?? undefined,
      powderCoatColor: legacy.powderCoatColor ?? undefined,
      notes: userMessage,
      sendCutSendUrl: "https://sendcutsend.com/upload",
      dslJson: JSON.stringify(finalDsl),
      featureGraphJson: JSON.stringify(featureGraph),
      svgPreview,
    };

    return {
      responseText: buildAssistantText(finalDsl, rationale, finalValidation, isFirst),
      partUpdate: update,
      partUpdated: true,
      rationale,
      dsl: finalDsl,
    };
  },
});
