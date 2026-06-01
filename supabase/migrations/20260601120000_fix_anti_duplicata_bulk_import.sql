-- =============================================================================
-- FIX: anti-duplicata barrava importacao de vendas em lote
-- =============================================================================
-- As triggers anti-duplicata (criadas em 20260520120000) detectavam linhas
-- IDENTICAS da MESMA transacao como "duplicatas". Num INSERT multi-linha (como
-- a importacao de planilha faz), o BEFORE ROW trigger da linha N JA enxerga as
-- linhas 1..N-1 do mesmo INSERT — entao um lote de vendas repetitivas de loja
-- (ex.: varias vendas "Cliente Geral", R$40, mesma data) travava com
-- "Lancamento duplicado detectado", abortando o lote inteiro (0 importadas).
--
-- CORRECAO: excluir da checagem as linhas criadas pela PROPRIA transacao atual,
-- comparando xmin (xid que criou a linha) com a transacao corrente. Assim:
--   - Importacao em lote (tudo numa transacao) -> linhas-irmas nao colidem -> OK
--   - Duplo-clique real (2 requests = 2 transacoes distintas) -> a 2a transacao
--     enxerga a 1a linha (xmin diferente, criada <10s) -> CONTINUA bloqueando.
--
-- xmin de linhas da transacao corrente == txid_current() truncado a 32 bits
-- (txid_current()::text::xid faz exatamente esse truncamento).
--
-- ESCOPO: aplicado nas 4 tabelas financeiras (vendas, contas_receber,
-- contas_pagar, movimentacoes). Conserta import em lote de vendas (vendas+CR+mov)
-- e tambem libera import em lote de despesas no futuro (contas_pagar).
-- =============================================================================


-- ---- vendas -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anti_duplicata_vendas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_duplicate_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT TRUE INTO v_exists
  FROM public.vendas v
  WHERE v.company_id = NEW.company_id
    AND COALESCE(NULLIF(v.cliente_cpf_cnpj, ''), '__sem_cpf__') =
        COALESCE(NULLIF(NEW.cliente_cpf_cnpj, ''), '__sem_cpf__')
    AND COALESCE(v.cliente_nome, '') = COALESCE(NEW.cliente_nome, '')
    AND v.valor_total = NEW.valor_total
    AND v.data_venda = NEW.data_venda
    AND v.created_at > NOW() - INTERVAL '10 seconds'
    AND NOT (v.xmin = txid_current()::text::xid)   -- ignora linhas da MESMA transacao (lote)
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe venda identica criada nos ultimos 10 segundos (cliente=%, valor=%, data=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.cliente_nome, '(sem nome)'), NEW.valor_total, NEW.data_venda
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ---- contas_receber ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anti_duplicata_contas_receber()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_duplicate_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT TRUE INTO v_exists
  FROM public.contas_receber cr
  WHERE cr.company_id = NEW.company_id
    AND COALESCE(NULLIF(cr.pagador_cpf_cnpj, ''), '__sem_cpf__') =
        COALESCE(NULLIF(NEW.pagador_cpf_cnpj, ''), '__sem_cpf__')
    AND COALESCE(cr.pagador_nome, '') = COALESCE(NEW.pagador_nome, '')
    AND cr.valor = NEW.valor
    AND cr.data_vencimento = NEW.data_vencimento
    AND cr.deleted_at IS NULL
    AND cr.created_at > NOW() - INTERVAL '10 seconds'
    AND NOT (cr.xmin = txid_current()::text::xid)
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe conta a receber identica criada nos ultimos 10 segundos (pagador=%, valor=%, vencimento=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.pagador_nome, '(sem nome)'), NEW.valor, NEW.data_vencimento
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ---- contas_pagar -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anti_duplicata_contas_pagar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_duplicate_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT TRUE INTO v_exists
  FROM public.contas_pagar cp
  WHERE cp.company_id = NEW.company_id
    AND COALESCE(NULLIF(cp.credor_cpf_cnpj, ''), '__sem_cpf__') =
        COALESCE(NULLIF(NEW.credor_cpf_cnpj, ''), '__sem_cpf__')
    AND COALESCE(cp.credor_nome, '') = COALESCE(NEW.credor_nome, '')
    AND cp.valor = NEW.valor
    AND cp.data_vencimento = NEW.data_vencimento
    AND cp.deleted_at IS NULL
    AND cp.created_at > NOW() - INTERVAL '10 seconds'
    AND NOT (cp.xmin = txid_current()::text::xid)
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe conta a pagar identica criada nos ultimos 10 segundos (credor=%, valor=%, vencimento=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.credor_nome, '(sem nome)'), NEW.valor, NEW.data_vencimento
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ---- movimentacoes ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anti_duplicata_movimentacoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_duplicate_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT TRUE INTO v_exists
  FROM public.movimentacoes m
  WHERE m.company_id = NEW.company_id
    AND m.conta_bancaria_id = NEW.conta_bancaria_id
    AND m.tipo = NEW.tipo
    AND m.valor = NEW.valor
    AND m.data = NEW.data
    AND COALESCE(m.descricao, '') = COALESCE(NEW.descricao, '')
    AND m.created_at > NOW() - INTERVAL '10 seconds'
    AND NOT (m.xmin = txid_current()::text::xid)
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe movimentacao identica criada nos ultimos 10 segundos (% R$ % em %). Se for legitimo, aguarde 10 segundos e tente novamente.',
      NEW.tipo, NEW.valor, NEW.data
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
