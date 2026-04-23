import { pgTable, text, serial, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  sendCutSendName: text("send_cut_send_name").notNull(),
  canBend: boolean("can_bend").notNull().default(false),
  canPowderCoat: boolean("can_powder_coat").notNull().default(false),
  minThickness: real("min_thickness").notNull(),
  maxThickness: real("max_thickness").notNull(),
  maxSheetWidth: real("max_sheet_width").notNull().default(48),
  maxSheetHeight: real("max_sheet_height").notNull().default(96),
  description: text("description"),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;

export const thicknessesTable = pgTable("thicknesses", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id, { onDelete: "cascade" }),
  gauge: text("gauge"),
  inches: real("inches").notNull(),
  mm: real("mm").notNull(),
});

export const insertThicknessSchema = createInsertSchema(thicknessesTable).omit({ id: true });
export type InsertThickness = z.infer<typeof insertThicknessSchema>;
export type Thickness = typeof thicknessesTable.$inferSelect;
