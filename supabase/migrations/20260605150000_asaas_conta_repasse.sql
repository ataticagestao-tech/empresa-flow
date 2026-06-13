-- ============================================================
-- Asaas — Conta de repasse (Etapa 4: anti-duplicidade com o extrato)
--
-- Conta bancária (do sistema) onde o Asaas deposita o repasse do saldo.
-- Quando o Asaas avisa o repasse (evento TRANSFER_DONE), o webhook lança uma
-- TRANSFERÊNCIA: débito na conta "Asaas (a receber)" + crédito nesta conta.
-- Como transferência não entra no DRE, a receita (já reconhecida na conta
-- Asaas no recebimento) não é contada de novo — e a conciliação do extrato
-- casa com o crédito já lançado, sem duplicar.
--
-- Opcional: se ficar em branco, o repasse é conciliado manualmente.
-- ============================================================

alter table public.asaas_configuracoes
  add column if not exists conta_repasse_id uuid references public.bank_accounts(id);

comment on column public.asaas_configuracoes.conta_repasse_id is
  'Conta bancária do sistema que recebe os repasses do Asaas. O webhook lança o repasse como transferência da conta "Asaas (a receber)" pra esta conta, evitando duplicar receita no extrato.';
