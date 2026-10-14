import {
  AddSourceReviewBody,
  AddSourceReviewParams,
  AddSourceReviewResponse,
  CreateSourceBody,
  CreateSourceResponse,
  ListLaunchSourcesResponse,
  ListSourceReviewsParams,
  ListSourceReviewsResponse,
  ListSourcesResponse,
  UpdateSourceBody,
  UpdateSourceParams,
  UpdateSourceResponse,
} from "@workspace/api-zod";
import {
  db,
  sourceReviewsTable,
  sourcesTable,
  type Source,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import { sendNotFound, sendValidationError } from "./utils";

const router: IRouter = Router();

function validationMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function sourceDetailsComplete(source: Source): boolean {
  return (
    source.name.trim().length > 0 &&
    source.sourceOwner.trim().length > 0 &&
    source.countyCoverage.length > 0 &&
    source.accessMethod.length > 0 &&
    source.costRateNotes.trim().length > 0 &&
    source.retentionNotes.trim().length > 0
  );
}

router.get("/sources", async (req, res): Promise<void> => {
  const ownerId = getOwnerId(req);
  const rows = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.ownerId, ownerId))
    .orderBy(desc(sourcesTable.updatedAt));

  res.json(ListSourcesResponse.parse(rows));
});

router.post("/sources", async (req, res): Promise<void> => {
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const body = parsed.data;
  if (
    !body.name.trim() ||
    !body.sourceOwner.trim() ||
    !body.countyCoverage.length ||
    !body.costRateNotes.trim() ||
    !body.retentionNotes.trim()
  ) {
    sendValidationError(
      res,
      "Complete the source owner, county coverage, access method, cost/rate limit, and retention notes.",
    );
    return;
  }

  const [row] = await db
    .insert(sourcesTable)
    .values({
      ...body,
      ownerId: getOwnerId(req),
      name: body.name.trim(),
      sourceOwner: body.sourceOwner.trim(),
      costRateNotes: body.costRateNotes.trim(),
      retentionNotes: body.retentionNotes.trim(),
      permissionStatus: "pending",
      permissionReviewerId: null,
      permissionReviewedAt: null,
      permissionReviewNotes: null,
    })
    .returning();

  if (!row) {
    res.status(500).json({ error: "The source could not be registered." });
    return;
  }

  res.status(201).json(CreateSourceResponse.parse(row));
});

router.patch("/sources/:id", async (req, res): Promise<void> => {
  const params = UpdateSourceParams.safeParse({ id: req.params.id });
  const parsed = UpdateSourceBody.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const changes = {
    ...parsed.data,
    ...(parsed.data.name === undefined
      ? {}
      : { name: parsed.data.name.trim() }),
    ...(parsed.data.sourceOwner === undefined
      ? {}
      : { sourceOwner: parsed.data.sourceOwner.trim() }),
    ...(parsed.data.costRateNotes === undefined
      ? {}
      : { costRateNotes: parsed.data.costRateNotes.trim() }),
    ...(parsed.data.retentionNotes === undefined
      ? {}
      : { retentionNotes: parsed.data.retentionNotes.trim() }),
  };
  if (
    (changes.name !== undefined && !changes.name) ||
    (changes.sourceOwner !== undefined && !changes.sourceOwner) ||
    (changes.costRateNotes !== undefined && !changes.costRateNotes) ||
    (changes.retentionNotes !== undefined && !changes.retentionNotes) ||
    (changes.countyCoverage !== undefined && !changes.countyCoverage.length)
  ) {
    sendValidationError(res, "Source details must not be blank.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.id, params.data.id),
          eq(sourcesTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!existing) return { row: null, resetReview: false };

    const changed = Object.entries(changes).some(([key, value]) => {
      const current = existing[key as keyof Source];
      return Array.isArray(value)
        ? JSON.stringify(value) !== JSON.stringify(current)
        : value !== current;
    });
    const resetReview = existing.permissionStatus === "approved" && changed;
    const updatedAt = new Date();
    const [row] = await tx
      .update(sourcesTable)
      .set({
        ...changes,
        ...(resetReview
          ? {
              permissionStatus: "pending" as const,
              permissionReviewerId: null,
              permissionReviewedAt: null,
              permissionReviewNotes: null,
            }
          : {}),
        updatedAt,
      })
      .where(
        and(
          eq(sourcesTable.id, params.data.id),
          eq(sourcesTable.ownerId, ownerId),
        ),
      )
      .returning();

    if (row && resetReview) {
      await tx.insert(sourceReviewsTable).values({
        sourceId: row.id,
        ownerId,
        previousStatus: "approved",
        status: "pending",
        reviewerId: ownerId,
        reviewedAt: updatedAt,
        reviewNotes:
          "Source details changed; prior permission approval was invalidated and must be reviewed again.",
      });
    }
    return { row: row ?? null, resetReview };
  });

  if (!result.row) {
    sendNotFound(res, "Source");
    return;
  }

  res.json(UpdateSourceResponse.parse(result.row));
});

router.get("/sources/:id/reviews", async (req, res): Promise<void> => {
  const params = ListSourceReviewsParams.safeParse({ id: req.params.id });
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }

  const ownerId = getOwnerId(req);
  const [source] = await db
    .select({ id: sourcesTable.id })
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

  const rows = await db
    .select()
    .from(sourceReviewsTable)
    .where(
      and(
        eq(sourceReviewsTable.sourceId, params.data.id),
        eq(sourceReviewsTable.ownerId, ownerId),
      ),
    )
    .orderBy(asc(sourceReviewsTable.reviewedAt), asc(sourceReviewsTable.id));

  res.json(ListSourceReviewsResponse.parse(rows));
});

router.post("/sources/:id/reviews", async (req, res): Promise<void> => {
  const params = AddSourceReviewParams.safeParse({ id: req.params.id });
  const parsed = AddSourceReviewBody.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  if (!parsed.data.reviewNotes.trim()) {
    sendValidationError(res, "Add a note explaining the permission and terms review.");
    return;
  }

  const ownerId = getOwnerId(req);
  const reviewedAt = new Date();
  const result = await db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.id, params.data.id),
          eq(sourcesTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!source) return { kind: "not_found" as const };
    if (parsed.data.status === "approved" && !sourceDetailsComplete(source)) {
      return { kind: "incomplete" as const };
    }

    const [review] = await tx
      .insert(sourceReviewsTable)
      .values({
        sourceId: source.id,
        ownerId,
        previousStatus: source.permissionStatus,
        status: parsed.data.status,
        reviewerId: ownerId,
        reviewedAt,
        reviewNotes: parsed.data.reviewNotes.trim(),
      })
      .returning();
    const [updated] = await tx
      .update(sourcesTable)
      .set({
        permissionStatus: parsed.data.status,
        permissionReviewerId: ownerId,
        permissionReviewedAt: reviewedAt,
        permissionReviewNotes: parsed.data.reviewNotes.trim(),
        updatedAt: reviewedAt,
      })
      .where(
        and(
          eq(sourcesTable.id, source.id),
          eq(sourcesTable.ownerId, ownerId),
        ),
      )
      .returning();
    if (!review || !updated) {
      throw new Error("The source review could not be saved.");
    }
    return { kind: "created" as const, review };
  });

  if (result.kind === "not_found") {
    sendNotFound(res, "Source");
    return;
  }
  if (result.kind === "incomplete") {
    sendValidationError(
      res,
      "A source cannot be approved until its owner, counties, access method, cost/rate limit, and retention notes are recorded.",
    );
    return;
  }

  res.status(201).json(AddSourceReviewResponse.parse(result.review));
});

router.get("/launch/sources", async (req, res): Promise<void> => {
  const ownerId = getOwnerId(req);
  const rows = await db
    .select()
    .from(sourcesTable)
    .where(
      and(
        eq(sourcesTable.ownerId, ownerId),
        eq(sourcesTable.permissionStatus, "approved"),
      ),
    )
    .orderBy(sourcesTable.name);

  res.json(ListLaunchSourcesResponse.parse(rows));
});

export default router;
