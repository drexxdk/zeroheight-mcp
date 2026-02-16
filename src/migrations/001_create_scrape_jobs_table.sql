-- Creates a table to track background tasks (SEP-1686)
CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);
