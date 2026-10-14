// Diagnostic: replay the /api/sources serializer against live rows to expose
// the 500. Run: pnpm --filter ./scripts exec tsx ./diag-sources-parse.ts
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

function envFromDotenv(): void {
  const root = new URL("..", import.meta.url).pathname;
  const raw = readFileSync(`${root}.env`, "utf8");
  for (const line of raw.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}
envFromDotenv();

const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const zRequire = createRequire(new URL("../lib/api-zod/package.json", import.meta.url));

const { db, sourcesTable } = require("@workspace/db");
const { ListSourcesResponse } = zRequire("@workspace/api-zod");

const main = async (): Promise<void> => {
  const rows = await db.select().from(sourcesTable);
  console.log("rows:", rows.length);
  const parsed = ListSourcesResponse.safeParse(rows);
  if (parsed.success) {
    console.log("parse: PASS");
  } else {
    console.log("parse: FAIL", JSON.stringify(parsed.error).slice(0, 700));
    for (const issue of parsed.error.issues.slice(0, 6)) {
      console.log(" -", issue.path.join("."), "|", issue.message, "| got:", String(JSON.stringify(issue.code ?? "")));
    }
  }
  const [first] = rows;
  if (first) {
    console.log("row keys sample:", Object.keys(first).slice(0, 8).join(","));
  }
  process.exit(0);
};

void main();
