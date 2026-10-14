export const launchCounties = [
  {
    metro: "Houston area",
    name: "Harris County",
    value: "Harris County, TX",
  },
  {
    metro: "Houston area",
    name: "Fort Bend County",
    value: "Fort Bend County, TX",
  },
  {
    metro: "Dallas–Fort Worth",
    name: "Dallas County",
    value: "Dallas County, TX",
  },
  {
    metro: "Dallas–Fort Worth",
    name: "Tarrant County",
    value: "Tarrant County, TX",
  },
] as const;

type LaunchCounty = (typeof launchCounties)[number];

export function parseLaunchLocation(location: string): {
  county: LaunchCounty;
  locality: string;
} | null {
  const normalized = location.trim().replace(/\s+/g, " ");
  const lowerCaseLocation = normalized.toLowerCase();

  for (const county of launchCounties) {
    const lowerCaseCounty = county.value.toLowerCase();
    if (lowerCaseLocation === lowerCaseCounty) {
      return { county, locality: "" };
    }

    const suffix = `, ${lowerCaseCounty}`;
    if (lowerCaseLocation.endsWith(suffix)) {
      return {
        county,
        locality: normalized.slice(0, -suffix.length).trim(),
      };
    }
  }

  return null;
}

export function formatLaunchLocation(
  locality: string,
  countyValue: string,
): string {
  const county = launchCounties.find(({ value }) => value === countyValue);
  if (!county) return locality.trim();

  const normalizedLocality = locality.trim().replace(/\s+/g, " ");
  return normalizedLocality
    ? `${normalizedLocality}, ${county.value}`
    : county.value;
}
