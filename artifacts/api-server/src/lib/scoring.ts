import type { Lead, ScoreContribution } from "@workspace/db";

type Evaluation = Pick<
  Lead,
  | "score"
  | "decision"
  | "expectedValue"
  | "netToBusinessValue"
  | "recommendedBid"
  | "mao"
  | "requiredAssignmentFee"
  | "scoringVersion"
  | "scoreBreakdown"
  | "missingInputs"
  | "estimatedContentsEv"
  | "hardVetoes"
>;

type ScorableLead = Partial<Lead> & {
  assetClass: Lead["assetClass"];
  contactStatus?: Lead["contactStatus"];
};

const RULES = {
  storage: "storage-rules-v1",
  real_estate: "real-estate-balanced-v1",
  estate: "estate-routing-v1",
  junk: "junk-scrap-gate-v1",
  commercial: "commercial-manual-review-v1",
  package: "package-manual-review-v1",
} as const;

const STORAGE_WEIGHTS = [
  ["brandVisibility", 25],
  ["containerComposition", 15],
  ["facilityTier", 15],
  ["scrapCoverage", 10],
  ["ownerContext", 10],
  ["unitVisibility", 10],
  ["cleanoutEase", 10],
  ["auctionHorizon", 5],
] as const;

const CLASS_VETOES: Record<Lead["assetClass"], string[]> = {
  storage: [
    "biohazard",
    "drug_paraphernalia",
    "firearm_without_ffl",
    "unresolvable_title",
  ],
  real_estate: [
    "unresolvable_title",
    "owner_refuses",
    "occupancy_outside_scope",
    "unlicensed_jurisdiction",
    "no_signed_authorization",
  ],
  estate: [
    "biohazard",
    "heir_dispute",
    "no_signed_authorization",
    "owner_refuses",
    "hoarding_remediation_required",
  ],
  commercial: [
    "biohazard",
    "owner_refuses",
    "unlicensed_jurisdiction",
  ],
  junk: [
    "biohazard",
    "drug_paraphernalia",
    "firearm_without_ffl",
    "owner_refuses",
    "unlicensed_jurisdiction",
  ],
  package: [
    "biohazard",
    "drug_paraphernalia",
    "firearm_without_ffl",
    "unresolvable_title",
    "owner_refuses",
    "occupancy_outside_scope",
    "unlicensed_jurisdiction",
    "heir_dispute",
    "no_signed_authorization",
    "hoarding_remediation_required",
  ],
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreBreakdown(
  rules: ReadonlyArray<readonly [string, number]>,
  values: Record<string, number | null>,
): { score: number | null; breakdown: ScoreContribution[]; missing: string[] } {
  const missing = rules
    .filter(([input]) => values[input] === null || values[input] === undefined)
    .map(([input]) => input);
  const breakdown = rules.map(([input, weight]) => {
    const inputScore = values[input] ?? null;
    return {
      input,
      weight,
      score: inputScore,
      contribution:
        inputScore === null
          ? 0
          : Math.round((inputScore * weight) / 10000 * 1000) / 1000,
    };
  });
  const score = missing.length
    ? null
    : Math.round(
        breakdown.reduce((total, entry) => total + entry.contribution, 0) *
          1000,
      ) / 1000;
  return { score, breakdown, missing };
}

function normalizedInputs(
  keys: ReadonlyArray<readonly [string, number]>,
  input: ScorableLead,
): Record<string, number | null> {
  return Object.fromEntries(
    keys.map(([key]) => [key, asNumber(input[key as keyof ScorableLead])]),
  );
}

function initialEvaluation(input: ScorableLead): Evaluation {
  const hardVetoes = (input.riskFlags ?? []).filter(
    (flag) =>
      CLASS_VETOES[input.assetClass].includes(flag) &&
      !(
        input.assetClass === "estate" &&
        flag === "no_signed_authorization"
      ),
  );
  if (
    input.assetClass === "estate" &&
    input.estateAuthorityStatus !== "verified"
  ) {
    hardVetoes.push("no_signed_authorization");
    if (input.estateAuthorityStatus === "rejected") {
      hardVetoes.push("estate_authority_rejected");
    }
  }
  return {
    score: null,
    decision: hardVetoes.length ? "pass" : "review",
    expectedValue: null,
    netToBusinessValue: null,
    recommendedBid: null,
    mao: null,
    requiredAssignmentFee: null,
    scoringVersion: RULES[input.assetClass],
    scoreBreakdown: [],
    missingInputs: [],
    estimatedContentsEv: asNumber(input.estimatedContentsEv),
    hardVetoes,
  };
}

function hasMoneyUnit(input: ScorableLead): boolean {
  return Boolean(input.currencyCode);
}

export function evaluateLead(input: ScorableLead): Evaluation {
  const result = initialEvaluation(input);

  if (input.assetClass === "storage") {
    const scored = scoreBreakdown(
      STORAGE_WEIGHTS,
      normalizedInputs(STORAGE_WEIGHTS, input),
    );
    result.score = scored.score;
    result.scoreBreakdown = scored.breakdown;
    result.missingInputs = scored.missing;

    const moneyInputs = [
      "resaleEstimate",
      "resaleProbability",
      "scrapFloor",
      "cleanoutCost",
      "dumpFees",
    ] as const;
    const missingMoneyInputs = moneyInputs.filter(
      (key) => asNumber(input[key]) === null,
    );
    if (!hasMoneyUnit(input)) result.missingInputs.push("currencyCode");
    result.missingInputs.push(...missingMoneyInputs);

    if (
      result.score !== null &&
      hasMoneyUnit(input) &&
      missingMoneyInputs.length === 0
    ) {
      const resale = input.resaleEstimate! * input.resaleProbability!;
      const expectedValue = roundMoney(
        resale + input.scrapFloor! - input.cleanoutCost! - input.dumpFees!,
      );
      const recommendedBid = roundMoney(expectedValue * 0.45);
      result.expectedValue = expectedValue;
      result.recommendedBid = result.hardVetoes.length
        ? null
        : Math.max(0, recommendedBid);
      if (!result.hardVetoes.length) {
        if (expectedValue <= 0 || result.score < 40) {
          result.decision = "pass";
        } else if (result.score < 55) {
          result.decision = "watch";
        } else if (result.score < 70) {
          result.decision =
            input.scrapFloor! >= recommendedBid ? "conditional_bid" : "watch";
        } else {
          result.decision = "bid";
        }
      }
    }
    return result;
  }

  if (input.assetClass === "real_estate") {
    const weightedInputs = [
      ["discountToMao", 20],
      ["motivationScore", 20],
      ["timelineScore", 20],
      ["titleClarity", 20],
      ["buyerLiquidity", 20],
    ] as const;
    const values = normalizedInputs(weightedInputs, input);
    const missing = weightedInputs
      .filter(([key]) => values[key] === null)
      .map(([key]) => key);
    const breakdown: ScoreContribution[] = weightedInputs.map(
      ([key, weight]) => {
        const value = values[key] ?? null;
        return {
          input: key,
          weight,
          score: value,
          contribution:
            value === null ? 0 : Math.round((value * weight) / 1000) / 100,
        };
      },
    );
    result.scoreBreakdown = breakdown;
    result.score =
      missing.length === 0
        ? Math.round(
            breakdown.reduce((total, part) => total + part.contribution, 0) *
              1000,
          ) / 1000
        : null;
    result.missingInputs = missing;

    const arv = asNumber(input.arv);
    const repairCost = asNumber(input.repairCost);
    if (arv === null) result.missingInputs.push("arv");
    if (repairCost === null) result.missingInputs.push("repairCost");
    if (!hasMoneyUnit(input)) result.missingInputs.push("currencyCode");
    if (arv !== null && repairCost !== null && hasMoneyUnit(input)) {
      const mao = roundMoney(arv * 0.7 - repairCost);
      const requiredFee =
        input.contractPrice === null || input.contractPrice === undefined
          ? 10000
          : Math.max(10000, input.contractPrice * 0.1);
      result.mao = mao;
      result.requiredAssignmentFee = roundMoney(requiredFee);
      result.recommendedBid = Math.max(0, roundMoney(mao - requiredFee));
      if (input.contractPrice !== null && input.contractPrice !== undefined) {
        result.expectedValue = roundMoney(mao - input.contractPrice);
      }
    }

    if (
      !result.hardVetoes.length &&
      result.score !== null &&
      result.recommendedBid !== null
    ) {
      if (result.score >= 75) result.decision = "contract";
      else if (result.score >= 60) result.decision = "option_refer";
      else result.decision = "pass";
    }
    return result;
  }

  if (input.assetClass === "estate") {
    const categoryValues = [
      ["toolsEstimate", 0.6],
      ["electronicsEstimate", 0.5],
      ["furnitureEstimate", 0.4],
      ["householdEstimate", 0.2],
      ["clothingEstimate", 0.1],
    ] as const;
    const categoryMissing = categoryValues
      .filter(([key]) => asNumber(input[key]) === null)
      .map(([key]) => key);
    const estimatedGross = asNumber(input.estimatedContentsEv);
    const grossFromCategories =
      categoryMissing.length === 0
        ? categoryValues.reduce(
            (sum, [key, ratio]) => sum + (input[key] ?? 0) * ratio,
            0,
          )
        : null;
    const gross = estimatedGross ?? grossFromCategories;
    result.estimatedContentsEv = gross;

    const estateInputs = [
      ["estimatedContentsEv", 35],
      ["executorCooperation", 20],
      ["resaleDensity", 20],
      ["accessLogistics", 15],
      ["timelineScore", 10],
    ] as const;
    const estateValues = normalizedInputs(estateInputs, input);
    if (gross !== null) {
      estateValues.estimatedContentsEv = Math.max(
        0,
        Math.min(100, (gross / 2000) * 100),
      );
    }
    const scored = scoreBreakdown(estateInputs, estateValues);
    result.score = scored.score;
    result.scoreBreakdown = scored.breakdown;
    result.missingInputs = scored.missing;

    if (estimatedGross === null && grossFromCategories === null) {
      result.missingInputs.push(...categoryMissing);
    }
    const cleanoutCost = asNumber(input.cleanoutCost);
    const dumpFees = asNumber(input.dumpFees);
    if (cleanoutCost === null) result.missingInputs.push("cleanoutCost");
    if (dumpFees === null) result.missingInputs.push("dumpFees");
    if (!hasMoneyUnit(input)) result.missingInputs.push("currencyCode");

    if (
      gross !== null &&
      cleanoutCost !== null &&
      dumpFees !== null &&
      hasMoneyUnit(input)
    ) {
      const expectedValue = roundMoney(gross - cleanoutCost - dumpFees);
      result.expectedValue = expectedValue;
      if (
        input.businessSharePercent !== null &&
        input.businessSharePercent !== undefined
      ) {
        result.netToBusinessValue = roundMoney(
          expectedValue * (input.businessSharePercent / 100),
        );
      }
      if (!result.hardVetoes.length) {
        if (expectedValue < 800) {
          result.decision = "refer";
        } else if (expectedValue < 2000) {
          result.decision = "hybrid";
        } else if (
          result.netToBusinessValue !== null &&
          result.netToBusinessValue >= 800
        ) {
          result.decision = "cleanout_consign";
        } else if (result.netToBusinessValue === null) {
          result.missingInputs.push("businessSharePercent");
        }
      }
    }
    return result;
  }

  if (input.assetClass === "junk") {
    const moneyFields = ["scrapEstimate", "runnerPayout", "dumpFees"] as const;
    const missing = moneyFields.filter(
      (key) => asNumber(input[key]) === null,
    );
    if (missing.length) result.missingInputs.push(...missing);
    if (input.resellableItemsFound === null || input.resellableItemsFound === undefined) {
      result.missingInputs.push("resellableItemsFound");
    }
    if (input.distanceKm === null || input.distanceKm === undefined) {
      result.missingInputs.push("distanceKm");
    }
    if (input.serviceRadiusKm === null || input.serviceRadiusKm === undefined) {
      result.missingInputs.push("serviceRadiusKm");
    }
    if (!hasMoneyUnit(input)) result.missingInputs.push("currencyCode");

    if (
      missing.length === 0 &&
      input.resellableItemsFound !== null &&
      input.resellableItemsFound !== undefined &&
      input.distanceKm !== null &&
      input.distanceKm !== undefined &&
      input.serviceRadiusKm !== null &&
      input.serviceRadiusKm !== undefined &&
      hasMoneyUnit(input)
    ) {
      result.expectedValue = roundMoney(
        input.scrapEstimate! - input.runnerPayout! - input.dumpFees!,
      );
      if (!result.hardVetoes.length) {
        const enoughScrap =
          input.scrapEstimate! >=
          1.5 * (input.runnerPayout! + input.dumpFees!);
        const withinRadius = input.distanceKm <= input.serviceRadiusKm;
        if (input.resellableItemsFound) {
          result.missingInputs.push("resellable items need separate valuation");
        } else if (enoughScrap && withinRadius) {
          result.decision = "run";
        } else {
          result.decision = "pass";
        }
      }
    }
    result.scoringVersion = RULES.junk;
    return result;
  }

  result.missingInputs = [
    input.assetClass === "commercial"
      ? "No approved commercial scoring model; manual review is required"
      : "Package valuation is not enabled; review component leads manually",
  ];
  return result;
}
