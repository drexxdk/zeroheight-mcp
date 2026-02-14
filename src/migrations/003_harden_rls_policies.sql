-- Harden RLS policies for images, pages, and scrape_jobs
-- This migration tightens access:
--  - `images` and `pages`: allow public SELECT, require authenticated role for INSERT/UPDATE/DELETE
--  - `scrape_jobs`: require authenticated role for all operations
-- Review and adapt if you need finer ownership controls.

BEGIN;

-- Ensure RLS enabled
ALTER TABLE IF EXISTS public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS images_allow_all_roles ON public.images';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS pages_allow_all_roles ON public.pages';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scrape_jobs' AND policyname = 'scrape_jobs_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS scrape_jobs_allow_all_roles ON public.scrape_jobs';
  END IF;
END$$;

-- images: allow anyone to SELECT, but require authenticated for writes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_select_public') THEN
    CREATE POLICY images_select_public ON public.images FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_insert_auth') THEN
    CREATE POLICY images_insert_auth ON public.images FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_update_auth') THEN
    CREATE POLICY images_update_auth ON public.images FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_delete_auth') THEN
    CREATE POLICY images_delete_auth ON public.images FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- pages: allow anyone to SELECT, require authenticated for writes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_select_public') THEN
    CREATE POLICY pages_select_public ON public.pages FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_insert_auth') THEN
    CREATE POLICY pages_insert_auth ON public.pages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_update_auth') THEN
    CREATE POLICY pages_update_auth ON public.pages FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_delete_auth') THEN
    CREATE POLICY pages_delete_auth ON public.pages FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- scrape_jobs: require authenticated for all operations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scrape_jobs' AND policyname = 'scrape_jobs_auth_all') THEN
    CREATE POLICY scrape_jobs_auth_all ON public.scrape_jobs FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END$$;

COMMIT;

-- NOTE: These policies assume you want public read access to pages/images.
-- If you prefer no public reads, change the SELECT policies to require auth.role() = 'authenticated'.
