-- Venue website, resolved from Google Place Details.
--
-- The jazz-nyc source is a scraped schedule table with no per-event links, so
-- every event it produces carries the same generic homepage URL. Storing the
-- venue's own site lets the API serve a useful destination instead — for the
-- jazz clubs that is usually the page that actually sells tickets
-- (Smalls and Mezzrow both resolve to smallslive.com).

ALTER TABLE venues ADD COLUMN IF NOT EXISTS website text;

-- Cached so re-running geocoding does not re-pay for a Place Details lookup.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS place_id text;
