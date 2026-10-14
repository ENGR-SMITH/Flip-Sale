import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { estateAuthorityStatusEnum, leadsTable } from "./leads";

export const estateAuthorityReviewsTable = pgTable(
  "distress_estate_authority_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    previousStatus: estateAuthorityStatusEnum("previous_status").notNull(),
    status: estateAuthorityStatusEnum("status").notNull(),
    evidenceRef: text("evidence_ref"),
    reviewerId: text("reviewer_id").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewNotes: text("review_notes").notNull(),
  },
  (table) => [
    index("distress_authority_reviews_owner_lead_time_idx").on(
      table.ownerId,
      table.leadId,
      table.reviewedAt,
    ),
  ],
);

export type EstateAuthorityReview =
  typeof estateAuthorityReviewsTable.$inferSelect;
