-- =============================================================================
-- DIAGNÓSTICO — Conta STONE da 002 FLORIPA acompanha Vendas e CR?
-- =============================================================================
-- 100% READ-ONLY. Rode bloco por bloco no SQL Editor do Supabase.
-- company_id 002 Floripa = 75f93aa5-24e5-4990-b3ed-ed32a61924f1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) A CONTA: saldo bate com (saldo inicial + movimentações)?
--    Se "diferenca" <> 0, o current_balance está dessincronizado das mov.
-- -----------------------------------------------------------------------------
SELECT ba.id,
       ba.name,
       ba.type,
       ba.initial_balance,
       ba.current_balance,
       COALESCE(SUM(CASE WHEN m.tipo = 'credito' THEN m.valor
                         WHEN m.tipo = 'debito'  THEN -m.valor END), 0)        AS soma_movimentacoes,
       ba.initial_balance
         + COALESCE(SUM(CASE WHEN m.tipo='credito' THEN m.valor
                             WHEN m.tipo='debito'  THEN -m.valor END),0)        AS saldo_calculado,
       ba.current_balance
         - ( ba.initial_balance
             + COALESCE(SUM(CASE WHEN m.tipo='credito' THEN m.valor
                                 WHEN m.tipo='debito'  THEN -m.valor END),0) )  AS diferenca
  FROM public.bank_accounts ba
  LEFT JOIN public.movimentacoes m ON m.conta_bancaria_id = ba.id
 WHERE ba.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND ba.name ILIKE '%stone%'
 GROUP BY ba.id, ba.name, ba.type, ba.initial_balance, ba.current_balance;


-- -----------------------------------------------------------------------------
-- 2) MOVIMENTAÇÕES da conta Stone, por origem (de onde vem o dinheiro do saldo)
--    origem = conta_receber  -> CR recebida (o esperado p/ repasse Stone)
--    origem = ofx/manual     -> lançado direto, pode não ter venda/CR por trás
-- -----------------------------------------------------------------------------
SELECT m.origem,
       m.tipo,
       count(*)        AS qtd,
       SUM(m.valor)    AS total
  FROM public.movimentacoes m
  JOIN public.bank_accounts ba ON ba.id = m.conta_bancaria_id
 WHERE ba.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND ba.name ILIKE '%stone%'
 GROUP BY m.origem, m.tipo
 ORDER BY m.origem, m.tipo;


-- -----------------------------------------------------------------------------
-- 3) CONTAS A RECEBER vinculadas à conta Stone (conta_bancaria_id = Stone)
--    Mostra quanto está ABERTO (repasse a cair) vs PAGO (já caiu).
-- -----------------------------------------------------------------------------
SELECT cr.status,
       count(*)               AS qtd,
       SUM(cr.valor)          AS valor_total,
       SUM(cr.valor_pago)     AS valor_pago
  FROM public.contas_receber cr
  JOIN public.bank_accounts ba ON ba.id = cr.conta_bancaria_id
 WHERE cr.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND ba.name ILIKE '%stone%'
   AND cr.deleted_at IS NULL
 GROUP BY cr.status
 ORDER BY cr.status;


-- -----------------------------------------------------------------------------
-- 4) FANTASMAS: CR marcada como PAGA mas SEM movimentação (pago no DRE, sem saldo)
--    Se aparecer linha aqui, o saldo da conta está MENOR do que deveria.
-- -----------------------------------------------------------------------------
SELECT cr.id, cr.pagador_nome, cr.valor, cr.valor_pago,
       cr.data_pagamento, cr.status
  FROM public.contas_receber cr
  JOIN public.bank_accounts ba ON ba.id = cr.conta_bancaria_id
 WHERE cr.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND ba.name ILIKE '%stone%'
   AND cr.status = 'pago'
   AND cr.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.movimentacoes m
                    WHERE m.conta_receber_id = cr.id)
 ORDER BY cr.data_pagamento DESC;


-- -----------------------------------------------------------------------------
-- 5) VENDAS x CR: vendas no cartão SEM nenhuma CR gerada (venda órfã)
--    O elo venda->saldo é a CR. Sem CR, a venda nunca vira dinheiro na conta.
-- -----------------------------------------------------------------------------
SELECT v.id, v.cliente_nome, v.data_venda, v.forma_pagamento,
       v.valor_liquido, v.status
  FROM public.vendas v
 WHERE v.company_id = '75f93aa5-24e5-4990-b3ed-ed32a61924f1'
   AND v.status = 'confirmado'
   AND v.deleted_at IS NULL
   AND (v.forma_pagamento ILIKE '%cart%' OR v.forma_pagamento ILIKE '%credito%'
        OR v.forma_pagamento ILIKE '%debito%' OR v.forma_pagamento = 'multiplo')
   AND NOT EXISTS (SELECT 1 FROM public.contas_receber cr
                    WHERE cr.venda_id = v.id AND cr.deleted_at IS NULL)
 ORDER BY v.data_venda DESC
 LIMIT 100;


-- -----------------------------------------------------------------------------
-- 6) RESUMO 1 LINHA — total vendas cartão x total CR x total caiu na Stone
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COALESCE(SUM(valor_liquido),0) FROM public.vendas
     WHERE company_id='75f93aa5-24e5-4990-b3ed-ed32a61924f1'
       AND status='confirmado' AND deleted_at IS NULL
       AND (forma_pagamento ILIKE '%cart%' OR forma_pagamento='multiplo'))   AS vendas_cartao,
  (SELECT COALESCE(SUM(cr.valor),0) FROM public.contas_receber cr
     JOIN public.bank_accounts ba ON ba.id=cr.conta_bancaria_id
    WHERE cr.company_id='75f93aa5-24e5-4990-b3ed-ed32a61924f1'
      AND ba.name ILIKE '%stone%' AND cr.deleted_at IS NULL)                  AS cr_stone_total,
  (SELECT COALESCE(SUM(cr.valor),0) FROM public.contas_receber cr
     JOIN public.bank_accounts ba ON ba.id=cr.conta_bancaria_id
    WHERE cr.company_id='75f93aa5-24e5-4990-b3ed-ed32a61924f1'
      AND ba.name ILIKE '%stone%' AND cr.status='aberto' AND cr.deleted_at IS NULL) AS cr_stone_aberto,
  (SELECT COALESCE(SUM(CASE WHEN m.tipo='credito' THEN m.valor ELSE -m.valor END),0)
     FROM public.movimentacoes m JOIN public.bank_accounts ba ON ba.id=m.conta_bancaria_id
    WHERE ba.company_id='75f93aa5-24e5-4990-b3ed-ed32a61924f1'
      AND ba.name ILIKE '%stone%')                                            AS caiu_na_stone;
