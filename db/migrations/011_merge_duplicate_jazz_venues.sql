-- ─── MERGE DUPLICATE JAZZ VENUES ─────────────────────────────────────────────
-- jazz-nyc.com writes the same room under more than one label, and its labels
-- drift over time. Each spelling became its own venues row, which splits a
-- venue's events and — worse — splits its curation:
--
--   The Django   space_permitting   79 events
--   Django(The)  unknown             2 events   ← same room, invisible to the
--                                                 walk-ins filter
--
-- Confirmed same room, not merely the same address: identical street address
-- AND identical website in the venues table, and jazz-nyc.com points both
-- labels at the same href.
--
-- Same address alone is NOT sufficient evidence and is deliberately not used
-- here. Lincoln Center, New World Stages, the Williams Center and Birdland all
-- run genuinely separate rooms at one address, and Birdland Jazz Club vs
-- Birdland Theater are already seeded separately in 009 for that reason.
--
-- Ticketmaster and SeatGeek produce a much larger crop of the same problem
-- ("Broadway Theatre" / "Broadway Theatre - New York" / "Broadway Theatre-New
-- York"). Those are all swept to 'none' by 010 so they do not split curation,
-- and they are left for the venue data-hygiene work rather than widened into
-- here.
--
-- Each merge is three steps in this order: repoint events, record an alias so
-- future ingests resolve to the canonical row, then delete the duplicate. The
-- delete is guarded on the row having no events left, so if the repoint fails
-- the delete is a no-op rather than taking events with it. (events.venue_id is
-- ON DELETE NO ACTION, so a bad delete would error rather than cascade — but
-- the guard makes the intent explicit.)
--
-- Idempotent by construction: after the first run the duplicate row is gone, so
-- every statement matches nothing on later runs. db/migrate.js re-runs every
-- migration on every run.
--
-- The alias key is `lower(name)` with every non-alphanumeric character removed,
-- matching resolveVenueAlias() in db/ingest.js. Note that stripping is applied
-- to the raw lowercased string, so 'Bar Lunàtico' keys as 'barluntico' — the
-- accented character is removed, not folded to 'a'.

-- ─── The Django ──────────────────────────────────────────────────────────────
-- Canonical: 'The Django' — curated space_permitting, 79 events.
-- jazz-nyc.com currently emits 'Django(The)' for most rows.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'The Django' AND d.name = 'Django(The)'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'djangothe', venue_id FROM venues WHERE name = 'The Django'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Django(The)'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── Bar Lunàtico ────────────────────────────────────────────────────────────
-- Canonical: 'Bar Lunàtico' — the venue's actual name. 'LunAtico' is the label
-- jazz-nyc.com currently emits and carries the live events.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Bar Lunàtico' AND d.name = 'LunAtico'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'lunatico', venue_id FROM venues WHERE name = 'Bar Lunàtico'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'LunAtico'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── The Jazz Gallery ────────────────────────────────────────────────────────
-- Canonical: 'The Jazz Gallery' — 18 events against 5 for the variant.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'The Jazz Gallery' AND d.name = 'Jazz Gallery (The)'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'jazzgallerythe', venue_id FROM venues WHERE name = 'The Jazz Gallery'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Jazz Gallery (The)'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── Pangea ──────────────────────────────────────────────────────────────────
-- Canonical: 'Pangea'.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Pangea' AND d.name = 'Pangea Restaurant and Bar'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'pangearestaurantandbar', venue_id FROM venues WHERE name = 'Pangea'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Pangea Restaurant and Bar'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);
