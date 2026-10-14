import {
  CreateClientServiceRequestBody,
  CreateClientServiceRequestResponse,
  ListClientServiceRequestsQueryParams,
  ListClientServiceRequestsResponse,
  UpdateClientServiceRequestBody,
  UpdateClientServiceRequestParams,
  UpdateClientServiceRequestResponse,
} from "@workspace/api-zod";
import { clientServiceRequestsTable, db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { sendNotFound, sendValidationError } from "./utils";

const publicRouter: IRouter = Router();
const operatorRouter: IRouter = Router();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;

function validationMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function canSubmitFromRequest(req: Request): boolean {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    if (requestWindows.size > 2_000) {
      for (const [ip, window] of requestWindows) {
        if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(ip);
      }
    }
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

publicRouter.post("/client/requests", async (req, res): Promise<void> => {
  if (!canSubmitFromRequest(req)) {
    res.status(429).json({
      error: "Please wait before submitting another service request.",
    });
    return;
  }
  const parsed = CreateClientServiceRequestBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const body = parsed.data;
  const [row] = await db
    .insert(clientServiceRequestsTable)
    .values({
      ...body,
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      jobLocation: body.jobLocation.trim(),
      description: body.description.trim(),
      preferredDate: body.preferredDate
        ? body.preferredDate.toISOString().slice(0, 10)
        : null,
      consentToContact: true,
    })
    .returning({
      id: clientServiceRequestsTable.id,
      createdAt: clientServiceRequestsTable.createdAt,
    });

  if (!row) {
    res.status(500).json({ error: "The service request could not be saved." });
    return;
  }
  res.status(201).json(
    CreateClientServiceRequestResponse.parse({
      requestId: row.id,
      submittedAt: row.createdAt,
      message:
        "Your request has been received. The team will review the details and contact you.",
    }),
  );
});

operatorRouter.get("/client/requests", async (req, res): Promise<void> => {
  const parsed = ListClientServiceRequestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const rows = await db
    .select()
    .from(clientServiceRequestsTable)
    .where(
      parsed.data.status
        ? eq(clientServiceRequestsTable.status, parsed.data.status)
        : undefined,
    )
    .orderBy(desc(clientServiceRequestsTable.createdAt));
  res.json(ListClientServiceRequestsResponse.parse(rows));
});

operatorRouter.patch(
  "/client/requests/:id",
  async (req, res): Promise<void> => {
    const params = UpdateClientServiceRequestParams.safeParse({
      id: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    });
    const parsed = UpdateClientServiceRequestBody.safeParse(req.body);
    if (!params.success) {
      sendValidationError(res, validationMessage(params.error));
      return;
    }
    if (!parsed.success) {
      sendValidationError(res, validationMessage(parsed.error));
      return;
    }
    const [row] = await db
      .update(clientServiceRequestsTable)
      .set({
        ...parsed.data,
        operatorNote:
          parsed.data.operatorNote === undefined
            ? undefined
            : parsed.data.operatorNote?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientServiceRequestsTable.id, params.data.id))
      .returning();
    if (!row) {
      sendNotFound(res, "Service request");
      return;
    }
    res.json(UpdateClientServiceRequestResponse.parse(row));
  },
);

export { operatorRouter as clientServiceRequestsOperatorRouter };
export { publicRouter as publicClientServiceRequestsRouter };
