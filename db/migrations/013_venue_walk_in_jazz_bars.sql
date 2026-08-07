-- ─── WALK-IN CURATION: JAZZ BARS AND SMALL ROOMS ─────────────────────────────
-- Round 3, continuing down the GET /venues/uncurated worklist. These are the
-- bar/restaurant tier — rooms where the music is a programme on top of a place
-- that already serves walk-in customers.
--
-- The tier is NOT curated as a block. Each venue below states its own policy;
-- the ones that do not are listed at the bottom and stay 'unknown'. Two rooms
-- in this tier turned out to be advance-only despite looking like bars, which
-- is exactly why the block treatment was avoided.
--
-- Guarded with `COALESCE(walk_in_policy,'unknown') = 'unknown'` like every
-- other seed; db/migrate.js re-runs all migrations on every run.

-- ─── always: no advance option, just turn up ─────────────────────────────────

-- No reservations system at all, communal seating, no cover. Musicians are paid
-- by a suggested $10 cash donation per person, which is what door_price records.
UPDATE venues SET walk_in_policy = 'always', door_price = COALESCE(door_price, 10.00)
 WHERE lower(name) = 'bar lunàtico' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Village pizzeria with live jazz nightly 7–11pm and no cover. Reservations are
-- not taken at all on weekends — you leave a name and wait, which is the most
-- literal 'always' on the list.
UPDATE venues SET walk_in_policy = 'always', door_price = COALESCE(door_price, 0.00)
 WHERE lower(name) = 'arturo''s 106 w houston st' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Times Square cocktail bar with nightly piano and jazz. Its own listing states
-- there is never a cover.
UPDATE venues SET walk_in_policy = 'always', door_price = COALESCE(door_price, 0.00)
 WHERE lower(name) = 'rum house @ hotel edison' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- "Walk-ins are always welcome", no cover, no drink minimum, no tickets
-- necessary, first come first served. 21+.
UPDATE venues SET walk_in_policy = 'always', door_price = COALESCE(door_price, 0.00)
 WHERE lower(name) = 'winnie''s jazz bar' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── space_permitting: advance exists, walk-ins admitted if there is room ─────

-- Supper club with live jazz that never charges a cover; table reservations are
-- encouraged before 10pm but not required. Both locations are the same operator
-- and the same policy, and are separate venues rows because they are separate
-- rooms (37 W 26th and 9 E 37th), not because of a naming duplicate.
UPDATE venues SET walk_in_policy = 'space_permitting', door_price = COALESCE(door_price, 0.00)
 WHERE lower(name) IN ('the flatiron / nomad', 'flatironmurryhill')
   AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- "Reservations are recommended, especially for prime seating, but walk-ins are
-- possible depending on the show's popularity." $30 per set for the music room,
-- $20 for premium bar seating; door_price records the bar figure, which is what
-- a walk-in is realistically getting.
UPDATE venues SET walk_in_policy = 'space_permitting', door_price = COALESCE(door_price, 20.00)
 WHERE lower(name) = 'one flight up' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- FAQ: "walk-ups are encouraged. Last-minute cancellations and no-shows mean
-- seats often open up at the door." Seating is first come, first served. There
-- is a two-item minimum per person per show, so door_price is left NULL rather
-- than 0.00 — see the Smoke note in 012.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'the pocket jazz club' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Walk-ins accepted subject to availability; the cover is added to the bill
-- rather than bought ahead. door_price is left NULL because the cover varies
-- materially by night ($15 Wed/Thu/Sun, $25 Fri/Sat) and a single number would
-- understate a weekend visit.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'birds' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Hotel cocktail bar (Soho Grand) with two live sets a night. The cover is
-- charged at the door and waived for hotel guests, which means there is a door
-- to walk up to; Resy handles dinner tables rather than admission. Cover is $25
-- Wed/Thu and $35 Fri/Sat, so door_price is left NULL for the reason above.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'club room' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Nonprofit listening room. Seating is first-come, first-served within a ticket
-- tier and walk-ins are possible depending on availability, though shows can
-- sell out.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'the jazz gallery' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Left 'unknown' on purpose ───────────────────────────────────────────────
-- These publish no admission policy that could be found, and inferring one from
-- the venue type is exactly the guess this column exists to avoid:
--
--   The Jazz Club, Fraunces Tavern, 181 Cabrini, Great Jones Distilling Co.,
--   Puertas Restaurant, The Bonnefont in Ft. Tryon Park
--
-- Birdland Jazz Club and Birdland Theater remain uncurated for the reason
-- recorded in 012: the FAQ never says whether an adult can turn up without a
-- ticket. That needs a phone call, not more searching.
