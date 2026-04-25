import { z } from "zod/v4";

export const PurchasedDslSchema = z.object({
  version: z.literal(1),
  kind: z.literal("purchased"),
  mcmasterPartNumber: z.string().min(1),
  quantity: z.number().int().positive(),
  label: z.string().min(1),
  unitCostUsd: z.number().nonnegative().optional(),
});
export type PurchasedDsl = z.infer<typeof PurchasedDslSchema>;

export function summarizePurchased(dsl: PurchasedDsl): string {
  return `${dsl.quantity} × ${dsl.label} (${dsl.mcmasterPartNumber})`;
}

export function mcmasterUrl(partNumber: string): string {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.mcmaster.com/${clean}/`;
}
