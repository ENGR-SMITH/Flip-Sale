import {
  CreateWorkerBody,
  CreateWorkerResponse,
  DeleteWorkerParams,
  ListWorkersQueryParams,
  ListWorkersResponse,
  UpdateWorkerBody,
  UpdateWorkerParams,
  UpdateWorkerResponse,
} from "@workspace/api-zod";
import { db, jobsTable, workersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getOwnerId } from "../middlewares/requireAuth";
import {
  recordActivity,
  sendNotFound,
  sendValidationError,
  serializeWorker,
} from "./utils";

const router: IRouter = Router();

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
}

function matchingDetails(
  worker: typeof workersTable.$inferSelect,
  job: typeof jobsTable.$inferSelect,
) {
  const locationConfigured =
    worker.latitude !== null &&
    worker.longitude !== null &&
    job.latitude !== null &&
    job.longitude !== null;
  let distanceKm: number | null = null;
  let withinServiceRadius: boolean | null = null;
  const matchReasons: string[] = [];

  if (locationConfigured) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latDelta = radians(job.latitude! - worker.latitude!);
    const lonDelta = radians(job.longitude! - worker.longitude!);
    const haversine =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(radians(worker.latitude!)) *
        Math.cos(radians(job.latitude!)) *
        Math.sin(lonDelta / 2) ** 2;
    distanceKm =
      Math.round(
        6371 *
          2 *
          Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) *
          10,
      ) / 10;
    withinServiceRadius = distanceKm <= worker.serviceRadiusKm;
  } else {
    matchReasons.push("Location unavailable; confirm service area manually");
  }

  const workerSkills = new Set(worker.skills.map((skill) => skill.trim().toLowerCase()));
  const missingSkills = job.requiredSkills.filter(
    (skill) => !workerSkills.has(skill.trim().toLowerCase()),
  );
  const skillsMatch = missingSkills.length === 0;
  if (!skillsMatch) {
    matchReasons.push(`Missing skills: ${missingSkills.join(", ")}`);
  } else {
    matchReasons.push("Required skills matched");
  }
  if (!worker.isAvailable) matchReasons.push("Worker is unavailable");
  if (withinServiceRadius === false) matchReasons.push("Outside service radius");
  if (withinServiceRadius === true) matchReasons.push("Inside service radius");

  return {
    distanceKm,
    withinServiceRadius,
    eligibleForJob:
      worker.isAvailable &&
      skillsMatch &&
      withinServiceRadius === true,
    matchReasons,
  };
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

router.get("/workers", async (req, res) => {
  const availableParam =
    typeof req.query.available === "string" ? req.query.available : undefined;
  if (
    availableParam !== undefined &&
    availableParam !== "true" &&
    availableParam !== "false"
  ) {
    sendValidationError(res, "available must be true or false.");
    return;
  }
  const jobIdParam = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
  const parsed = ListWorkersQueryParams.safeParse({
    ...(availableParam ? { available: availableParam === "true" } : {}),
    ...(jobIdParam ? { jobId: jobIdParam } : {}),
  });
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }

  const ownerId = getOwnerId(req);
  let job: typeof jobsTable.$inferSelect | undefined;
  if (parsed.data.jobId) {
    [job] = await db
      .select()
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.id, parsed.data.jobId),
          eq(jobsTable.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!job) {
      sendNotFound(res, "Job");
      return;
    }
  }

  const conditions = [eq(workersTable.ownerId, ownerId)];
  if (parsed.data.available !== undefined) {
    conditions.push(eq(workersTable.isAvailable, parsed.data.available));
  }
  const rows = await db
    .select()
    .from(workersTable)
    .where(and(...conditions))
    .orderBy(desc(workersTable.updatedAt));

  const result = rows.map((worker) => {
    const match = job ? matchingDetails(worker, job) : undefined;
    return { worker, match };
  });
  if (job) {
    result.sort((left, right) => {
      const eligibility =
        Number(right.match?.eligibleForJob ?? false) -
        Number(left.match?.eligibleForJob ?? false);
      if (eligibility !== 0) return eligibility;
      const distance =
        (left.match?.distanceKm ?? Number.POSITIVE_INFINITY) -
        (right.match?.distanceKm ?? Number.POSITIVE_INFINITY);
      if (Number.isFinite(distance) && distance !== 0) return distance;
      return left.worker.displayName.localeCompare(right.worker.displayName);
    });
  }
  res.json(
    ListWorkersResponse.parse(
      result.map(({ worker, match }) => serializeWorker(worker, match)),
    ),
  );
});

router.post("/workers", async (req, res) => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  if (!validCoordinatePair(parsed.data.latitude, parsed.data.longitude)) {
    sendValidationError(res, "Enter both worker coordinates or leave both blank.");
    return;
  }

  const ownerId = getOwnerId(req);
  const [row] = await db
    .insert(workersTable)
    .values({ ...parsed.data, ownerId })
    .returning();
  if (!row) {
    res.status(500).json({ error: "The worker could not be created." });
    return;
  }
  await recordActivity(
    ownerId,
    "lead_updated",
    "Worker profile added",
    `${row.displayName} · ${row.homeArea}`,
  );
  res.status(201).json(
    CreateWorkerResponse.parse(serializeWorker(row)),
  );
});

router.patch("/workers/:id", async (req, res) => {
  const params = UpdateWorkerParams.safeParse({ id: req.params.id });
  const parsed = UpdateWorkerBody.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, validationMessage(params.error));
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  if (!validCoordinatePair(parsed.data.latitude, parsed.data.longitude)) {
    sendValidationError(res, "Enter both worker coordinates or leave both blank.");
    return;
  }

  const ownerId = getOwnerId(req);
  const fields = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );
  const [row] = await db
    .update(workersTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(
      and(
        eq(workersTable.id, params.data.id),
        eq(workersTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!row) {
    sendNotFound(res, "Worker");
    return;
  }
  await recordActivity(
    ownerId,
    "lead_updated",
    "Worker profile updated",
    `${row.displayName} · ${row.isAvailable ? "available" : "unavailable"}`,
  );
  res.json(
    UpdateWorkerResponse.parse(serializeWorker(row)),
  );
});

router.delete("/workers/:id", async (req, res) => {
  const parsed = DeleteWorkerParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    sendValidationError(res, validationMessage(parsed.error));
    return;
  }
  const ownerId = getOwnerId(req);
  const [row] = await db
    .delete(workersTable)
    .where(
      and(
        eq(workersTable.id, parsed.data.id),
        eq(workersTable.ownerId, ownerId),
      ),
    )
    .returning({ id: workersTable.id, displayName: workersTable.displayName });
  if (!row) {
    sendNotFound(res, "Worker");
    return;
  }
  await recordActivity(
    ownerId,
    "lead_updated",
    "Worker profile removed",
    `${row.displayName} was removed from the crew list`,
  );
  res.status(204).end();
});

export default router;
