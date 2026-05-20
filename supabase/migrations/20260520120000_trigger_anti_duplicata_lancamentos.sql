-- =============================================================================
-- TRIGGER ANTI-DUPLICATA — bloqueia INSERTs identicos em janela curta
-- =============================================================================
-- Defesa em profundidade contra duplicacao manual de lancamentos. Protege contra:
--   - Double-click no botao Salvar (front debounce falhou)
--   - Race condition entre dois cliques quase simultaneos
--   - Requisicao via API externa duplicada
--   - Refresh do navegador que reenviou o form
--
-- COMO FUNCIONA: BEFORE INSERT verifica se ja existe registro com criterios
-- identicos criado nos ultimos 10 segundos. Se sim, RAISE EXCEPTION com
-- mensagem clara.
--
-- BYPASS: GUC `app.skip_duplicate_check` quando setado pra 'true' (uso interno
-- de RPCs como conciliar_lote que sao defensivas por desenho — ja tem propria
-- logica de dedup).
--
-- JANELA: 10 segundos. Curta o suficiente pra nao atrapalhar lancamentos em
-- sequencia (ex: lancar 5 CPs do mesmo fornecedor em menos de 1 minuto OK),
-- mas pega o caso classico de double-click.
-- =============================================================================


-- =============================================================================
-- FUNCTION: vendas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.anti_duplicata_vendas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Bypass interno (RPCs/triggers defensivos podem setar)
  BEGIN
    v_skip := current_setting('app.skip_duplicate_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'true' THEN
    RETURN NEW;
  END IF;

  -- Procura venda identica nos ultimos 10 segundos:
  -- mesma empresa + mesmo cliente (CPF ou nome) + mesmo valor + mesma data
  SELECT TRUE INTO v_exists
  FROM public.vendas v
  WHERE v.company_id = NEW.company_id
    AND COALESCE(NULLIF(v.cliente_cpf_cnpj, ''), '__sem_cpf__') =
        COALESCE(NULLIF(NEW.cliente_cpf_cnpj, ''), '__sem_cpf__')
    AND COALESCE(v.cliente_nome, '') = COALESCE(NEW.cliente_nome, '')
    AND v.valor_total = NEW.valor_total
    AND v.data_venda = NEW.data_venda
    AND v.created_at > NOW() - INTERVAL '10 seconds'
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe venda identica criada nos ultimos 10 segundos (cliente=%, valor=%, data=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.cliente_nome, '(sem nome)'), NEW.valor_total, NEW.data_venda
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicata_vendas ON public.vendas;
CREATE TRIGGER trg_anti_duplicata_vendas
  BEFORE INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.anti_duplicata_vendas();


-- =============================================================================
-- FUNCTION: contas_receber
-- =============================================================================
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

  -- Procura CR identica nos ultimos 10 segundos
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
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe conta a receber identica criada nos ultimos 10 segundos (pagador=%, valor=%, vencimento=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.pagador_nome, '(sem nome)'), NEW.valor, NEW.data_vencimento
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicata_contas_receber ON public.contas_receber;
CREATE TRIGGER trg_anti_duplicata_contas_receber
  BEFORE INSERT ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.anti_duplicata_contas_receber();


-- =============================================================================
-- FUNCTION: contas_pagar
-- =============================================================================
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

  -- Procura CP identica nos ultimos 10 segundos
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
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe conta a pagar identica criada nos ultimos 10 segundos (credor=%, valor=%, vencimento=%). Se for legitimo, aguarde 10 segundos e tente novamente.',
      COALESCE(NEW.credor_nome, '(sem nome)'), NEW.valor, NEW.data_vencimento
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicata_contas_pagar ON public.contas_pagar;
CREATE TRIGGER trg_anti_duplicata_contas_pagar
  BEFORE INSERT ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.anti_duplicata_contas_pagar();


-- =============================================================================
-- FUNCTION: movimentacoes
-- =============================================================================
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

  -- Procura mov identica nos ultimos 10 segundos:
  -- mesma empresa + conta bancaria + tipo + valor + data + descricao
  SELECT TRUE INTO v_exists
  FROM public.movimentacoes m
  WHERE m.company_id = NEW.company_id
    AND m.conta_bancaria_id = NEW.conta_bancaria_id
    AND m.tipo = NEW.tipo
    AND m.valor = NEW.valor
    AND m.data = NEW.data
    AND COALESCE(m.descricao, '') = COALESCE(NEW.descricao, '')
    AND m.created_at > NOW() - INTERVAL '10 seconds'
  LIMIT 1;

  IF v_exists THEN
    RAISE EXCEPTION 'Lancamento duplicado detectado: ja existe movimentacao identica criada nos ultimos 10 segundos (% R$ % em %). Se for legitimo, aguarde 10 segundos e tente novamente.',
      NEW.tipo, NEW.valor, NEW.data
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicata_movimentacoes ON public.movimentacoes;
CREATE TRIGGER trg_anti_duplicata_movimentacoes
  BEFORE INSERT ON public.movimentacoes
  FOR EACH ROW EXECUTE FUNCTION public.anti_duplicata_movimentacoes();


-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON FUNCTION public.anti_duplicata_vendas IS
'Bloqueia INSERT em vendas se ja existir venda identica criada nos ultimos 10s. Bypass via SET LOCAL app.skip_duplicate_check = ''true''.';

COMMENT ON FUNCTION public.anti_duplicata_contas_receber IS
'Bloqueia INSERT em contas_receber se ja existir CR identica criada nos ultimos 10s. Bypass via SET LOCAL app.skip_duplicate_check = ''true''.';

COMMENT ON FUNCTION public.anti_duplicata_contas_pagar IS
'Bloqueia INSERT em contas_pagar se ja existir CP identica criada nos ultimos 10s. Bypass via SET LOCAL app.skip_duplicate_check = ''true''.';

COMMENT ON FUNCTION public.anti_duplicata_movimentacoes IS
'Bloqueia INSERT em movimentacoes se ja existir mov identica criada nos ultimos 10s. Bypass via SET LOCAL app.skip_duplicate_check = ''true''.';
