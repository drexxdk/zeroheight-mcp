-- Enable RLS and add basic policies for images, pages, and scrape_jobs
-- WARNING: These policies allow access for the 'anon' and 'authenticated' roles.
-- Review and harden policies before applying to production.

BEGIN;

-- Enable Row Level Security on tables
ALTER TABLE IF EXISTS public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scrape_jobs ENABLE ROW LEVEL SECURITY;

-- images: allow all operations for anon/authenticated (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_allow_all_roles'
  ) THEN
    CREATE POLICY images_allow_all_roles
      ON public.images
      FOR ALL
      USING (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
END$$;

-- pages: allow all operations for anon/authenticated (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_allow_all_roles'
  ) THEN
    CREATE POLICY pages_allow_all_roles
      ON public.pages
      FOR ALL
      USING (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
END$$;

-- scrape_jobs: allow all operations for anon/authenticated (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scrape_jobs' AND policyname = 'scrape_jobs_allow_all_roles'
  ) THEN
    CREATE POLICY scrape_jobs_allow_all_roles
      ON public.scrape_jobs
      FOR ALL
      USING (auth.role() = 'anon' OR auth.role() = 'authenticated');
  END IF;
END$$;

COMMIT;

-- NOTE: These policies are intentionally permissive to allow non-admin clients
-- to perform the operations previously done by the admin/service-role key.
-- For production, refine policies to require authentication and to limit
-- operations to specific columns or predicates (for example, only allow
-- users to modify rows they own).
