-- ─── VENUE TYPE ──────────────────────────────────────────────────────────────
-- Whether a venue programmes distinct events, or sells timed entry to one
-- standing experience.
--
-- Ticketing APIs issue every timed-entry slot its own event id, which is
-- correct for them and wrong for us: on 2026-08-21 Balloon Museum contributed
-- 22 rows and Banksy Museum 16, together a quarter of the whole feed, four of
-- them character-for-character identical. Nothing about the event row says it
-- is an admission slot, so the distinction has to live on the venue.
--
--   programmed  a schedule of distinct events — jazz club, theatre, arena
--   attraction  timed entry to the same experience all day — museum,
--               observation deck, immersive exhibit
--   unknown     not yet curated. Means "we don't know", NOT "programmed".
--
-- Deliberately NOT derived from the event name, the genre, or the venue name:
--
--   * name matching finds 2 of the 39 museum rows, and "General Admission" is
--     ordinary music-club language — Bowery Ballroom and Mercury Lounge sell
--     GA, and a name rule would drop them
--   * genre matching (Fine Art, Family) happens to isolate them perfectly on
--     one night's data and would silently eat a kids' matinee or a gallery
--     opening the first time one appeared. Family is one of our own chips
--   * venue-name matching on 'museum' would drop a jazz concert at the Whitney
--     or a lecture at MoMA, which are real events that happen to be at museums
--
-- Use the name pattern to BUILD THE WORKLIST, never as the filter:
--   SELECT name FROM venues
--    WHERE name ~* 'museum|gallery|zoo|aquarium|observator'
--      AND COALESCE(venue_type,'unknown') = 'unknown';

ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type TEXT
  CHECK (venue_type IN ('programmed','attraction','unknown'))
  DEFAULT 'unknown';

-- ─── SEED ────────────────────────────────────────────────────────────────────
-- db/migrate.js re-runs every migration on every run, so each statement is
-- guarded on 'unknown'. The seed only ever fills a gap; once a human curates a
-- venue, re-running migrations leaves it alone.
--
-- To curate by hand (survives future migration runs):
--   UPDATE venues SET venue_type = 'attraction' WHERE lower(name) = '...';

UPDATE venues SET venue_type = 'attraction'
 WHERE lower(name) = 'balloon museum nyc' AND COALESCE(venue_type,'unknown') = 'unknown';

UPDATE venues SET venue_type = 'attraction'
 WHERE lower(name) = 'banksy museum new york' AND COALESCE(venue_type,'unknown') = 'unknown';

UPDATE venues SET venue_type = 'attraction'
 WHERE lower(name) = 'museum of chinese in america' AND COALESCE(venue_type,'unknown') = 'unknown';
