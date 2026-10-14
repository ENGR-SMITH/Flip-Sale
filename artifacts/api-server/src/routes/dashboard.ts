import {
  GetDashboardSummaryResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  jobsTable,
  leadsTable,
  workersTable,
  type Lead,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import { sendValidationError } from "./utils";

const router: IRouter = Router();
const assetClasses = [
  "storage",
  "real_estate",
  "estate",
  "commercial",
  "junk",
  "package",
] as const;
const leadStages = [
  "detected",
  "researched",
  "contacted",
  "negotiating",
  "under_contract",
  "monetizing",
  "settled",
  "dead",
] as const;

router.get("/dashboard/summary", async (req, res) => {
  const ownerId = getOwnerId(req);
  const [leads, jobs, workers] = await Promise.all([
    db.select().from(leadsTable).where(eq(leadsTable.ownerId, ownerId)),
    db.select().from(jobsTable).where(eq(jobsTable.ownerId, ownerId)),
    db
      .select({ isAvailable: workersTable.isAvailable })
      .from(workersTable)
      .where(eq(workersTable.ownerId, ownerId)),
  ]);
  const valueByCurrency = new Map<string, number>();
  for (const lead of leads) {
    if (
      !lead.currencyCode ||
      lead.expectedValue === null ||
      ["settled", "dead"].includes(lead.stage) ||
      lead.decision === "pass"
    ) {
      continue;
    }
    valueByCurrency.set(
      lead.currencyCode,
      (valueByCurrency.get(lead.currencyCode) ?? 0) + lead.expectedValue,
    );
  }
  const summary = {
    totalLeads: leads.length,
    needsResearch: leads.filter((lead) => lead.stage === "detected").length,
    awaitingReview: leads.filter((lead) => lead.decision === "review").length,
    activeDeals: leads.filter((lead) =>
      ["negotiating", "under_contract", "monetizing"].includes(lead.stage),
    ).length,
    openJobs: jobs.filter(
      (job) => !["completed", "cancelled"].includes(job.status),
    ).length,
    availableWorkers: workers.filter((worker) => worker.isAvailable).length,
    expectedPipelineValueByCurrency: Array.from(valueByCurrency.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyCode, amount]) => ({
        currencyCode,
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
      })),
    byAssetClass: assetClasses.map((assetClass) => ({
      assetClass,
      count: leads.filter((lead) => lead.assetClass === assetClass).length,
    })),
    byStage: leadStages.map((stage) => ({
      stage,
      count: leads.filter((lead) => lead.stage === stage).length,
    })),
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/activity", async (req, res) => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(
      res,
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
    return;
  }
  const ownerId = getOwnerId(req);
  const rows = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.ownerId, ownerId))
    .orderBy(desc(activityTable.occurredAt))
    .limit(parsed.data.limit ?? 12);
  res.json(
    GetRecentActivityResponse.parse(
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail: row.detail,
        occurredAt: row.occurredAt,
      })),
    ),
  );
});

export default router;
