import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Pre-beta waitlist. Surfaced by the Landing page's Request-access form.
// No PII beyond an email, no marketing consent plumbing — when the beta
// opens we'll migrate these into a real CRM.
export const waitlistTable = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  source: text("source").notNull().default("landing"),
  note: text("note"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWaitlistSchema = createInsertSchema(waitlistTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistSchema>;
export type WaitlistEntry = typeof waitlistTable.$inferSelect;
