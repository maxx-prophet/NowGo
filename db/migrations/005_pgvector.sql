-- pgvector semantic venue matching
-- Requires: CREATE EXTENSION vector (already enabled on Railway)

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE venues ADD COLUMN IF NOT EXISTS embedding vector(1536);
