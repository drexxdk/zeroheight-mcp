-- Add a JSONB `result` column to tasks to store structured task results (SEP-1686)
BEGIN;

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS result JSONB;

COMMIT;
