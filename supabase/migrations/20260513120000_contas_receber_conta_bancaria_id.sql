-- Adiciona conta_bancaria_id em contas_receber para suportar vendas com
-- multiplas formas de pagamento (cada split sabe em qual conta vai cair).
-- Coluna nullable: CRs criados antes da feature nao tinham essa info, e
-- o destino so e materializado quando o CR for quitado (movimentacoes).

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid
    REFERENCES public.bank_accounts(id);

CREATE INDEX IF NOT EXISTS idx_cr_conta_bancaria
  ON public.contas_receber(conta_bancaria_id)
  WHERE conta_bancaria_id IS NOT NULL;

COMMENT ON COLUMN public.contas_receber.conta_bancaria_id IS
  'Conta destino prevista no momento da venda (split de pagamento). Pode ser NULL para CRs criados antes da feature de multi-pagamento ou em fluxos que so escolhem a conta na quitacao.';
