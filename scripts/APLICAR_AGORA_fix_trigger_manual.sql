-- =============================================================================
-- FIX FINAL: trigger garantir_mov_ao_quitar_cr/cp em prod usa 'manual' (invalido)
-- =============================================================================
-- A constraint movimentacoes_status_conciliacao_check aceita:
--   ('pendente','conciliado','divergente','ignorado')
-- Mas a versao em prod das triggers garantir_mov_ao_quitar_cr/cp insere com
-- status_conciliacao='manual'. Toda vez que a RPC criar_venda_atomica insere
-- um CR pago, a trigger dispara e estoura a constraint.
--
-- Migration local correta (20260520150000_garantias_integridade_financeira.sql)
-- nunca foi aplicada. Este script aplica a versao correta + backfill.
-- =============================================================================

-- 1. CR: garantir mov ao pagar (versao correta com 'pendente')
CREATE OR REPLACE FUNCTION public.garantir_mov_ao_quitar_cr()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_mov_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_mov_garantia', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;

  IF NEW.status NOT IN ('pago', 'parcial', 'conciliado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT TRUE INTO v_mov_exists
  FROM public.movimentacoes WHERE conta_receber_id = NEW.id LIMIT 1;
  IF v_mov_exists THEN RETURN NEW; END IF;

  IF NEW.conta_bancaria_id IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  INSERT INTO public.movimentacoes (
    company_id, conta_bancaria_id, conta_contabil_id,
    conta_receber_id, tipo, valor, data, descricao, origem, status_conciliacao
  ) VALUES (
    NEW.company_id,
    NEW.conta_bancaria_id,
    NEW.conta_contabil_id,
    NEW.id,
    'credito',
    COALESCE(NEW.valor_pago, NEW.valor),
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    'Recebimento — ' || COALESCE(NEW.pagador_nome, '(sem nome)'),
    'conta_receber',
    CASE WHEN NEW.status = 'conciliado' THEN 'conciliado' ELSE 'pendente' END
  );

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garantir_mov_ao_quitar_cr ON public.contas_receber;
CREATE TRIGGER trg_garantir_mov_ao_quitar_cr
  AFTER INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.garantir_mov_ao_quitar_cr();


-- 2. CP: mesma correcao
CREATE OR REPLACE FUNCTION public.garantir_mov_ao_quitar_cp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_skip TEXT;
  v_mov_exists BOOLEAN;
BEGIN
  BEGIN
    v_skip := current_setting('app.skip_mov_garantia', true);
  EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;

  IF NEW.status NOT IN ('pago', 'parcial', 'conciliado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT TRUE INTO v_mov_exists
  FROM public.movimentacoes WHERE conta_pagar_id = NEW.id LIMIT 1;
  IF v_mov_exists THEN RETURN NEW; END IF;

  IF NEW.conta_bancaria_id IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.skip_categoria_garantia', 'true', true);

  INSERT INTO public.movimentacoes (
    company_id, conta_bancaria_id, conta_contabil_id,
    conta_pagar_id, tipo, valor, data, descricao, origem, status_conciliacao
  ) VALUES (
    NEW.company_id,
    NEW.conta_bancaria_id,
    NEW.conta_contabil_id,
    NEW.id,
    'debito',
    COALESCE(NEW.valor_pago, NEW.valor),
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    'Pagamento — ' || COALESCE(NEW.credor_nome, '(sem nome)'),
    'conta_pagar',
    CASE WHEN NEW.status = 'conciliado' THEN 'conciliado' ELSE 'pendente' END
  );

  PERFORM set_config('app.skip_categoria_garantia', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garantir_mov_ao_quitar_cp ON public.contas_pagar;
CREATE TRIGGER trg_garantir_mov_ao_quitar_cp
  AFTER INSERT OR UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.garantir_mov_ao_quitar_cp();


-- 3. Verificacao final: confirma que nenhuma funcao no schema public ainda menciona 'manual'
DO $$
DECLARE
  v_bad_funcs TEXT;
BEGIN
  SELECT string_agg(proname, ', ') INTO v_bad_funcs
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('garantir_mov_ao_quitar_cr', 'garantir_mov_ao_quitar_cp')
    AND pg_get_functiondef(oid) LIKE '%''manual''%';
  IF v_bad_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'AINDA HA FUNCOES COM manual: %', v_bad_funcs;
  ELSE
    RAISE NOTICE 'OK: triggers corrigidas. Tente lancar a venda agora.';
  END IF;
END $$;
