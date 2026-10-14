import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const clientServiceRequestStatusEnum = pgEnum(
  "client_service_request_status",
  ["new", "reviewing", "contacted", "scheduled", "closed"],
);

export const clientServiceRequestsTable = pgTable(
  "client_service_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceClass: text("service_class").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    jobLocation: text("job_location").notNull(),
    description: text("description").notNull(),
    preferredDate: date("preferred_date", { mode: "string" }),
    consentToContact: boolean("consent_to_contact").notNull(),
    status: clientServiceRequestStatusEnum("status").notNull().default("new"),
    operatorNote: text("operator_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("client_service_requests_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const insertClientServiceRequestSchema = createInsertSchema(
  clientServiceRequestsTable,
).omit({
  id: true,
  status: true,
  operatorNote: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientServiceRequest = z.infer<
  typeof insertClientServiceRequestSchema
>;
export type ClientServiceRequest =
  typeof clientServiceRequestsTable.$inferSelect;
