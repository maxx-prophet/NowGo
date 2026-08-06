-- ─── VENUE WALK-IN POLICY ────────────────────────────────────────────────────
-- Whether you can turn up at a venue without buying ahead, and what it costs at
-- the door. Curated per venue: no source exposes this as structured data.
--
-- Hybrid is the normal case for NYC jazz clubs — Smalls sells $35 advance
-- tickets AND admits $25 walk-ins if there is room — so this is a reliability
-- scale, not a boolean.
--
--   always            no advance option; you just show up
--   space_permitting  advance tickets exist, walk-ins admitted if there is room
--   standby           walk-ins queue with no guarantee
--   none              advance purchase genuinely required
--   unknown           not yet curated. Means "we don't know", NOT "no".
--
-- door_price is the WALK-IN price, which differs from the advance price
-- (Smalls: $25 door vs $35 advance). Deliberately not merged into price_min.

ALTER TABLE venues ADD COLUMN IF NOT EXISTS walk_in_policy TEXT
  CHECK (walk_in_policy IN ('always','space_permitting','standby','none','unknown'))
  DEFAULT 'unknown';

ALTER TABLE venues ADD COLUMN IF NOT EXISTS door_price NUMERIC(6,2);

-- ─── SEED ────────────────────────────────────────────────────────────────────
-- db/migrate.js re-runs every migration on every run, so each statement is
-- guarded with `AND walk_in_policy = 'unknown'`. The seed only ever fills a
-- gap; once a human curates a venue, re-running migrations leaves it alone.
--
-- To curate a venue by hand (survives future migration runs):
--   UPDATE venues SET walk_in_policy = 'always', door_price = 10.00
--    WHERE lower(name) = 'venue name here';
--
-- Sourced from venue research (2026-08-05):

UPDATE venues SET walk_in_policy = 'always', door_price = 10.00
 WHERE lower(name) = 'cellar dog' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'always', door_price = 0.00
 WHERE lower(name) = 'arthur''s tavern' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting', door_price = 25.00
 WHERE lower(name) = 'smalls' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting', door_price = 25.00
 WHERE lower(name) = 'mezzrow' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'blue note jazz club' AND walk_in_policy = 'unknown';

-- NOTE: 'Village Vangard' is misspelled in the venues table (missing the 'u').
-- Seeded on the actual stored spelling; correcting the name is out of scope.
UPDATE venues SET walk_in_policy = 'standby'
 WHERE lower(name) = 'village vangard' AND walk_in_policy = 'unknown';

-- Birdland's own FAQ is silent on walk-ins and secondary sources conflict, so
-- it stays 'unknown' rather than being guessed in either direction.

-- Sourced from ClickUp 86b9wfdnt ("Manual curation: top 20 NYC walk-in venues"),
-- which names these as reliable walk-in venues:

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'the django' AND walk_in_policy = 'unknown';

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'zinc bar' AND walk_in_policy = 'unknown';
