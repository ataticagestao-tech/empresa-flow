-- Permitir que usuários vejam integrações da sua empresa (sem config/secrets)
-- A coluna config continua protegida pelo frontend (não será selecionada)
CREATE POLICY "integracoes: select by company"
  ON public.integracoes FOR SELECT
  USING (
    company_id IN (
      SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
    )
  );
