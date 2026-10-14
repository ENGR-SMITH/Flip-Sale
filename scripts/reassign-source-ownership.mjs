// One-off utility: move all seeded pipeline records (owner "seed-preview") to
// the real signed-in Clerk account. Usage:
//   TARGET_OWNER=user_xxx node scripts/reassign-source-ownership.mjs
import { createRequire } from "node:module";
const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = dbRequire("pg");

const me = process.env.TARGET_OWNER;
if (!me || !me.startsWith("user_")) {
  console.error("Set TARGET_OWNER=user_... (the Clerk userId to receive the records)");
  process.exit(1);
}

const c = new Pool({ connectionString: process.env.DATABASE_URL });
for (const table of [
  "distress_sources",
  "distress_source_runs",
  "distress_source_observations",
  "distress_source_reviews",
  "distress_activity",
]) {
  try {
    const r = await c.query(`update ${table} set owner_id = $1 where owner_id = 'seed-preview'`, [me]);
    console.log("reassigned", table, r.rowCount);
  } catch (e) {
    console.log("reassigned", table, "skip:", e.message.slice(0, 60));
  }
}

const owners = await c.query("select owner_id, count(*)::int n from distress_sources group by owner_id");
console.log("OWNERS:", JSON.stringify(owners.rows));
const obs = await c.query("select count(*)::int n from distress_source_observations where owner_id = $1", [me]);
console.log("YOUR_OBS:", obs.rows[0].n);
await c.end();
