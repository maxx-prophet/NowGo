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
`/events/:id`, `/travel`, `/sources`, and `POST /pipeline/run`. Probing
`/api/events` returns a 404 that looks exactly like an outage when the service
is healthy.

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

**`POST /pipeline/run` is unauthenticated.** Anyone can trigger the fetchers and
burn third-party API quota. Should be gated before any public launch.

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

These are real as of 2026-08-04. Verify before relying on any of them.

- **`sources.last_fetched_at` is never written.** Always null. It cannot be used
  to tell whether a fetcher succeeded.
- **`walk_in` is a curated property of the venue, not the event.**
  `venues.walk_in_policy` (`always` / `space_permitting` / `standby` / `none` /
  `unknown`, default `unknown`) is set by hand per venue in
  `db/migrations/009_venue_walk_in.sql`; the API derives each event's `walk_in`
  boolean from its venue's policy (see `WALK_IN_SQL` in
  `src/services/walk-in.js`). Most venues are still uncurated (`unknown`), so
  they never appear in the "walk-ins only" filter — that is expected, not a
  bug, until more venues get curated.
- **`price_min` is null on most events**, so the budget filter has little to work
  with.
- **`availability_tier` is `unknown` on a sizeable share** of events.
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
  `DATABASE_URL`, `TM_API_KEY`, `SEATGEEK_*`, `GOOGLE_MAPS_KEY`, `ANTHROPIC_API_KEY`.
  Load with `set -a; . ./.env.nowgo; set +a`.
- **`mobile/.env`** (gitignored) holds `POSTHOG_KEY`.
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
