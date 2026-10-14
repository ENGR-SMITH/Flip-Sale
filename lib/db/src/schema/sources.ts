import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const sourceAccessMethodEnum = pgEnum("source_access_method", [
  "manual_entry",
  "public_download",
  "authorized_feed",
  "api",
  "approved_scraping_provider",
  "partner_submission",
  "other",
]);

export const sourcePermissionStatusEnum = pgEnum("source_permission_status", [
  "pending",
  "approved",
  "rejected",
]);

export const sourcesTable = pgTable(
  "distress_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    sourceUrl: text("source_url"),
    countyCoverage: text("county_coverage").array().notNull(),
    sourceOwner: text("source_owner").notNull(),
    accessMethod: sourceAccessMethodEnum("access_method").notNull(),
    assetClasses: text("asset_classes")
      .array()
      .notNull()
      .default(sql`ARRAY['estate']::text[]`),
    apifyActorId: text("apify_actor_id"),
    collectionEnabled: boolean("collection_enabled").notNull().default(false),
    collectionIntervalHours: integer("collection_interval_hours")
      .notNull()
      .default(24),
    collectionMaxPages: integer("collection_max_pages").notNull().default(25),
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }),
    nextCollectionAt: timestamp("next_collection_at", { withTimezone: true }),
    costRateNotes: text("cost_rate_notes").notNull(),
    retentionNotes: text("retention_notes").notNull(),
    permissionStatus: sourcePermissionStatusEnum("permission_status")
      .notNull()
      .default("pending"),
    permissionReviewerId: text("permission_reviewer_id"),
    permissionReviewedAt: timestamp("permission_reviewed_at", {
      withTimezone: true,
    }),
    permissionReviewNotes: text("permission_review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("distress_sources_owner_status_idx").on(
      table.ownerId,
      table.permissionStatus,
    ),
    index("distress_sources_owner_name_idx").on(table.ownerId, table.name),
    index("distress_sources_collection_due_idx").on(
      table.collectionEnabled,
      table.nextCollectionAt,
    ),
  ],
);

export const sourceReviewsTable = pgTable(
  "distress_source_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourcesTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    previousStatus: sourcePermissionStatusEnum("previous_status").notNull(),
    status: sourcePermissionStatusEnum("status").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewNotes: text("review_notes").notNull(),
  },
  (table) => [
    index("distress_source_reviews_owner_source_time_idx").on(
      table.ownerId,
      table.sourceId,
      table.reviewedAt,
    ),
  ],
);

export const sourceRunStatusEnum = pgEnum("source_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const sourceRunsTable = pgTable(
  "distress_source_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourcesTable.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    actorId: text("actor_id").notNull(),
    providerRunId: text("provider_run_id"),
    datasetId: text("dataset_id"),
    status: sourceRunStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    itemsFound: integer("items_found").notNull().default(0),
    observationsAdded: integer("observations_added").notNull().default(0),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("distress_source_runs_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
    index("distress_source_runs_source_status_idx").on(
      table.sourceId,
      table.status,
    ),
  ],
);

export const sourceObservationStatusEnum = pgEnum(
  "source_observation_status",
  ["needs_review", "converted_to_lead", "dismissed"],
);

export const sourceObservationsTable = pgTable(
  "distress_source_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourcesTable.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => sourceRunsTable.id, { onDelete: "cascade" }),
    assetClass: text("asset_class").notNull(),
    title: text("title"),
    observedUrl: text("observed_url").notNull(),
    fingerprint: text("fingerprint").notNull(),
    summary: text("summary").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewStatus: sourceObservationStatusEnum("review_status")
      .notNull()
      .default("needs_review"),
    leadId: uuid("lead_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("distress_observations_owner_review_time_idx").on(
      table.ownerId,
      table.reviewStatus,
      table.discoveredAt,
    ),
    index("distress_observations_owner_class_idx").on(
      table.ownerId,
      table.assetClass,
    ),
    uniqueIndex("distress_observations_source_fingerprint_uniq").on(
      table.sourceId,
      table.fingerprint,
    ),
  ],
);

export const insertSourceSchema = createInsertSchema(sourcesTable).omit({
  id: true,
  ownerId: true,
  permissionStatus: true,
  permissionReviewerId: true,
  permissionReviewedAt: true,
  permissionReviewNotes: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sourcesTable.$inferSelect;
export type SourceReview = typeof sourceReviewsTable.$inferSelect;
export type SourceRun = typeof sourceRunsTable.$inferSelect;
export type SourceObservation = typeof sourceObservationsTable.$inferSelect;
