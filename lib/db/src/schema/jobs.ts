import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { activityTable } from "./activity";
import { leadsTable } from "./leads";
import { workersTable } from "./workers";

export const jobTypeEnum = pgEnum("job_type", [
  "pickup",
  "cleanout",
  "scrap_run",
  "meetup",
  "other",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "open",
  "invited",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const jobsTable = pgTable(
  "distress_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    leadId: uuid("lead_id").references(() => leadsTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    jobType: jobTypeEnum("job_type").notNull(),
    location: text("location").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    requiredSkills: text("required_skills")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    estimatedHours: doublePrecision("estimated_hours"),
    payoutAmount: numeric("payout_amount", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    currencyCode: text("currency_code"),
    payoutStructure: text("payout_structure").notNull(),
    status: jobStatusEnum("status").notNull().default("open"),
    workerId: uuid("worker_id").references(() => workersTable.id, {
      onDelete: "set null",
    }),
    latitude: numeric("latitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    longitude: numeric("longitude", {
      precision: 10,
      scale: 7,
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("distress_jobs_owner_status_idx").on(table.ownerId, table.status),
    index("distress_jobs_scheduled_idx").on(table.scheduledAt),
  ],
);

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
