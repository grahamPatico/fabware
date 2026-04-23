import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

// Off-the-shelf assembly parts sourced from McMaster-Carr (fasteners, bearings,
// extrusion, etc.). McMaster has no public API; we store the part number and
// whatever metadata the user provides, plus a deterministic product-page URL.
export const assemblyPartsTable = pgTable("assembly_parts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  mcmasterPartNumber: text("mcmaster_part_number").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const ASSEMBLY_PART_CATEGORIES = [
  "fastener",
  "nut",
  "washer",
  "bearing",
  "bushing",
  "extrusion",
  "fitting",
  "spring",
  "magnet",
  "spacer",
  "insert",
  "other",
] as const;

export const insertAssemblyPartSchema = createInsertSchema(assemblyPartsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAssemblyPart = z.infer<typeof insertAssemblyPartSchema>;
export type AssemblyPart = typeof assemblyPartsTable.$inferSelect;

export function mcmasterProductUrl(partNumber: string): string {
  const clean = partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.mcmaster.com/${clean}/`;
}
