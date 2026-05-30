-- Tracks how segment/genre classification was sourced.
-- NULL = sourced from the original API; 'llm' = classified by Claude Haiku.
ALTER TABLE events ADD COLUMN IF NOT EXISTS genre_source TEXT;
