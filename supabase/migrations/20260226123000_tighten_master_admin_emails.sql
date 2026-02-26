BEGIN;

CREATE OR REPLACE FUNCTION public.is_master_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'izabelvier@outlook.com',
    'isabelvier@outlook.com',
    'yuriallmeida@gmail.com'
  );
$$;

INSERT INTO public.admin_users (user_id, email, is_super_admin)
SELECT u.id, u.email, true
FROM auth.users u
WHERE lower(u.email) IN (
  'izabelvier@outlook.com',
  'isabelvier@outlook.com',
  'yuriallmeida@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE
SET
  is_super_admin = true,
  email = excluded.email;

COMMIT;
