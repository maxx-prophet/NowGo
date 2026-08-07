-- ─── WALK-IN CURATION: JAZZ ROOMS, ROUND 2 ───────────────────────────────────
-- 009 seeded the first nine venues, 010 swept the advance-ticket categories.
-- These are researched individually from each venue's own published policy,
-- worked off the GET /venues/uncurated worklist in descending event count.
--
-- Only venues whose policy is stated explicitly by the venue (or by a specific,
-- checkable secondary source) are set here. A venue that merely *seems* like a
-- walk-in is left 'unknown' — 009's Birdland reasoning applies throughout:
-- silence is not confirmation.
--
-- Guarded with `COALESCE(walk_in_policy,'unknown') = 'unknown'` like every
-- other seed; db/migrate.js re-runs all migrations on every run.

-- ─── Jazzcultural ────────────────────────────────────────────────────────────
-- Spike Wilner's (Smalls/Mezzrow) third club, opened March 2026 at 349 W 46th
-- in the former Swing 46. Its published info page states walk-ins are welcome
-- for bar and Studio seats subject to availability — the textbook case for
-- space_permitting. $25 music charge for café/bar seats from 6pm ($40 for the
-- Studio); door_price records the bar figure, which is what a walk-in pays.
-- No music charge at all from noon to 5pm.

UPDATE venues SET walk_in_policy = 'space_permitting', door_price = COALESCE(door_price, 25.00)
 WHERE lower(name) = 'jazzcultural' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Smoke Jazz Club ─────────────────────────────────────────────────────────
-- Tickets are not required in the bar/lounge, which is separate from the
-- listening room, and there is never a minimum there. A small number of
-- listening-room tickets are sometimes released at the door.
--
-- door_price deliberately left NULL rather than 0.00: the bar has no cover, but
-- the 10pm sets carry a $20 consumption minimum, so quoting a price of zero
-- would understate what turning up actually costs.

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'smoke jazz club' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Bar Bayeux ──────────────────────────────────────────────────────────────
-- No cover, no tickets, no reservations. The clearest 'always' on the list.

UPDATE venues SET walk_in_policy = 'always', door_price = COALESCE(door_price, 0.00)
 WHERE lower(name) = 'bar bayeux' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── St. Mazie Bar & Supper Club ─────────────────────────────────────────────
-- A bar and restaurant with live jazz nightly, open to 1am weekdays and 2am
-- weekends. Reservations are recommended because it fills up, not required —
-- which is the distinction space_permitting exists to capture.

UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'st. mazie bar & supper club' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Dizzy's Club ────────────────────────────────────────────────────────────
-- Jazz at Lincoln Center. Advance purchase is strongly recommended; walk-ups
-- are possible only via a standby list. That is 'standby' by our definition —
-- a queue with no guarantee — so it does NOT reach the walk-ins filter, the
-- same call made for the Village Vanguard in 009.

UPDATE venues SET walk_in_policy = 'standby'
 WHERE lower(name) = 'dizzy''s club' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Bill's Place ────────────────────────────────────────────────────────────
-- Harlem speakeasy, BYOB, unamplified, capacity around 30 across two set times.
-- Reservations are required; there is no door to walk up to.

UPDATE venues SET walk_in_policy = 'none'
 WHERE lower(name) = 'bill''s place' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── Still uncurated on purpose ──────────────────────────────────────────────
-- Birdland Jazz Club / Birdland Theater: its own FAQ is still silent on
-- walk-ins — it documents that buying a ticket confirms a reservation and that
-- under-21s need table seating to sit at the bar, but never says whether an
-- adult can turn up without one. Secondary sources lean toward advance being
-- required. That is enough to withhold it from the walk-ins filter, which
-- 'unknown' already does, but not enough to assert 'none'. Needs a phone call.
