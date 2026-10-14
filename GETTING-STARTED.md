# Flip Sale — How to Start the App (Full Setup Guide)

This guide is the complete, start-to-finish reference for getting everything up and
running: credentials, database, servers, automatic source collection, and the
dashboard preview. Follow it top to bottom the first time; after the first setup,
starting the app is **one command** (see section 5).

---

## 1. What you are starting

| Piece | What it does | Address when running |
|---|---|---|
| **API server** | Express 5 backend: leads, sources, workers, jobs, client requests, auth (Clerk), and the **automatic source-collection scheduler** (Apify scrapers + public feeds/APIs) | http://localhost:5000 |
| **Operator dashboard** (`artifacts/distress-intelligence`) | Your workspace: signal detection per asset class, source registry, observations → leads, outreach, field workers/jobs | http://localhost:5173 |
| **Client-facing services app** (`artifacts/distress-client-services`) | Separate app for clients of each service class — built but not started by the launcher; see section 8 | not started by default |
| **Neon Postgres** | Hosted database where everything is stored (11 tables) | cloud |
| **Apify** | Scraping platform used to pull updates from websites/platforms automatically | cloud |

How the automatic sourcing works, in one paragraph: the API server runs a
scheduler that ticks every 60 seconds. It looks for sources in the database that
are **approved** + **collection-enabled** + **due for collection**. For each it
launches a collection run — either a real Apify actor crawl, a public RSS/Atom
feed read, or a public JSON API read (e.g. county open-data portals). Every run
and every observation it produces is stored in the database and shows up in the
dashboard's Sources page. No manual entry is required once sources are approved.
Manual entry remains available as a fallback.

---

## 2. One-time setup: accounts + credentials

All credentials live in one file: **`.env` at the project root** (already created;
it is git-ignored so real values never get committed). Open it and make sure each
key below has a real value. Where to get each one:

| Key | Where to get it | Notes |
|---|---|---|
| `DATABASE_URL` | https://console.neon.tech → your project → **Connection Details** → copy the connection string | Postgres. The API server refuses to start without it. |
| `APIFY_API_TOKEN` | https://console.apify.com → **Settings → Integrations → API token** | Powers the automated scraper runs. **Caution:** the Apify free plan has a monthly usage cap — scraper sources fail with `403 Monthly usage hard limit exceeded` until it resets or you add $5 of credit at https://apify.com/billing | |
| `CLERK_SECRET_KEY` | https://dashboard.clerk.com → your app → **API Keys** | Server-side auth key |
| `CLERK_PUBLISHABLE_KEY` | Same Clerk API Keys page | Server-side publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same Clerk API Keys page | Frontend publishable key. **All three Clerk keys must come from the same Clerk application** |

Optional keys (safe to leave as-is): `LOG_LEVEL` (`info` default),
`VITE_CLERK_PROXY_URL` (only if routing Clerk through a domain proxy).

**Verify your credentials:**

```bash
grep -c "^DATABASE_URL=" .env                       # should print 1
grep -A1 "^DATABASE_URL=" .env | head -1            # should start with postgresql://
```

---

## 3. One-time setup: install dependencies

Requires: Node.js 24 and pnpm (the repo enforces pnpm — npm/yarn are rejected).

```bash
pnpm install
```

Note: `pnpm-workspace.yaml` already allow-lists the two packages that need build
scripts (`esbuild`, `@clerk/shared`). If install ever complains about ignored
build scripts again, add the package under `allowBuilds:` in
`pnpm-workspace.yaml` with `true`.

---

## 4. One-time setup: create the database tables

Pushes the full schema (leads, sources, runs, observations, workers, jobs, etc.)
to your Neon database:

```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"
pnpm --filter @workspace/db run push
```

You should see **`[✓] Changes applied`**. To confirm, the database should contain
`distress_sources`, `distress_source_runs`, `distress_source_observations`,
`distress_leads`, `distress_workers`, `distress_jobs`, and a few more tables.

---

## 5. Start the app (one command)

From the project root:

```bash
bash scripts/start-app.sh
```

This single command:
1. checks your `.env` has every required key (clear error if not),
2. builds the API server,
3. starts the **API server** on http://localhost:5000,
4. starts the **operator dashboard** on http://localhost:5173.

Useful variants:

```bash
SKIP_BUILD=1 bash scripts/start-app.sh     # skip the rebuild (already built)
bash scripts/start-app.sh --api-only       # API server without the dashboard
```

**Stop the app:** press `Ctrl+C` in that terminal — it stops both servers cleanly.

**Verify it is up** (in a second terminal):

```bash
curl http://localhost:5000/api/healthz     # {"status":"ok"}
curl -I http://localhost:5173              # HTTP 200
```

Then open **http://localhost:5173** in your browser → sign in / create your
account through Clerk → you land on the operator dashboard.

---

## 6. Make source collection actually pull updates

The engine runs automatically, but it only collects from sources that pass both
gates. This is the part that is yours to control:

1. **Register sources** — on the dashboard's Sources page (or directly in the
   database during early setup). A source needs a name, owner, county coverage,
   an HTTPS URL or Apify actor, cost/rate notes, and retention notes. Manual
   entry stays available; approved sources are collected automatically.
2. **Approve them** — every new source starts as `pending`. Approve it (with a
   permission note) on the Sources page. Only **approved** sources are collected.
3. **Enable collection** — set the source's `collection_enabled` true and choose
   an interval (hours). Within 60 seconds the scheduler launches the first run;
   every run + observation shows on the Sources page.

Currently registered & approved (added during setup testing — reassign or
re-register them under your own account after you sign in):

| Source | Method | What you get |
|---|---|---|
| Prince George's County Foreclosure Filings | Public JSON API | Newest-first foreclosure filings (addresses) |
| Maryland Foreclosure Notice Counts | Public JSON API | Monthly intent-to-foreclose counts by county |
| New Orleans Sheriff Sales open-data (Socrata) | Public JSON API | Historic lien-foreclosure sheriff sales (2012-era) |
| TN Public Notices page crawl | Apify `website-content-crawler` | Public-notice page crawl — **blocked until your Apify quota resets** |

A reusable seeding script exists at `scripts/seed-fresh-sources.mjs`
(run it with `DATABASE_URL` exported as in section 4).

**Apify quota:** scraper-based sources fail with
`403 Monthly usage hard limit exceeded` while your Apify plan is exhausted.
Public feed/API sources keep working regardless. Clear the quota at
https://apify.com/billing or wait for the monthly reset.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| API exits instantly, log says `DATABASE_URL must be set` | `.env` missing/empty `DATABASE_URL` | Fill it (section 2) |
| `ERR_PNPM_IGNORED_BUILDS` on `pnpm install` | New dependency needs build scripts | Add package under `allowBuilds:` in `pnpm-workspace.yaml` |
| Browser shows sign-in but API pages say 401 | Expected — API routes are Clerk-protected | Sign in via the dashboard at :5173 |
| `403 Monthly usage hard limit exceeded` in a source run | Apify monthly quota exhausted | Billing page or wait for reset |
| Run `failed` with "could not be reached without a redirect" | The feed URL redirects (webpage, not raw feed) | Use the direct feed/RSS/JSON URL |
| Nothing new appears from a stale dataset | The source has no new rows; dedupe hides repeats | Register fresher sources (section 6) |
| Dashboard says "API unavailable" | API server not running, or started after the dashboard | Start API server; refresh page |
| Port already in use (5000/5173) | Old process still running | `pkill -f dist/index.mjs; pkill -f "vite/bin/vite.js"` then restart |

System status lamp in the dashboard header turns from offline to green once the
API responds.

---

## 8. Day-to-day operation

1. `bash scripts/start-app.sh`
2. Open http://localhost:5173 → sign in.
3. Sources page: watch runs/observations; approve new sources; dismiss noise or
   convert observations into leads.
4. **From observation to lead (the human-review flow)** — nothing collected
   ever becomes a lead automatically:

   ```
   Collected update → Review queue (status: needs_review)
     ├─ Convert… → YOU confirm two things in the dialog:
     │    · Lead location / jurisdiction — which county the deal actually
     │      belongs to (drives field-worker matching and distance later)
     │    · Next operator action — e.g. "Research owner and draft outreach"
     └─ Dismiss → ignored permanently
   ```

   When conversion succeeds, the original collected record (title, source URL,
   summary, timestamps) is preserved and **attached to the lead as evidence** —
   you can always show the public record that generated any lead. The
   observation only leaves the review queue after the backend confirms the
   lead creation; if the request fails, the item stays in the queue so a
   failed click never loses a collected update. "Keep in review" closes the
   dialog without changing anything.

5. Leads: score, decide (bid / watch / pass / contract), draft outreach.
6. Workers page: people near job locations for physical ops (cleanouts,
   pickups); Jobs page: plan and track field assignments.
7. `Ctrl+C` to stop everything.

The client-facing services app (`artifacts/distress-client-services`) is a
separate Vite app for clients choosing a service class. It is not part of the
launcher; to run it manually:

```bash
cd artifacts/distress-client-services
PORT=5174 BASE_PATH=/ node --env-file=/workspaces/Flip-Sale/.env node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0
```

> Note: it currently has no `/api` dev proxy configured (the operator dashboard
> has one) — add the same `server.proxy` block from
> `artifacts/distress-intelligence/vite.config.ts` if you want it talking to the
> API during development.

---

## 9. Quick reference

| Command | What it does |
|---|---|
| `bash scripts/start-app.sh` | Start API (:5000) + dashboard (:5173) |
| `pnpm run typecheck` | Typecheck every package (libs first) |
| `pnpm run build` | Build all packages |
| `pnpm --filter @workspace/db run push` | Push schema changes to the database |
| `node scripts/seed-fresh-sources.mjs` | Re-register the fresh public foreclosure sources |
| `scripts/seed-fresh-sources.mjs` inputs | See sources table in section 6 |

Legacy note: the repo was configured for Replit (`.replit`, `postgresql-16`
module). On Replit the deployment router forwards `/api` and serves the built
dashboard; the scripts in this guide are the local equivalent.
