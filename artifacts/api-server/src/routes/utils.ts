import { getAuth } from "@clerk/express";
import { db, activityTable, type Activity } from "@workspace/db";
import type { Lead, Job, Worker } from "@workspace/db";
import type { Request, Response } from "express";

export function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

export function sendNotFound(res: Response, entity: string): void {
  res.status(404).json({ error: `${entity} was not found.` });
}

export function sendConflict(res: Response, message: string): void {
  res.status(409).json({ error: message });
}

export function ownerIdFrom(req: Request): string {
  return getAuth(req).userId ?? "";
}

export function serializeLead(row: Lead) {
  return {
    id: row.id,
    title: row.title,
    assetClass: row.assetClass,
    stage: row.stage,
    location: row.location,
    source: row.source,
    sourceId: row.sourceId,
    distressSignal: row.distressSignal,
    estateAuthorityStatus: row.estateAuthorityStatus,
    estateAuthorityEvidenceRef: row.estateAuthorityEvidenceRef,
    estateAuthorityReviewerId: row.estateAuthorityReviewerId,
    estateAuthorityReviewedAt: row.estateAuthorityReviewedAt,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    contactStatus: row.contactStatus,
    currencyCode: row.currencyCode,
    riskFlags: row.riskFlags,
    businessSharePercent: row.businessSharePercent,
    resellableItemsFound: row.resellableItemsFound,
    eventDate: row.eventDate,
    score: row.score,
    decision: row.decision,
    expectedValue: row.expectedValue,
    netToBusinessValue: row.netToBusinessValue,
    recommendedBid: row.recommendedBid,
    mao: row.mao,
    requiredAssignmentFee: row.requiredAssignmentFee,
    scoringVersion: row.scoringVersion,
    scoreBreakdown: row.scoreBreakdown,
    missingInputs: row.missingInputs,
    hardVetoes: row.hardVetoes,
    brandVisibility: row.brandVisibility,
    containerComposition: row.containerComposition,
    facilityTier: row.facilityTier,
    scrapCoverage: row.scrapCoverage,
    ownerContext: row.ownerContext,
    unitVisibility: row.unitVisibility,
    cleanoutEase: row.cleanoutEase,
    auctionHorizon: row.auctionHorizon,
    resaleEstimate: row.resaleEstimate,
    resaleProbability: row.resaleProbability,
    scrapFloor: row.scrapFloor,
    cleanoutCost: row.cleanoutCost,
    dumpFees: row.dumpFees,
    arv: row.arv,
    repairCost: row.repairCost,
    contractPrice: row.contractPrice,
    discountToMao: row.discountToMao,
    motivationScore: row.motivationScore,
    timelineScore: row.timelineScore,
    titleClarity: row.titleClarity,
    buyerLiquidity: row.buyerLiquidity,
    toolsEstimate: row.toolsEstimate,
    electronicsEstimate: row.electronicsEstimate,
    furnitureEstimate: row.furnitureEstimate,
    householdEstimate: row.householdEstimate,
    clothingEstimate: row.clothingEstimate,
    estimatedContentsEv: row.estimatedContentsEv,
    executorCooperation: row.executorCooperation,
    resaleDensity: row.resaleDensity,
    accessLogistics: row.accessLogistics,
    scrapEstimate: row.scrapEstimate,
    runnerPayout: row.runnerPayout,
    serviceRadiusKm: row.serviceRadiusKm,
    distanceKm: row.distanceKm,
    latitude: row.latitude,
    longitude: row.longitude,
    evidenceUrl: row.evidenceUrl,
    nextAction: row.nextAction,
    nextActionDueAt: row.nextActionDueAt,
    noNextActionReason: row.noNextActionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeWorker(
  row: Worker,
  matching?: {
    distanceKm: number | null;
    eligibleForJob: boolean | null;
    withinServiceRadius: boolean | null;
    matchReasons: string[];
  },
) {
  return {
    id: row.id,
    displayName: row.displayName,
    homeArea: row.homeArea,
    skills: row.skills,
    isAvailable: row.isAvailable,
    serviceRadiusKm: row.serviceRadiusKm,
    locationConfigured: row.latitude !== null && row.longitude !== null,
    distanceKm: matching?.distanceKm ?? null,
    eligibleForJob: matching?.eligibleForJob ?? null,
    withinServiceRadius: matching?.withinServiceRadius ?? null,
    matchReasons: matching?.matchReasons ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeJob(row: Job, workerName: string | null) {
  return {
    id: row.id,
    leadId: row.leadId,
    title: row.title,
    jobType: row.jobType,
    location: row.location,
    scheduledAt: row.scheduledAt,
    requiredSkills: row.requiredSkills,
    estimatedHours: row.estimatedHours,
    payoutAmount: row.payoutAmount,
    currencyCode: row.currencyCode,
    payoutStructure: row.payoutStructure,
    status: row.status,
    workerId: row.workerId,
    workerName,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function recordActivity(
  ownerId: string,
  kind: Activity["kind"],
  title: string,
  detail: string,
  leadId: string | null = null,
  jobId: string | null = null,
): Promise<void> {
  await db.insert(activityTable).values({
    ownerId,
    kind,
    title,
    detail,
    leadId,
    jobId,
  });
}

export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}
