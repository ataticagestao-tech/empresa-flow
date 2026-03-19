-- ============================================================
-- GESTAP — Módulo: Estoque & Compras
-- Adiciona colunas de estoque em products
-- Cria: ordens_compra, entradas/saídas estoque, inventário
-- Triggers para atualização automática de estoque
-- ============================================================

-- 1. Adicionar colunas de estoque na tabela products existente
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unidade_medida text DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS cost_price numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_medio numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_atual numeric(15,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(15,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo numeric(15,3),
  ADD COLUMN IF NOT EXISTS metodo_custeio text DEFAULT 'media_ponderada'
    CHECK (metodo_custeio IN ('media_ponderada','peps','ueps')),
  ADD COLUMN IF NOT EXISTS localizacao text,
  ADD COLUMN IF NOT EXISTS controla_validade boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS controla_lote boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS conta_contabil_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS tipo_produto text DEFAULT 'produto'
    CHECK (tipo_produto IN ('produto','insumo','ativo','embalagem'));

-- 2. Ordens de Compra
CREATE TABLE IF NOT EXISTS public.ordens_compra (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fornecedor_id   uuid NOT NULL REFERENCES public.suppliers(id),
  numero          text NOT NULL,
  data_emissao    date NOT NULL DEFAULT current_date,
  data_prevista   date,
  cond_pagamento  text,
  valor_total     numeric(15,2) NOT NULL DEFAULT 0,
  observacoes     text,
  gerada_por_alerta boolean DEFAULT false,
  status          text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviada','parcial','recebida','cancelada')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ordens_compra_itens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_compra_id     uuid NOT NULL REFERENCES public.ordens_compra(id) ON DELETE CASCADE,
  produto_id          uuid NOT NULL REFERENCES public.products(id),
  quantidade          numeric(15,3) NOT NULL,
  valor_unitario      numeric(15,4) NOT NULL,
  quantidade_recebida numeric(15,3) NOT NULL DEFAULT 0
);

-- 3. Entradas de Estoque
CREATE TABLE IF NOT EXISTS public.entradas_estoque (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fornecedor_id   uuid REFERENCES public.suppliers(id),
  ordem_compra_id uuid REFERENCES public.ordens_compra(id),
  conta_pagar_id  uuid,
  data_entrada    date NOT NULL DEFAULT current_date,
  numero_nf       text,
  chave_nf        text,
  valor_total     numeric(15,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entradas_estoque_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id      uuid NOT NULL REFERENCES public.entradas_estoque(id) ON DELETE CASCADE,
  produto_id      uuid NOT NULL REFERENCES public.products(id),
  quantidade      numeric(15,3) NOT NULL,
  valor_unitario  numeric(15,4) NOT NULL,
  lote            text,
  data_validade   date
);

-- 4. Saídas de Estoque
CREATE TABLE IF NOT EXISTS public.saidas_estoque (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  produto_id      uuid NOT NULL REFERENCES public.products(id),
  quantidade      numeric(15,3) NOT NULL,
  valor_unitario  numeric(15,4),
  tipo            text NOT NULL DEFAULT 'consumo'
    CHECK (tipo IN ('consumo','venda','transferencia','perda','ajuste','devolucao')),
  motivo          text,
  lote            text,
  centro_custo_id uuid REFERENCES public.centros_custo(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 5. Inventário
CREATE TABLE IF NOT EXISTS public.inventario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  descricao   text,
  data_inicio date NOT NULL DEFAULT current_date,
  status      text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','concluido','cancelado')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id   uuid NOT NULL REFERENCES public.inventario(id) ON DELETE CASCADE,
  produto_id      uuid NOT NULL REFERENCES public.products(id),
  qtd_sistema     numeric(15,3) NOT NULL,
  qtd_contada     numeric(15,3) NOT NULL,
  valor_unitario  numeric(15,4),
  ajuste_aprovado boolean DEFAULT false,
  ajuste_aplicado boolean DEFAULT false
);

-- 6. Trigger: entrada atualiza estoque e custo médio
CREATE OR REPLACE FUNCTION public.trg_entrada_atualiza_estoque()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estoque_atual numeric;
  v_custo_medio numeric;
  v_novo_estoque numeric;
  v_novo_custo numeric;
BEGIN
  SELECT estoque_atual, custo_medio INTO v_estoque_atual, v_custo_medio
  FROM public.products WHERE id = NEW.produto_id;

  v_novo_estoque := COALESCE(v_estoque_atual, 0) + NEW.quantidade;

  -- Custo médio ponderado
  IF v_novo_estoque > 0 THEN
    v_novo_custo := (
      (COALESCE(v_estoque_atual, 0) * COALESCE(v_custo_medio, 0)) +
      (NEW.quantidade * NEW.valor_unitario)
    ) / v_novo_estoque;
  ELSE
    v_novo_custo := NEW.valor_unitario;
  END IF;

  UPDATE public.products
  SET estoque_atual = v_novo_estoque,
      custo_medio = ROUND(v_novo_custo, 4),
      updated_at = now()
  WHERE id = NEW.produto_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entrada_atualiza_estoque ON public.entradas_estoque_itens;
CREATE TRIGGER trg_entrada_atualiza_estoque
  AFTER INSERT ON public.entradas_estoque_itens
  FOR EACH ROW EXECUTE FUNCTION public.trg_entrada_atualiza_estoque();

-- 7. Trigger: saída reduz estoque
CREATE OR REPLACE FUNCTION public.trg_saida_atualiza_estoque()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estoque_atual numeric;
BEGIN
  SELECT estoque_atual INTO v_estoque_atual
  FROM public.products WHERE id = NEW.produto_id;

  IF COALESCE(v_estoque_atual, 0) < NEW.quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente para o produto %', NEW.produto_id;
  END IF;

  UPDATE public.products
  SET estoque_atual = COALESCE(v_estoque_atual, 0) - NEW.quantidade,
      updated_at = now()
  WHERE id = NEW.produto_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saida_atualiza_estoque ON public.saidas_estoque;
CREATE TRIGGER trg_saida_atualiza_estoque
  AFTER INSERT ON public.saidas_estoque
  FOR EACH ROW EXECUTE FUNCTION public.trg_saida_atualiza_estoque();

-- 8. View: alertas de estoque mínimo
CREATE OR REPLACE VIEW public.v_estoque_minimo_alerta AS
SELECT
  p.id AS produto_id,
  p.company_id,
  p.code AS codigo,
  p.description AS descricao,
  p.estoque_atual,
  p.estoque_minimo,
  p.estoque_maximo,
  p.custo_medio,
  p.fornecedor_id,
  p.unidade_medida,
  COALESCE(p.estoque_maximo, p.estoque_minimo * 2) - p.estoque_atual AS quantidade_repor
FROM public.products p
WHERE p.is_active = true
  AND p.estoque_atual <= p.estoque_minimo
  AND p.estoque_minimo > 0;

-- 9. RLS
ALTER TABLE public.ordens_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ordens_compra
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ordens_compra' AND policyname='ordens_compra: all') THEN
    CREATE POLICY "ordens_compra: all" ON public.ordens_compra FOR ALL
      USING (company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()));
  END IF;
  -- entradas_estoque
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='entradas_estoque' AND policyname='entradas_estoque: all') THEN
    CREATE POLICY "entradas_estoque: all" ON public.entradas_estoque FOR ALL
      USING (company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()));
  END IF;
  -- saidas_estoque
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saidas_estoque' AND policyname='saidas_estoque: all') THEN
    CREATE POLICY "saidas_estoque: all" ON public.saidas_estoque FOR ALL
      USING (company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()));
  END IF;
  -- inventario
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventario' AND policyname='inventario: all') THEN
    CREATE POLICY "inventario: all" ON public.inventario FOR ALL
      USING (company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()));
  END IF;
END $$;

-- 10. Índices
CREATE INDEX IF NOT EXISTS idx_oc_company ON public.ordens_compra(company_id);
CREATE INDEX IF NOT EXISTS idx_oc_fornecedor ON public.ordens_compra(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_itens_oc ON public.ordens_compra_itens(ordem_compra_id);
CREATE INDEX IF NOT EXISTS idx_entrada_company ON public.entradas_estoque(company_id);
CREATE INDEX IF NOT EXISTS idx_saida_company ON public.saidas_estoque(company_id);
CREATE INDEX IF NOT EXISTS idx_saida_produto ON public.saidas_estoque(produto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_company ON public.inventario(company_id);
CREATE INDEX IF NOT EXISTS idx_products_estoque ON public.products(company_id, estoque_atual);

-- 11. FK contas_pagar → ordens_compra (se coluna existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contas_pagar' AND column_name='ordem_compra_id') THEN
    NULL; -- já existe
  ELSE
    ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS ordem_compra_id uuid REFERENCES public.ordens_compra(id);
  END IF;
END $$;
