# Distress Intelligence OS — Feature Guide and Remaining Work

**Status reviewed:** October 13, 2026  
**Purpose:** Explain what the current application does, how an operator uses it, and what still needs to be built before it supports the full operating model in the development blueprint.

> This guide describes the code currently in the app, not every feature in the long-term blueprint. A source record, review status, score, or screen does not by itself establish legal permission, professional authority, or business readiness.

## 1. Current product scope

The app is a sign-in-protected, human-operated workspace for recording and evaluating distress-related opportunities. The configured first pilot is **Estate / probate** in four Texas counties:

- Harris and Fort Bend counties in the Houston area
- Dallas and Tarrant counties in the Dallas–Fort Worth area

Other asset classes are available in the lead workflow, but not all have a complete scoring model or dedicated operating process. The app is decision support: it does not automatically contact people, place bids, sign agreements, dispatch workers, or move money.

The starting source registry is intentionally empty. No data provider, feed, or collection permission is assumed to be approved.

## 2. Implemented features

### 2.1 Sign-in and record ownership

- The application uses Clerk sign-in.
- Workspace API routes require an authenticated user.
- Leads, sources, source reviews, authority reviews, jobs, and workers are scoped to the signed-in user. One user cannot use these routes to access another user's records.
- A public health check is available for service monitoring; it does not expose workspace records.

**Current limit:** This is user-level ownership, not a full organization/team permission system. There are no separate administrator, researcher, field coordinator, worker, buyer, or auditor roles yet.

### 2.2 Operator overview dashboard

The dashboard reads live records from the API and displays:

- Total opportunities and counts by asset class and pipeline stage
- Leads needing research and awaiting a human decision
- Active deals and expected pipeline value, separated by currency
- Available workers and open field jobs
- Recent lead/job activity
- A launch-focus panel showing the Texas counties and estate/probate pilot, plus the fact that live source access is not connected

The values are computed from the records in the workspace. The dashboard does not yet show source-ingestion runs, deadlines, contact follow-ups, settlement balances, or predicted-versus-realized performance.

### 2.3 Lead capture, review, search, and deletion

Operators can create, inspect, edit, search, filter, and delete leads. Lead lists can be filtered by asset class, stage, and decision, and searched by title, location, source, distress signal, or contact name.

The lead record includes:

- Title, asset class, stage, and distress signal
- A selected Texas launch county and optional city/area detail
- Source attribution, evidence URL, and relevant event date
- Contact name, email, phone, and a basic contact-status value
- Currency, risk flags, location context, and class-specific input fields
- Calculated score, decision, expected value, hard vetoes, missing inputs, and score breakdown when available

County is required and restricted to Harris, Fort Bend, Dallas, or Tarrant. The API checks it as well as the form. The app does not geocode a street address or verify that the entered city is actually in the selected county.

The current stages are Detected, Researched, Contacted, Negotiating, Under contract, Monetizing, Settled, and Dead. An operator selects the stage. A full stage-transition policy, required exit checks, next-action owner, due date, and reason code are not implemented.

Deleting a lead is an explicit, irreversible action in the current interface.

### 2.4 Lead evidence records

After creating a lead, an operator can add evidence entries containing:

- Evidence type
- Source name and optional URL
- How the information was collected
- When it was observed
- A summary of the observed facts

This supports a basic provenance trail and helps distinguish observed facts from conclusions. The lead form also has a general evidence URL.

**Current limit:** Evidence is entered as text and links. There is no document/photo upload, OCR, image extraction, deduplication workflow, confidence scoring, or complete before-and-after history for every lead edit.

### 2.5 Source registry and permission review

The Source Permissions page lets an operator register a source with:

- Name and optional URL
- Source owner
- Access method (for example manual entry, public download, authorized feed, API, partner submission, or another method)
- County coverage
- Cost/rate notes
- Retention notes

New sources enter as **pending**. An operator can record an approval or rejection with a required review note. The app stores the reviewer identity and time and retains source permission decisions as review-history records. If key details of an approved source change, its approval is reset to pending and a review-history entry records why.

Only an approved source can be selected for registered-source attribution. The lead form filters choices to the selected county, and the API also checks that the approved source covers that county. **Manual operator entry** remains available as a separate attribution option.

**Important:** Recording an approval is an internal operator decision, not a legal opinion or confirmation from the source owner. Cost/rate and retention fields are notes; the app does not enforce a rate limit, charge budget, or automatically delete data at the end of a retention period. Registering or approving a source does not connect it or start collection.

### 2.6 Estate authority review

Estate/probate leads have a separate authority-review panel. Authority status is **unknown**, **verified**, or **rejected**. A review must include notes; a verified or rejected decision must also include an evidence reference. The authenticated reviewer and review time are recorded by the server, and each decision is stored in an append-only review history.

New estate leads start with authority **unknown**. Unknown and rejected authority create a hard veto for estate scoring. The review endpoint only accepts estate/probate leads. Changing ordinary risk flags cannot bypass this authority check. The estate-specific authority gate does not add an estate veto to other asset classes.

**Current limit:** The app records an operator's review and evidence reference; it does not retrieve court records, validate signatures, or determine legal authority.

### 2.7 Current scoring and routing

Scores are calculated on the server when a lead is created or updated. Missing required inputs are reported instead of silently treated as favorable. Scoring rules have version labels in the returned record, and some classes expose weighted input breakdowns.

#### Storage

- Eight inputs contribute to a 0–100 score: brand visibility (25%), container composition (15%), facility tier (15%), scrap coverage (10%), owner/context (10%), unit visibility (10%), cleanout ease (10%), and auction horizon (5%).
- Expected value is estimated resale value multiplied by resale probability, plus scrap floor, less cleanout cost and dump fees.
- The starting recommended bid is 45% of expected value.
- Decisions are: PASS below 40 or when expected value is not positive; WATCH from 40 to below 55; CONDITIONAL BID from 55 to below 70 only when the scrap floor covers the recommended bid; BID from 70 upward.
- Applicable hard vetoes take priority over the score.

#### Real estate

- Five score inputs are equally weighted: discount to maximum allowable offer (MAO), motivation, timeline, title clarity, and buyer liquidity.
- MAO is calculated as `ARV × 0.70 − repair cost`.
- The required assignment fee is the greater of $10,000 or 10% of contract price. The app calculates the resulting recommended offer where inputs are available.
- Decisions are CONTRACT at 75 or above, OPTION / REFER from 60 to below 75, and PASS below 60. Hard vetoes take priority.

#### Estate / probate

- Gross contents value can be entered as an override or estimated from category inputs using initial resale ratios: tools 60%, electronics 50%, furniture 40%, household/kitchen 20%, and clothing 10%.
- Expected value is gross contents value less cleanout cost and dump fees.
- The score weights expected contents value (35%), executor cooperation (20%), resale density (20%), access/logistics (15%), and timeline (10%). The value input is normalized against $2,000 for this weighted score.
- If expected value is below $800, the route is REFER. From $800 to below $2,000, it is HYBRID. At $2,000 or more, CLEANOUT / CONSIGN requires a recorded business share producing at least $800 net to the business.
- Unverified or rejected authority blocks the estate route regardless of editable risk flags.

#### Junk / scrap

- RUN requires the scrap estimate to be at least 1.5 times runner payout plus dump fees, the pickup to be within the configured service radius, and no resellable items to require separate valuation.
- Missing inputs are surfaced. Applicable hard vetoes take priority.

#### Commercial closures and multi-asset packages

These classes can be recorded, filtered, and reviewed, but there is no approved commercial scoring model or package valuation engine. They remain manual-review workflows; the app does not present an invented automated score for them.

**Current limits:** Rules are implemented in code rather than managed through an administrator-facing, versioned configuration screen. A version label is stored, but there is no rule-change approval workflow or full model-calibration system. Scoring behavior and thresholds must be validated against real operating costs before live use.

### 2.8 Workers and field jobs

The People Network page supports creating, editing, listing, and removing worker profiles with display name, home area, skills, availability, service radius, and optional approximate coordinates. When a job is selected, the app can compare workers using skill match, availability, and approximate distance/service radius, and show reasons for the match result.

The Field Operations page supports creating, editing, listing, filtering, and deleting jobs. A job can include a linked lead, job type, location, schedule, required skills, estimated hours, payout amount/currency/structure, optional coordinates, assigned worker, and status.

Job statuses follow a limited sequence: open → invited → assigned → in progress → completed, with cancellation allowed from active stages. The API requires a worker for assigned/in-progress states and checks availability, required skills, and service radius when location data is available. The interface's invite/assign controls record a status change; they do not send an invitation or receive a worker's acceptance.

**Current limits:** There is no worker login or worker-only view, verification/safety/insurance process, automated invitation, acceptance flow, live tracking, completion evidence, expense capture, or approved payout/settlement flow. Approximate matching is a planning aid, not a dispatch decision.

### 2.9 Activity feed

The dashboard shows recent lead and job changes recorded by the API. Source-permission and estate-authority decisions have their own histories.

**Current limit:** This is not yet a complete audit log of all field changes. There is no universal event timeline containing old/new values, actor permissions, every read of sensitive data, or a retention/export workflow.

## 3. What remains before the full operating model is implemented

The following work is not present in the current app or is only represented by a basic/manual version.

### Priority 1 — Confirm operating permissions and policies

Before using live data or contacting real people:

1. Review and approve the exact source, access method, terms, rate/cost limits, and retention policy for each intended source.
2. Define contact eligibility, consent/provenance, do-not-contact handling, permitted channels, opt-outs, contact hours, and human message approval.
3. Confirm the jurisdiction-specific estate/probate, real-estate, referral, privacy, worker, insurance, and safety procedures with qualified reviewers.
4. Define who may approve source access, estate authority, outreach, job assignments, financial adjustments, and any override.

The app supports recording some of these decisions; it does not make those decisions for the business.

### Priority 2 — Complete lead operations and CRM workflow

- Add lead assignment, next action, due date, deadline reminders, stale-lead indicators, and documented reason codes.
- Enforce allowed pipeline transitions and required information before a lead advances.
- Add duplicate detection and a reviewed merge process that preserves evidence and provenance.
- Add full lead change history, including who changed which fields and when.
- Add contact qualification, consent/source provenance, suppression/do-not-contact state, and jurisdiction/channel checks.
- Build reviewed outreach templates, draft preview, named human approval, send/reply/failure logging, follow-up queue, and attempt limits. Sending must remain disabled until the operating policy and integrations are approved.

### Priority 3 — Add complete economics and settlement records

- Add deal, expense, receipt, counterparty split, payout, settlement, and payment-reference records.
- Separate projected value from collected cash.
- Reconcile actual income, costs, business/heir/owner share, crew payout, fees, and days to cash.
- Require settlement checks or an explicitly authorized exception before marking a deal settled.
- Start with manual ledgered settlement; connect a payment provider only after its suitability and jurisdiction are reviewed.

### Priority 4 — Finish the field-operations workflow

- Add worker/crew eligibility and verification status, safety requirements, capacity, and privacy-aware access rules.
- Implement actual invite, acceptance, assignment, progress, and cancellation records rather than status-only controls.
- Add completion evidence, receipts, recovered-material values, dump fees, actual hours, and payout approval.
- Ensure workers only see jobs assigned or offered to them; restrict exact addresses and personal/location data by role.
- Add a manual location/availability path and a weekly scheduling view.

### Priority 5 — Add authorized lead intake and source operations

- Select and review the first real source(s) for the pilot before building a connector.
- Add controlled CSV/manual batch import, validation, duplicate review, and source timestamps.
- Add authorized API/feed adapters only where permitted, with run status, last success/failure, retries, pause switch, budget cap, and collection logs.
- Preserve external source IDs and observation timestamps so repeated records can be deduplicated without losing provenance.
- Do not activate scraping, skip-tracing, paid enrichment, or scheduled collection merely because the Source Registry has a corresponding access-method option.

### Priority 6 — Finish scoring, explainability, and quality controls

- Validate formulas and thresholds with real costs and qualified operating reviewers.
- Add full rule configuration/version approval, reproducible score runs, rule-change history, and an audited override process.
- Complete and test the commercial and package models only after their rules are explicitly defined.
- Add missing-value, boundary, veto, and regression tests for every scoring engine; preserve the input and rule version that produced each decision.
- Add event-triggered re-scoring for relevant dates and evidence changes, with a human review queue rather than silent decision changes.

### Priority 7 — Production readiness and privacy

- Add organization/team roles and least-privilege access for contact details, addresses, worker data, and financial records.
- Implement data retention and deletion behavior; current retention notes are informational only.
- Configure and test backups/restore, monitoring, alerting, rate/cost reporting, and incident procedures.
- Add end-to-end tests for authenticated lead, source approval, authority review, scoring, worker, and job workflows.
- Test the signed-in application with a permitted test account and review the production Clerk configuration before launch.

## 4. Suggested operator workflow today

1. **Sign in** and review the dashboard. It summarizes records that have already been entered; it does not discover leads.
2. **Register a source** before using it for registered-source attribution. Record its owner, scope, method, costs/rates, and retention notes. Keep it pending until a human has reviewed the permissions and terms.
3. **Approve or reject the source** with a review note. Approval only makes it eligible for attribution; it does not connect the source or start collection.
4. **Create a lead** and choose one of the four pilot counties. Select a county-covering approved source or choose the explicitly labeled Manual operator entry option.
5. **Enter evidence and class inputs.** Save the lead to calculate its current score/decision. For an existing lead, add separate evidence records with source, collection method, observation date, and summary.
6. **For estate leads, record authority separately.** Keep status unknown until reviewed. Use a verified or rejected decision only with an evidence reference and review notes.
7. **Use the decision as decision support.** Review missing inputs, vetoes, score breakdown, estimates, and human/legal constraints before taking action.
8. **Plan field work manually** by creating a job and worker profiles. Matching helps identify possible candidates; the coordinator still records invitations and assignments and remains responsible for safety and privacy.

## 5. Verification snapshot

For the current code snapshot:

- Database schema update applied successfully.
- API and web TypeScript checks passed.
- Seven estate-scoring tests passed, including authority-gate and non-estate behavior.
- The web and API services restarted and the public landing page rendered.
- The API health check returned `{"status":"ok"}`; protected workspace endpoints returned an authentication-required response without a sign-in session.

The signed-in pages and authenticated CRUD journeys were not visually exercised in the preview because that preview browser had no login session. The app's authentication was left enabled.

## 6. Release boundary

The current app is a working authenticated workspace for manual lead capture, source governance, basic deterministic scoring, estate authority review, and manually coordinated field jobs. It is **not yet the complete end-to-end operating system** described in the blueprint: it has no live source ingestion, compliant outreach system, complete worker dispatch, deal ledger/settlement, or production-grade role/retention/audit controls.

Treat all projected values as estimates, keep consequential actions under human approval, and do not interpret an in-app approval or score as legal permission or a guarantee of profit.
