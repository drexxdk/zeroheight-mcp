-- Creates a table to track background scrape jobs
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  args JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  logs TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_created_at ON scrape_jobs(status, created_at);
