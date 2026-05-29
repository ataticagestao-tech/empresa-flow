-- =====================================================================
-- Biblioteca CNAE → tributação (referência, compartilhada)
-- Sugere Anexo (Simples) e presunção IRPJ/CSLL + ISS (Presumido/Real)
-- por código CNAE, para pré-preencher o mix tributário da empresa.
-- Conjunto CURADO dos nichos mais comuns — editável pela UI (cresce com o uso).
-- NÃO calcula ICMS (sistema é orientado a serviço/NFSe); comércio em Presumido
-- fica sem ICMS na previsão. Ver lib/fiscal/apuracao.ts e PrevisaoImpostos.tsx
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cnae_tributacao (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL UNIQUE,
  descricao             text NOT NULL,
  anexo_simples         text CHECK (anexo_simples IN ('I','II','III','IV','V')),
  fator_r_aplicavel     boolean NOT NULL DEFAULT false,  -- true = III↔V depende do Fator R
  presuncao_irpj        numeric(5,2) NOT NULL DEFAULT 32,
  presuncao_csll        numeric(5,2) NOT NULL DEFAULT 32,
  aliquota_iss_sugerida numeric(5,2) NOT NULL DEFAULT 3,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cnae_tributacao ENABLE ROW LEVEL SECURITY;

-- Referência compartilhada: leitura/edição para usuários autenticados.
DROP POLICY IF EXISTS "cnae_trib_select" ON public.cnae_tributacao;
CREATE POLICY "cnae_trib_select" ON public.cnae_tributacao
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cnae_trib_write" ON public.cnae_tributacao;
CREATE POLICY "cnae_trib_write" ON public.cnae_tributacao
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Seed curado (nichos comuns). presunção/ISS em %.
INSERT INTO public.cnae_tributacao (codigo, descricao, anexo_simples, fator_r_aplicavel, presuncao_irpj, presuncao_csll, aliquota_iss_sugerida) VALUES
  ('8630-5/01', 'Atividade médica ambulatorial com procedimentos cirúrgicos', 'III', true, 8, 12, 3),
  ('8630-5/03', 'Atividade médica ambulatorial restrita a consulta', 'III', true, 32, 32, 3),
  ('8610-1/01', 'Atividades de atendimento hospitalar', 'III', true, 8, 12, 3),
  ('8640-2/02', 'Laboratórios clínicos', 'III', true, 8, 12, 3),
  ('8650-0/03', 'Atividades de psicologia e psicanálise', 'III', true, 32, 32, 3),
  ('8650-0/04', 'Atividades de fisioterapia', 'III', true, 32, 32, 3),
  ('9602-5/01', 'Cabeleireiros, manicure e pedicure', 'III', true, 32, 32, 3),
  ('9602-5/02', 'Atividades de estética e outros serviços de cuidados com a beleza', 'III', true, 32, 32, 3),
  ('8599-6/04', 'Treinamento em desenvolvimento profissional e gerencial', 'III', true, 32, 32, 3),
  ('6920-6/01', 'Atividades de contabilidade', 'III', true, 32, 32, 3),
  ('6911-7/01', 'Serviços advocatícios', 'IV', false, 32, 32, 5),
  ('7112-0/00', 'Serviços de engenharia', 'V', true, 32, 32, 3),
  ('4120-4/00', 'Construção de edifícios', 'IV', false, 8, 12, 3),
  ('4772-5/00', 'Comércio varejista de cosméticos, perfumaria e higiene pessoal', 'I', false, 8, 12, 0),
  ('4781-4/00', 'Comércio varejista de vestuário', 'I', false, 8, 12, 0),
  ('4789-0/99', 'Comércio varejista de outros produtos', 'I', false, 8, 12, 0),
  ('5611-2/01', 'Restaurantes e similares', 'I', false, 8, 12, 0),
  ('4520-0/01', 'Serviços de manutenção e reparação de veículos', 'III', true, 32, 32, 3),
  ('6201-5/01', 'Desenvolvimento de software sob encomenda', 'III', true, 32, 32, 3),
  ('7020-4/00', 'Consultoria em gestão empresarial', 'V', true, 32, 32, 3)
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.cnae_tributacao IS
  'Biblioteca CNAE→tributação (anexo Simples + presunção IRPJ/CSLL + ISS) para pré-preencher o mix. Curada e editável. Ver lib/fiscal/apuracao.ts';
