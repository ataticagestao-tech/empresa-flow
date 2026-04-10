-- ============================================================
-- Retroação: quitar contas_receber de vendas À VISTA importadas
-- ============================================================
--
-- Contexto: até a correção no loop de importação de vendas
-- (src/pages/Vendas.tsx::executarImportacao), todas as CRs geradas
-- por importação CSV ficavam com status='aberto', mesmo quando a
-- forma de pagamento era à vista (pix, dinheiro, cartão débito).
-- Isso quebrava o regime de caixa do Painel Gerencial, que soma
-- valor_pago por data_pagamento — o KPI Faturamento em modo Caixa
-- ignorava completamente as vendas importadas e caía para o fallback
-- de conciliação bancária, divergindo da página Vendas.
--
-- Esta migration alinha as CRs já gravadas com o comportamento novo,
-- marcando-as como pagas na mesma data da venda. NÃO gera movimentações
-- de crédito: para os meses já conciliados, o extrato bancário já
-- registrou a entrada pelo outro lado, e gerar movimentações agora
-- causaria duplicidade no saldo e na conciliação.
--
-- Critérios aplicados:
--   • CR vinculada a uma venda (venda_id NOT NULL)
--   • CR ainda em aberto, sem valor_pago parcial manual
--   • Venda com forma_pagamento à vista (pix, dinheiro, cartao_debito)
--   • Venda confirmada (não cancelada)
--   • CR não soft-deletada
--
-- O trigger bloquear_edicao_pago (20260325180000_audit_imutabilidade.sql)
-- permite esta operação porque OLD.status = 'aberto' — a imutabilidade
-- só é imposta quando OLD.status já está em 'pago' ou 'conciliado'.

UPDATE public.contas_receber cr
SET
  status = 'pago',
  valor_pago = cr.valor,
  data_pagamento = v.data_venda,
  forma_recebimento = v.forma_pagamento
FROM public.vendas v
WHERE cr.venda_id = v.id
  AND cr.status = 'aberto'
  AND cr.valor_pago = 0
  AND cr.deleted_at IS NULL
  AND v.forma_pagamento IN ('pix', 'dinheiro', 'cartao_debito')
  AND v.status = 'confirmado';
