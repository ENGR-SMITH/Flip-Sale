/**
 * Conversion gate: a collected update can only become a lead inside a county
 * the source actually registered. Launch counties (Houston / DFW) work as
 * before; any other honest county registration also works now, plus
 * "Statewide ST" entries that cover the matching state.
 *
 * Pure function — no I/O — so it is trivially testable.
 */

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

export type CoverageMatch = {
  matched: boolean;
  countyName: string | null; // clean county name when available
  rule: "county_name" | "statewide_state" | "state_fallback" | null;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCountyName(location: string): string | null {
  // "Prince George's County, MD" / "Waukesha Parish, LA" / "Fort Bend County" /
  // bare county name like "Harris".
  const withUnit = location.match(
    new RegExp(
      `\\b([A-Za-z][A-Za-z'’ .-]{1,50}?)\\s+(?:county|parish|borough)\\b`,
      "i",
    ),
  );
  if (withUnit) return withUnit[1]!.trim();
  const plain = location.match(
    new RegExp(`\\b([A-Za-z][A-Za-z'’ .-]{1,50}?)\\s*[,\\d]`, ""),
  );
  return plain ? plain[1]!.trim() || null : null;
}

function extractState(location: string): string | null {
  const match = location.match(new RegExp(`\\b(${US_STATES})\\b`, "i"));
  return match ? match[1]!.toUpperCase() : null;
}

export function matchLocationToCountyCoverage(
  location: string,
  coverage: string[],
): CoverageMatch {
  const cleanedLocation = location.trim().replace(/\s+/g, " ");
  const countyName = extractCountyName(cleanedLocation);
  const baseName = countyName ? normalize(countyName) : null;
  const state = extractState(cleanedLocation);

  // 1. County-name match against any registered entry.
  if (baseName) {
    for (const entry of coverage) {
      const entryName = normalize(entry);
      if (entryName.includes(baseName) || baseName.includes(entryName)) {
        return { matched: true, countyName, rule: "county_name" };
      }
    }
  }

  // 2. Statewide registration covering the location's state.
  if (state) {
    for (const entry of coverage) {
      const entryName = normalize(entry);
      if (
        entryName === "statewide" ||
        entryName.includes(`statewide ${state.toLowerCase()}`)
      ) {
        return { matched: true, countyName, rule: "statewide_state" };
      }
    }
  }

  // 3. State-consistency fallback: the location only carries a city/state and
  //    the county could not be resolved (Census down for city names, Gemini
  //    quota exhausted). Accept when the source covers counties within the
  //    location's state — the operator registered that scope themselves.
  if (state) {
    const stateToken = state.toLowerCase();
    const stateCovered = coverage.some((entry) =>
      normalize(entry).includes(stateToken),
    );
    if (stateCovered) {
      return { matched: true, countyName, rule: "state_fallback" };
    }
  }

  return { matched: false, countyName, rule: null };
}
