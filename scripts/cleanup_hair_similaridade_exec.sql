-- ============================================================================
-- CLEANUP HAIR — dedup conservador por SIMILARIDADE de nome (pg_trgm)
--
-- Regra:
--   Para cada par de movs em mesma conta/valor/tipo em ±7 dias:
--     Se similaridade(nome_limpo_1, nome_limpo_2) >= 0.6 -> duplicata
--     Mantem a com CR/CP linkado (com categoria) ou a mais antiga
--     Delete a outra (hard-delete mov + soft-delete CR/CP orfao resultante)
--
-- Backup automatico antes. Recalcula saldos e refresh MVs ao fim.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE
  v_hair UUID;
  v_bkp TEXT := to_char(now(), 'YYYYMMDD_HH24MI');
  v_threshold FLOAT := 0.6;
  v_movs_del INT;
  v_crs_del INT;
  v_cps_del INT;
BEGIN
  SELECT id INTO v_hair FROM public.companies WHERE nome_fantasia = 'HAIR OF BRASIL LTDA';

  EXECUTE format('CREATE TABLE public.backup_hair_sim_movs_%s AS SELECT * FROM public.movimentacoes WHERE company_id = %L', v_bkp, v_hair);
  EXECUTE format('CREATE TABLE public.backup_hair_sim_cr_%s AS SELECT * FROM public.contas_receber WHERE company_id = %L', v_bkp, v_hair);
  EXECUTE format('CREATE TABLE public.backup_hair_sim_cp_%s AS SELECT * FROM public.contas_pagar WHERE company_id = %L', v_bkp, v_hair);

  -- 1. Detectar pares + deletar mov "pior"
  WITH mov_clean AS (
    SELECT m.id, m.conta_bancaria_id, m.data, m.valor, m.tipo,
      m.conta_receber_id, m.conta_pagar_id, m.conta_contabil_id, m.created_at,
      regexp_replace(
        regexp_replace(
          lower(COALESCE(
            (SELECT pagador_nome FROM public.contas_receber WHERE id = m.conta_receber_id),
            (SELECT credor_nome  FROM public.contas_pagar   WHERE id = m.conta_pagar_id),
            m.descricao
          )),
          '(pgto:|pagamento[: \-—]+|recbto:|recebimento[: \-—]+|débito|debito|crédito|credito|transferência|transferencia|pix|doc\.?:|deb pix|cred pix|cobrança|cobranca|liquidação|liquidacao|arrecadação|arrecadacao|convênios?|convenios?|própria|propria|arranjo|tef|dom|ltda|comissão|comissao|mastercard|visa|elo|hipercard|maquininha|documento|operação|operacao|recebimento vendas|recebim|pagamen|transfer|cobran|liquidac|arrecadac|propri|doc |domdeb|domcred|deb |cred )',
          ' ', 'g'),
        '[^a-zçáéíóúãõâêîôûàèìòù ]+', ' ', 'g'
      ) AS nome_limpo
    FROM public.movimentacoes m
    WHERE m.company_id = v_hair AND m.origem <> 'transferencia'
  ),
  pairs AS (
    SELECT m1.id AS id1, m2.id AS id2,
      m1.conta_receber_id AS cr1, m1.conta_pagar_id AS cp1,
      m1.conta_contabil_id AS cc1, m1.created_at AS ct1,
      m2.conta_receber_id AS cr2, m2.conta_pagar_id AS cp2,
      m2.conta_contabil_id AS cc2, m2.created_at AS ct2
    FROM mov_clean m1
    INNER JOIN mov_clean m2 ON m1.conta_bancaria_id = m2.conta_bancaria_id
      AND m1.valor = m2.valor AND m1.tipo = m2.tipo
      AND m1.id < m2.id
      AND ABS(m1.data - m2.data) <= 7
    WHERE length(trim(m1.nome_limpo)) >= 4
      AND length(trim(m2.nome_limpo)) >= 4
      AND similarity(m1.nome_limpo, m2.nome_limpo) >= v_threshold
  ),
  a_deletar AS (
    SELECT DISTINCT
      CASE
        WHEN (cr1 IS NOT NULL OR cp1 IS NOT NULL) AND (cr2 IS NULL AND cp2 IS NULL) THEN id2
        WHEN (cr1 IS NULL AND cp1 IS NULL) AND (cr2 IS NOT NULL OR cp2 IS NOT NULL) THEN id1
        WHEN cc1 IS NOT NULL AND cc2 IS NULL THEN id2
        WHEN cc1 IS NULL AND cc2 IS NOT NULL THEN id1
        ELSE CASE WHEN ct1 < ct2 THEN id2 ELSE id1 END
      END AS mov_id
    FROM pairs
  )
  DELETE FROM public.movimentacoes m USING a_deletar d WHERE m.id = d.mov_id;
  GET DIAGNOSTICS v_movs_del = ROW_COUNT;

  -- 2. Soft-delete CRs orfaos (sem mov ativa, sem bt/brm link)
  WITH crs_orfaos AS (
    SELECT cr.id FROM public.contas_receber cr
    WHERE cr.company_id = v_hair AND cr.deleted_at IS NULL
      AND cr.status IN ('pago','conciliado','parcial')
      AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_receber_id = cr.id)
      AND (cr.created_via_bank_tx_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = cr.created_via_bank_tx_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches brm
        WHERE brm.receivable_id = cr.id AND brm.bank_transaction_id IS NOT NULL
      )
  )
  UPDATE public.contas_receber cr SET deleted_at = now() FROM crs_orfaos o WHERE cr.id = o.id;
  GET DIAGNOSTICS v_crs_del = ROW_COUNT;

  -- 3. Soft-delete CPs orfaos
  WITH cps_orfaos AS (
    SELECT cp.id FROM public.contas_pagar cp
    WHERE cp.company_id = v_hair AND cp.deleted_at IS NULL
      AND cp.status IN ('pago','conciliado','parcial')
      AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m WHERE m.conta_pagar_id = cp.id)
      AND (cp.created_via_bank_tx_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = cp.created_via_bank_tx_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches brm
        WHERE brm.payable_id = cp.id AND brm.bank_transaction_id IS NOT NULL
      )
  )
  UPDATE public.contas_pagar cp SET deleted_at = now() FROM cps_orfaos o WHERE cp.id = o.id;
  GET DIAGNOSTICS v_cps_del = ROW_COUNT;

  -- 4. Recalc saldos + refresh MVs
  UPDATE public.bank_accounts ba
    SET current_balance = ba.initial_balance + COALESCE((
      SELECT SUM(CASE WHEN m.tipo='credito' THEN m.valor ELSE -m.valor END)
        FROM public.movimentacoes m WHERE m.conta_bancaria_id = ba.id
    ), 0), updated_at = now()
    WHERE ba.company_id = v_hair;
  PERFORM public.refresh_mvs_financeiras();

  RAISE NOTICE 'Movs deletadas (sim>=%): %', v_threshold, v_movs_del;
  RAISE NOTICE 'CRs soft-deletados: %', v_crs_del;
  RAISE NOTICE 'CPs soft-deletados: %', v_cps_del;
  RAISE NOTICE 'Backup: backup_hair_sim_{movs,cr,cp}_%', v_bkp;
END $$;
