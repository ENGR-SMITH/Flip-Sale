import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  numeric,
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const workersTable = pgTable(
  "distress_workers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    displayName: text("display_name").notNull(),
    homeArea: text("home_area").notNull(),
    skills: text("skills")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    isAvailable: boolean("is_available").notNull().default(true),
    serviceRadiusKm: doublePrecision("service_radius_km").notNull().default(0),
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
    index("distress_workers_owner_available_idx").on(
      table.ownerId,
      table.isAvailable,
    ),
  ],
);

export const insertWorkerSchema = createInsertSchema(workersTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
