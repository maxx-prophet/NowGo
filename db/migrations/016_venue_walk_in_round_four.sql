-- ─── WALK-IN CURATION: ROUND 4 ───────────────────────────────────────────────
-- Worked from GET /venues/uncurated on 2026-08-29, taking the uncurated venues
-- with the most events first. Every policy below is quoted from the venue's own
-- published wording; the ones that state nothing are listed at the bottom and
-- stay 'unknown'.
--
-- Guarded with `COALESCE(walk_in_policy,'unknown') = 'unknown'` like every
-- other seed; db/migrate.js re-runs all migrations on every run.

-- ─── none: the venue states a reservation is required ────────────────────────

-- The Jazz Club, 9 W 56th St — the speakeasy room operated by Aman New York.
-- Its own site states "Reservations are required." and offers exactly one path
-- in: emailing reservations@thejazzclub.com. No door, no standby. 36 events.
UPDATE venues SET walk_in_policy = 'none'
 WHERE lower(name) = 'the jazz club' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── space_permitting: you can turn up, a seat is not promised ───────────────

-- Blue Note. The FAQ is explicit in both directions: "Everyone needs a ticket
-- to enter the club" — so this is not 'always' — but tickets are sold in
-- person at the box office, and "Seating is always first come, first served.
-- No exceptions." Bar seating is limited "with the rest of the capacity being
-- standing room", so a walk-up on a busy night gets in standing or not at all.
--
-- door_price stays NULL: the FAQ states the entrance fee depends on the
-- artist, and a single number would be a promise we cannot keep.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'blue note' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- Fraunces Tavern. The site states its three bars — Independence, Lafayette's
-- Hideout and Dingle Whiskey Bar — "operate on a walk-in only, first-come,
-- first served basis." Reservations exist for the dining rooms but are nowhere
-- stated as required.
--
-- Residual uncertainty, recorded rather than papered over: every event we
-- carry here is the Jackie West Jazz Brunch, and the site does not say which
-- room the brunch is served in. 'space_permitting' is the honest tier for
-- that — the app never tells a user a ticket is unnecessary at this tier, only
-- that walking in is possible if there is room. If it turns out the brunch is
-- a reservations-only dining room, this becomes 'none'.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) = 'fraunces tavern' AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── still unknown on purpose ────────────────────────────────────────────────
--
-- Checked and found to state no policy at all. Left alone rather than guessed:
--   Five Spot Jazz (43 events) — a RESERVATION link in the nav and nothing
--     said about walking in either way.
--   Sugar Mouse (East Village indie bar, 47 3rd Ave) — no policy published.
--
-- Not attempted, and not an oversight: the general-admission music clubs in
-- this worklist — Bowery Ballroom, Mercury Lounge, Irving Plaza, Elsewhere,
-- Music Hall of Williamsburg, Warsaw, Brooklyn Paramount, The Bell House,
-- Gramercy Theatre, Sony Hall, Baby's All Right, Berlin, Cielo. Whether you
-- get in depends on the show, not the room, and no source we have answers it.
-- See the availability notes in CLAUDE.md; this is a blocked problem, not a
-- to-do.
--
-- Birdland Theater (125 events — the single largest uncurated venue we have)
-- still needs a phone call to 212-581-3080. The main room was settled that way
-- on 2026-08-28; the Theater is a separate room at the same address and was
-- not covered by that call.
