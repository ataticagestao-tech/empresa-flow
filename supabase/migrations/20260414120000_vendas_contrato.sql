-- Adiciona suporte a anexo de contrato e data de assinatura em vendas
-- Contexto: vendas ja funcionam como "contratos" (tipo='contrato' no enum).
-- Agora permitimos anexar o PDF do contrato e registrar data de assinatura.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS contrato_url TEXT,
  ADD COLUMN IF NOT EXISTS data_contrato DATE;

COMMENT ON COLUMN public.vendas.contrato_url IS 'URL publica do PDF do contrato no Supabase Storage (bucket contratos)';
COMMENT ON COLUMN public.vendas.data_contrato IS 'Data de assinatura do contrato (opcional)';

-- Bucket dedicado para PDFs de contratos
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket (padrao do projeto: authenticated users)
DROP POLICY IF EXISTS "Users can upload contratos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view contratos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update contratos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete contratos" ON storage.objects;

CREATE POLICY "Users can upload contratos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contratos');

CREATE POLICY "Users can view contratos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'contratos');

CREATE POLICY "Users can update contratos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'contratos');

CREATE POLICY "Users can delete contratos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'contratos');
