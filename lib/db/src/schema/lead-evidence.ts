import { createInsertSchema } from "drizzle-zod";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { leadsTable } from "./leads";

export const leadEvidenceSourceEnum = pgEnum("distress_evidence_source", [
  "public_record",
  "court_record",
  "listing",
  "referral",
  "site_observation",
  "other",
]);

export const evidenceConfidenceEnum = pgEnum("distress_evidence_confidence", [
  "not_assessed",
  "low",
  "medium",
  "high",
]);

export const leadEvidenceTable = pgTable(
  "distress_lead_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    sourceType: leadEvidenceSourceEnum("source_type").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    collectionMethod: text("collection_method").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    confidence: evidenceConfidenceEnum("confidence").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("distress_evidence_lead_observed_idx").on(
      table.ownerId,
      table.leadId,
      table.observedAt,
    ),
  ],
);

export const insertLeadEvidenceSchema = createInsertSchema(leadEvidenceTable).omit({
  id: true,
  leadId: true,
  ownerId: true,
  createdAt: true,
});

export type InsertLeadEvidence = z.infer<typeof insertLeadEvidenceSchema>;
export type LeadEvidence = typeof leadEvidenceTable.$inferSelect;
