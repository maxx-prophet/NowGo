# NowGo

**NowGo NYC** shows what's on in New York tonight and tomorrow, and tells you
when to leave to make it. Free on the
[App Store](https://apps.apple.com/us/app/nowgo-nyc/id6797667109) ·
[nowgoapp.com](https://nowgoapp.com)

Read **`CLAUDE.md`** before working on this repo — it holds the non-obvious
rules (route names, time zones, the fetcher → ingest contract, release steps).

---

## How it works

1. **Fetchers** pull events from Ticketmaster, SeatGeek and jazz-nyc.com.
2. **Ingest** upserts them into Postgres (`db/ingest.js`). It never deletes;
   events age out of the "tonight" window instead.
3. **Enrichment** geocodes venues, then adds embeddings, genres, surprise
   scores and one-line hooks via external APIs. Each stage is optional — one
   failing API skips only its own step.
4. The **pipeline** (`src/scheduler.js`) runs all of the above in process at
   10am, 2pm, 5pm and 8pm New York time.
5. The **API** (`src/server.js`, Express) serves the feed with travel time and
   a leave-by time per event.
6. The **iOS app** (`mobile/`, Expo SDK 54 / React Native) shows the feed.

## Layout

```
NowGo/
├── src/
│   ├── server.js        # Express API
│   ├── scheduler.js     # The pipeline and its cron schedule
│   ├── fetchers/        # ticketmaster.js, seatgeek.js, jazz-nyc.js
│   ├── services/        # Enrichment, ranking, travel, walk-in, PostHog…
│   └── views/           # HTML pages (the /venues/uncurated worklist)
├── db/                  # Pool, migrate runner, ingest, numbered migrations
├── mobile/              # The Expo app (own package.json — cd mobile first)
├── Landing Page/        # nowgoapp.com (static; deploys on push to main)
├── docs/                # Privacy policy (GitHub Pages), specs, drafts
└── design/              # Logo source files
```

## Setup

Requires Node 18+ and a Postgres database (plain numeric `geo_lat` /
`geo_lng`; no PostGIS needed).

```bash
npm install
# create .env.nowgo — see below
npm run migrate
npm start            # API on http://localhost:$PORT
```

`.env.nowgo` (gitignored) holds:

| Variable | For |
|---|---|
| `DATABASE_URL` | Postgres |
| `TM_API_KEY` | Ticketmaster Discovery API |
| `SEATGEEK_CLIENT_ID`, `SEATGEEK_CLIENT_SECRET` | SeatGeek |
| `GOOGLE_MAPS_KEY` | Geocoding, venue websites, transit times |
| `MAPBOX_TOKEN` | Walking/driving times (optional) |
| `ANTHROPIC_API_KEY` | Genres and hooks |
| `OPENAI_API_KEY` | Venue embeddings |
| `PIPELINE_TOKEN` | Bearer token for `POST /pipeline/run` |
| `POSTHOG_KEY` | Pipeline health events |
| `TICKETSDATA_USERNAME`, `_PASSWORD` | Availability check (off in production) |

## Scripts

| | |
|---|---|
| `npm start` | Run the API (the pipeline schedule starts with it) |
| `npm test` | Backend tests — new test files must be added to the script |
| `npm run migrate` | Apply migrations. **Railway does not run these** — apply by hand before deploying code that needs them |
| `npm run pipeline` | Run the whole pipeline once against whatever `DATABASE_URL` points at |
| `npm run fetch:tm` / `fetch:sg` / `fetch:jazz` | Run one fetcher on its own; output goes to `data/` |

The mobile app has its own: `cd mobile && npm test && npx tsc --noEmit`.

## API

Routes are at the root, not under `/api`:

| Route | |
|---|---|
| `GET /health` | Status |
| `GET /events/tonight` | The feed (`lat`, `lng`, `mode`, `night=tomorrow`, filters) |
| `GET /events/:id` | One event |
| `GET /travel` | Travel time for one trip |
| `GET /sources` | Each source and when it last fetched successfully |
| `GET /venues/uncurated` | Walk-in curation worklist (HTML; `?format=json` for rows) |
| `POST /pipeline/run` | Run the pipeline now — needs `Authorization: Bearer $PIPELINE_TOKEN` |

## Deploys

- **Backend:** Railway deploys `main` automatically.
- **Website:** pushing `Landing Page/` to `main` updates nowgoapp.com within a minute.
- **App:** EAS Build → TestFlight → App Store review. See "Mobile / EAS" in `CLAUDE.md`.
