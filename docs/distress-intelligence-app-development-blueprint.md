# Distress Intelligence Operating System
## Phased Application Development Blueprint

**Blueprint version:** 1.0  
**Source:** *Distress-Intelligence Operating System — Complete Blueprint, Scoring Models & Operating Documentation, v1.1*  
**Purpose:** Translate the supplied operating concept into a phased, testable plan for a working application.

> This plan reflects the supplied document; it does not independently verify that a listed data source, platform, API, scraping method, payment provider, or legal approach is currently available or permitted. Confirm market and jurisdiction before enabling live sourcing, outreach, contracting, or payments.

---

## 1. Product in one sentence

Build an operations platform that records distress signals across asset classes, researches and scores leads using explicit rules, routes each qualified opportunity to a permitted deal path, coordinates people doing physical work, records every dollar, and improves its estimates using realized outcomes.

The application should help an operator answer, for every lead:

1. What is the opportunity, where did it come from, and how fresh is the information?
2. What evidence supports the lead and its estimated value?
3. What score, expected value, hard veto, and decision rule apply?
4. What is the next allowed action and who owns it?
5. What did the deal actually earn or cost?

The system is decision support for a human operator. It should not autonomously contact people, bid, sign agreements, dispatch workers, or move money in the initial releases.

## 2. Business model and operating constraints from the source

The proposed operation detects financial distress and surplus property across storage, real estate, estates, commercial closures, and junk/scrap. A lead is routed to one of the defined outcomes:

- **Storage:** bid, conditional bid, watch, or pass.
- **Real estate:** contract, option/refer, or pass.
- **Estate:** cleanout-consign, hybrid, pass, or refer.
- **Junk/scrap:** run or pass.
- **Multi-asset:** evaluate the pieces separately, then consider a package.

The source describes a roughly **$10 starting-capital constraint**. Deals therefore rely on revenue share, assignment, referral, consignment, or pay-after-sale arrangements rather than upfront purchases. The app must surface cash exposure and deal structure explicitly; it must not imply that operating costs, paid data, legal review, insurance, or platform fees are actually zero.

The proposed operating loop is:

`Sources → Ingest → Lead database → Scoring engines → Master router → CRM pipeline → Monetization → Ledger → Calibration`

Runners, cleanout crews, buyers, facility managers, attorneys, and other partners participate in the physical and transaction workflow.

## 3. Product principles

1. **Evidence before scores.** Every important input should have a value, source, timestamp, and confidence or review state.
2. **Deterministic decisions.** Identical inputs and rule versions produce identical scores. AI may extract or summarize evidence, but must not silently change the scoring math.
3. **Human approval at consequential steps.** A person approves outreach, bids, agreements, worker assignments, and settlements.
4. **No hidden assumptions.** Missing information stays unknown; it is not silently scored as favorable.
5. **Automate sources selectively.** Prefer authorized APIs, feeds, exports, and documented/manual capture. Scraping is an adapter option only when the site permits it and access controls are respected.
6. **Track source quality and freshness.** Stale leads and failed collection runs must be visible.
7. **Protect people and location data.** Contact details and worker locations are role-restricted and used only for the workflow.
8. **Make the economics auditable.** Predicted value, costs, splits, cash timing, and actual results are separately recorded.
9. **Ship incrementally.** Prove one end-to-end workflow before investing in broad, fragile source automation.

## 4. Decisions to resolve before live operations

These are product configuration gates, not assumptions to bury in code:

- **Operating jurisdiction and initial market:** The source document names primarily U.S. public-record, auction, and consumer-contact sources. Confirm the country/state/county where the business will operate and which local laws apply.
- **First launch asset class:** Choose the first class to use in a real workflow. The schema can support all classes from the start, but initial source integrations and operational testing should be narrow.
- **Source permissions and collection method:** For each source, record whether access is by API, permitted feed, public download, manual entry, or an approved scraping provider. Verify terms, rate limits, licensing, and data-retention requirements.
- **Contact policy:** Define allowed channels, consent/opt-out handling, contact-hour rules, do-not-contact checks, message review, and retention. The source’s DNC reference and outreach scripts require jurisdiction-specific review before use.
- **Worker operating model:** Decide whether workers are employees, contractors, partner crews, or referrals; define eligibility, insurance/safety checks, payout rules, and who can see exact job addresses.
- **Cash and payment workflow:** Confirm the legal business account and suitable payment rails. The source mentions WHOP, but its fit for deal remittances and payouts is not assumed. Start with ledgered manual settlement if needed.
- **Budget and service limits:** Establish a spend limit for paid enrichment, vision analysis, scraping, communications, and infrastructure. Do not spend on skip-tracing until a lead passes the approved qualification gate.
- **Human override policy:** Define who can override a score or hard veto, what evidence is required, and how the override is audited.

## 5. Users and permissions

| Role | Main responsibilities | Default access |
|---|---|---|
| Owner / administrator | Configure market, thresholds, users, permissions, sources, and audit policy | All operational data and configuration |
| Research / sourcing operator | Capture leads, attach evidence, resolve identity, review comps | Assigned leads and source details |
| Deal / outreach operator | Review decisions, prepare and approve outreach, manage replies and negotiations | Assigned leads, approved contact details, message history |
| Field-operations coordinator | Find available workers, dispatch approved jobs, confirm completion | Job requirements, approximate candidate proximity, assigned job details |
| Runner / crew member | Set availability, accept a job, report progress and expenses | Only assigned job details and payout terms |
| Buyer / partner | Receive a permitted opportunity or referral, report outcome | Only the opportunity intentionally shared |
| Auditor / bookkeeper | Review deal ledger, receipts, settlements, and closeout | Financial records, limited contact details |

Use least-privilege permissions. Exact contact information, property addresses, worker identity/location, and financial records should not be visible to every user by default.

## 6. Application areas

### 6.1 Operations overview

- Leads by class, stage, owner, age, and next action.
- Upcoming auction, foreclosure, closing, and pickup dates.
- Qualified opportunities awaiting review.
- Outreach needing approval or follow-up.
- Open jobs and worker availability.
- Deals awaiting cash collection, payout, or settlement.
- Source-ingestion health and stale/failed pulls.
- Predicted-versus-realized performance summaries.

### 6.2 Separate asset-class workspaces

Each class gets a dedicated dashboard, filters, evidence fields, scoring form, and decision queue. The pages share a common lead record and pipeline rather than maintaining disconnected copies.

1. **Storage units:** facility, unit/auction date, photos, visibility, contents extraction, scrap estimate, cleanout estimate, bid ceiling, and hard-veto review.
2. **Real estate:** property, ownership evidence, ARV comps, repair estimate, MAO, motivation/timeline evidence, title status, matched buyers, and jurisdiction/licensure check.
3. **Estates and probate:** case/estate signal, executor authority, contents estimate, resale mix, access/logistics, closing deadline, signed authorization, and proposed remittance structure.
4. **Commercial closures:** business/entity, dissolution/UCC/bankruptcy/closure evidence, assets, timing, and the selected downstream route. The source defines detection signals but not a complete separate commercial scoring model; do not invent one. Initially route to a human-selected existing engine or pass/watch pending a future approved model.
5. **Junk and scrap:** request/source, location, material estimate, service radius, runner payout, dump fees, scrap-floor calculation, resellable-item check, and run/pass decision.
6. **Packages:** related leads/assets, individual valuations, package adjustment, shared logistics, and combined decision with a written rationale.

### 6.3 Lead record and evidence

Each lead should include:

- Unique lead and, when applicable, parent/package IDs.
- Asset class and subtype.
- Original source, source record/link, collection method, observed time, and last-verified time.
- Location with jurisdiction and geocoding status.
- Distress signal and supporting evidence.
- Owner/entity/contact data with source, confidence, permission/qualification status, and restricted visibility.
- Photos, documents, notes, comps, estimates, and extraction/review history.
- Scoring inputs, score, EV, decision, rule-set version, hard vetoes, and overrides.
- Current stage, assigned operator, next action, due date, and event/timeline triggers.
- Contact/consent/opt-out state and message log, if applicable.
- Predicted economics, actual transactions, reason codes, and closeout state.

Keep the raw source snapshot or a defensible reference when permitted, rather than storing more personal data than needed. Record deletion/retention policy per source and jurisdiction.

### 6.4 CRM pipeline

Implement the source’s stages as configurable but auditable states:

`Detected → Researched → Contacted → Negotiating → Under Contract / Transfer → Monetizing → Settled`

`Dead` is a terminal route available from appropriate stages and requires a reason code. Enforce stage exit criteria, but allow authorized operators to correct mistakes with an audit entry. Timeline events should queue a re-score for WATCH leads rather than silently changing a deal decision.

### 6.5 Outreach and service proposals

- Store reviewed templates by audience, asset class, jurisdiction, and channel.
- Draft a tailored professional proposal using approved lead facts and service terms.
- Show the evidence used and flag unknown or unverified claims.
- Require a human to review and approve the exact recipient and message before sending.
- Log channel, sender, sent time, delivery/failure, reply, opt-out, and next permitted step.
- Block sending where the contact is not qualified for outreach, is opted out, fails a required compliance check, or lacks required approval.
- Provide a one-click internal “do not contact” control and enforce it across campaigns.
- Treat the source’s sample scripts as draft copy only; legal and market review is required before use.

### 6.6 Field operations and worker matching

Provide a page to:

- List jobs by location area, date/time window, job type, estimated duration, required skills/equipment, safety notes, and payout formula.
- Maintain worker/crew profile, service radius, current availability, capabilities, verification status, and past reliability.
- Match workers by distance to the job, availability, skills, service radius, and eligibility—not distance alone.
- Let the coordinator compare candidates, invite/assign, record acceptance, and track completion.
- Record before/after evidence where appropriate, receipts, material recovered, dump fees, and payout calculation.
- Stage upcoming-week physical jobs and identify unfilled shifts.

Use opt-in, coarse or time-limited location data where possible. Do not expose a worker’s live or exact location to other workers or unrelated users. Reveal the exact job address only to authorized candidates when needed; log access. Include a manual location/availability path for users who do not grant device location.

## 7. Scoring and routing requirements

Scores, thresholds, formulas, probabilities, and hard vetoes must be stored as versioned configuration. Each result must be reproducible and show a breakdown of inputs and weighted contributions.

### 7.1 Storage score

The supplied weights total 100:

| Input | Weight |
|---|---:|
| High-value brand visibility | 25 |
| Container composition | 15 |
| Facility tier | 15 |
| Scrap floor coverage | 10 |
| Owner/context profile | 10 |
| Unit visibility | 10 |
| Cleanout complexity (inverse) | 10 |
| Auction horizon | 5 |

`Score = Σ(weight × sub-score) / 100`

`EV = Σ(item resale comp × probability of sale) + scrap floor − cleanout cost − dump fees`

The source’s starting bid ceiling is `EV × 0.45`. Its score bands are: 70–100 BID; 55–69 CONDITIONAL BID only when scrap floor covers the bid; 40–54 WATCH; below 40 PASS. Apply the listed hard vetoes regardless of score. The UI must distinguish **score-based eligibility** from the **dollar bid ceiling**.

### 7.2 Real-estate wholesale score

`MAO = ARV × 0.70 − repair cost`

Required assignment fee is described as `max($10,000, 10% of contract price)`. The supplied decision bands are 75–100 CONTRACT, 60–74 OPTION / REFER, below 60 PASS. Track the discount to MAO, motivation evidence, timeline, title/lien clarity, and buyer liquidity. Include title, occupancy, licensing, disclosure, and jurisdictional review gates. Never label a user a licensed professional or assert a legal conclusion based on the score.

### 7.3 Estate / probate score

`EV_contents = Σ(category estimate × resale ratio) − cleanout cost − dump fees`

Starting resale ratios in the source: tools 0.60, electronics 0.50, furniture 0.40, kitchen/household 0.20, clothing 0.10, and specialist review for antiques/collectibles. Store its five weighted inputs: estimated contents EV (35), executor urgency/cooperation (20), resale density (20), access/logistics (15), and timeline (10).

The source routes EV ≥ $2,000 and net-to-us ≥ $800 to CLEANOUT-CONSIGN; EV $800–$2,000 to HYBRID; below $800 to PASS / REFER. The source also lists dispute, authorization, and biohazard vetoes. Present both EV and net-to-business requirement; do not infer an authorization exists.

### 7.4 Junk / scrap gate

`RUN` only when `scrap estimate ≥ 1.5 × (runner payout + dump fees)` and pickup is within the configured service radius. Check for resellable items before the scrap calculation. Display the calculation and the source/freshness of scrap-price assumptions.

### 7.5 Master router

- Select engine by asset class and retain the original class decision.
- Apply hard vetoes before recommending a route.
- A PASS may only be overridden with a hard-number rationale, authorized role, and audit record.
- Re-score WATCH leads when a relevant recorded event occurs.
- Run the scrap-floor check for marginal cases where applicable.
- For a multi-asset package, preserve component calculations and record package adjustments separately.
- Do not treat AI extraction or a missing field as a final decision; require review where confidence is low.

## 8. Data and system design

### 8.1 Suggested first implementation

- Responsive web application for desktop operations and mobile field use.
- TypeScript front end and API, with a relational database such as PostgreSQL.
- Background job queue for scheduled pulls, event-triggered re-scores, reminders, and retries.
- Object storage for photos and permitted documents.
- Role-based authentication, audit log, encrypted transport, backups, and secret management.
- Provider adapters behind a common source interface so a source can be disabled or replaced without rewriting the lead workflow.
- Configuration and schema migrations tracked in version control.

The stack is a recommendation for the build, not a commitment to any particular third-party service or paid plan.

### 8.2 Core records

Initial data model should cover:

`User`, `Role`, `WorkerProfile`, `Lead`, `Asset`, `Package`, `Source`, `SourceObservation`, `Evidence`, `Contact`, `ConsentStatus`, `ScoreRun`, `RuleSetVersion`, `Decision`, `Override`, `PipelineEvent`, `Message`, `Job`, `JobAssignment`, `JobCompletion`, `BuyerMatch`, `Deal`, `Expense`, `Payment`, `Settlement`, `ReasonCode`, and `AuditEvent`.

Do not place all class-specific fields in an unstructured notes column. Use typed fields for score inputs and a flexible extension for class-specific evidence, retaining schema validation.

### 8.3 Source adapter contract

Every automated/manual source adapter should expose:

- Source identity, class, supported geographic scope, and collection method.
- Permission/terms review status, rate limit, cost, and data-retention notes.
- Last successful run, last attempted run, records added/updated, and failure reason.
- Stable external record identifier when available; deduplication key and merge review.
- Observation timestamp and source link.
- Pause switch and budget cap.

Run ingestion in a reviewable path: `fetch → normalize → deduplicate → qualify → persist evidence → create/update lead → report`. Source failures must not be represented as “zero new leads” without an explicit status.

## 9. Development phases

### Phase 0 — Market, policy, and workflow validation

**Goal:** Avoid building a US-specific sourcing and outreach product for an unconfirmed market or embedding unsafe assumptions.

**Build/configure**

- Confirm jurisdiction, initial operating area, initial asset class, users/roles, and service radius.
- Review source list and tag each source as API/feed/manual/approved scraper/not approved/unknown.
- Define contact approval, opt-out, retention, eligibility, worker safety, override, and settlement policies.
- Resolve payment/accounting workflow and actual initial software/data budget.
- Convert each proposed outcome into a human-reviewed process map and stage exit criteria.

**Exit gate**

- One initial market and asset class are selected.
- There is a documented approved acquisition and outreach path for test leads.
- Scoring inputs and responsible reviewers are agreed.
- Known legal or provider-permission blockers are explicitly excluded from the first release.

### Phase 1 — Secure lead workspace and class dashboards

**Goal:** Replace scattered lead notes with one auditable source of truth.

**Build**

- Authentication, roles, organization settings, and audit events.
- Lead creation/editing, evidence upload/linking, source attribution, notes, deduplication review, assignment, and search.
- Separate dashboards for storage, real estate, estates, commercial, junk/scrap, and package leads.
- Shared pipeline with next action, due date, timeline event, reason code, and stale-lead indication.
- Manual entry and CSV import for the first test cohort.
- Overview dashboard for stage, owner, age, deadlines, and source freshness.

**Acceptance criteria**

- A lead can be created, researched, assigned, advanced, rejected, and retrieved without losing its evidence or history.
- Every lead has an asset class, source, owner, stage, and next action or explicit reason it has none.
- Duplicate candidates can be reviewed and merged without silently discarding provenance.
- A user without a role cannot access restricted contact, worker, or financial data.

### Phase 2 — Deterministic scoring, EV, hard vetoes, and router

**Goal:** Make the operating rules usable and testable inside the app.

**Build**

- Versioned scoring configuration and per-class forms.
- Score breakdowns with evidence references, confidence/review state, and missing-input warnings.
- Storage EV and bid ceiling; real-estate ARV/repair/MAO; estate contents EV; junk/scrap gate.
- Hard-veto checks, master router, WATCH event re-score queue, package evaluation, and auditable override flow.
- Unit and regression tests for score boundaries, formulas, missing values, vetoes, and rule-version changes.

**Acceptance criteria**

- Identical input plus identical rule version returns the same result.
- Every decision is explainable from stored inputs and formulas.
- Hard vetoes cannot be bypassed without the approved override role, rationale, and audit record.
- Threshold boundaries and formulas match approved configuration; the source document’s worked examples are represented as test fixtures where internally consistent.

**Important review items before production:** validate all calculations and examples against the operator’s real costs and jurisdiction. Treat the source’s values as starting parameters, not proven performance.

### Phase 3 — CRM execution and reviewed outreach

**Goal:** Turn approved leads into orderly, compliant conversations.

**Build**

- Contact qualification state, provenance, opt-out/suppression list, and permitted-channel checks.
- Outreach templates by class and audience, with placeholders tied to verified lead data.
- Drafting, human preview/approval, send logging, reply logging, reminders, and attempt limits.
- Contact-to-reply and reply-to-agreement metrics with definitions.
- Follow-up queue and communication history on each lead.

**Acceptance criteria**

- No message can be sent without a named operator’s approval and a valid recipient/channel state.
- Opt-outs and suppressed contacts are blocked consistently across all outreach screens.
- A message record shows exact content, recipient, sender, time, and status.
- Unverified claims and missing terms are flagged before approval.

**Initially out of scope:** autonomous bulk messaging, automated skip-tracing of unqualified leads, and automatic negotiation.

### Phase 4 — Physical job board and worker matching

**Goal:** Schedule real-world pickups and cleanouts without exposing unnecessary personal/location data.

**Build**

- Worker and crew profiles with opt-in availability, skills, capacity, service radius, and verification status.
- Job creation from an approved lead/deal, location, date window, instructions, safety requirements, and payout formula.
- Candidate match list based on availability, travel distance, radius, skill, and eligibility.
- Invite/accept/assign workflow, coordinator view, progress states, completion evidence, expense capture, and payout approval.
- Weekly staging board for upcoming jobs.

**Acceptance criteria**

- Coordinator can find eligible candidates without exposing their precise location to other candidates.
- A worker sees only jobs they are invited to or assigned to.
- Every job records agreed compensation before acceptance and actual costs at closeout.
- No worker is automatically dispatched or paid by a score.

### Phase 5 — Detection and source integrations

**Goal:** Reduce manual discovery while keeping source permissions, freshness, and cost visible.

**Build in priority order**

1. Public/authorized CSV imports and permitted feeds for the chosen market.
2. Scheduled API integrations where a suitable authorized API exists.
3. Alerts, email ingestion, or partner submissions with human review.
4. Approved scraping-provider tasks only for specific sources whose terms and access permit the method.
5. Identity resolution and paid enrichment only after the lead passes the configured qualification gate.
6. Optional photo/item extraction that produces suggestions with confidence and requires operator review.

**Acceptance criteria**

- Each source has documented access method, scope, run cadence, rate/cost limit, and owner.
- A run reports success, partial success, or failure distinctly, with retry visibility.
- Deduplication avoids creating a new lead for every repeated observation.
- Every extracted lead retains its source and observed-at timestamp.
- Disabled, blocked, or terms-uncertain sources cannot continue scheduled runs.
- Paid enrichment cannot execute before qualification and budget checks.

**Source families to evaluate from the supplied document:** storage-auction listings and lien notices; county recorder/assessor, treasurer, sheriff, probate and open-data portals; obituary and estate-sale sources; Secretary of State/UCC and bankruptcy records; local closure alerts; free-item and removal-request sources; authorized resale-comps sources; and contact/compliance services.

### Phase 6 — Deal ledger, payouts, and settlement

**Goal:** Prove whether the low-cash operating model works with actual deal economics.

**Build**

- Deal ledger with predicted EV, all direct/indirect costs, gross, owner/heir share, runner/crew share, fees, realized margin, and days to cash.
- Receipts and payment references; expected-versus-actual settlement checklist.
- Manual settlement recording and approval first; integrate supported payment rails only after provider, jurisdiction, and account fit are verified.
- Weekly reconciliation and reason code when realized margin is below the agreed tolerance.
- Float/exposure view separating reserve, business cash, committed costs, and deal-specific receipts.

**Acceptance criteria**

- A deal cannot be marked settled until the required collections, payouts, and ledger checks are completed or an authorized exception is recorded.
- Ledger arithmetic can be traced to its underlying expense and payment entries.
- Every counterparty split and payout has a source agreement or authorized override.
- The app never represents a projected EV as collected cash.

### Phase 7 — Calibration, operating analytics, and launch hardening

**Goal:** Use closed deals to improve assumptions and launch safely.

**Build**

- Predicted-versus-realized EV by class, category, facility/source, and time period.
- MAPE and sample count with warnings for small or incomplete samples.
- Monthly review queue for category errors, recurring negative margins, facility tiers, and dead-reason codes.
- Rule-change proposal and approval workflow; do not auto-tune live thresholds without human review.
- KPI dashboards for lead volume, contact/reply, reply/deal, average fee, EV accuracy, job completion, days-to-cash, and cost per qualified lead.
- Backups/restore test, monitoring, permission review, data-retention process, rate/cost alerts, and incident response checklist.

**Acceptance criteria**

- Realized results are linked to the prediction and rule version that produced the decision.
- Calibration reports show numerator, denominator, date range, and sample size.
- Proposed changes can be compared with the current rules before approval.
- Operational KPIs are clearly defined; target values from the source are treated as goals, not verified baselines.

## 10. Suggested release sequence

### Pilot release

- One confirmed market and one asset class.
- Manual/CSV lead capture.
- Lead record, evidence, pipeline, score/EV, router, human-approved outreach, and deal ledger.
- Small group of trained users and test data before live counterparties.

### Operational release

- Add the remaining class dashboards and applicable scoring engines.
- Add job scheduling and worker matching.
- Add only the highest-value approved source integrations.
- Track actual outcomes and reconcile every closed deal.

### Scale release

- Expand source coverage, geographic scope, job volume, and partner access only after source quality and unit economics are demonstrated.
- Add event-driven re-scoring and approved automation.
- Use calibration evidence to revise parameters with explicit human sign-off.

## 11. Non-functional requirements

- **Security:** least privilege, secure authentication, protected secrets, encrypted transport, audit logs, backups, and tested restore.
- **Privacy:** collect only necessary identity/contact/location data; define retention and deletion; restrict exact location and contact access.
- **Reliability:** ingestion retries, idempotency, duplicate detection, job failure queues, and visible last-success timestamps.
- **Explainability:** show score inputs, weights, formulas, data provenance, rule version, vetoes, and override reason.
- **Accessibility and field usability:** responsive layouts, low-bandwidth-friendly forms, readable status indicators, and mobile completion flows.
- **Financial integrity:** use decimal-safe currency arithmetic, record currency and market, preserve immutable transaction history, and reconcile split totals.
- **Configurability:** thresholds, service radius, source cadence, allowed channels, pay formulas, and reason codes are versioned and scoped to a market.
- **Observability:** track ingestion errors, message status, queue lag, failed jobs, system access, and budget usage without logging secrets or unnecessary personal data.

## 12. Risks and controls

| Risk | Control |
|---|---|
| A source blocks or prohibits automated access | Verify access terms first; prefer authorized APIs/feeds/manual import; provide source kill switch and transparent failure state |
| Personal data is inaccurate or used improperly | Record provenance and confidence; restrict enrichment until qualified; support correction, suppression, and retention rules |
| Outreach violates local requirements or harms trust | Market-specific review, human approval, suppression checks, attempt limits, and auditable templates |
| Score creates false confidence | Display uncertainty and missing inputs; keep hard-veto and human-review paths; compare predictions with realized results |
| Deal economics omit labor, disposal, fees, or timing | Require itemized costs and sensitivity range; reconcile actuals; block settlement without accounting |
| Worker safety or location privacy failure | Eligibility and safety checklist, job-specific disclosure, access logging, manual fallback, and incident process |
| Too many integrations are built before the workflow works | Start with one market/class; prioritize sources by qualified-lead yield, reliability, legal access, and cost |
| The starting-cash constraint is contradicted by subscriptions and operations | Track cash exposure and recurring costs; set a hard spend cap; confirm each payment/data provider before use |
| Real-estate, probate, or referral rules vary by jurisdiction | Configure jurisdiction-specific review gates; require qualified professional review where needed; do not make legal determinations in-app |

## 13. Not in the first release

- Scraping every website in the directory or bypassing CAPTCHAs, login restrictions, or access controls.
- Autonomous cold outreach, automated negotiation, autonomous bidding, contract signing, or worker dispatch.
- Automated skip-tracing before a lead qualifies under approved rules.
- A proprietary marketplace or public worker-location map.
- Claims that the business is compliant, licensed, insured, or legally permitted solely because the app allows an action.
- Automated changes to score weights based on a small or unreviewed sample.
- A complete commercial-distress scoring engine: the source provides commercial detection signals but no full commercial scorecard.

## 14. Definition of a successful first pilot

The pilot is successful when a small, reviewable set of real leads can move end to end through:

1. Evidence-backed capture and source attribution.
2. Research and a reproducible, versioned score.
3. A human-approved route and next action.
4. A compliant, logged outreach or a documented reason not to contact.
5. A signed/authorized deal path where applicable.
6. A scheduled and verified field job where applicable.
7. Complete income, cost, split, and settlement records.
8. A comparison of predicted versus realized outcome and a documented learning.

The initial success bar is data integrity and safe repeatability—not 40 leads per week, a particular assignment fee, or a MAPE target before enough real deals exist.

## 15. Recommended build order

1. Confirm market, first class, policies, source permissions, and spend ceiling.
2. Build the secure lead workspace, evidence model, class dashboards, and pipeline.
3. Implement and test deterministic scoring, EV, vetoes, and router.
4. Add human-reviewed outreach and suppression controls.
5. Add job scheduling and private worker matching.
6. Integrate a small number of authorized, high-yield data sources.
7. Complete ledger, reconciliation, and manual settlement controls.
8. Use real outcomes to calibrate; then expand source coverage and automation.

This sequence proves the business workflow before committing to a large scraping/API program and keeps every consequential action reviewable by a person.
