-- Add a unique constraint / index on images.original_url to prevent duplicates
-- This migration will attempt to deduplicate existing rows by keeping the
-- row with the smallest id for each original_url, then create a unique
-- index if it does not already exist.

BEGIN;

-- If images table doesn't exist, skip quietly
DO $$
BEGIN
  IF to_regclass('public.images') IS NULL THEN
    RAISE NOTICE 'Skipping unique index creation: table public.images does not exist';
    RETURN;
  END IF;

  -- Remove exact duplicate original_url rows, keeping the row with the smallest id.
  -- This is a best-effort dedupe to allow adding a unique index; review data before running in production.
  BEGIN
    -- Only run delete if duplicates exist
    IF EXISTS (
      SELECT original_url FROM public.images WHERE original_url IS NOT NULL GROUP BY original_url HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Found duplicate original_url rows in public.images; removing duplicates (keeping lowest id)';
      -- Delete duplicates keeping the smallest id per original_url
      EXECUTE '
        DELETE FROM public.images a
        USING (
          SELECT MIN(id) AS keep_id, original_url
          FROM public.images
          WHERE original_url IS NOT NULL
          GROUP BY original_url
          HAVING COUNT(*) > 1
        ) k
        WHERE a.original_url = k.original_url
          AND a.id <> k.keep_id
      ';
    ELSE
      RAISE NOTICE 'No duplicate original_url rows found';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If something goes wrong (for example id column not present), warn and continue.
    RAISE WARNING 'Dedupe step failed: %', SQLERRM;
  END;

  -- Create a unique index on original_url if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'images' AND indexname = 'idx_images_original_url_unique'
  ) THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_images_original_url_unique ON public.images (original_url) WHERE original_url IS NOT NULL';
      RAISE NOTICE 'Created unique index idx_images_original_url_unique on public.images(original_url)';
    EXCEPTION WHEN OTHERS THEN
      -- If concurrent index creation fails (e.g., within transaction), fall back to non-concurrent create
      RAISE WARNING 'Concurrent index create failed: %, attempting non-concurrent create', SQLERRM;
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_images_original_url_unique ON public.images (original_url) WHERE original_url IS NOT NULL';
    END;
  ELSE
    RAISE NOTICE 'Unique index idx_images_original_url_unique already exists';
  END IF;

END$$;

COMMIT;

-- NOTE: This migration attempts a best-effort deduplication. Review database
-- contents and backups before applying in production environments.
