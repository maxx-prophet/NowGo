-- ─── WALK-IN CURATION: BIRDLAND ──────────────────────────────────────────────
-- Settled by phone on 2026-08-28 (212-581-3080) after three attempts to resolve
-- it from published sources failed. Birdland's FAQ says a ticket confirms a
-- reservation and that under-21s need table seating, but never says whether an
-- adult can simply turn up — which is the one fact walk_in_policy encodes.
--
-- What the room actually said: walk-ins are allowed, a reservation is
-- recommended. On the Friday of the call there were still a few tables and a
-- few bar spots open. That is 'space_permitting', not 'always' — the room
-- expects you to book and admits you if there is room.
--
-- door_price stays NULL. The cover varies by set AND by seating: $50 table /
-- $40 bar at the early show, $40 table / $30 bar at 9:30. Any single number
-- would understate an early table, and a price we show is a promise.
--
-- Guarded with `COALESCE(walk_in_policy,'unknown') = 'unknown'` like every
-- other seed; db/migrate.js re-runs all migrations on every run.

-- Two rows, one room. 'Birdland Jazz Club' carries the website; 'Birdland Jazz
-- Club - New York' arrived from another source without one, so the address+
-- website test in 011 cannot confirm them as duplicates and they are NOT merged
-- here. They are curated together because they are plainly the same 315 W 44th
-- room, and leaving one behind would split the curation the way Django did.
UPDATE venues SET walk_in_policy = 'space_permitting'
 WHERE lower(name) IN ('birdland jazz club', 'birdland jazz club - new york')
   AND COALESCE(walk_in_policy, 'unknown') = 'unknown';

-- ─── still unknown on purpose ────────────────────────────────────────────────
-- 'Birdland Theater' is a genuinely separate room at the same address, and the
-- call covered the main room — the sets and seating prices quoted are the
-- upstairs 8:00/9:30 shows. Nobody has yet been asked whether the Theater
-- admits walk-ups on the same terms, so it stays 'unknown' rather than
-- inheriting a policy it was never asked about. ~5 upcoming events stay out of
-- the walk-ins-only filter until that call is made.
