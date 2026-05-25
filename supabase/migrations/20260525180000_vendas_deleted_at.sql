-- =============================================================================
-- FIX: vendas precisa de deleted_at pro trigger _log_vendas nao quebrar
-- =============================================================================
-- Sintoma: ao atualizar uma venda (ex: toggle nf_emitida na tela
-- /nfse-emissao aba "Vendas a faturar"), Postgres retornava:
--   "record 'new' has no field 'deleted_at'"
--
-- Causa: trigger trg_log_vendas (BEFORE UPDATE) chama a funcao
-- public._log_vendas() que referencia NEW.deleted_at. Mas a tabela
-- public.vendas nunca teve essa coluna — outras tabelas auditadas
-- (contas_pagar, contas_receber, bank_reconciliation_matches) tem.
--
-- Fix: adiciona deleted_at + deleted_by em vendas seguindo o mesmo padrao
-- de soft-delete das demais tabelas financeiras. A funcao _log_vendas
-- agora consegue ler o campo (sempre NULL ate alguem soft-deletar uma
-- venda — comportamento atual nao muda).
-- =============================================================================

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_vendas_deleted_at
  ON public.vendas (company_id, data_venda DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.vendas.deleted_at IS 'Soft delete timestamp (NULL = ativa). Necessario pro trigger _log_vendas funcionar.';
COMMENT ON COLUMN public.vendas.deleted_by IS 'Usuario que executou o soft delete';
