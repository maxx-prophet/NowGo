# NowGo — working notes

Non-obvious things about this project, learned the hard way. Read before probing
production or making assumptions about names, paths, or timing.

Keep this file honest: if something here turns out to be wrong, fix it rather
than working around it.

## Layout

- **Repo root** — the backend. Express + Postgres, deployed on Railway.
  Entry point `src/server.js`, started with `npm start`.
- **`mobile/`** — the Expo (SDK 54) iOS app. Has its own `package.json`,
  `AGENTS.md`, and test script. Always `cd mobile` before running anything
  Expo-related; installing from the root puts packages in the wrong place.

## Backend gotchas

**Routes are not under `/api`.** They are `/health`, `/events/tonight`,
`/events/:id`, `/travel`, `/sources`, `/venues/uncurated`, and
`POST /pipeline/run`. Probing `/api/events` returns a 404 that looks exactly
like an outage when the service is healthy.

**`/venues/uncurated` returns HTML, not JSON** — it is the walk-in curation
worklist, meant to be opened in a browser. Add `?format=json` for the rows.

**Event JSON field names** differ from the obvious guesses:

| Actual | Not |
|---|---|
| `start_time` | ~~`starts_at`~~ |
| `availability_tier` | ~~`availability`~~ |
| `url` | ~~`ticket_url`~~ |

**Venue coordinates are `geo_lat` / `geo_lng`** — plain numerics, not PostGIS.
There is no `geo` geography column. Code written against `ST_MakePoint` will
throw on its first query.

**The "tonight" window** is `start_time > now() - 30 minutes` and
`< tomorrow 4am ET`. Events that started more than 30 minutes ago drop out. This
is why the feed looks empty late at night — it is usually correct behavior, not
a bug.

**`POST /pipeline/run` requires `Authorization: Bearer $PIPELINE_TOKEN`.** It
**fails closed**: with `PIPELINE_TOKEN` unset the route answers 503 rather than
reverting to open, so a missing env var is loud instead of silently
reintroducing the hole. The token lives in `.env.nowgo` and must also be set on
Railway. Scheduled ingestion is unaffected — `src/scheduler.js` calls
`runPipeline()` in process and never goes through HTTP.

Triggering it by hand:

```
curl -X POST https://nowgo-production.up.railway.app/pipeline/run \
  -H "Authorization: Bearer $PIPELINE_TOKEN"
```

## The pipeline

In-process `node-cron` in `src/scheduler.js`, running at **10am, 2pm, 5pm and
8pm America/New_York**. It is not a separate service — if the API is down, no
ingestion happens.

Order matters: fetch → `ingestEvents` → geocode → enrichment. Geocoding must run
after ingest so venue rows exist. It is wrapped in its own try/catch because the
whole pipeline body shares one catch, and an external-API failure there would
otherwise silently skip embeddings, availability, genre, surprise scores and
hooks.

**After any outage the feed is empty until the pipeline reruns.** Every event is
time-bound to tonight, so restoring the service is not enough — trigger
`POST /pipeline/run`.

## The fetcher → ingest contract

**Fetchers must emit `time` as a bare `HH:MM:SS` in NYC local time.** Do not
append a UTC offset. `db/ingest.js` builds `` `${date}T${time}Z` `` and applies
the correct Eastern offset for that date itself, including DST.

Appending an offset produces `2026-08-05T19:00:00-04:00Z` — an invalid date
carrying both an offset and `Z`. Ingest catches it, logs
`Invalid time value`, and **skips the event**.

This cost a lot of time: the jazz fetcher did exactly that, so every event whose
time parsed successfully was silently dropped, and only events whose time
*failed* to parse survived — falling back to `'00:00:00'`. The result looked like
"all jazz events are at midnight" when it was really "only the broken ones made
it in." Fixing the time parser alone made things worse by dropping more events.

**Lesson:** when a whole source's data looks uniformly wrong, check whether
ingest is rejecting the good records rather than assuming the fetcher produced
bad ones. `Ingested N events, skipped M` in the pipeline log is the tell — a
large `skipped` count is not normal.

**Reading Railway logs is the fastest way to diagnose pipeline problems.** Three
rounds of black-box probing from outside told me less than one log dump. Ask for
the deploy logs early.

**`railway logs` strips timestamps; `railway logs --json` keeps them.** Every
run now ends with a `⏱  Pipeline stages` block (slowest first), but for runs
before that landed, or to time anything the block does not cover, diff the
`timestamp` field between consecutive JSON lines. Delivery lag is a few
seconds, so gaps under ~5s are noise.

**Railway does NOT run database migrations.** `railway.toml` only sets
`startCommand`; there is no migrate step in the deploy. Schema-dependent code
must not be merged until `npm run migrate` has been applied to production by
hand, or the deploy 500s on every query touching the new columns.

## Time zones

**Railway runs UTC.** Anything that means "today in NYC" must be computed
explicitly, e.g. `nycDateStr()` in `src/fetchers/jazz-nyc.js` using `Intl` with
`timeZone: "America/New_York"`. Using `new Date()` and the server's local zone
means everything after 8pm ET is already tomorrow — this caused the 8pm run to
fetch the wrong day's schedule every day.

Related: `setHours(26)` style arithmetic has been a source of bugs here. JS
clamps invalid hours unpredictably.

## Data quality — known gaps

These are real as of 2026-08-07. Verify before relying on any of them.

- **`sources.last_fetched_at`** is stamped by the pipeline after each fetch
  stage returns (`src/services/sources.js`), so `GET /sources` shows when a
  fetcher last succeeded. A fetch that throws leaves the old stamp — a stale
  one is the signal. Before 2026-09-20 it was never written.
- **`walk_in` is a curated property of the venue, not the event.**
  `venues.walk_in_policy` (`always` / `space_permitting` / `standby` / `none` /
  `unknown`, default `unknown`) is set by hand per venue in
  `db/migrations/009_venue_walk_in.sql`; the API derives each event's `walk_in`
  boolean from its venue's policy (see `WALK_IN_SQL` in
  `src/services/walk-in.js`). Venues left `unknown` never appear in the
  "walk-ins only" filter — that is expected, not a bug, until they are curated.

  Curation lives in migrations `009`, `012`–`013` and `015`, plus the `010`
  sweep. As of 2026-08-07: 144 `none`, 15 `space_permitting`, 7 `always`,
  2 `standby`, ~109 `unknown` — 45 walk-in events on a typical night across 21
  venues. The NYC jazz rooms are essentially fully curated. (Spot check
  2026-09-08: `/events/tonight?limit=500` returned 108 events, 32 of them
  walk-in.)

  **The worklist is `GET /venues/uncurated`**, not something you have to dig
  out of the logs. `reportUncuratedVenues()` still logs the same set after each
  pipeline run. Curating a venue is one `UPDATE`; the migration seeds are
  guarded with `COALESCE(walk_in_policy,'unknown') = 'unknown'` so re-running
  migrations never clobbers it.

  **Do not curate a venue from its type.** The bar/restaurant tier looks
  uniform and is not: Bill's Place is a bar-sized Harlem room that *requires*
  reservations (~30 seats), and Dizzy's admits walk-ups only via a standby
  list. Both would have been wrong under a blanket rule. Set a policy only
  where the venue states one; `unknown` is the honest default.

  **`door_price` is left NULL when the cover varies by night** — Birds is $15
  midweek and $25 Fri/Sat, Club Room $25 and $35. A single number would
  understate a weekend visit, and a price we show is a promise.

  **Birdland was settled by phone on 2026-08-28** (212-581-3080), after three
  attempts to resolve it from published sources failed — its FAQ says a ticket
  confirms a reservation but never says whether an adult can turn up without
  one. The main room is `space_permitting`: walk-ins allowed, reservation
  recommended. `door_price` stays NULL because the cover varies by set and
  seating. **Birdland Theater is a separate room at the same address and stays
  `unknown`** — the call covered the main room only. Migration
  `015_venue_walk_in_birdland.sql`.

- **Museum timed-entry slots are one row each in `events`**, and stay that
  way — Ticketmaster issues an event ID per 15-minute admission slot, so
  Balloon Museum and Banksy Museum are ~20 rows a day. The API folds a run of
  ≥3 same-venue/name/URL starts spaced ≤60 min apart into one card with
  `showtimes` (`src/services/timed-entry.js`). Do not key that on venue+name
  alone: a jazz room's two sets are separate events on purpose, and the
  closest real multi-set night is 105 min apart. Counting rows in SQL will
  still show the duplication; that is expected.

- **`price_min` is null on most events**, so the budget filter has little to work
  with.

- **`availability_tier` comes from Ticketmaster only.** SeatGeek supplies
  *nothing* — all 1,197 SeatGeek-sourced events carry no tier, because
  `mapSGAvailability` reads `stats.lowest_price`/`listing_count` and SeatGeek
  returns `stats: {}` for club shows. SeatGeek describes the **resale** market,
  which barely exists for a 500-cap room; no resale listings says nothing about
  whether the box office has tickets.

  Consequence: **general-admission music clubs cannot be curated for walk-ins.**
  Bowery Ballroom, Irving Plaza, Elsewhere, Mercury Lounge and similar sit at
  86% `unknown` availability, and whether you get in depends on the *show*, not
  the venue. There is no current source that answers it. They stay `unknown` on
  purpose — this is a blocked problem, not an open to-do.

- **`runAvailabilityCheck` has never run in production.** It short-circuits when
  `TICKETSDATA_USERNAME`/`_PASSWORD` are absent, logging
  `ℹ️ TICKETSDATA credentials missing — skipping (tiers set at ingest)`. The
  credentials are in local `.env.nowgo` and are **not** set on Railway —
  confirmed from the deploy log of the 2026-08-23 manual run, which logged that
  line.

  **Before enabling it:** `mapTier` returns `sold_out` when it finds zero
  offers, so an empty or malformed TicketsData response is indistinguishable
  from a genuinely sold-out show. `/events/tonight` filters out `sold_out` by
  default, so one bad response silently drops an event and a bad batch empties
  the feed. Tracked on ClickUp `86bba0bk0`.
- **jazz-nyc.com writes the same room under several labels, and they drift.**
  The venue cell is a link, and **the `href` is the stable identity — the text
  is not**. Today's table has `Django(The)` (42 rows) and `The Django` (3) both
  pointing at `thedjangonyc.com`; `Bar Lunàtico`/`LunAtico`,
  `Jazz Gallery (The)`/`The Jazz Gallery` and `Pangea`/`Pangea Restaurant and
  Bar` behaved the same way. Each spelling became its own `venues` row, which
  splits a venue's events **and its walk-in curation** — `The Django` was
  `space_permitting` while `Django(The)` sat `unknown`, so its events never
  reached the filter. Merged in `011_merge_duplicate_jazz_venues.sql` via
  `venue_aliases`.

  The fetcher now emits the href as `venueUrl`, ingest writes it to
  `venues.website` only when that is empty — jazz-nyc's Smoke row links to a
  performer's site, so an existing Google-resolved site is kept, and the worklist
  flags an uncurated venue that shares a site with a known one — a `🔁` line
  in the pipeline log and a "same site as" note on `/venues/uncurated`. That
  is the relabel signal. **It is not a merge**: Birdland Theater shares
  birdlandjazz.com with the main room and is a different room. A human
  decides, and the merge is a `venue_aliases` row.

  **jazz-nyc.com also leaves the area cell empty for some venues** — on
  2026-09-20 every Smalls, Mezzrow, Jazzcultural and Arthur's Tavern row.
  The fetcher used to require a known NYC code and silently dropped them,
  which is why those rooms had no events from 09-17 to 09-20. It now drops
  only rows with an explicit non-NYC code (`OUTSIDE_NYC`) and logs
  `Kept N rows with no area code`.

  **The scraper health check is per-venue, not "zero results"** — the outage
  above returned 56 events. `src/services/scraper-health.js` flags a venue
  with jazz-nyc events on ≥5 of the last 7 days, including this weekday, that
  has nothing upcoming. The weekday clause matters: Bar Bayeux is closed
  Sun/Mon and was a false positive without it. Replayed as of 2026-09-19 it
  names exactly the four rooms that were lost.

  Do **not** merge venues on shared address alone: Lincoln Center, New World
  Stages, the Williams Center and Birdland all run genuinely separate rooms at
  one address. Require matching address *and* website.

- **`Jazzcultural` is a real venue, not a parsing artifact.** It is Spike
  Wilner's (Smalls/Mezzrow) third club, opened March 2026 at 349 W 46th St in
  the former Swing 46. Its listings are distinct from Smalls' and Mezzrow's
  even though jazz-nyc.com points all three at `smallslive.com`. Its own
  `jazzcultural.com` is close to an empty placeholder, so its event links are
  thin — that is the site being sparse, not bad data.

- **jazz-nyc.com has no per-event links.** Every event from that source carries
  the same homepage URL. The API substitutes `venues.website` (resolved via
  Google Place Details) where available — see `EVENT_URL_SQL` in `src/server.js`.
- **jazz-nyc.com drops the current day's rows from its table in the evening**,
  observed around 8:30pm ET. A late request for "today" matches nothing, which is
  why the fetcher asks for today *and* tomorrow.

## Verifying third-party links

**Ticketmaster returns 401 to curl** — that is their bot wall, not a dead link.
Never conclude a URL is broken from a curl status.

To actually check a Ticketmaster event, use the Discovery API:
`https://app.ticketmaster.com/discovery/v2/events/{id}?apikey=$TM_API_KEY`.

**The ID in a public Ticketmaster URL is a different namespace from the Discovery
API `id`.** Extracting the ID from the URL and querying the API can produce false
"not found" results. Some events also legitimately point at `ticketweb.com` or
`universe.com`, which Ticketmaster owns.

## Secrets and env

- **`.env.nowgo`** (repo root, gitignored) holds every backend secret:
  `DATABASE_URL`, `TM_API_KEY`, `SEATGEEK_*`, `GOOGLE_MAPS_KEY`,
  `ANTHROPIC_API_KEY`, `PIPELINE_TOKEN`, and the `ASC_*` App Store Connect
  values.
  Load with `set -a; . ./.env.nowgo; set +a`.
- **`mobile/.env`** (gitignored) holds `POSTHOG_KEY`. The backend needs the
  same key in `.env.nowgo` **and on Railway** (`railway variables --set
  POSTHOG_KEY=...`): the pipeline sends `scraper_health` every run and
  `pipeline_failed` on a crash via `src/services/posthog.js`. Without the key
  it logs one warning and sends nothing — the PostHog alert then fires on
  silence, which is the intended failure mode.
- Never put tokens in tracked files. GitHub push protection has blocked this repo
  before over a token in a `.rtf`.
- `psql` with a password containing `!` needs single quotes around the URL.

**EAS does not read `mobile/.env`.** Build-time variables must be set separately
on EAS (`eas env:create --environment production ...`), or they resolve to empty
in the build. This silently disabled PostHog in production once — the "not
configured" warning in `src/config/posthog.ts` is gated on `__DEV__`, so a
production build gives no signal at all.

Verify what a build will actually see with:
`npx eas-cli config --profile production --platform ios`

## Mobile / EAS

- Bundle ID **`com.nowgo.app`**, app name **NowGo**.
- Expo account is **`maxprophet`** (one x). GitHub is **`maxx-prophet`** (two).
  Mixing them up produces "Account not found" pages that look like broken links.
  Signing into Expo with "Sign in with Apple" creates a *separate* empty account.
- **EAS builds from git.** Uncommitted files risk being excluded from the build
  archive — commit before building, and check the build's `Commit` field matches
  your HEAD.
- `eas.json` uses `appVersionSource: "remote"`, so `ios.buildNumber` in
  `app.config.js` is ignored. `autoIncrement` is on for the production profile.
- **A finished build reaches only the internal group.** `eas build` → `eas
  submit` puts the build in TestFlight and on "Team (Expo)" (Donnie). The public
  link hands out whatever is newest on **"Friends and Family"**, and a build only
  gets there when it is assigned to that group — which triggers Beta App Review.
  This was missed on build 4 (Aug 21) and again on build 9 (Sep 8): testers on
  the link were reporting bugs against a build two releases old. After every
  build: assign it to Friends and Family, then confirm with
  `GET /v1/betaGroups/{id}/builds` (or the TestFlight tab in App Store Connect).
- App Store icons must be **square 1024×1024 with no alpha**. The source wordmark
  is preserved at `mobile/assets/_wordmark-source.png`; `icon.png` is a stacked
  lockup generated from it. `splash-icon.png` is intentionally the wide wordmark,
  which is correct for `resizeMode: "contain"`.

## Tests

Test files are **listed explicitly** in the `test` script of each `package.json`.
A new test file will not run until it is added there.

- Backend: `npm test` (root)
- Mobile: `cd mobile && npm test`, plus `npx tsc --noEmit`
- Expo health: `npx expo-doctor@latest`

## Environment notes

- Interactive tap automation in the iOS Simulator (AppleScript, `cliclick`) is
  unreliable here even with accessibility permissions granted. Prefer
  screenshots, code review, and clean typecheck/tests — and say so rather than
  presenting screenshots as full interactive proof.
- `timeout` is not available on macOS by default.
