-- NowGo: Initial schema
-- Requires PostgreSQL with PostGIS extension (Railway: enable via dashboard or CREATE EXTENSION)

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ─── SOURCES ──────────────────────────────────────────────────────────────────
-- Tracks which event APIs we pull from.

CREATE TABLE IF NOT EXISTS sources (
  source_id       TEXT PRIMARY KEY,          -- 'ticketmaster' | 'seatgeek' | 'nyc_parks'
  display_name    TEXT        NOT NULL,
  api_base_url    TEXT,
  last_fetched_at TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sources (source_id, display_name, api_base_url) VALUES
  ('ticketmaster', 'Ticketmaster', 'https://app.ticketmaster.com/discovery/v2'),
  ('seatgeek',     'SeatGeek',     'https://api.seatgeek.com/2'),
  ('nyc_parks',    'NYC Parks',    'https://www.nycgovparks.org/api')
ON CONFLICT (source_id) DO NOTHING;

-- ─── VENUES ───────────────────────────────────────────────────────────────────
-- Normalized venue records. Geo column powers "events near me" via PostGIS.

CREATE TABLE IF NOT EXISTS venues (
  venue_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  address      TEXT,
  neighborhood TEXT,
  city         TEXT        NOT NULL DEFAULT 'New York',
  geo          GEOGRAPHY(POINT, 4326),   -- (lng, lat) — WGS 84
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIST index for ST_DWithin / ST_Distance queries
CREATE INDEX IF NOT EXISTS venues_geo_idx ON venues USING GIST (geo);
CREATE UNIQUE INDEX IF NOT EXISTS venues_name_idx ON venues (lower(name));

-- ─── EVENTS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  event_id          TEXT        PRIMARY KEY,   -- source-prefixed: 'tm_X', 'sg_Y', 'parks_Z'
  source            TEXT        NOT NULL REFERENCES sources (source_id),
  name              TEXT        NOT NULL,
  venue_id          UUID        REFERENCES venues (venue_id),
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  url               TEXT,

  -- Taxonomy
  segment           TEXT,                      -- Music | Sports | Arts & Theatre | Family | …
  genre             TEXT,
  sub_genre         TEXT,

  -- Pricing
  price_min         NUMERIC(10, 2),
  price_max         NUMERIC(10, 2),
  currency          CHAR(3)     NOT NULL DEFAULT 'USD',
  is_free           BOOLEAN     NOT NULL DEFAULT false,

  -- Availability
  availability_tier TEXT        NOT NULL DEFAULT 'unknown'
    CHECK (availability_tier IN ('available', 'scarce', 'sold_out', 'cancelled', 'unknown')),

  last_checked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_start_time_idx        ON events (start_time);
CREATE INDEX IF NOT EXISTS events_source_idx            ON events (source);
CREATE INDEX IF NOT EXISTS events_venue_id_idx          ON events (venue_id);
CREATE INDEX IF NOT EXISTS events_availability_tier_idx ON events (availability_tier);

-- ─── AVAILABILITY SNAPSHOTS ───────────────────────────────────────────────────
-- Append-only log of price/availability changes for each event.

CREATE TABLE IF NOT EXISTS availability_snapshots (
  snapshot_id       BIGSERIAL   PRIMARY KEY,
  event_id          TEXT        NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
  availability_tier TEXT        NOT NULL,
  price_min         NUMERIC(10, 2),
  price_max         NUMERIC(10, 2),
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_event_id_idx  ON availability_snapshots (event_id);
CREATE INDEX IF NOT EXISTS snapshots_checked_at_idx ON availability_snapshots (checked_at DESC);

-- ─── HELPER: "EVENTS NEAR ME" QUERY ──────────────────────────────────────────
-- Example (run via pg client with $1=lng, $2=lat, $3=radius_meters):
--
--   SELECT
--     e.event_id, e.name, e.start_time, e.price_min, e.availability_tier,
--     v.name AS venue_name, v.address,
--     round(ST_Distance(v.geo, ST_MakePoint($1, $2)::geography)::numeric) AS distance_m
--   FROM events e
--   JOIN venues v ON e.venue_id = v.venue_id
--   WHERE e.start_time BETWEEN now() AND now() + interval '12 hours'
--     AND e.availability_tier NOT IN ('cancelled')
--     AND ST_DWithin(v.geo, ST_MakePoint($1, $2)::geography, $3)
--   ORDER BY distance_m, e.start_time;
