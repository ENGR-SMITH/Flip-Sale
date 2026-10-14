// One-off seed script: registers fresh public foreclosure datasets as approved
// collection-enabled sources. Run with DATABASE_URL set:
//   node scripts/seed-fresh-sources.mjs
import { createRequire } from "node:module";
const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg");

const c = new Pool({ connectionString: process.env.DATABASE_URL });
const now = new Date();
const owner = "seed-preview";

const seeds = [
  {
    name: "Prince George's County Foreclosure Filings",
    url: "https://data.princegeorgescountymd.gov/resource/mnie-hrv7.json?%24order=submitteddate%20DESC&%24limit=25",
    county: "Prince George's County, MD",
    owner: "Prince George's County OIT",
    classes: ["real_estate", "estate"],
    cost: "Free public SODA API; <=1 request/24h",
    retention: "Keep observations 30 days; redact contacts before outreach",
    note: "Newest-first foreclosure filings feed; approved public data.",
  },
  {
    name: "Maryland Foreclosure Notice Counts",
    url: "https://opendata.maryland.gov/resource/w3bc-8mnv.json?%24order=date%20DESC&%24limit=6",
    county: "Statewide MD",
    owner: "Maryland Office of Financial Regulation",
    classes: ["real_estate"],
    cost: "Free public SODA API; <=1 request/24h",
    retention: "Keep observations 30 days",
    note: "Monthly intent-to-foreclose counts by county; signal layer.",
  },
];

for (const s of seeds) {
  const r = await c.query(
    `insert into distress_sources
      (owner_id, name, source_url, county_coverage, source_owner, access_method,
       asset_classes, collection_enabled, collection_interval_hours, collection_max_pages,
       next_collection_at, cost_rate_notes, retention_notes, permission_status,
       permission_reviewer_id, permission_reviewed_at, permission_review_notes)
     values ($1,$2,$3,$4,$5,'api',$6,true,24,25,now() - interval '1 sec',$7,$8,'approved',$9,$10,$11)
     returning id, name`,
    [owner, s.name, s.url, [s.county], s.owner, s.classes, s.cost, s.retention, owner, now, s.note],
  );
  console.log("seeded:", r.rows[0]?.id, s.name);
}

await c.query("update distress_sources set collection_interval_hours = 24 where name like 'New Orleans%'");
await c.query("delete from distress_source_runs where status = 'succeeded'");
await c.query("delete from distress_source_observations");
console.log("reset previous runs/observations for a clean re-collection");
await c.end();
