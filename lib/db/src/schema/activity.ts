import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const activityTable = pgTable(
  "distress_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind", {
      enum: [
        "lead_created",
        "lead_updated",
        "evidence_added",
        "job_created",
        "job_updated",
      ],
    }).notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    leadId: uuid("lead_id"),
    jobId: uuid("job_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("distress_activity_owner_time_idx").on(table.ownerId, table.occurredAt)],
);

export const insertActivitySchema = createInsertSchema(activityTable).omit({
  id: true,
  occurredAt: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
