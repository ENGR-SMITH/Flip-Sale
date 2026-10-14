import {
  CreateJobBody,
  CreateJobResponse,
  DeleteJobParams,
  DeleteJobResponse,
  ListJobsQueryParams,
  ListJobsResponse,
  UpdateJobBody,
  UpdateJobParams,
  UpdateJobResponse,
} from "@workspace/api-zod";
import {
  db,
  jobsTable,
  leadsTable,
  workersTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import {
  recordActivity,
  sendNotFound,
  sendValidationError,
  serializeJob,
} from "./utils";

const router: IRouter = Router();

const allowedTransitions: Record<string, string[]> = {
  open: ["invited", "assigned", "cancelled"],
  invited: ["open", "assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function validCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    (latitude === null || latitude === undefined) ===
    (longitude === null || longitude === undefined)
  );
}

async function validateReferences(
  ownerId: string,
  values: {
    leadId?: string | null;
    workerId?: string | null;
    requiredSkills?: string[];
    latitude?: number | null;
    longitude?: number | null;
    status?: string;
    previousStatus?: string;
    previousWorkerId?: string | null;
  },
): Promise<string | null> {
  if (!validCoordinatePair(values.latitude, values.longitude)) {
    return "Enter both job coordinates or leave both blank.";
  }
  if (
    values.leadId &&
    !(await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.id, values.leadId),
          eq(leadsTable.ownerId, ownerId),
        ),
      )
      .limit(1))
      .length
  ) {
    return "The selected lead is not available in this workspace.";
  }

  const assignmentChanged =
    Boolean(values.workerId) &&
    (values.workerId !== values.previousWorkerId ||
      values.status === "assigned" && values.previousStatus !== "assigned");
  if (
    ["assigned", "in_progress"].includes(values.status ?? "") &&
    !values.workerId
  ) {
    return "Assign a worker before marking a job assigned or in progress.";
  }
  if (!values.workerId) return null;

  const [worker] = await db
    .select()
    .from(workersTable)
    .where(
      and(
        eq(workersTable.id, values.workerId),
        eq(workersTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!worker) {
    return "The selected worker is not available in this workspace.";
  }
  if (!assignmentChanged) return null;
  if (!worker.isAvailable) {
    return `${worker.displayName} is marked unavailable.`;
  }
  const requiredSkills = values.requiredSkills ?? [];
  const workerSkills = new Set(
    worker.skills.map((skill) => skill.trim().toLowerCase()),
  );
  const missingSkills = requiredSkills.filter(
    (skill) => !workerSkills.has(skill.trim().toLowerCase()),
  );
  if (missingSkills.length) {
    return `${worker.displayName} is missing required skills: ${missingSkills.join(", ")}.`;
  }
  if (
    worker.latitude !== null &&
    worker.longitude !== null &&
    values.latitude !== null &&
    values.latitude !== undefined &&
    values.longitude !== null &&
    values.longitude !== undefined
  ) {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latDelta = toRadians(values.latitude - worker.latitude);
    const lonDelta = toRadians(values.longitude - worker.longitude);
    const a =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(toRadians(worker.latitude)) *
        Math.cos(toRadians(values.latitude)) *
        Math.sin(lonDelta / 2) ** 2;
    const distanceKm =
      6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (distanceKm > worker.serviceRadiusKm) {
      return `${worker.displayName} is outside their service radius.`;
    }
  }
  return null;
}

async function workerNames(ownerId: string) {
  const workers = await db
    .select({ id: workersTable.id, displayName: workersTable.displayName })
    .from(workersTable)
    .where(eq(workersTable.ownerId, ownerId));
  return new Map(workers.map((worker) => [worker.id, worker.displayName]));
}

router.get("/jobs", async (req, res) => {
  const parsed = ListJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const conditions = [eq(jobsTable.ownerId, ownerId)];
  if (parsed.data.status) {
    conditions.push(eq(jobsTable.status, parsed.data.status));
  }
  if (parsed.data.leadId) {
    conditions.push(eq(jobsTable.leadId, parsed.data.leadId));
  }
  const [rows, names] = await Promise.all([
    db
      .select()
      .from(jobsTable)
      .where(and(...conditions))
      .orderBy(desc(jobsTable.updatedAt)),
    workerNames(ownerId),
  ]);
  res.json(
    ListJobsResponse.parse(
      rows.map((row) =>
        serializeJob(
          row,
          row.workerId ? names.get(row.workerId) ?? null : null,
        ),
      ),
    ),
  );
});

router.post("/jobs", async (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const body = parsed.data;
  if (body.payoutAmount !== null && body.payoutAmount !== undefined && !body.currencyCode) {
    sendValidationError(res, "Choose a currency for the job payout.");
    return;
  }
  const ownerId = getOwnerId(req);
  const referenceError = await validateReferences(ownerId, body);
  if (referenceError) {
    sendValidationError(res, referenceError);
    return;
  }
  const [row] = await db
    .insert(jobsTable)
    .values({
      ...body,
      ownerId,
      leadId: body.leadId ?? null,
      workerId: body.workerId ?? null,
      scheduledAt: body.scheduledAt ?? null,
      estimatedHours: body.estimatedHours ?? null,
      payoutAmount: body.payoutAmount ?? null,
      currencyCode: body.currencyCode ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
    })
    .returning();
  if (!row) {
    res.status(500).json({ error: "The job could not be created." });
    return;
  }
  await recordActivity(
    ownerId,
    "job_created",
    "Job scheduled",
    `${row.title} · ${row.location}`,
    row.leadId,
    row.id,
  );
  const names = await workerNames(ownerId);
  res.status(201).json(
    CreateJobResponse.parse(
      serializeJob(
        row,
        row.workerId ? names.get(row.workerId) ?? null : null,
      ),
    ),
  );
});

router.patch("/jobs/:id", async (req, res) => {
  const params = UpdateJobParams.safeParse({ id: req.params.id });
  const parsed = UpdateJobBody.safeParse(req.body);
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
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.id, params.data.id),
        eq(jobsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!existing) {
    sendNotFound(res, "Job");
    return;
  }

  const body = parsed.data;
  const next = { ...existing, ...body };
  if (
    body.payoutAmount !== undefined &&
    body.payoutAmount !== null &&
    (body.currencyCode === undefined
      ? !existing.currencyCode
      : !body.currencyCode)
  ) {
    sendValidationError(res, "Choose a currency for the job payout.");
    return;
  }
  if (
    body.currencyCode === null &&
    (body.payoutAmount ?? existing.payoutAmount) !== null
  ) {
    sendValidationError(res, "A payout amount must keep its currency code.");
    return;
  }
  if (
    body.status &&
    body.status !== existing.status &&
    !(allowedTransitions[existing.status] ?? []).includes(body.status)
  ) {
    sendValidationError(
      res,
      `A job cannot move from ${existing.status.replaceAll("_", " ")} to ${body.status.replaceAll("_", " ")}.`,
    );
    return;
  }

  const referenceError = await validateReferences(ownerId, {
    leadId: next.leadId,
    workerId: next.workerId,
    requiredSkills: next.requiredSkills,
    latitude: next.latitude,
    longitude: next.longitude,
    status: next.status,
    previousStatus: existing.status,
    previousWorkerId: existing.workerId,
  });
  if (referenceError) {
    sendValidationError(res, referenceError);
    return;
  }
  const fields = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
  const [row] = await db
    .update(jobsTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(
      and(
        eq(jobsTable.id, params.data.id),
        eq(jobsTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!row) {
    sendNotFound(res, "Job");
    return;
  }
  await recordActivity(
    ownerId,
    "job_updated",
    "Job updated",
    `${row.title} · ${row.status.replaceAll("_", " ")}`,
    row.leadId,
    row.id,
  );
  const names = await workerNames(ownerId);
  res.json(
    UpdateJobResponse.parse(
      serializeJob(
        row,
        row.workerId ? names.get(row.workerId) ?? null : null,
      ),
    ),
  );
});

router.delete("/jobs/:id", async (req, res) => {
  const parsed = DeleteJobParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [row] = await db
    .delete(jobsTable)
    .where(
      and(
        eq(jobsTable.id, parsed.data.id),
        eq(jobsTable.ownerId, ownerId),
      ),
    )
    .returning({
      id: jobsTable.id,
      title: jobsTable.title,
      leadId: jobsTable.leadId,
    });
  if (!row) {
    sendNotFound(res, "Job");
    return;
  }
  await recordActivity(
    ownerId,
    "job_updated",
    "Job removed",
    `${row.title} was removed from the board`,
    row.leadId,
    row.id,
  );
  res.status(204).json(DeleteJobResponse.parse(undefined));
});

export default router;
