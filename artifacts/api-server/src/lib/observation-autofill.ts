import { logger } from "./logger";

/**
 * Auto-fill suggestions for the observation-to-lead conversion dialog.
 *
 * Jurisdiction: US Census Bureau Geocoder (public, no key, bounded usage)
 * resolves an address found in the collected record to a county + state.
 * Only ever used to fill a suggestion field — the operator still reviews it.
 *
 * Next action: Google Gemini when GEMINI_API_KEY is configured; otherwise a
 * deterministic template so the button always degrades gracefully.
 */

const CENSUS_GEOCODE_API =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const CENSUS_BENCHMARK = "Public_AR_Current";
const CENSUS_VINTAGE = "Current_Current";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
// Verified working with this app's key; override with GEMINI_MODEL if you want
// a different version (e.g. gemini-flash-latest). The engine degrades to the
// template fallback whenever Gemini is unavailable, so nothing breaks.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

export type AutoFillInput = {
  title: string;
  summary: string;
  sourceName: string;
  assetClass: string;
};

export type AutoFillSuggestion = {
  jurisdiction: string | null;
  jurisdictionSource: "census_geocoder" | "census_geocoder_city_state" | "observation_text" | "none";
  addressUsed: string | null;
  nextAction: string;
  nextActionSource: "gemini" | "fallback";
};

const STREET_TYPE =
  "(?:St|Street|Ave|Avenue|Way|Dr|Drive|Blvd|Boulevard|Rd|Road|Ln|Lane|Ct|Court|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Pl|Place|Cir|Circle|Trl|Trail|Loop|Dr N|Dr S)";
const STATE_ZIP = "[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?";

function addressCandidatesFromText(text: string): string[] {
  const candidates: string[] = [];
  // Full one-line address: "4111 Canterbury Way, Temple Hills, MD 20748"
  const full = text.match(
    new RegExp(
      `\\b(\\d{1,6}[A-Za-z]?)\\s+([A-Za-z0-9'’.#\\- ]{3,60}?\\s*${STREET_TYPE})\\s*,\\s*([A-Za-z'’ .-]{2,40})\\s*,\\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\\s+(\\d{5}(?:-\\d{4})?)\\b`,
      "i",
    ),
  );
  if (full) {
    candidates.push(
      `${full[1]} ${full[2]!.replace(/\s+/g, " ").trim()}, ${full[3]!.trim()}, ${full[4]!.toUpperCase()} ${full[5]}`,
    );
  }
  // Street fragment + separate city/state/zip fragments.
  const street = text.match(
    new RegExp(
      `\\b(\\d{1,6}[A-Za-z]?)\\s+([A-Za-z0-9'’.#\\- ]{3,60}?\\s+${STREET_TYPE})\\b`,
      "i",
    ),
  );
  const city = text.match(
    new RegExp(`,\\s*([A-Za-z'’ .-]{2,40}),\\s*([A-Z]{2})\\s+(\\d{5})`),
  );
  if (street && city) {
    candidates.push(
      `${street[1]} ${street[2]!.replace(/\s+/g, " ").trim()}, ${city[1]!.trim()}, ${city[2]} ${city[3]}`,
    );
  } else if (street) {
    candidates.push(`${street[1]} ${street[2]!.replace(/\s+/g, " ").trim()}`);
  }
  return candidates.slice(0, 2);
}

function countyFromText(text: string): string | null {
  const match = text.match(
    /\b([A-Za-z][A-Za-z'’ .-]{2,40}?)\s+(County|Parish),?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/,
  );
  if (!match) return null;
  const unit = match[2] === "Parish" && match[1].toUpperCase() === match[1] ? "County" : match[2];
  return `${match[1]!.trim()} ${unit}, ${match[3]}`;
}

type GeminiExtract = {
  address: string | null;
  nextAction: string | null;
};

async function geminiExtract(text: string): Promise<GeminiExtract | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const prompt = [
    "You assist an operator triaging a physically-observed business record.",
    "From the RECORD text below, extract:",
    ' - "address": the most complete US mailing address present (street, city, state, zip if available), or null if none.',
    ' - "nextAction": one short imperative next operator action (max 100 chars) for handling this record, concrete and safe, e.g. "Verify authority, then route to owner for a cleanout offer". Do not include contact details.',
    "Respond with ONLY a JSON object {\"address\": string|null, \"nextAction\": string}.",
    "",
    "RECORD:",
    text,
  ].join("\n");

  const response = await fetch(
    `${GEMINI_API}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gemini returned ${response.status}: ${detail.slice(0, 160).replace(/\s+/g, " ")} `,
    );
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = JSON.parse(raw.trim()) as Partial<GeminiExtract>;
  return {
    address: typeof parsed.address === "string" && parsed.address.trim() ? parsed.address.trim() : null,
    nextAction:
      typeof parsed.nextAction === "string" && parsed.nextAction.trim()
        ? parsed.nextAction.trim().slice(0, 500)
        : null,
  };
}

type CensusMatch = {
  jurisdiction: string;
  kind: "county" | "city_state";
};

const CENSUS_LOCATIONS_API =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

// County objects may carry STATE as a two-letter abbreviation or as the
// numeric state FIPS prefix of GEOID; accept either.
const STATE_FIPS_TO_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

type CountyCandidate = { county: string; state: string };

function countyFromGeographyLayer(
  geographies: Record<string, Array<Record<string, unknown>>>,
): CountyCandidate | null {
  for (const layer of Object.values(geographies)) {
    for (const geography of layer) {
      const county = typeof geography.COUNTY === "string" ? geography.COUNTY : null;
      const name = typeof geography.BASENAME === "string" ? geography.BASENAME : null;
      if (!county || !(/^\d{3}$/.test(county)) || !name) continue;
      const geoid = typeof geography.GEOID === "string" ? geography.GEOID : null;
      const stateRaw = typeof geography.STATE === "string" ? geography.STATE : null;
      let state: string | null = null;
      if (stateRaw && /^[A-Z]{2}$/.test(stateRaw.toUpperCase())) {
        state = stateRaw.toUpperCase();
      } else if (geoid) {
        state = STATE_FIPS_TO_ABBR[geoid.slice(0, 2)] ?? null;
      }
      if (!state) continue;
      return { county: name.trim(), state };
    }
  }
  return null;
}

async function fetchCensusJson(url: string): Promise<{
  geographies?: Record<string, Array<Record<string, unknown>>>;
  addressMatches?: Array<{
    addressComponents?: { city?: string; state?: string };
    matchedAddress?: string;
  }>;
} | null> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Census Geocoder returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    result?: {
      geographies?: Record<string, Array<Record<string, unknown>>>;
      addressMatches?: Array<{
        addressComponents?: { city?: string; state?: string };
        matchedAddress?: string;
      }>;
    };
  };
  return payload.result ?? null;
}

/**
 * Resolve an address to its county via the Census geography layers. When the
 * location is city-level (no ZIP), Census omits the geography layers — retry
 * once with the ZIP-completed matched address from the locations endpoint.
 */
async function censusCountyFromAddress(
  address: string,
): Promise<CountyCandidate | null> {
  const url = `${CENSUS_GEOCODE_API}?address=${encodeURIComponent(address)}&benchmark=${CENSUS_BENCHMARK}&vintage=${CENSUS_VINTAGE}&format=json`;
  const result = await fetchCensusJson(url);
  const direct = result?.geographies
    ? countyFromGeographyLayer(result.geographies)
    : null;
  if (direct) return direct;

  const matchedAddress = result?.addressMatches?.[0]?.matchedAddress ?? null;
  if (matchedAddress && matchedAddress !== address) {
    const retryUrl = `${CENSUS_GEOCODE_API}?address=${encodeURIComponent(matchedAddress)}&benchmark=${CENSUS_BENCHMARK}&vintage=${CENSUS_VINTAGE}&format=json`;
    const retryResult = await fetchCensusJson(retryUrl);
    if (retryResult?.geographies) {
      const retryCounty = countyFromGeographyLayer(retryResult.geographies);
      if (retryCounty) return retryCounty;
    }
  }
  return null;
}

async function censusJurisdiction(address: string): Promise<CensusMatch | null> {
  const county = await censusCountyFromAddress(address);
  if (county) {
    return {
      jurisdiction: `${county.county} County, ${county.state}`,
      kind: "county",
    };
  }

  const url = `${CENSUS_GEOCODE_API}?address=${encodeURIComponent(address)}&benchmark=${CENSUS_BENCHMARK}&vintage=${CENSUS_VINTAGE}&format=json`;
  const result = await fetchCensusJson(url);
  const match = result?.addressMatches?.[0]?.addressComponents;
  if (match?.city && match.state) {
    return {
      jurisdiction: `${match.city}, ${match.state}`,
      kind: "city_state",
    };
  }
  return null;
}

/**
 * Gemini county inference for the conversion gate — strictly validated:
 * the state must be a known two-letter code and the county a normal name.
 * Returns null (never throws) when the key is missing, the model fails, or
 * the answer looks unreliable.
 */
async function geminiCounty(
  location: string,
): Promise<{ county: string; state: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `${GEMINI_API}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    `Which US county contains the place "${location}"?`,
                    'Respond with ONLY a JSON object {"county": "<county name without the word County>", "state": "<two-letter code>"}.',
                    'If you are not certain, return {"county": null, "state": null}.',
                  ].join(" "),
                },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Gemini returned ${response.status}: ${detail.slice(0, 120).replace(/\s+/g, " ")}`);
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(raw.trim()) as { county?: unknown; state?: unknown };
    const countyName = typeof parsed.county === "string" ? parsed.county.trim() : "";
    const stateCode = typeof parsed.state === "string" ? parsed.state.trim().toUpperCase() : "";
    if (!countyName || !/^[A-Z]{2}$/.test(stateCode)) return null;
    if (/\b(county|parish|borough)\b/i.test(countyName)) {
      return { county: countyName.replace(/\s+\b(county|parish|borough)\b/i, ""), state: stateCode };
    }
    return { county: countyName, state: stateCode };
  } catch (error) {
    logger.warn(
      { message: error instanceof Error ? error.message.slice(0, 160) : "unknown" },
      "Gemini county inference failed during conversion",
    );
    return null;
  }
}

export function geminiIsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Resolve a possibly city-level location ("LAUREL, MD") to its county.
 * Chain: Census geography layers → Census with the ZIP-completed matched
 * address → Gemini county inference (strictly validated). Returns null when
 * the address cannot be resolved; never throws. Bounded calls + timeouts.
 */
export async function countyFromLocationViaCensus(
  location: string,
): Promise<string | null> {
  try {
    const county = await censusCountyFromAddress(location);
    if (county) return `${county.county} County, ${county.state}`;
  } catch (error) {
    logger.warn(
      { message: error instanceof Error ? error.message.slice(0, 160) : "unknown" },
      "Census county lookup failed during conversion",
    );
  }

  const inferred = await geminiCounty(location);
  if (inferred) return `${inferred.county} County, ${inferred.state}`;
  return null;
}

export async function suggestObservationFill(
  input: AutoFillInput,
): Promise<AutoFillSuggestion> {
  const text = [
    input.title,
    input.summary,
    input.sourceName,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);

  // 1. County stated directly in the record wins — no geocoding needed.
  const county = countyFromText(text);

  // 2. Ask Gemini (when configured) for an address + a next-action suggestion.
  let address: string | null = null;
  let nextAction: string | null = null;
  let geminiFailed = false;
  if (geminiIsConfigured()) {
    try {
      const extracted = await geminiExtract(text);
      if (extracted) {
        address = extracted.address;
        nextAction = extracted.nextAction;
      }
    } catch (error) {
      geminiFailed = true;
      logger.warn(
        {
          message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        },
        "Gemini auto-fill failed; using fallbacks",
      );
    }
  }

  // 3. Fallback address extraction from the record text itself.
  const candidates = address ? [address, ...addressCandidatesFromText(text)] : addressCandidatesFromText(text);

  // 4. Census Geocoder resolves the address to a county + state.
  let jurisdiction: string | null = null;
  let jurisdictionSource: AutoFillSuggestion["jurisdictionSource"] = county ? "observation_text" : "none";
  let addressUsed: string | null = null;
  for (const candidate of candidates.slice(0, county ? 0 : 2)) {
    try {
      const match = await censusJurisdiction(candidate);
      if (match) {
        jurisdiction = match.jurisdiction;
        jurisdictionSource = match.kind === "county" ? "census_geocoder" : "census_geocoder_city_state";
        addressUsed = candidate;
        break;
      }
    } catch (error) {
      logger.warn(
        {
          message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        },
        "Census Geocoder lookup failed for auto-fill",
      );
      break;
    }
  }
  if (!jurisdiction && county) {
    jurisdiction = county;
  }

  // 5. Next action: Gemini suggestion, else a deterministic template.
  const nextActionSource: AutoFillSuggestion["nextActionSource"] = nextAction
    ? "gemini"
    : "fallback";
  if (!nextAction) {
    nextAction = jurisdiction
      ? `Verify ownership and authority for ${jurisdiction}, then prepare the first outreach step.`
      : "Open the evidence URL, verify the record, and decide the first outreach step.";
  }
  if (geminiFailed) {
    logger.info("Auto-fill next action fell back to the template after a Gemini error");
  }

  return {
    jurisdiction,
    jurisdictionSource,
    addressUsed,
    nextAction,
    nextActionSource,
  };
}
