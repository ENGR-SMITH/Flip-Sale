import {
  AddLeadEvidenceBody,
  AddLeadEvidenceParams,
  AddLeadEvidenceResponse,
  ListLeadEvidenceParams,
  ListLeadEvidenceResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  leadEvidenceTable,
  leadsTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
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

async function hasOwnedLead(leadId: string, ownerId: string): Promise<boolean> {
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, ownerId)))
    .limit(1);

  return Boolean(lead);
}

router.get("/leads/:id/evidence", async (req, res): Promise<void> => {
  const params = ListLeadEvidenceParams.safeParse({ id: req.params.id });
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }

  const ownerId = getOwnerId(req);
  if (!(await hasOwnedLead(params.data.id, ownerId))) {
    sendNotFound(res, "Lead");
    return;
  }

  const rows = await db
    .select()
    .from(leadEvidenceTable)
    .where(
      and(
        eq(leadEvidenceTable.leadId, params.data.id),
        eq(leadEvidenceTable.ownerId, ownerId),
      ),
    )
    .orderBy(asc(leadEvidenceTable.observedAt), asc(leadEvidenceTable.createdAt));

  res.json(ListLeadEvidenceResponse.parse(rows));
});

router.post("/leads/:id/evidence", async (req, res): Promise<void> => {
  const params = AddLeadEvidenceParams.safeParse({ id: req.params.id });
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }

  const parsed = AddLeadEvidenceBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  if (!(await hasOwnedLead(params.data.id, ownerId))) {
    sendNotFound(res, "Lead");
    return;
  }

  const data = parsed.data;
  const evidence = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(leadEvidenceTable)
      .values({
        ...data,
        leadId: params.data.id,
        ownerId,
        observedAt: new Date(data.observedAt),
      })
      .returning();

    if (!row) {
      throw new Error("The evidence record could not be created.");
    }

    await tx.insert(activityTable).values({
      ownerId,
      kind: "evidence_added",
      title: "Evidence recorded",
      detail: `${row.sourceName} · ${row.sourceType.replaceAll("_", " ")}`,
      leadId: params.data.id,
    });

    return row;
  });

  res.status(201).json(AddLeadEvidenceResponse.parse(evidence));
});

export default router;
