# Source ingestion, feeds, and Apify review

## Recommendation

Prefer an authorized official feed or documented public JSON API when the source owner permits collection. The app reads public RSS/Atom feeds and public JSON endpoints directly. Use Apify's **Website Content Crawler** (`apify/website-content-crawler`) as a fallback for public websites only after source-specific terms and permission have been reviewed. It turns crawled page content into text/Markdown that operators can review, but it does not produce verified, structured court-case records.

Use Apify's **Web Scraper** (`apify/web-scraper`) only for a known public page where its page function is appropriate. It is not a general court-data integration. The current integration intentionally limits it to one page per run.

Official references:

- [Website Content Crawler actor](https://apify.com/apify/website-content-crawler)
- [Web Scraper actor](https://apify.com/apify/web-scraper)
- [Apify API documentation](https://docs.apify.com/api/v2)

The collectors use the Apify API with server-side bearer authentication. The `APIFY_API_TOKEN` is held in Replit Secrets and read only by the API server; do not put the credential in a tracked `.env` file, frontend code, URLs, or logs. Apify charges are usage-dependent. A collection run must be treated as a paid external operation.

## Guardrails in this app

- A source must be registered with its owner, URL, access method, counties, asset classes, cost notes, and retention notes.
- New sources start as pending. Registering a source or assigning an actor does not grant permission.
- Collection is available only after an operator records an approved permission review, selects `approved_scraping_provider`, assigns an allowlisted actor, and provides an HTTPS source URL.
- The website crawler respects robots.txt, uses a narrow URL scope, one-level crawl depth, concurrency of one, and a per-run page limit. The Web Scraper is limited to a single page.
- Scheduled collection is opt-in and has a minimum six-hour interval. An operator can also start a one-off run.
- Authorized feeds and public JSON endpoints must be public HTTPS URLs and cannot use embedded credentials. Collected material becomes a human-review observation, not a lead. Contact details are not extracted; an operator must review an observation before converting it.
- No county source is pre-registered, no actor run has been launched, and no Apify spend has been incurred by this setup.

## Texas county access research (checked October 2026)

The existing product documents identify Harris, Fort Bend, Dallas, and Tarrant counties as the pilot area. These official pages were checked as starting points for a human access and terms review; they are not approval to scrape or reuse records:

| County | Official starting point | Integration note |
| --- | --- | --- |
| Harris | [County Clerk Public Records](https://www.cclerk.hctx.net/PublicRecords.aspx) and [Probate Court Search](https://cclerk.hctx.net/Applications/websearch/CourtSearch.aspx?CaseType=Probate) | The Clerk advertises purchased index files as pipe-delimited `.txt`, with date-range delivery and daily FTP data sold monthly for most Clerk records. Ask Data Sales whether probate case indexes are included and obtain the price, license, permitted commercial use, retention, and delivery specification before integration. |
| Fort Bend | [County Clerk Online Record Search](https://www.fortbendcountytx.gov/government/departments/county-clerk/online-record-search) and [Odyssey Public Access](https://tylerpaw.fortbendcountytx.gov/PublicAccess/) | The County identifies Civil/Probate case records in its Odyssey/re:SearchTX access paths. No official machine-readable feed or API was found in this review. Do not automate the portal without written authorization and its data terms. |
| Dallas | [Online Record Search](https://www.dallascounty.org/services/record-search/) and [Public Access terms](https://www.dallascounty.org/services/public-access.php) | The Court Records portal terms state that commercial use of the site's information is strictly prohibited. Do not crawl or use that portal for this commercial product unless Dallas County provides a separate written license or authorized feed. No official feed/API was found in this review. |
| Tarrant | [Probate online searches](https://www.tarrantcountytx.gov/en/county-clerk/civil-courts/probate-courts/online-searches.html) and [Real Estate Records](https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records.html) | The Clerk lists a Central Library bulk-data payment path, while probate case search is documented separately. Confirm whether the bulk service includes probate indexes, the data format, license, price, and delivery method; no public API specification was found in this review. |

An accessible public search page does not, by itself, establish permission for automated collection or commercial reuse. Prefer a documented county bulk-data license, authorized API/feed, or partner submission. If terms are unclear, leave the source pending and continue with manual entry.

## What credentials are needed

For a source whose published terms explicitly permit crawling, the app needs the server-side `APIFY_API_TOKEN`; no additional credential is required for the Apify API call. Sources that require login, payment, a data license, or a county/partner API need the separately authorized access method and credentials for that provider. Do not crawl around an access gate or reuse a human portal login as an undocumented scraper credential.

## Limits of the general-purpose actor

The Website Content Crawler extracts page content, not official structured event fields. Court portal layouts, anti-automation controls, record fees, terms, and update frequency vary. Before relying on extracted information, verify it against the official record and obtain a source-specific legal/access review. If accurate structured case data is needed, request an authorized county feed or licensed provider instead of treating generic page text as a definitive record.
