BEGIN;

-- Keep multi-tenant restrictions, but avoid inconsistent combinations where users can edit
-- and still fail on INSERT due to can_create=false.
CREATE OR REPLACE FUNCTION public.can_create_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.is_super_admin(_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.companies c
        WHERE c.id = _company_id
          AND c.owner_id = _user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_company_permissions ucp
        WHERE ucp.user_id = _user_id
          AND ucp.company_id = _company_id
          AND (
            ucp.can_create = true
            OR ucp.can_edit = true
            OR ucp.can_delete = true
          )
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.user_company_permissions ucp
          WHERE ucp.user_id = _user_id
            AND ucp.company_id = _company_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_companies uc
          WHERE uc.user_id = _user_id
            AND uc.company_id = _company_id
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_create_company(uuid, uuid) TO authenticated, service_role;

-- Backfill existing rows that are logically inconsistent with write permissions.
UPDATE public.user_company_permissions
SET
  can_create = true,
  updated_at = NOW()
WHERE can_create = false
  AND (can_edit = true OR can_delete = true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pending_user_company_permissions'
  ) THEN
    UPDATE public.pending_user_company_permissions
    SET
      can_create = true,
      updated_at = NOW()
    WHERE can_create = false
      AND (can_edit = true OR can_delete = true);
  END IF;
END
$$;

COMMIT;
