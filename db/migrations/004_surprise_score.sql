ALTER TABLE events ADD COLUMN IF NOT EXISTS surprise_score NUMERIC(5,2);
CREATE INDEX IF NOT EXISTS events_surprise_score_idx ON events (surprise_score DESC NULLS LAST);
