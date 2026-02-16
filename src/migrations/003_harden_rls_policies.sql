-- Harden RLS policies for images, pages, and tasks

BEGIN;

ALTER TABLE IF EXISTS public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'images' AND policyname = 'images_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS images_allow_all_roles ON public.images';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pages' AND policyname = 'pages_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS pages_allow_all_roles ON public.pages';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_allow_all_roles') THEN
    EXECUTE 'DROP POLICY IF EXISTS tasks_allow_all_roles ON public.tasks';
  END IF;
END$$;

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_auth_all') THEN
    CREATE POLICY tasks_auth_all ON public.tasks FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END$$;

COMMIT;

