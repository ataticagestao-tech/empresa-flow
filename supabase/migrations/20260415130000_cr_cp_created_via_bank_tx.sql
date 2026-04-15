-- ============================================================
-- Feature: rastrear CR/CP criados a partir de conciliacao bancaria
--
-- Objetivo: ao excluir um extrato (bank_transaction), podermos
-- soft-deletar os CR/CP que foram criados especificamente a partir
-- dele, em vez de apenas reverter status para 'aberto'. CR/CP
-- pre-existentes (com venda_id/contrato_recorrente_id) ou manuais
-- nao sao afetados.
--
-- Diagnostico (rodado em 2026-04-15):
--   - 25.199 CR/CP orfaos (sem venda_id/contrato) com match bancario
--   - 99.99% foram criados em <=10s do match -> via conciliacao
--   - 2 CR na zona cinzenta (10-60s) nao serao marcados
-- ============================================================

-- ─── 1. Adicionar coluna created_via_bank_tx_id ─────────────

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS created_via_bank_tx_id uuid
    REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS created_via_bank_tx_id uuid
    REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cr_created_via_bank_tx
  ON public.contas_receber(created_via_bank_tx_id)
  WHERE created_via_bank_tx_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cp_created_via_bank_tx
  ON public.contas_pagar(created_via_bank_tx_id)
  WHERE created_via_bank_tx_id IS NOT NULL;

COMMENT ON COLUMN public.contas_receber.created_via_bank_tx_id IS
  'Se preenchido, este CR foi criado via conciliacao bancaria (fluxo Criar e Conciliar). Ao excluir o extrato, o CR sera soft-deletado.';

COMMENT ON COLUMN public.contas_pagar.created_via_bank_tx_id IS
  'Se preenchido, este CP foi criado via conciliacao bancaria (fluxo Criar e Conciliar). Ao excluir o extrato, o CP sera soft-deletado.';


-- ─── 2. Backfill retroativo ─────────────────────────────────
--
-- Criterio: CR/CP sem venda/contrato + tem match em
-- bank_reconciliation_matches + match criado em <=10s da criacao
-- do CR/CP (alta confianca que foi via conciliacao).
--
-- Triggers precisam ser desabilitados porque bloquear_edicao_pago
-- nao permite alterar colunas arbitrarias em registros status='pago'.

ALTER TABLE public.contas_receber DISABLE TRIGGER USER;
ALTER TABLE public.contas_pagar DISABLE TRIGGER USER;

-- Backfill CR
WITH cr_para_marcar AS (
  SELECT DISTINCT ON (cr.id)
    cr.id AS cr_id,
    brm.bank_transaction_id
  FROM public.contas_receber cr
  INNER JOIN public.bank_reconciliation_matches brm
    ON brm.receivable_id = cr.id
  WHERE cr.venda_id IS NULL
    AND cr.contrato_recorrente_id IS NULL
    AND cr.created_via_bank_tx_id IS NULL
    AND brm.status = 'matched'
    AND ABS(EXTRACT(EPOCH FROM (brm.created_at - cr.created_at))) <= 10
  ORDER BY cr.id, brm.created_at ASC
)
UPDATE public.contas_receber cr
SET created_via_bank_tx_id = m.bank_transaction_id
FROM cr_para_marcar m
WHERE cr.id = m.cr_id;

-- Backfill CP
WITH cp_para_marcar AS (
  SELECT DISTINCT ON (cp.id)
    cp.id AS cp_id,
    brm.bank_transaction_id
  FROM public.contas_pagar cp
  INNER JOIN public.bank_reconciliation_matches brm
    ON brm.payable_id = cp.id
  WHERE cp.contrato_recorrente_id IS NULL
    AND cp.created_via_bank_tx_id IS NULL
    AND brm.status = 'matched'
    AND ABS(EXTRACT(EPOCH FROM (brm.created_at - cp.created_at))) <= 10
  ORDER BY cp.id, brm.created_at ASC
)
UPDATE public.contas_pagar cp
SET created_via_bank_tx_id = m.bank_transaction_id
FROM cp_para_marcar m
WHERE cp.id = m.cp_id;

ALTER TABLE public.contas_receber ENABLE TRIGGER USER;
ALTER TABLE public.contas_pagar ENABLE TRIGGER USER;


-- ─── 3. Relatorio de backfill ───────────────────────────────

DO $$
DECLARE
  v_cr_marcados int;
  v_cp_marcados int;
BEGIN
  SELECT COUNT(*) INTO v_cr_marcados
  FROM public.contas_receber
  WHERE created_via_bank_tx_id IS NOT NULL;

  SELECT COUNT(*) INTO v_cp_marcados
  FROM public.contas_pagar
  WHERE created_via_bank_tx_id IS NOT NULL;

  RAISE NOTICE 'Backfill concluido: % CR marcados, % CP marcados',
    v_cr_marcados, v_cp_marcados;
END $$;
