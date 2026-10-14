import {
  CreateLeadBody,
  CreateLeadResponse,
  DeleteLeadParams,
  GetLeadParams,
  GetLeadResponse,
  ListLeadsQueryParams,
  ListLeadsResponse,
  UpdateLeadBody,
  UpdateLeadParams,
  UpdateLeadResponse,
} from "@workspace/api-zod";
import { db, leadsTable, sourcesTable, type Lead } from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import { evaluateLead } from "../lib/scoring";
import { matchLocationToCountyCoverage } from "../lib/location-match";
import { countyFromLocationViaCensus } from "../lib/observation-autofill";
import {
  recordActivity,
  sendNotFound,
  sendValidationError,
  serializeLead,
} from "./utils";

const router: IRouter = Router();

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}


router.get("/leads", async (req, res) => {
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const conditions = [eq(leadsTable.ownerId, ownerId)];
  if (parsed.data.assetClass) {
    conditions.push(eq(leadsTable.assetClass, parsed.data.assetClass));
  }
  if (parsed.data.stage) {
    conditions.push(eq(leadsTable.stage, parsed.data.stage));
  }
  if (parsed.data.search) {
    const search = `%${parsed.data.search}%`;
    const searchCondition = or(
      ilike(leadsTable.title, search),
      ilike(leadsTable.location, search),
      ilike(leadsTable.source, search),
      ilike(leadsTable.distressSignal, search),
      ilike(leadsTable.contactName, search),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rows = await db
    .select()
    .from(leadsTable)
    .where(and(...conditions))
    .orderBy(desc(leadsTable.updatedAt));
  res.json(ListLeadsResponse.parse(rows.map(serializeLead)));
});

router.post("/leads", async (req, res) => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const body = parsed.data;
  if (!body.location?.trim()) {
    sendValidationError(
      res,
      "Add a lead location or jurisdiction.",
    );
    return;
  }
  let sourceName = "Manual operator entry";
  let sourceId: string | null = null;
  if (body.sourceId) {
    const [approvedSource] = await db
      .select({
        id: sourcesTable.id,
        name: sourcesTable.name,
        countyCoverage: sourcesTable.countyCoverage,
      })
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.id, body.sourceId),
          eq(sourcesTable.ownerId, ownerId),
          eq(sourcesTable.permissionStatus, "approved"),
        ),
      )
      .limit(1);
    if (!approvedSource) {
      sendValidationError(
        res,
        "Choose an approved source or use Manual operator entry.",
      );
      return;
    }
    let coverageMatch = matchLocationToCountyCoverage(
      body.location,
      approvedSource.countyCoverage,
    );
    if (!coverageMatch.matched) {
      const county = await countyFromLocationViaCensus(body.location);
      if (county) {
        const resolved = matchLocationToCountyCoverage(county, approvedSource.countyCoverage);
        if (resolved.matched) coverageMatch = resolved;
      }
    }
    if (!coverageMatch.matched) {
      sendValidationError(
        res,
        "The approved source does not cover the selected location. Register the county on the source or use Manual operator entry.",
      );
      return;
    }
    sourceName = approvedSource.name;
    sourceId = approvedSource.id;
  } else if (body.source !== "Manual operator entry") {
    sendValidationError(
      res,
      "Choose an approved source or use Manual operator entry.",
    );
    return;
  }
  const eventDate = body.eventDate ?? null;
  const evaluation = evaluateLead({
    ...body,
    source: sourceName,
    sourceId,
    estateAuthorityStatus: "unknown",
    eventDate,
    riskFlags: body.riskFlags ?? [],
    contactStatus: body.contactStatus ?? "unknown",
  });
  const [row] = await db
    .insert(leadsTable)
    .values({
      ...body,
      source: sourceName,
      sourceId,
      ownerId,
      eventDate,
      contactStatus: body.contactStatus ?? "unknown",
      contactName: body.contactName ?? null,
      contactEmail: body.contactEmail ?? null,
      contactPhone: body.contactPhone ?? null,
      currencyCode: body.currencyCode ?? "USD",
      riskFlags: body.riskFlags ?? [],
      businessSharePercent: body.businessSharePercent ?? null,
      resellableItemsFound: body.resellableItemsFound ?? null,
      evidenceUrl: body.evidenceUrl ?? null,
      ...evaluation,
    })
    .returning();
  if (!row) {
    res.status(500).json({ error: "The lead could not be created." });
    return;
  }

  await recordActivity(
    ownerId,
    "lead_created",
    "Lead captured",
    `${row.title} · ${row.assetClass.replaceAll("_", " ")}`,
    row.id,
  );
  res.status(201).json(CreateLeadResponse.parse(serializeLead(row)));
});

router.get("/leads/:id", async (req, res) => {
  const parsed = GetLeadParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, parsed.data.id), eq(leadsTable.ownerId, ownerId)))
    .limit(1);
  if (!row) {
    sendNotFound(res, "Lead");
    return;
  }
  res.json(GetLeadResponse.parse(serializeLead(row)));
});

router.patch("/leads/:id", async (req, res) => {
  const params = UpdateLeadParams.safeParse({ id: req.params.id });
  const parsed = UpdateLeadBody.safeParse(req.body);
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
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.id, params.data.id),
        eq(leadsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!existing) {
    sendNotFound(res, "Lead");
    return;
  }
  if (
    parsed.data.location !== undefined &&
    !parsed.data.location?.trim()
  ) {
    sendValidationError(
      res,
      "Add a lead location or jurisdiction.",
    );
    return;
  }

  const fields = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );
  const proposedSourceId =
    parsed.data.sourceId === undefined
      ? existing.sourceId
      : parsed.data.sourceId;
  const proposedSource =
    parsed.data.source === undefined ? existing.source : parsed.data.source;
  const proposedLocation = parsed.data.location ?? existing.location;
  const attributionChanged =
    proposedSourceId !== existing.sourceId ||
    proposedSource !== existing.source;
  const countyChanged =
    (matchLocationToCountyCoverage(proposedLocation, []).countyName ?? null) !==
    (matchLocationToCountyCoverage(existing.location, []).countyName ?? null);
  if (attributionChanged || (countyChanged && proposedSourceId !== null)) {
    if (proposedSourceId) {
      const [approvedSource] = await db
        .select({
          id: sourcesTable.id,
          name: sourcesTable.name,
          countyCoverage: sourcesTable.countyCoverage,
        })
        .from(sourcesTable)
        .where(
          and(
            eq(sourcesTable.id, proposedSourceId),
            eq(sourcesTable.ownerId, ownerId),
            eq(sourcesTable.permissionStatus, "approved"),
          ),
        )
        .limit(1);
      if (!approvedSource) {
        sendValidationError(
          res,
          "Choose an approved source or use Manual operator entry.",
        );
        return;
      }
      let editCoverageMatch = matchLocationToCountyCoverage(
        proposedLocation,
        approvedSource.countyCoverage,
      );
      if (!editCoverageMatch.matched) {
        const county = await countyFromLocationViaCensus(proposedLocation);
        if (county) {
          const resolved = matchLocationToCountyCoverage(county, approvedSource.countyCoverage);
          if (resolved.matched) editCoverageMatch = resolved;
        }
      }
      if (
        !editCoverageMatch.matched
      ) {
        sendValidationError(
          res,
          "The approved source does not cover the selected location. Register the county on the source or use Manual operator entry.",
        );
        return;
      }
      fields.sourceId = approvedSource.id;
      fields.source = approvedSource.name;
    } else if (proposedSource === "Manual operator entry") {
      fields.sourceId = null;
      fields.source = "Manual operator entry";
    } else {
      sendValidationError(
        res,
        "Choose an approved source or use Manual operator entry.",
      );
      return;
    }
  }
  const nextLead = {
    ...existing,
    ...fields,
  } as Lead;
  const evaluation = evaluateLead(nextLead);
  const [row] = await db
    .update(leadsTable)
    .set({
      ...fields,
      ...evaluation,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leadsTable.id, params.data.id),
        eq(leadsTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!row) {
    sendNotFound(res, "Lead");
    return;
  }

  await recordActivity(
    ownerId,
    "lead_updated",
    "Lead updated",
    `${row.title} · ${row.decision.replaceAll("_", " ")}`,
    row.id,
  );
  res.json(UpdateLeadResponse.parse(serializeLead(row)));
});

router.delete("/leads/:id", async (req, res) => {
  const parsed = DeleteLeadParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [row] = await db
    .delete(leadsTable)
    .where(and(eq(leadsTable.id, parsed.data.id), eq(leadsTable.ownerId, ownerId)))
    .returning({ id: leadsTable.id, title: leadsTable.title });
  if (!row) {
    sendNotFound(res, "Lead");
    return;
  }

  await recordActivity(
    ownerId,
    "lead_updated",
    "Lead removed",
    `${row.title} was removed from the workspace`,
    row.id,
  );
  res.status(204).end();
});

export default router;
