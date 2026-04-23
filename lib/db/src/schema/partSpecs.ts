import { pgTable, text, serial, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const partSpecsTable = pgTable("part_specs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  partType: text("part_type").notNull().default("bracket"),
  material: text("material"),
  thickness: real("thickness"),
  width: real("width"),
  height: real("height"),
  depth: real("depth"),
  bendRadius: real("bend_radius"),
  bendAngles: text("bend_angles"),
  holePattern: text("hole_pattern"),
  powderCoat: boolean("powder_coat"),
  powderCoatColor: text("powder_coat_color"),
  notes: text("notes"),
  svgPreview: text("svg_preview"),
  sendCutSendUrl: text("send_cut_send_url"),
  dslJson: text("dsl_json"),
  featureGraphJson: text("feature_graph_json"),
  currentRevisionId: integer("current_revision_id"),
  totalRevisions: integer("total_revisions").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPartSpecSchema = createInsertSchema(partSpecsTable).omit({ id: true, updatedAt: true });
export type InsertPartSpec = z.infer<typeof insertPartSpecSchema>;
export type PartSpec = typeof partSpecsTable.$inferSelect;
