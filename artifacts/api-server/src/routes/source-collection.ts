import {
  ConvertSourceObservationToLeadBody,
  ConvertSourceObservationToLeadParams,
  ConvertSourceObservationToLeadResponse,
  ListSourceObservationsQueryParams,
  ListSourceObservationsResponse,
  ListSourceRunsQueryParams,
  ListSourceRunsResponse,
  RefreshSourceRunParams,
  RefreshSourceRunResponse,
  RunSourceCollectionParams,
  RunSourceCollectionResponse,
  UpdateSourceCollectionBody,
  UpdateSourceCollectionParams,
  UpdateSourceCollectionResponse,
  UpdateSourceObservationBody,
  UpdateSourceObservationParams,
  UpdateSourceObservationResponse,
  parseLaunchLocation,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  leadEvidenceTable,
  leadsTable,
  sourceObservationsTable,
  sourceRunsTable,
  sourcesTable,
  type SourceObservation,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import { evaluateLead } from "../lib/scoring";
import {
  apifyIsConfigured,
  assertSourceCanBeCollected,
  enqueueSourceRun,
  refreshApifyRun,
} from "../lib/apify-source-collector";
import {
  sendNotFound,
  sendValidationError,
  serializeLead,
} from "./utils";

const router: IRouter = Router();
const launchCountyCodes: Record<string, string> = {
  "Harris County": "harris",
  "Fort Bend County": "fort_bend",
  "Dallas County": "dallas",
  "Tarrant County": "tarrant",
};

function validationMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function routeId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function serializeSourceRun(run: typeof sourceRunsTable.$inferSelect) {
  return {
    id: run.id,
    sourceId: run.sourceId,
    sourceName: run.sourceName,
    actorId: run.actorId,
    providerRunId: run.providerRunId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    itemsFound: run.itemsFound,
    observationsAdded: run.observationsAdded,
    errorSummary: run.errorSummary,
    createdAt: run.createdAt,
  };
}

function serializeObservation(row: SourceObservation) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    runId: row.runId,
    assetClass: row.assetClass,
    title: row.title,
    observedUrl: row.observedUrl,
    summary: row.summary,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    publishedAt: row.publishedAt,
    discoveredAt: row.discoveredAt,
    reviewStatus: row.reviewStatus,
    leadId: row.leadId,
    createdAt: row.createdAt,
  };
}

router.post("/sources/:id/collection", async (req, res): Promise<void> => {
  const params = UpdateSourceCollectionParams.safeParse({
    id: routeId(req.params.id),
  });
  const parsed = UpdateSourceCollectionBody.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(
      and(
        eq(sourcesTable.id, params.data.id),
        eq(sourcesTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!source) {
    sendNotFound(res, "Source");
    return;
  }

  if (parsed.data.enabled) {
    try {
      assertSourceCanBeCollected({
        ...source,
        collectionIntervalHours: parsed.data.intervalHours,
      });
    } catch (error) {
      sendValidationError(
        res,
        error instanceof Error
          ? error.message
          : "This source is not ready for collection.",
      );
      return;
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(sourcesTable)
    .set({
      collectionEnabled: parsed.data.enabled,
      collectionIntervalHours: parsed.data.intervalHours,
      nextCollectionAt: parsed.data.enabled
        ? new Date(
            now.getTime() + parsed.data.intervalHours * 60 * 60 * 1000,
          )
        : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(sourcesTable.id, params.data.id),
        eq(sourcesTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!updated) {
    sendNotFound(res, "Source");
    return;
  }
  res.json(UpdateSourceCollectionResponse.parse(updated));
});

router.post("/sources/:id/runs", async (req, res): Promise<void> => {
  const params = RunSourceCollectionParams.safeParse({
    id: routeId(req.params.id),
  });
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(
      and(
        eq(sourcesTable.id, params.data.id),
        eq(sourcesTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!source) {
    sendNotFound(res, "Source");
    return;
  }
  if (
    source.accessMethod === "approved_scraping_provider" &&
    !apifyIsConfigured()
  ) {
    res.status(503).json({ error: "APIFY_API_TOKEN is not configured." });
    return;
  }

  let run: Awaited<ReturnType<typeof enqueueSourceRun>>;
  try {
    run = await enqueueSourceRun(source, ownerId);
  } catch (error) {
    sendValidationError(
      res,
      error instanceof Error ? error.message : "The source cannot be collected.",
    );
    return;
  }
  if (!run) {
    sendValidationError(res, "A collection run is already active for this source.");
    return;
  }
  res.status(202).json(RunSourceCollectionResponse.parse(serializeSourceRun(run)));
});

router.get("/sources/runs", async (req, res): Promise<void> => {
  const parsed = ListSourceRunsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const conditions = [eq(sourceRunsTable.ownerId, ownerId)];
  if (parsed.data.sourceId) {
    conditions.push(eq(sourceRunsTable.sourceId, parsed.data.sourceId));
  }
  const rows = await db
    .select()
    .from(sourceRunsTable)
    .where(and(...conditions))
    .orderBy(desc(sourceRunsTable.createdAt))
    .limit(parsed.data.limit);
  res.json(ListSourceRunsResponse.parse(rows.map(serializeSourceRun)));
});

router.post("/sources/runs/:id/refresh", async (req, res): Promise<void> => {
  const params = RefreshSourceRunParams.safeParse({
    id: routeId(req.params.id),
  });
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [entry] = await db
    .select({ run: sourceRunsTable, source: sourcesTable })
    .from(sourceRunsTable)
    .innerJoin(sourcesTable, eq(sourceRunsTable.sourceId, sourcesTable.id))
    .where(
      and(
        eq(sourceRunsTable.id, params.data.id),
        eq(sourceRunsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!entry) {
    sendNotFound(res, "Collection run");
    return;
  }
  const run = await refreshApifyRun(entry.run, entry.source);
  res.json(RefreshSourceRunResponse.parse(serializeSourceRun(run)));
});

router.get("/sources/observations", async (req, res): Promise<void> => {
  const parsed = ListSourceObservationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const conditions = [eq(sourceObservationsTable.ownerId, ownerId)];
  if (parsed.data.assetClass) {
    conditions.push(
      eq(sourceObservationsTable.assetClass, parsed.data.assetClass),
    );
  }
  if (parsed.data.reviewStatus) {
    conditions.push(
      eq(sourceObservationsTable.reviewStatus, parsed.data.reviewStatus),
    );
  }
  const rows = await db
    .select()
    .from(sourceObservationsTable)
    .where(and(...conditions))
    .orderBy(desc(sourceObservationsTable.discoveredAt))
    .limit(parsed.data.limit);
  res.json(ListSourceObservationsResponse.parse(rows.map(serializeObservation)));
});

router.patch("/sources/observations/:id", async (req, res): Promise<void> => {
  const params = UpdateSourceObservationParams.safeParse({
    id: routeId(req.params.id),
  });
  const parsed = UpdateSourceObservationBody.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const [existing] = await db
    .select()
    .from(sourceObservationsTable)
    .where(
      and(
        eq(sourceObservationsTable.id, params.data.id),
        eq(sourceObservationsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!existing) {
    sendNotFound(res, "Source observation");
    return;
  }
  if (existing.reviewStatus === "converted_to_lead") {
    sendValidationError(res, "A converted observation cannot be changed.");
    return;
  }

  const [updated] = await db
    .update(sourceObservationsTable)
    .set({ reviewStatus: parsed.data.reviewStatus })
    .where(
      and(
        eq(sourceObservationsTable.id, params.data.id),
        eq(sourceObservationsTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!updated) {
    sendNotFound(res, "Source observation");
    return;
  }
  res.json(
    UpdateSourceObservationResponse.parse(serializeObservation(updated)),
  );
});

router.post(
  "/sources/observations/:id/lead",
  async (req, res): Promise<void> => {
    const params = ConvertSourceObservationToLeadParams.safeParse({
      id: routeId(req.params.id),
    });
    const parsed = ConvertSourceObservationToLeadBody.safeParse(req.body);
    if (!params.success) {
      sendValidationError(res, validationMessage(params.error));
      return;
    }
    if (!parsed.success) {
      sendValidationError(res, validationMessage(parsed.error));
      return;
    }

    const ownerId = getOwnerId(req);
    const [entry] = await db
      .select({ observation: sourceObservationsTable, source: sourcesTable })
      .from(sourceObservationsTable)
      .innerJoin(
        sourcesTable,
        eq(sourceObservationsTable.sourceId, sourcesTable.id),
      )
      .where(
        and(
          eq(sourceObservationsTable.id, params.data.id),
          eq(sourceObservationsTable.ownerId, ownerId),
          eq(sourcesTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!entry) {
      sendNotFound(res, "Source observation");
      return;
    }
    if (entry.observation.reviewStatus !== "needs_review") {
      sendValidationError(
        res,
        "Only an observation awaiting review can become a lead.",
      );
      return;
    }
    if (entry.source.permissionStatus !== "approved") {
      sendValidationError(
        res,
        "The source approval was removed; review it before converting this update.",
      );
      return;
    }
    if (parsed.data.assetClass !== entry.observation.assetClass) {
      sendValidationError(
        res,
        "The lead asset class must match the source observation.",
      );
      return;
    }
    const parsedLocation = parseLaunchLocation(parsed.data.location);
    const countyCode = parsedLocation
      ? launchCountyCodes[parsedLocation.county.name]
      : null;
    if (
      !parsedLocation ||
      !countyCode ||
      !entry.source.countyCoverage.includes(countyCode)
    ) {
      sendValidationError(
        res,
        "The lead location must be in a Texas launch county covered by this source.",
      );
      return;
    }

    const body = parsed.data;
    const eventDate = body.eventDate
      ? new Date(body.eventDate)
      : entry.observation.publishedAt;
    const forcedLead = {
      ...body,
      source: entry.source.name,
      sourceId: entry.source.id,
      evidenceUrl: body.evidenceUrl ?? entry.observation.observedUrl,
      eventDate,
      estateAuthorityStatus: "unknown" as const,
      contactStatus: body.contactStatus ?? "unknown",
      riskFlags: body.riskFlags ?? [],
    };
    const evaluation = evaluateLead(forcedLead);

    const result = await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leadsTable)
        .values({
          ...body,
          ownerId,
          source: entry.source.name,
          sourceId: entry.source.id,
          eventDate,
          contactStatus: body.contactStatus ?? "unknown",
          contactName: body.contactName ?? null,
          contactEmail: body.contactEmail ?? null,
          contactPhone: body.contactPhone ?? null,
          currencyCode: body.currencyCode ?? "USD",
          riskFlags: body.riskFlags ?? [],
          businessSharePercent: body.businessSharePercent ?? null,
          resellableItemsFound: body.resellableItemsFound ?? null,
          evidenceUrl: body.evidenceUrl ?? entry.observation.observedUrl,
          ...evaluation,
        })
        .returning();
      if (!lead) throw new Error("The lead could not be created.");

      await tx.insert(leadEvidenceTable).values({
        ownerId,
        leadId: lead.id,
        sourceType: "other",
        sourceName: entry.source.name,
        sourceUrl: entry.observation.observedUrl,
        collectionMethod:
          entry.source.accessMethod === "api"
            ? "Public JSON API"
            : entry.source.accessMethod === "authorized_feed"
              ? "Authorized feed"
              : "Apify public-page crawler",
        observedAt: entry.observation.discoveredAt,
        confidence: "not_assessed",
        summary: entry.observation.summary,
      });
      const [observation] = await tx
        .update(sourceObservationsTable)
        .set({
          reviewStatus: "converted_to_lead",
          leadId: lead.id,
        })
        .where(
          and(
            eq(sourceObservationsTable.id, entry.observation.id),
            eq(sourceObservationsTable.ownerId, ownerId),
            eq(sourceObservationsTable.reviewStatus, "needs_review"),
          ),
        )
        .returning();
      if (!observation) {
        throw new Error("The observation was already reviewed.");
      }
      await tx.insert(activityTable).values({
        ownerId,
        kind: "lead_created",
        title: "Lead created from source review",
        detail: `${lead.title} · ${lead.assetClass.replaceAll("_", " ")}`,
        leadId: lead.id,
      });
      return { lead, observation };
    });

    res.status(201).json(
      ConvertSourceObservationToLeadResponse.parse({
        lead: serializeLead(result.lead),
        observation: serializeObservation(result.observation),
      }),
    );
  },
);

export default router;
