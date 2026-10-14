import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { sourcesTable } from "./sources";

export const assetClassEnum = pgEnum("asset_class", [
  "storage",
  "real_estate",
  "estate",
  "commercial",
  "junk",
  "package",
]);

export const leadStageEnum = pgEnum("lead_stage", [
  "detected",
  "researched",
  "contacted",
  "negotiating",
  "under_contract",
  "monetizing",
  "settled",
  "dead",
]);

export const estateAuthorityStatusEnum = pgEnum("estate_authority_status", [
  "unknown",
  "verified",
  "rejected",
]);

export const leadDecisionEnum = pgEnum("lead_decision", [
  "bid",
  "conditional_bid",
  "watch",
  "pass",
  "contract",
  "option_refer",
  "cleanout_consign",
  "hybrid",
  "refer",
  "run",
  "review",
]);

export const riskFlagValues = [
  "biohazard",
  "drug_paraphernalia",
  "water_damage",
  "paperwork_only",
  "firearm_without_ffl",
  "unclear_vehicle_title",
  "unresolvable_title",
  "owner_refuses",
  "occupancy_outside_scope",
  "unlicensed_jurisdiction",
  "heir_dispute",
  "no_signed_authorization",
  "hoarding_remediation_required",
] as const;

export type ScoreContribution = {
  input: string;
  weight: number;
  score: number | null;
  contribution: number;
};

export const leadsTable = pgTable(
  "distress_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    assetClass: assetClassEnum("asset_class").notNull(),
    stage: leadStageEnum("stage").notNull(),
    location: text("location").notNull(),
    source: text("source").notNull(),
    sourceId: uuid("source_id").references(() => sourcesTable.id, {
      onDelete: "set null",
    }),
    distressSignal: text("distress_signal").notNull(),
    nextAction: text("next_action"),
    nextActionDueAt: timestamp("next_action_due_at", { withTimezone: true }),
    noNextActionReason: text("no_next_action_reason"),
    estateAuthorityStatus: estateAuthorityStatusEnum(
      "estate_authority_status",
    )
      .notNull()
      .default("unknown"),
    estateAuthorityEvidenceRef: text("estate_authority_evidence_ref"),
    estateAuthorityReviewerId: text("estate_authority_reviewer_id"),
    estateAuthorityReviewedAt: timestamp("estate_authority_reviewed_at", {
      withTimezone: true,
    }),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactStatus: text("contact_status", {
      enum: ["unknown", "qualified", "do_not_contact"],
    })
      .notNull()
      .default("unknown"),
    currencyCode: text("currency_code"),
    riskFlags: text("risk_flags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    businessSharePercent: doublePrecision("business_share_percent"),
    resellableItemsFound: boolean("resellable_items_found"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    score: doublePrecision("score"),
    decision: leadDecisionEnum("decision").notNull().default("review"),
    expectedValue: numeric("expected_value", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    netToBusinessValue: numeric("net_to_business_value", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    recommendedBid: numeric("recommended_bid", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    mao: numeric("mao", { precision: 14, scale: 2, mode: "number" }),
    requiredAssignmentFee: numeric("required_assignment_fee", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    scoringVersion: text("scoring_version"),
    scoreBreakdown: jsonb("score_breakdown")
      .$type<ScoreContribution[]>()
      .notNull()
      .default([]),
    missingInputs: text("missing_inputs")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    hardVetoes: text("hard_vetoes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    brandVisibility: doublePrecision("brand_visibility"),
    containerComposition: doublePrecision("container_composition"),
    facilityTier: doublePrecision("facility_tier"),
    scrapCoverage: doublePrecision("scrap_coverage"),
    ownerContext: doublePrecision("owner_context"),
    unitVisibility: doublePrecision("unit_visibility"),
    cleanoutEase: doublePrecision("cleanout_ease"),
    auctionHorizon: doublePrecision("auction_horizon"),
    resaleEstimate: numeric("resale_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    resaleProbability: doublePrecision("resale_probability"),
    scrapFloor: numeric("scrap_floor", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    cleanoutCost: numeric("cleanout_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    dumpFees: numeric("dump_fees", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    arv: numeric("arv", { precision: 14, scale: 2, mode: "number" }),
    repairCost: numeric("repair_cost", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    contractPrice: numeric("contract_price", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    discountToMao: doublePrecision("discount_to_mao"),
    motivationScore: doublePrecision("motivation_score"),
    timelineScore: doublePrecision("timeline_score"),
    titleClarity: doublePrecision("title_clarity"),
    buyerLiquidity: doublePrecision("buyer_liquidity"),
    toolsEstimate: numeric("tools_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    electronicsEstimate: numeric("electronics_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    furnitureEstimate: numeric("furniture_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    householdEstimate: numeric("household_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    clothingEstimate: numeric("clothing_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    estimatedContentsEv: numeric("estimated_contents_ev", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    executorCooperation: doublePrecision("executor_cooperation"),
    resaleDensity: doublePrecision("resale_density"),
    accessLogistics: doublePrecision("access_logistics"),
    scrapEstimate: numeric("scrap_estimate", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    runnerPayout: numeric("runner_payout", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    serviceRadiusKm: doublePrecision("service_radius_km"),
    distanceKm: doublePrecision("distance_km"),
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
    evidenceUrl: text("evidence_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("distress_leads_owner_class_idx").on(
      table.ownerId,
      table.assetClass,
    ),
    index("distress_leads_owner_stage_idx").on(table.ownerId, table.stage),
    index("distress_leads_created_idx").on(table.createdAt),
  ],
);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  ownerId: true,
  score: true,
  decision: true,
  expectedValue: true,
  recommendedBid: true,
  hardVetoes: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
