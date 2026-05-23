# NowGo

**NowGo** is a NYC event discovery app that surfaces what's happening tonight and tells you exactly when to leave based on your real-time travel time.

It aggregates events from Ticketmaster, SeatGeek, and Jazz NYC, stores them in a PostGIS-enabled PostgreSQL database, and serves them through a REST API consumed by a React Native mobile app.

---

## How it works

1. **Fetchers** pull events from each source API and write normalized JSON to `data/`
2. **Ingest** reads those files and upserts records into PostgreSQL
3. **Scheduler** runs the fetch → ingest pipeline automatically at 10am, 2pm, 5pm, and 8pm ET
4. **API server** serves events filtered by location, time window, and category — enriched with travel time and a "leave by" timestamp
5. **Mobile app** (React Native) presents a tonight feed with filters and event detail views

---

## Project structure

```
NowGo/
├── src/
│   ├── server.js          # Express API server
│   ├── scheduler.js       # Cron pipeline (fetch → ingest)
│   ├── fetchers/          # One file per event source
│   │   ├── ticketmaster.js
│   │   ├── seatgeek.js
│   │   ├── bandsintown.js
│   │   ├── eventbrite.js
│   │   ├── jazz-nyc.js
│   │   ├── nyc-parks.js
│   │   └── ticketsdata.js  # Availability enrichment
│   └── services/
│       └── travel.js       # Travel time (Google Maps / Mapbox / distance estimate)
├── db/
│   ├── index.js            # pg connection pool
│   ├── migrate.js          # Run initial schema
│   ├── ingest.js           # Load fetched data into Postgres
│   └── migrations/
│       └── 001_initial_schema.sql
├── mobile/
│   └── src/
│       ├── api/nowgo.js    # API client
│       ├── screens/        # TonightFeed, EventDetail, FiltersModal
│       └── components/
├── data/                   # Fetcher output (JSON, gitignored)
├── docs/                   # Architecture, market analysis, pitch deck
└── Landing Page/           # Static marketing site
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL with the **PostGIS** extension enabled
- API keys (see Environment below)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env.nowgo` file in the project root:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/nowgo

# Event source APIs (add the ones you have)
TICKETMASTER_KEY=
SEATGEEK_CLIENT_ID=
SEATGEEK_CLIENT_SECRET=
BANDSINTOWN_APP_ID=
EVENTBRITE_TOKEN=

# Travel time (at least one recommended)
GOOGLE_MAPS_KEY=       # Best for transit directions
MAPBOX_TOKEN=          # Best for driving/walking/cycling

# Server
PORT=3000
```

### 3. Run database migrations

```bash
npm run migrate
```

### 4. Fetch initial event data

Run any combination of fetchers:

```bash
npm run fetch:tm      # Ticketmaster
npm run fetch:sg      # SeatGeek
npm run fetch:parks   # NYC Parks
npm run fetch:eb      # Eventbrite
npm run fetch:bt      # Bandsintown
npm run fetch:jazz    # Jazz NYC
npm run enrich:td     # Ticketsdata (availability enrichment)
```

### 5. Ingest into the database

```bash
npm run ingest
```

### 6. Start the server

```bash
npm run server
```

The API will be available at `http://localhost:3000`.

---

## API

### `GET /health`
Returns server status.

### `GET /events/tonight`
Returns events happening in the next 18 hours.

| Param | Default | Description |
|---|---|---|
| `lat` | — | User latitude |
| `lng` | — | User longitude |
| `radius_miles` | `10` | Search radius |
| `limit` | `50` | Max results (cap 200) |
| `segment` | — | Filter: `Music`, `Sports`, `Arts & Theatre`, etc. |
| `mode` | `transit` | Travel mode: `transit`, `walking`, `driving`, `cycling` |
| `buffer_minutes` | `10` | Extra buffer added to travel time for "leave by" |

When `lat`/`lng` are provided, each event includes `travel_minutes`, `travel_distance_km`, and `leave_by`.

**Example:**
```
GET /events/tonight?lat=40.758&lng=-73.9855&radius_miles=5&mode=transit
```

### `GET /events/:id`
Returns a single event with full venue details.

### `GET /sources`
Lists all configured event sources and their last fetch time.

### `POST /pipeline/run`
Manually triggers the fetch → ingest pipeline in the background.

---

## Scheduler

The pipeline runs automatically when the server is running:

| Time (ET) | |
|---|---|
| 10:00 AM | Morning refresh |
| 2:00 PM | Afternoon refresh |
| 5:00 PM | Pre-evening refresh |
| 8:00 PM | Night refresh |

---

## Travel time

The server uses a provider waterfall for travel estimates:

- **Transit mode:** Google Distance Matrix → Mapbox → distance estimate
- **Other modes:** Mapbox → Google Distance Matrix → distance estimate

If no API keys are configured, it falls back to a NYC-tuned haversine distance estimate.

---

## Database schema

Three core tables in PostgreSQL + PostGIS:

- **`sources`** — registered event APIs
- **`venues`** — normalized venue records with a `GEOGRAPHY(POINT)` geo column for radius queries
- **`events`** — deduplicated event records with pricing, availability tier, and segment/genre taxonomy
- **`availability_snapshots`** — append-only log of price and availability changes

---

## Troubleshooting

**`psql` connection fails with password containing `!`**
The shell interprets `!` as a history command. Use single quotes:
```bash
psql 'postgresql://user:passw0rd!@host:5432/db'
```

**`ingest` skips all events: "no unique or exclusion constraint matching ON CONFLICT"**
The venue unique index must be on `name` exactly, not `lower(name)`. Connect to your DB and run:
```sql
DROP INDEX IF EXISTS venues_name_idx;
CREATE UNIQUE INDEX venues_name_idx ON venues (name);
```

**Railway Postgres connection refused**
`DATABASE_URL` isn't loaded automatically from `.env.nowgo` in the shell. Paste it directly into the `psql` command, or prefix your command with `source .env.nowgo &&`.

**Mobile app shows no events / fetch failed**
- Check `mobile/src/api/nowgo.js` — the variable must be named `API_BASE` (not `BASE_URL`)
- Make sure the URL starts with `https://`
- Confirm the backend is up: `curl https://your-railway-url.up.railway.app/health`
- Run the fetch + ingest pipeline to populate the database: `npm run fetch:tm && npm run fetch:sg && npm run fetch:jazz && npm run ingest`

**Expo simulator "TypeError: fetch failed" when pressing `i`**
Expo CLI can't download Expo Go to the simulator. Enable Developer Mode in the simulator settings and try again, or run `npx expo start --tunnel` to route through Expo's servers.

**GitHub push blocked by secret scanning**
If a token was committed, revoke it immediately at github.com → Settings → Developer Settings → Personal Access Tokens. Then remove it from history:
```bash
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch 'filename'" --prune-empty --tag-name-filter cat -- --all
git push origin main --force
```
Always store secrets in `.env.nowgo` — it is gitignored.
