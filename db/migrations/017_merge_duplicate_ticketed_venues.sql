-- ─── MERGE DUPLICATE VENUES FROM THE TICKETING SOURCES ───────────────────────
-- The same problem 011 fixed for jazz-nyc.com, now from Ticketmaster and
-- SeatGeek: one room arriving under two labels and becoming two venues rows,
-- which splits its event count and would split its walk-in curation the moment
-- either row is curated.
--
-- 011 required matching address AND website as proof. **None of these rows has
-- a website at all**, so that test cannot be applied here and a different bar
-- is used, stated per merge below. Same address alone is still NOT sufficient
-- and is not relied on anywhere in this file — Elsewhere is the proof of why:
-- three of its rows share 599 Johnson Ave and only two of them are one room.
--
-- Each merge is the same three steps as 011, in order: repoint events, record
-- the alias so future ingests resolve to the canonical row, then delete the
-- duplicate guarded on it having no events left. Idempotent by construction.
--
-- Alias keys are lower(name) with every non-alphanumeric character removed,
-- matching venueAliasKey() in db/ingest.js.

-- ─── Mercury Lounge ──────────────────────────────────────────────────────────
-- Evidence: identical street address written two ways ('217 East Houston St.'
-- and '217 East Houston Street'), and the duplicate is the canonical name plus
-- the ticketing sources' ' - New York' city suffix — the exact pattern 011
-- names ("Broadway Theatre" / "Broadway Theatre - New York").
-- Canonical: 'Mercury Lounge', 42 events. Duplicate carries 25.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Mercury Lounge' AND d.name = 'Mercury Lounge - New York'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'mercuryloungenewyork', venue_id FROM venues WHERE name = 'Mercury Lounge'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Mercury Lounge - New York'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── Night Club 101 ──────────────────────────────────────────────────────────
-- Same ' - New York' suffix pattern. The duplicate has no address at all, so
-- the name is the whole of the evidence here; it is the canonical name plus the
-- known suffix and nothing else.
-- Canonical: 'Night Club 101' (101 Avenue A), 22 events. Duplicate carries 1.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Night Club 101' AND d.name = 'Night Club 101 - New York'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'nightclub101newyork', venue_id FROM venues WHERE name = 'Night Club 101'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Night Club 101 - New York'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── Elsewhere, the rooftop only ─────────────────────────────────────────────
-- Elsewhere runs genuinely separate rooms at 599 Johnson Ave, so this merge is
-- deliberately narrow: 'Elsewhere - The Rooftop' and 'Rooftop at Elsewhere' are
-- the same room named two ways, and **'Elsewhere - Brooklyn' is NOT merged into
-- either** — it is the main hall and a different room at the same address.
-- This is precisely the case CLAUDE.md warns about, so the shared address is
-- explicitly not the evidence; the two names describing one rooftop is.
-- Canonical: 'Elsewhere - The Rooftop', 8 events. Duplicate carries 1.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Elsewhere - The Rooftop' AND d.name = 'Rooftop at Elsewhere'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'rooftopatelsewhere', venue_id FROM venues WHERE name = 'Elsewhere - The Rooftop'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Rooftop at Elsewhere'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);

-- ─── Berlin ──────────────────────────────────────────────────────────────────
-- The two rows disagree so completely that neither address nor website could
-- match: one reads '25 Avenue A', the other 'The Lower-Level of 2A Bar'. The
-- venue's own site (berlin.nyc) resolves it — Berlin is "the lower-level of 2A
-- Bar", at 25 Avenue A. Two descriptions of one basement.
-- Canonical: 'Berlin NYC' — it carries the real street address and 22 events.
-- Duplicate 'Berlin' carries 14.
--
-- Note the alias key here is the bare word 'berlin'. That is broad, and it is
-- safe only because this app is NYC-only; a venue genuinely called "Berlin"
-- elsewhere would be wrongly folded in. Revisit if coverage ever leaves NYC.

UPDATE events e SET venue_id = c.venue_id
  FROM venues c, venues d
 WHERE c.name = 'Berlin NYC' AND d.name = 'Berlin'
   AND e.venue_id = d.venue_id;

INSERT INTO venue_aliases (alias, venue_id)
SELECT 'berlin', venue_id FROM venues WHERE name = 'Berlin NYC'
ON CONFLICT (alias) DO NOTHING;

DELETE FROM venues d WHERE d.name = 'Berlin'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = d.venue_id);
