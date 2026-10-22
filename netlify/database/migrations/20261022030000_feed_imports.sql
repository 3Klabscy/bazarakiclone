-- Partner listing feeds (e.g. estate agencies that have agreed to share their listings).
ALTER TABLE ads ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ads ADD COLUMN source_feed TEXT;
ALTER TABLE ads ADD COLUMN external_id TEXT;
ALTER TABLE ads ADD COLUMN external_url TEXT;
CREATE UNIQUE INDEX ads_feed_external ON ads (source_feed, external_id) WHERE source_feed IS NOT NULL;

CREATE TABLE feeds (
  name TEXT PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_stats JSONB
);
