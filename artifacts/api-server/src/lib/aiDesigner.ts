import { anthropic } from "@workspace/integrations-anthropic-ai";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message, PartSpec } from "@workspace/db";
import { generateSvgPreview, type FlatPreviewSpec } from "./dxfGenerator";
import { buildFeatureGraph } from "./featureGraph";
import {
  PartDslSchema,
  type PartDsl,
  emptyDsl,
  dslToLegacy,
  legacyToDsl,
  summarizeDsl,
} from "./dsl";
import {
  validateSpec,
  applySnap,
  SCS_MATERIALS,
  POWDER_COAT_COLORS,
  type ValidationResult,
} from "./scsRules";
import { MCMASTER_SEED, lookupSeedPart, findSeedPart } from "./mcmasterSeed";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 6;

interface PartUpdate {
  partType?: string;
  material?: string | null;
  thickness?: number | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  bendRadius?: number | null;
  bendAngles?: string | null;
  holePattern?: string | null;
  powderCoat?: boolean | null;
  powderCoatColor?: string | null;
  notes?: string | null;
  svgPreview?: string | null;
  sendCutSendUrl?: string | null;
  dslJson?: string | null;
  featureGraphJson?: string | null;
}

export interface DesignResult {
  responseText: string;
  partUpdate: PartUpdate | null;
  partUpdated: boolean;
  validation: ValidationResult | null;
  dsl: PartDsl | null;
  rationale: string | null;
}

interface ImageInput {
  data: string; // base64
  mediaType: string;
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
  return `You are the design engine for Fabware, an AI harness for turning ideas into manufacturable hardware. In this workspace you design flat-pattern sheet-metal parts that will be laser-cut by Send Cut Send, and attach standard off-the-shelf assembly parts (fasteners, bearings, etc.) sourced from McMaster-Carr.

You convert a user's natural-language request (and optional reference image) into a small parametric DSL that a downstream geometry engine will turn into a flat pattern, an SVG preview, and a DXF for Send Cut Send. You only design within Send Cut Send's actual catalog and capabilities.

## Send Cut Send catalog
${materialList}

Powder coat colors: ${colors}.

## Units (read this carefully)
All DSL numbers are in INCHES, dimensionless integers, or degrees — never millimeters, never with units attached.
- If the user gives metric (e.g. "15 mm hole", "1.8 mm thick"), convert yourself: 1 mm = 0.03937 in.
- Counts (hole count, slot count) are dimensionless integers. Never multiply a count by a unit. \`"count": 50\` is correct; \`"count": 1270\` (50 × 25.4) is not.
- Angles are degrees in [1, 180].

## Standard sheet-metal gauges (steel / stainless)
Snap user thicknesses to the nearest of these when possible:
26 ga = 0.018", 24 ga = 0.024", 22 ga = 0.030", 20 ga = 0.036", 18 ga = 0.048",
16 ga = 0.060", 14 ga = 0.075", 13 ga = 0.090", 12 ga = 0.105", 11 ga = 0.120",
10 ga = 0.135", 7 ga = 0.187", 3 ga = 0.250".
If the user says "16 gauge mild steel", use thickness 0.060". Aluminum stocks its own thicknesses (see catalog).

## Geometry sanity
Pattern features must fit inside the part perimeter. A Ø0.25" hole at the corner needs ~0.375" margin from each edge — so the part must be at least ~1" on its short side to host four corner holes. Verify your features fit before submitting.

## Part types
bracket, plate, enclosure, angle, channel, tab, gusset.

## DSL schema (you must produce JSON that matches this exactly)
{
  "version": 1,
  "partType": "bracket" | "plate" | "enclosure" | "angle" | "channel" | "tab" | "gusset",
  "material": <one of catalog material names above>,
  "thickness": <number, inches, must be in stocked thicknesses for the material>,
  "width": <number, inches, must fit material max sheet>,
  "height": <number, inches, must fit material max sheet>,
  "depth": <number or null>,
  "features": [ ... feature objects ... ],
  "finish": null | { "type": "powder_coat", "color": <one of POWDER COAT COLORS, only if material can be powder-coated> },
  "assemblyRefs": [ { "mcmasterPartNumber": <string>, "quantity": <int>, "role": <snake_case optional> } ]
}

## Feature objects
- Hole: { "kind": "hole", "name": <snake_case>, "count": int 1..64, "diameter": inches, "pattern": "corner"|"center"|"top_row"|"bottom_row", "inset": inches optional (default 0.375) }
- Bend: { "kind": "bend", "name": <snake_case>, "axis": "horizontal"|"vertical", "positionRatio": 0..1 (default 0.4), "angle": 1..180 degrees, "radius": inches >= thickness }
- Slot: { "kind": "slot", "name": <snake_case>, "count": int, "length": inches, "width": inches, "pattern": "corner"|"center"|"top_row"|"bottom_row" }
- Fillet: { "kind": "fillet", "name": <snake_case>, "radius": inches, "corners": "all"|"top"|"bottom" }

Use semantic feature names like "mounting_hole", "vent_hole", "main_bend", "tab_slot" — these become identifiers in the DXF and the UI.

## McMaster-Carr assembly parts
When the user mentions fasteners, nuts, washers, bearings, springs, magnets, extrusion, or any other off-the-shelf component, attach them to the design via \`assemblyRefs\` — each entry is a McMaster-Carr part number + quantity + optional role tag (e.g. "mounting", "pivot"). Hole diameters must match the fastener: a 1/4\"-20 screw wants a 0.266\" (letter F) clearance hole; an M5 screw wants a 5.5 mm (0.217\") clearance hole. If you add mounting fasteners, verify the part's \`hole\` feature diameter is the matching clearance size.

Curated McMaster lookup — prefer these when the user asks for common hardware:
${mcmasterCatalog}

If the user asks for a fastener you don't have in this list, pick a sensible nearby item from the list and say so in the rationale, or omit the assembly ref rather than invent a part number. Never invent a McMaster part number you aren't sure about.

You may also call the \`lookup_mcmaster\` tool with free-text ("1/4-20 SHCS 1 inch") if you're unsure which curated entry matches.

## Workflow
You will be given the user's message and the existing DSL (or null).
1. Compose a candidate DSL that fulfills the request, snapping every value to Send Cut Send's catalog (nearest stocked thickness, nearest hole size that's >= material thickness, max sheet, etc.). If the request is incompatible (e.g. "1 inch thick aluminum 6061 with a bend"), pick the closest compatible alternative — do not refuse.
2. Call the validate_dsl tool with your candidate. The tool returns rule pass/fail and snap suggestions.
3. If validation has any "fail" rule, revise and validate again. Stop after at most 3 validations.
4. When the candidate is acceptable, call submit_final with the FINAL valid DSL and a short (1–3 sentence) rationale describing what you designed and any adjustments made for manufacturability. Do not include code fences in the rationale.

## Existing part DSL
${existing}

Treat the existing DSL as the current state. If the user is refining ("make the holes bigger", "switch to aluminum"), modify only the relevant fields. If they describe a new part, replace it.

You MUST end with a submit_final tool call. Do not write a final assistant message; the rationale comes through the tool call.`;
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "validate_dsl",
    description:
      "Validate a candidate part DSL against Send Cut Send's manufacturing rules. Returns a list of rule results with pass/warn/fail status and snap-to-valid suggestions.",
    input_schema: {
      type: "object",
      properties: {
        dsl: {
          type: "object",
          description: "Candidate PartDsl object matching the schema in the system prompt.",
        },
      },
      required: ["dsl"],
    },
  },
  {
    name: "lookup_mcmaster",
    description:
      "Look up a McMaster-Carr part from the curated Fabware catalog by free-text query or part number. Returns up to 5 candidate matches with part number, name, category, description, and product-page URL.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text description ('1/4-20 SHCS 1 inch', 'skateboard bearing') or an exact McMaster part number.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "submit_final",
    description:
      "Submit the final accepted DSL with a short user-facing rationale. Call this exactly once when the design passes validation.",
    input_schema: {
      type: "object",
      properties: {
        dsl: {
          type: "object",
          description: "Final PartDsl object.",
        },
        rationale: {
          type: "string",
          description: "1-3 sentences describing the finished design and any manufacturability adjustments made.",
        },
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
    return {
      parsed: null,
      validation: null,
      parseError: parseResult.error.message.slice(0, 600),
    };
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
  });
  return { parsed: dsl, validation };
}

function buildHistoryForLlm(
  history: Message[],
  currentMessage: string,
  image: ImageInput | null,
): Anthropic.Messages.MessageParam[] {
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const m of history.slice(-8)) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
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

interface AgentLoopResult {
  finalDsl: PartDsl;
  rationale: string;
  finalValidation: ValidationResult;
  iterations: number;
}

async function runAgentLoop(
  systemPrompt: string,
  initialMessages: Anthropic.Messages.MessageParam[],
  fallbackDsl: PartDsl,
): Promise<AgentLoopResult> {
  const conversation: Anthropic.Messages.MessageParam[] = [...initialMessages];
  let iter = 0;
  let lastValidatedDsl: PartDsl | null = null;
  let lastValidation: ValidationResult | null = null;

  while (iter < MAX_TOOL_ITERATIONS) {
    iter += 1;
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages: conversation,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // Model gave up without tool — fall back
      break;
    }

    // Append assistant response
    conversation.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    let finalSubmitted: { dsl: PartDsl; rationale: string; validation: ValidationResult } | null =
      null;

    for (const tu of toolUses) {
      if (tu.name === "validate_dsl") {
        const input = tu.input as { dsl: unknown };
        const { parsed, validation, parseError } = validateForLlm(input.dsl);
        if (!parsed || !validation) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `DSL did not parse: ${parseError ?? "unknown"}. Re-emit a corrected DSL that matches the schema exactly.`,
          });
        } else {
          lastValidatedDsl = parsed;
          lastValidation = validation;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(
              {
                hasFailures: validation.hasFailures,
                rules: validation.rules.map((r) => ({
                  id: r.id,
                  status: r.status,
                  message: r.message,
                  suggestion: r.suggestion,
                })),
                snappedSpec: validation.snappedSpec,
              },
              null,
              2,
            ),
          });
        }
      } else if (tu.name === "lookup_mcmaster") {
        const input = tu.input as { query?: string };
        const q = (input.query ?? "").trim();
        const matches: Array<{
          partNumber: string;
          name: string;
          category: string;
          description: string;
        }> = [];
        if (q) {
          const direct = lookupSeedPart(q);
          if (direct) matches.push(direct);
          const fuzzy = findSeedPart(q);
          if (fuzzy && !matches.some((m) => m.partNumber === fuzzy.partNumber)) {
            matches.push(fuzzy);
          }
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
          content: JSON.stringify(
            {
              query: q,
              matches: matches.slice(0, 5).map((m) => ({
                partNumber: m.partNumber,
                name: m.name,
                category: m.category,
                description: m.description,
              })),
            },
            null,
            2,
          ),
        });
      } else if (tu.name === "submit_final") {
        const input = tu.input as { dsl: unknown; rationale: string };
        const { parsed, validation, parseError } = validateForLlm(input.dsl);
        if (!parsed || !validation) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `Final DSL did not parse: ${parseError ?? "unknown"}. Fix and submit again.`,
          });
        } else {
          finalSubmitted = { dsl: parsed, rationale: input.rationale ?? "", validation };
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "Submitted.",
          });
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
      // Apply snap-to-valid one last time to be safe
      const legacy = dslToLegacy(finalSubmitted.dsl);
      const snapped = applySnap(legacy, finalSubmitted.validation.snappedSpec);
      const finalDsl = legacyToDsl(snapped);
      // Carry McMaster assembly refs through the legacy round-trip.
      finalDsl.assemblyRefs = finalSubmitted.dsl.assemblyRefs ?? [];
      const finalValidation = validateSpec(snapped);
      return {
        finalDsl,
        rationale: finalSubmitted.rationale,
        finalValidation,
        iterations: iter,
      };
    }
  }

  // Loop exhausted — use last validated DSL (snapped) or fallback
  if (lastValidatedDsl && lastValidation) {
    const legacy = dslToLegacy(lastValidatedDsl);
    const snapped = applySnap(legacy, lastValidation.snappedSpec);
    const finalDsl = legacyToDsl(snapped);
    finalDsl.assemblyRefs = lastValidatedDsl.assemblyRefs ?? [];
    const finalValidation = validateSpec(snapped);
    return {
      finalDsl,
      rationale:
        "Snapped your design to Send Cut Send's catalog (the model didn't finalize, so I used the most recent validated draft).",
      finalValidation,
      iterations: iter,
    };
  }

  const legacyFallback = dslToLegacy(fallbackDsl);
  const fallbackValidation = validateSpec(legacyFallback);
  return {
    finalDsl: fallbackDsl,
    rationale: "I couldn't fully understand the request — kept the existing design as a starting point.",
    finalValidation: fallbackValidation,
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
    ? [
        "",
        "**Send Cut Send rules adjusted:**",
        ...violations.map((v) => `- ${v.label}: ${v.message}`),
      ].join("\n")
    : "";
  const summary = summarizeDsl(dsl);
  const intro = isFirst
    ? `Here's the design I built:`
    : `Updated design:`;
  return [
    intro,
    "",
    rationale,
    "",
    `**Spec:** ${summary}`,
    violationLines,
  ]
    .filter((s) => s !== "")
    .join("\n");
}

export async function generatePartFromMessage(
  userMessage: string,
  history: Message[],
  existingSpec: PartSpec | null,
  image: ImageInput | null = null,
): Promise<DesignResult> {
  const lower = userMessage.toLowerCase().trim();
  const isSmallTalk =
    !image &&
    !existingSpec &&
    lower.length < 12 &&
    !/(inch|mm|steel|aluminum|brass|copper|bracket|plate|hole|bend)/.test(lower);

  if (isSmallTalk) {
    return {
      responseText:
        "Welcome. Describe the part you want laser-cut — for example: 'Steel mounting bracket, about 4 by 3 inches, 14ga, four corner holes for #10 screws, 90 degree bend.' I only design within Send Cut Send's catalog so the file is manufacturable.",
      partUpdate: null,
      partUpdated: false,
      validation: null,
      dsl: null,
      rationale: null,
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

  let agentResult: AgentLoopResult;
  try {
    agentResult = await runAgentLoop(systemPrompt, llmHistory, fallback);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown LLM error";
    return {
      responseText: `I couldn't reach the design model just now (${message}). Please try again.`,
      partUpdate: null,
      partUpdated: false,
      validation: null,
      dsl: null,
      rationale: null,
    };
  }

  const { finalDsl, rationale, finalValidation } = agentResult;
  const legacy = dslToLegacy(finalDsl);
  const featureGraph = buildFeatureGraph(finalDsl);
  const previewSpec: FlatPreviewSpec = {
    ...legacy,
    dsl: finalDsl,
    featureGraph,
  };
  const svgPreview = generateSvgPreview(previewSpec);

  const update: PartUpdate = {
    partType: legacy.partType ?? finalDsl.partType,
    material: legacy.material,
    thickness: legacy.thickness ?? null,
    width: legacy.width ?? null,
    height: legacy.height ?? null,
    depth: legacy.depth ?? null,
    bendAngles: legacy.bendAngles ?? null,
    bendRadius: legacy.bendRadius ?? null,
    holePattern: legacy.holePattern ?? null,
    powderCoat: legacy.powderCoat ?? null,
    powderCoatColor: legacy.powderCoatColor ?? null,
    notes: userMessage,
    sendCutSendUrl: "https://sendcutsend.com/upload",
    dslJson: JSON.stringify(finalDsl),
    featureGraphJson: JSON.stringify(featureGraph),
    svgPreview,
  };

  const isFirst = !existingSpec || history.filter((m) => m.role === "assistant").length === 0;
  const responseText = buildAssistantText(finalDsl, rationale, finalValidation, isFirst);

  return {
    responseText,
    partUpdate: update,
    partUpdated: true,
    validation: finalValidation,
    dsl: finalDsl,
    rationale,
  };
}

function safeParseDsl(json: string): PartDsl | null {
  try {
    const parsed = PartDslSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
