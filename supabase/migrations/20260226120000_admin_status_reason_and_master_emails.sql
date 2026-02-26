BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_status_updated_at
  ON public.profiles (status_updated_at DESC);

CREATE OR REPLACE FUNCTION public.is_master_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    lower(coalesce(auth.jwt() ->> 'email', '')) IN ('izabelvier@outlook.com', 'isabelvier@outlook.com')
    OR lower(coalesce(auth.jwt() ->> 'email', '')) LIKE 'yuriallmeida@%';
$$;

INSERT INTO public.admin_users (user_id, email, is_super_admin)
SELECT u.id, u.email, true
FROM auth.users u
WHERE lower(u.email) IN ('izabelvier@outlook.com', 'isabelvier@outlook.com')
   OR lower(u.email) LIKE 'yuriallmeida@%'
ON CONFLICT (user_id) DO UPDATE
SET
  is_super_admin = true,
  email = excluded.email;

COMMIT;
