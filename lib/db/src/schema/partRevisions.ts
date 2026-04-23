import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const partRevisionsTable = pgTable("part_revisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  dslJson: text("dsl_json").notNull(),
  specSnapshot: text("spec_snapshot").notNull(),
  rationale: text("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartRevisionSchema = createInsertSchema(partRevisionsTable).omit({ id: true, createdAt: true });
export type InsertPartRevision = z.infer<typeof insertPartRevisionSchema>;
export type PartRevision = typeof partRevisionsTable.$inferSelect;
