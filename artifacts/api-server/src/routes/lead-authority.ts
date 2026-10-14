import {
  AddEstateAuthorityReviewBody,
  AddEstateAuthorityReviewParams,
  AddEstateAuthorityReviewResponse,
  ListEstateAuthorityReviewsParams,
  ListEstateAuthorityReviewsResponse,
} from "@workspace/api-zod";
import {
  db,
  estateAuthorityReviewsTable,
  leadsTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import { evaluateLead } from "../lib/scoring";
import { sendNotFound, sendValidationError } from "./utils";

const router: IRouter = Router();

function validationMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

router.get(
  "/leads/:id/authority-reviews",
  async (req, res): Promise<void> => {
    const params = ListEstateAuthorityReviewsParams.safeParse({
      id: req.params.id,
    });
    if (!params.success) {
      sendValidationError(res, validationMessage(params.error));
      return;
    }

    const ownerId = getOwnerId(req);
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.id, params.data.id),
          eq(leadsTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!lead) {
      sendNotFound(res, "Lead");
      return;
    }

    const reviews = await db
      .select()
      .from(estateAuthorityReviewsTable)
      .where(
        and(
          eq(estateAuthorityReviewsTable.leadId, params.data.id),
          eq(estateAuthorityReviewsTable.ownerId, ownerId),
        ),
      )
      .orderBy(
        asc(estateAuthorityReviewsTable.reviewedAt),
        asc(estateAuthorityReviewsTable.id),
      );

    res.json(ListEstateAuthorityReviewsResponse.parse(reviews));
  },
);

router.post(
  "/leads/:id/authority-reviews",
  async (req, res): Promise<void> => {
    const params = AddEstateAuthorityReviewParams.safeParse({
      id: req.params.id,
    });
    const parsed = AddEstateAuthorityReviewBody.safeParse(req.body);
    if (!params.success) {
      sendValidationError(res, validationMessage(params.error));
      return;
    }
    if (!parsed.success) {
      sendValidationError(res, validationMessage(parsed.error));
      return;
    }

    const evidenceRef = parsed.data.evidenceRef?.trim() || null;
    const reviewNotes = parsed.data.reviewNotes.trim();
    if (
      !reviewNotes ||
      (parsed.data.status !== "unknown" && !evidenceRef)
    ) {
      sendValidationError(
        res,
        "Verified or rejected authority requires an evidence reference and every review requires notes.",
      );
      return;
    }

    const ownerId = getOwnerId(req);
    const reviewedAt = new Date();
    const result = await db.transaction(async (tx) => {
      const [lead] = await tx
        .select()
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.id, params.data.id),
            eq(leadsTable.ownerId, ownerId),
          ),
        )
        .limit(1);
      if (!lead) return { kind: "not_found" as const };
      if (lead.assetClass !== "estate") {
        return { kind: "not_estate" as const };
      }

      const evaluation = evaluateLead({
        ...lead,
        estateAuthorityStatus: parsed.data.status,
      });
      const [updatedLead] = await tx
        .update(leadsTable)
        .set({
          estateAuthorityStatus: parsed.data.status,
          estateAuthorityEvidenceRef: evidenceRef,
          estateAuthorityReviewerId: ownerId,
          estateAuthorityReviewedAt: reviewedAt,
          ...evaluation,
          updatedAt: reviewedAt,
        })
        .where(
          and(
            eq(leadsTable.id, lead.id),
            eq(leadsTable.ownerId, ownerId),
          ),
        )
        .returning({ id: leadsTable.id });
      const [review] = await tx
        .insert(estateAuthorityReviewsTable)
        .values({
          leadId: lead.id,
          ownerId,
          previousStatus: lead.estateAuthorityStatus,
          status: parsed.data.status,
          evidenceRef,
          reviewerId: ownerId,
          reviewedAt,
          reviewNotes,
        })
        .returning();
      if (!updatedLead || !review) {
        throw new Error("The estate authority review could not be saved.");
      }
      return { kind: "created" as const, review };
    });

    if (result.kind === "not_found") {
      sendNotFound(res, "Lead");
      return;
    }
    if (result.kind === "not_estate") {
      sendValidationError(
        res,
        "Estate authority review applies only to estate/probate leads.",
      );
      return;
    }

    res.status(201).json(AddEstateAuthorityReviewResponse.parse(result.review));
  },
);

export default router;
