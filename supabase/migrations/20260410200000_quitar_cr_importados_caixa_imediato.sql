-- ============================================================
-- Retroação: quitar contas_receber de vendas importadas
-- Regra de negócio: CAIXA IMEDIATO nas unidades listadas
-- ============================================================
--
-- Regra (confirmada pela operadora em 2026-04-10):
-- Em todas as unidades abaixo, toda venda é considerada "baixada no
-- dia do lançamento". O caixa bate 1-para-1 com a emissão, sem vendas
-- a prazo reais — pix, dinheiro e cartão débito são os únicos meios
-- usados hoje e ambos entram como dinheiro na hora.
--
-- Contexto técnico: o loop de importação CSV
-- (src/pages/Vendas.tsx::executarImportacao) deixava todos os CRs em
-- status='aberto'. A correção aplicada no mesmo PR já quita as vendas
-- à vista no ato para imports futuros; esta migration retroage os CRs
-- históricos já gravados na base.
--
-- Escopo:
--   • Apenas as 12 unidades listadas explicitamente abaixo. Outras
--     empresas da base (incluindo "003 ITAQUERA") NÃO são tocadas.
--   • Apenas vendas com data_venda <= CURRENT_DATE. Isso protege
--     registros futuros (seed/demo ou vendas pré-agendadas) de virar
--     caixa recebido em mês que ainda não chegou.
--   • Qualquer forma de pagamento (filtro amplo, não só à vista) —
--     garante que eventuais CRs parcelados ou outros formatos também
--     entrem, caso existam. Na prática o dataset atual só tem pix,
--     dinheiro e cartao_debito.
--   • CR ainda aberta, sem pagamento parcial manual, não soft-deleted.
--   • Venda não cancelada.
--
-- Efeitos colaterais:
--   • NÃO gera movimentações bancárias. O extrato de cada unidade já
--     foi conciliado em paralelo e inserir movs agora causaria saldo
--     duplicado e quebra da conciliação.
--   • O trigger bloquear_edicao_pago (20260325180000) permite o UPDATE
--     porque OLD.status='aberto' — a imutabilidade só é imposta a
--     partir de 'pago'/'conciliado'.

UPDATE public.contas_receber cr
SET
  status = 'pago',
  valor_pago = cr.valor,
  data_pagamento = v.data_venda,
  forma_recebimento = v.forma_pagamento
FROM public.vendas v
JOIN public.companies c ON c.id = v.company_id
WHERE cr.venda_id = v.id
  AND cr.status = 'aberto'
  AND cr.valor_pago = 0
  AND cr.deleted_at IS NULL
  AND v.status = 'confirmado'
  AND v.data_venda <= CURRENT_DATE
  AND COALESCE(c.nome_fantasia, c.razao_social) IN (
    '001 ELDORADO',
    '002 FLORIPA',
    '004 GRANJA VIANA',
    '005 TABOÃO VERMELHO',
    '006 CANTAREIRA',
    '007 CAMBORIU',
    '008 TABOÃO AZUL',
    '009 ITAQUERA 02',
    '010 SHOPPING ESTAÇÃO BH',
    '011 ITAQUERA 01',
    '012 SHOPPING ESTAÇÃO BH 2',
    'MUBI KIDS'
  );
