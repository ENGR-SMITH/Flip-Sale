import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  and,
  asc,
  eq,
  inArray,
  lte,
} from "drizzle-orm";
import {
  db,
  sourceObservationsTable,
  sourceRunsTable,
  sourcesTable,
  type Source,
  type SourceRun,
} from "@workspace/db";
import { logger } from "./logger";
import {
  feedItemToObservationInput,
  readPublicSourceFeed,
} from "./authorized-source-feed";

const APIFY_API = "https://api.apify.com/v2";
const ALLOWED_ACTORS = new Set([
  "apify/website-content-crawler",
  "apify/web-scraper",
]);
const MAX_SUMMARY_LENGTH = 1200;
const activeLaunches = new Set<string>();
const refreshesInFlight = new Map<string, Promise<SourceRun>>();

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function sourceUrl(source: Source): URL {
  if (!source.sourceUrl) {
    throw new Error("Add a public source URL before enabling collection.");
  }

  let parsed: URL;
  try {
    parsed = new URL(source.sourceUrl);
  } catch {
    throw new Error("The source URL is not valid.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    isIP(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Collection only supports public HTTPS website URLs.");
  }
  if (
    Array.from(parsed.searchParams.keys()).some((key) =>
      /(?:api[_-]?key|access[_-]?token|authorization|credential|password|secret|signature|^auth$|^key$|^sig$|^token$)/i.test(
        key,
      ),
    )
  ) {
    throw new Error(
      "Do not put credentials in source URLs. This collector only supports public endpoints.",
    );
  }

  return parsed;
}

export function assertSourceCanBeCollected(source: Source): void {
  if (source.permissionStatus !== "approved") {
    throw new Error("Review and approve this source before collecting it.");
  }
  sourceUrl(source);

  if (source.accessMethod === "approved_scraping_provider") {
    if (!source.apifyActorId || !ALLOWED_ACTORS.has(source.apifyActorId)) {
      throw new Error("Select one of the supported Apify actors for this source.");
    }
    return;
  }

  if (
    source.accessMethod === "authorized_feed" ||
    source.accessMethod === "api"
  ) {
    return;
  }

  throw new Error(
    "Collection supports approved feeds, public JSON APIs, or the approved scraping-provider method.",
  );
}

export function apifyIsConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}

function safeActorInput(source: Source): JsonRecord {
  const url = sourceUrl(source);
  const pathPrefix = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  const safePageLimit = Math.max(1, Math.min(source.collectionMaxPages, 100));

  if (source.apifyActorId === "apify/website-content-crawler") {
    return {
      startUrls: [{ url: url.toString() }],
      includeUrlGlobs: [`${url.origin}${pathPrefix}**`],
      maxCrawlDepth: safePageLimit === 1 ? 0 : 1,
      maxCrawlPages: safePageLimit,
      maxConcurrency: 1,
      crawlerType: "playwright:adaptive",
      respectRobotsTxtFile: true,
      useSitemaps: false,
    };
  }

  return {
    startUrls: [{ url: url.toString() }],
    maxPagesPerCrawl: 1,
    pageFunction: `async function pageFunction(context) {
      const { request, $ } = context;
      const text = $("body").text().replace(/\\\\s+/g, " ").trim();
      return {
        url: request.url,
        title: $("title").text().trim(),
        text: text.slice(0, 12000),
      };
    }`,
    proxyConfiguration: { useApifyProxy: true },
  };
}

async function apifyFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${APIFY_API}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  let message = "";
  try {
    const parsed = asRecord(JSON.parse(body));
    message = stringValue(asRecord(parsed.error).message, parsed.message) ?? "";
  } catch {
    message = body;
  }
  const safeMessage = message.replace(/https?:\/\/\S+/gi, "[external URL]");
  return new Error(
    `Apify returned ${response.status}${safeMessage ? `: ${safeMessage.slice(0, 240)}` : ""}`,
  );
}

function actorApiPath(actorId: string): string {
  return `/actors/${encodeURIComponent(actorId.replace("/", "~"))}`;
}

function nextCollectionDate(source: Source, from = new Date()): Date {
  return new Date(from.getTime() + source.collectionIntervalHours * 60 * 60 * 1000);
}

async function advanceSchedule(source: Source): Promise<void> {
  const [current] = await db
    .select({
      collectionEnabled: sourcesTable.collectionEnabled,
      collectionIntervalHours: sourcesTable.collectionIntervalHours,
    })
    .from(sourcesTable)
    .where(eq(sourcesTable.id, source.id))
    .limit(1);
  if (!current) return;

  const now = new Date();
  await db
    .update(sourcesTable)
    .set({
      lastCollectedAt: now,
      nextCollectionAt: current.collectionEnabled
        ? new Date(
            now.getTime() + current.collectionIntervalHours * 60 * 60 * 1000,
          )
        : null,
      updatedAt: now,
    })
    .where(eq(sourcesTable.id, source.id));
}

async function markRunFailed(
  run: SourceRun,
  source: Source,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Source collection failed.";
  const safeMessage = message.slice(0, 500);
  await db
    .update(sourceRunsTable)
    .set({
      status: "failed",
      errorSummary: safeMessage,
      completedAt: new Date(),
    })
    .where(and(eq(sourceRunsTable.id, run.id), eq(sourceRunsTable.ownerId, run.ownerId)));
  await advanceSchedule(source);
  logger.warn(
    { runId: run.id, sourceId: source.id, message: safeMessage },
    "Source collection run failed",
  );
}

async function startActorRun(run: SourceRun, source: Source): Promise<void> {
  try {
    assertSourceCanBeCollected(source);
    const actorId = source.apifyActorId;
    if (!actorId) throw new Error("Select an Apify actor for this source.");
    const response = await apifyFetch(`${actorApiPath(actorId)}/runs`, {
      method: "POST",
      body: JSON.stringify(safeActorInput(source)),
    });
    if (!response.ok) throw await responseError(response);

    const payload = asRecord(await response.json());
    const data = asRecord(payload.data);
    const providerRunId = stringValue(data.id);
    const datasetId = stringValue(data.defaultDatasetId);
    if (!providerRunId || !datasetId) {
      throw new Error("Apify did not return a run ID and output dataset.");
    }

    await db
      .update(sourceRunsTable)
      .set({
        providerRunId,
        datasetId,
        status: "running",
        errorSummary: null,
      })
      .where(and(eq(sourceRunsTable.id, run.id), eq(sourceRunsTable.ownerId, run.ownerId)));
  } catch (error) {
    await markRunFailed(run, source, error);
  } finally {
    activeLaunches.delete(source.id);
  }
}

async function startFeedRun(run: SourceRun, source: Source): Promise<void> {
  try {
    assertSourceCanBeCollected(source);
    await db
      .update(sourceRunsTable)
      .set({ status: "running" })
      .where(
        and(
          eq(sourceRunsTable.id, run.id),
          eq(sourceRunsTable.ownerId, run.ownerId),
        ),
      );
    const result = await readPublicSourceFeed(source);
    const inserts = result.items.flatMap((item) =>
      normalizedObservation(
        feedItemToObservationInput(item, source.sourceUrl ?? ""),
        source,
        run.id,
      ),
    );

    let observationsAdded = 0;
    for (let offset = 0; offset < inserts.length; offset += 50) {
      const inserted = await db
        .insert(sourceObservationsTable)
        .values(inserts.slice(offset, offset + 50))
        .onConflictDoNothing()
        .returning({ id: sourceObservationsTable.id });
      observationsAdded += inserted.length;
    }

    const collectorId =
      source.accessMethod === "api"
        ? `public-api/${result.format}`
        : `authorized-feed/${result.format}`;
    await db
      .update(sourceRunsTable)
      .set({
        actorId: collectorId,
        status: "succeeded",
        itemsFound: result.items.length,
        observationsAdded,
        completedAt: new Date(),
        errorSummary: null,
      })
      .where(
        and(
          eq(sourceRunsTable.id, run.id),
          eq(sourceRunsTable.ownerId, run.ownerId),
        ),
      );
    await advanceSchedule(source);
  } catch (error) {
    await markRunFailed(run, source, error);
  } finally {
    activeLaunches.delete(source.id);
  }
}

export async function enqueueSourceRun(
  source: Source,
  ownerId: string,
): Promise<SourceRun | null> {
  assertSourceCanBeCollected(source);
  if (
    source.accessMethod === "approved_scraping_provider" &&
    !apifyIsConfigured()
  ) {
    throw new Error("APIFY_API_TOKEN is not configured.");
  }
  if (activeLaunches.has(source.id)) return null;

  const [activeRun] = await db
    .select({ id: sourceRunsTable.id })
    .from(sourceRunsTable)
    .where(
      and(
        eq(sourceRunsTable.sourceId, source.id),
        eq(sourceRunsTable.ownerId, ownerId),
        inArray(sourceRunsTable.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  if (activeRun) return null;

  const [run] = await db
    .insert(sourceRunsTable)
    .values({
      ownerId,
      sourceId: source.id,
      sourceName: source.name,
      actorId:
        source.accessMethod === "approved_scraping_provider"
          ? source.apifyActorId!
          : source.accessMethod === "api"
            ? "public-api"
            : "authorized-feed",
      status: "queued",
      startedAt: new Date(),
    })
    .returning();
  if (!run) {
    throw new Error("The collection run could not be created.");
  }

  activeLaunches.add(source.id);
  const now = new Date();
  await db
    .update(sourcesTable)
    .set({
      lastCollectedAt: now,
      nextCollectionAt: source.collectionEnabled
        ? nextCollectionDate(source, now)
        : null,
      updatedAt: now,
    })
    .where(and(eq(sourcesTable.id, source.id), eq(sourcesTable.ownerId, ownerId)));

  if (source.accessMethod === "approved_scraping_provider") {
    void startActorRun(run, source);
  } else {
    void startFeedRun(run, source);
  }
  return run;
}

function redactContactDetails(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(
      /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\d)/g,
      "[phone removed]",
    )
    .replace(/(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 15
        ? "[phone removed]"
        : candidate;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedObservation(
  raw: unknown,
  source: Source,
  runId: string,
): (typeof sourceObservationsTable.$inferInsert)[] {
  const item = asRecord(raw);
  const metadata = asRecord(item.metadata);
  const publishedMeta = asRecord(item.datePublished);
  const title =
    stringValue(item.title, metadata.title, item.pageTitle) ?? "Untitled page";
  const rawSummary = stringValue(
    item.text,
    item.markdown,
    item.cleanText,
    item.content,
    metadata.description,
  );
  if (!rawSummary) return [];

  const summary = redactContactDetails(rawSummary).slice(0, MAX_SUMMARY_LENGTH);
  if (!summary) return [];

  let observedUrl = source.sourceUrl!;
  const candidateUrl = stringValue(item.url, item.loadedUrl);
  if (candidateUrl) {
    try {
      const candidate = new URL(candidateUrl);
      const base = sourceUrl(source);
      if (
        candidate.protocol !== "https:" ||
        candidate.username ||
        candidate.password ||
        candidate.hostname !== base.hostname
      ) {
        return [];
      }
      observedUrl = candidate.toString();
    } catch {
      return [];
    }
  }

  const publishedValue = stringValue(
    item.publishedAt,
    item.date,
    item.datePublished,
    publishedMeta.value,
    metadata.publishedTime,
    metadata.date,
  );
  const publishedDate = publishedValue ? new Date(publishedValue) : null;
  const publishedAt =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate
      : null;
  const fingerprint = createHash("sha256")
    .update(`${observedUrl}\n${title}\n${summary}`)
    .digest("hex");
  const classes = source.assetClasses.filter((value) =>
    ["storage", "real_estate", "estate", "commercial", "junk", "package"].includes(
      value,
    ),
  );

  return classes.map((assetClass) => ({
    ownerId: source.ownerId,
    sourceId: source.id,
    sourceName: source.name,
    runId,
    assetClass,
    title: title.slice(0, 500),
    observedUrl,
    fingerprint,
    summary,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    publishedAt,
  }));
}

async function importDataset(
  source: Source,
  run: SourceRun,
): Promise<{ itemsFound: number; observationsAdded: number }> {
  if (!run.datasetId) {
    throw new Error("The Apify run has no output dataset.");
  }
  const response = await apifyFetch(
    `/datasets/${encodeURIComponent(run.datasetId)}/items?clean=true&format=json&limit=${Math.min(source.collectionMaxPages, 100)}`,
  );
  if (!response.ok) throw await responseError(response);
  const items: unknown = await response.json();
  if (!Array.isArray(items)) {
    throw new Error("Apify returned an unexpected dataset format.");
  }

  const inserts = items.flatMap((item) =>
    normalizedObservation(item, source, run.id),
  );
  let observationsAdded = 0;
  for (let offset = 0; offset < inserts.length; offset += 50) {
    const batch = inserts.slice(offset, offset + 50);
    const inserted = await db
      .insert(sourceObservationsTable)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: sourceObservationsTable.id });
    observationsAdded += inserted.length;
  }
  return { itemsFound: items.length, observationsAdded };
}

async function refreshRun(
  run: SourceRun,
  source: Source,
): Promise<SourceRun> {
  if (
    !run.providerRunId ||
    run.status === "succeeded" ||
    run.status === "failed"
  ) {
    return run;
  }

  const response = await apifyFetch(
    `/actor-runs/${encodeURIComponent(run.providerRunId)}`,
  );
  if (!response.ok) throw await responseError(response);
  const payload = asRecord(await response.json());
  const data = asRecord(payload.data);
  const status = stringValue(data.status)?.toUpperCase() ?? "RUNNING";

  if (status === "SUCCEEDED") {
    const result = await importDataset(source, run);
    const completedAt = new Date();
    const [updated] = await db
      .update(sourceRunsTable)
      .set({
        status: "succeeded",
        itemsFound: result.itemsFound,
        observationsAdded: result.observationsAdded,
        completedAt,
        errorSummary: null,
      })
      .where(
        and(
          eq(sourceRunsTable.id, run.id),
          eq(sourceRunsTable.ownerId, run.ownerId),
        ),
      )
      .returning();
    await advanceSchedule(source);
    return updated ?? run;
  }

  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    const message =
      stringValue(data.statusMessage) ?? `Apify run ended with ${status}.`;
    await markRunFailed(run, source, new Error(message));
    const [updated] = await db
      .select()
      .from(sourceRunsTable)
      .where(
        and(
          eq(sourceRunsTable.id, run.id),
          eq(sourceRunsTable.ownerId, run.ownerId),
        ),
      )
      .limit(1);
    return updated ?? run;
  }

  const [updated] = await db
    .update(sourceRunsTable)
    .set({ status: "running" })
    .where(
      and(
        eq(sourceRunsTable.id, run.id),
        eq(sourceRunsTable.ownerId, run.ownerId),
      ),
    )
    .returning();
  return updated ?? run;
}

export async function refreshApifyRun(
  run: SourceRun,
  source: Source,
): Promise<SourceRun> {
  const inFlight = refreshesInFlight.get(run.id);
  if (inFlight) return inFlight;

  const task = refreshRun(run, source).catch(async (error: unknown) => {
    await markRunFailed(run, source, error);
    const [updated] = await db
      .select()
      .from(sourceRunsTable)
      .where(
        and(
          eq(sourceRunsTable.id, run.id),
          eq(sourceRunsTable.ownerId, run.ownerId),
        ),
      )
      .limit(1);
    return updated ?? run;
  });
  refreshesInFlight.set(run.id, task);
  try {
    return await task;
  } finally {
    refreshesInFlight.delete(run.id);
  }
}

let scheduler: NodeJS.Timeout | undefined;

export function startSourceCollectionScheduler(): void {
  if (scheduler) return;

  const tick = async (): Promise<void> => {
    try {
      const running = await db
        .select({ run: sourceRunsTable, source: sourcesTable })
        .from(sourceRunsTable)
        .innerJoin(sourcesTable, eq(sourceRunsTable.sourceId, sourcesTable.id))
        .where(inArray(sourceRunsTable.status, ["queued", "running"]))
        .orderBy(asc(sourceRunsTable.createdAt))
        .limit(8);
      for (const item of running) {
        await refreshApifyRun(item.run, item.source);
      }

      const dueSources = await db
        .select()
        .from(sourcesTable)
        .where(
          and(
            eq(sourcesTable.collectionEnabled, true),
            eq(sourcesTable.permissionStatus, "approved"),
            inArray(sourcesTable.accessMethod, [
              "authorized_feed",
              "api",
              "approved_scraping_provider",
            ]),
            lte(sourcesTable.nextCollectionAt, new Date()),
          ),
        )
        .orderBy(asc(sourcesTable.nextCollectionAt))
        .limit(3);
      for (const source of dueSources) {
        try {
          await enqueueSourceRun(source, source.ownerId);
        } catch (error) {
          logger.warn(
            {
              sourceId: source.id,
              message:
                error instanceof Error
                  ? error.message.slice(0, 300)
                  : "Unable to schedule collection.",
            },
            "Scheduled source collection was skipped",
          );
          await advanceSchedule(source);
        }
      }
    } catch (error) {
      logger.error(
        {
          message:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Unknown scheduler error",
        },
        "Source collection scheduler tick failed",
      );
    }
  };

  scheduler = setInterval(() => {
    void tick();
  }, 60_000);
  scheduler.unref();
  void tick();
  logger.info("Source collection scheduler started");
}
