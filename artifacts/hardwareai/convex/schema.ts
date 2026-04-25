import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // --- Chat (new) ---
  threads: defineTable({
    title: v.string(),
    model: v.string(),
    effort: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // --- Projects ---
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    scope: v.optional(v.object({
      tier: v.union(v.literal("jerry-rigged"), v.literal("mvp"), v.literal("commercial")),
      environment: v.object({
        location: v.union(v.literal("indoor"), v.literal("outdoor")),
        waterproof: v.optional(v.boolean()),
        uv: v.optional(v.boolean()),
        freeze: v.optional(v.boolean()),
      }),
      useCase: v.string(),
      userInteraction: v.optional(v.string()),
      referenceScale: v.optional(v.object({
        kind: v.string(),
        dimensions: v.optional(v.object({ w: v.number(), d: v.number(), h: v.number() })),
        quantity: v.optional(v.number()),
      })),
      budgetCeiling: v.optional(v.number()),
    })),
    archetypeId: v.optional(v.union(
      v.literal("hinged_enclosure"),
      v.literal("sliding_enclosure"),
      v.literal("bracket_plus_panel"),
      v.literal("divided_tray"),
      v.literal("shelf_with_brackets"),
      v.literal("box_with_lid"),
      v.null(),
    )),
    archetypeParams: v.optional(v.any()),
    isMultiPart: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updated", ["updatedAt"]),

  // --- Parts (individual components within a multi-part project) ---
  parts: defineTable({
    projectId: v.id("projects"),
    role: v.string(),
    label: v.string(),
    position: v.object({
      x: v.number(), y: v.number(), z: v.number(),
      rotX: v.number(), rotY: v.number(), rotZ: v.number(),
    }),
    partType: v.string(),
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
    notes: v.optional(v.string()),
    svgPreview: v.optional(v.string()),
    dslJson: v.optional(v.string()),
    featureGraphJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // --- Interfaces (connections between parts) ---
  interfaces: defineTable({
    projectId: v.id("projects"),
    kind: v.union(
      v.literal("bolted"),
      v.literal("pem_inserted"),
      v.literal("riveted"),
      v.literal("hinged"),
    ),
    partA: v.id("parts"),
    partB: v.id("parts"),
    featureRefs: v.array(v.object({
      partId: v.id("parts"),
      featureName: v.string(),
    })),
    hardwareRefs: v.array(v.object({
      mcmasterPartNumber: v.string(),
      quantity: v.number(),
      role: v.optional(v.string()),
    })),
    accessSide: v.optional(v.union(
      v.literal("A-to-B"),
      v.literal("B-to-A"),
      v.literal("either"),
    )),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // --- Messages (unified: chat-thread + project-scoped) ---
  messages: defineTable({
    threadId: v.optional(v.id("threads")),
    projectId: v.optional(v.id("projects")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    imageData: v.optional(v.string()),
    imageMediaType: v.optional(v.string()),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
    thinking: v.optional(v.string()),
    usage: v.optional(
      v.object({
        inputTokens: v.number(),
        outputTokens: v.number(),
        cacheReadTokens: v.optional(v.number()),
        cacheCreationTokens: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_project", ["projectId", "createdAt"]),

  // --- Part Specs (one per project) ---
  partSpecs: defineTable({
    projectId: v.id("projects"),
    partType: v.string(), // "bracket" | "plate" | "enclosure" | "angle" | "channel" | "tab" | "gusset"
    material: v.optional(v.string()),
    thickness: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    depth: v.optional(v.number()),
    bendRadius: v.optional(v.number()),
    bendAngles: v.optional(v.string()), // JSON-encoded array
    holePattern: v.optional(v.string()), // JSON-encoded array
    powderCoat: v.optional(v.boolean()),
    powderCoatColor: v.optional(v.string()),
    notes: v.optional(v.string()),
    svgPreview: v.optional(v.string()),
    sendCutSendUrl: v.optional(v.string()),
    dslJson: v.optional(v.string()),
    featureGraphJson: v.optional(v.string()),
    currentRevisionId: v.optional(v.id("partRevisions")),
    totalRevisions: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // --- Part Revisions (undo/redo history) ---
  partRevisions: defineTable({
    projectId: v.id("projects"),
    revisionNumber: v.number(),
    dslJson: v.string(),
    specSnapshot: v.string(),
    rationale: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project_revision", ["projectId", "revisionNumber"]),

  // --- Assembly Parts (McMaster off-the-shelf refs) ---
  assemblyParts: defineTable({
    projectId: v.id("projects"),
    mcmasterPartNumber: v.string(),
    name: v.string(),
    category: v.string(),
    quantity: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId", "createdAt"]),

  // --- Materials catalog ---
  materials: defineTable({
    name: v.string(),
    category: v.string(),
    sendCutSendName: v.string(),
    canBend: v.boolean(),
    canPowderCoat: v.boolean(),
    minThickness: v.number(),
    maxThickness: v.number(),
    maxSheetWidth: v.number(),
    maxSheetHeight: v.number(),
    description: v.optional(v.string()),
  }).index("by_name", ["name"]),

  thicknesses: defineTable({
    materialId: v.id("materials"),
    gauge: v.optional(v.string()),
    inches: v.number(),
    mm: v.number(),
  }).index("by_material", ["materialId", "inches"]),

  // --- Waitlist ---
  waitlist: defineTable({
    email: v.string(),
    source: v.string(),
    note: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  }),
});
