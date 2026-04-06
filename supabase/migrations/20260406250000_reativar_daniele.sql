-- Reativar perfil de daniele@dionellybrinquedos.com.br

UPDATE public.profiles
SET status = 'active',
    status_reason = NULL,
    status_updated_at = now(),
    updated_at = now()
WHERE email = 'daniele@dionellybrinquedos.com.br';
