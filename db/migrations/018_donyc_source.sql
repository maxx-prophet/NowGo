-- ─── DoNYC AS A SOURCE ───────────────────────────────────────────────────────
-- events.source references sources(source_id), so every DoNYC insert fails
-- until this row exists. Apply to production BEFORE deploying the code that
-- fetches DoNYC (Railway does not run migrations). The pipeline checks for this
-- row and skips the DoNYC stage with a clear error rather than failing per
-- event, but the events will not appear until it is applied.
--
-- See src/fetchers/donyc.js and src/services/donyc-match.js.

INSERT INTO sources (source_id, display_name, api_base_url)
VALUES ('donyc', 'DoNYC', 'https://donyc.com')
ON CONFLICT (source_id) DO NOTHING;
