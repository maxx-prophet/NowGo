-- ─── VENUE ALIASES ───────────────────────────────────────────────────────────
-- Maps alternate/abbreviated venue names to a canonical venue_id.
-- alias column: lowercase, alphanumeric only (e.g. 'msg', 'barclays')
--
-- To add a new alias:
--   INSERT INTO venue_aliases (alias, venue_id)
--   SELECT 'newalias', venue_id FROM venues WHERE lower(name) = 'canonical name';

CREATE TABLE IF NOT EXISTS venue_aliases (
  alias    TEXT PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS venue_aliases_venue_id_idx ON venue_aliases (venue_id);

-- ─── SEED CANONICAL VENUES ───────────────────────────────────────────────────
-- No-op if venues already exist from pipeline ingests.

INSERT INTO venues (name, city) VALUES
  ('Madison Square Garden', 'New York'),
  ('Barclays Center',       'New York'),
  ('Beacon Theatre',        'New York'),
  ('Radio City Music Hall', 'New York'),
  ('Terminal 5',            'New York'),
  ('Irving Plaza',          'New York'),
  ('Apollo Theater',        'New York')
ON CONFLICT DO NOTHING;

-- ─── SEED ALIASES ────────────────────────────────────────────────────────────

INSERT INTO venue_aliases (alias, venue_id)
SELECT a.alias, v.venue_id
FROM (VALUES
  ('msg',                'Madison Square Garden'),
  ('thegarden',          'Madison Square Garden'),
  ('barclays',           'Barclays Center'),
  ('barclayscenter',     'Barclays Center'),
  ('beacon',             'Beacon Theatre'),
  ('beacontheatre',      'Beacon Theatre'),
  ('radiocity',          'Radio City Music Hall'),
  ('radiocitymusichal',  'Radio City Music Hall'),
  ('t5',                 'Terminal 5'),
  ('terminal5',          'Terminal 5'),
  ('apollo',             'Apollo Theater'),
  ('apollotheater',      'Apollo Theater')
) AS a(alias, canonical)
JOIN venues v ON lower(v.name) = lower(a.canonical)
ON CONFLICT (alias) DO NOTHING;
