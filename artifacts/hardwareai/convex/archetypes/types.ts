import { z } from "zod/v4";
import type { PartDsl } from "../lib/dsl";
import type { Pose } from "../lib/positions";

export const ScopeSchema = z.object({
  tier: z.enum(["jerry-rigged", "mvp", "commercial"]),
  environment: z.object({
    location: z.enum(["indoor", "outdoor"]),
    waterproof: z.boolean().optional(),
    uv: z.boolean().optional(),
    freeze: z.boolean().optional(),
  }),
  useCase: z.string(),
  userInteraction: z.string().optional(),
  referenceScale: z.object({
    kind: z.string(),
    dimensions: z.object({ w: z.number(), d: z.number(), h: z.number() }).optional(),
    quantity: z.number().optional(),
  }).optional(),
  budgetCeiling: z.number().optional(),
});
export type ProjectScope = z.infer<typeof ScopeSchema>;

export type Tier = "jerry-rigged" | "mvp" | "commercial";

export interface InterfaceSpec {
  kind: "bolted" | "pem_inserted" | "riveted" | "hinged" | "weld_seam";
  roleA: string;
  roleB: string;
  featureA: string;
  featureB: string;
  hardwareRefs: Array<{ mcmasterPartNumber: string; quantity: number; role?: string }>;
  accessSide?: "A-to-B" | "B-to-A" | "either";
}

export interface GeneratedPart {
  role: string;
  label: string;
  dsl: PartDsl;
  position: Pose;
}

export interface Archetype<P> {
  id: string;
  label: string;
  description: string;
  tags: string[];
  paramSchema: z.ZodType<P>;
  paramDefaults(scope: ProjectScope): P;
  tierDefaults?: Partial<Record<Tier, Partial<P>>>;
  generate(params: P, scope: ProjectScope): {
    parts: GeneratedPart[];
    interfaces: InterfaceSpec[];
  };
  thumbnailSvg: string;
}
