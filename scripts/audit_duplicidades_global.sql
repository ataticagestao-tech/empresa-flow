-- =============================================================================
-- AUDITORIA GLOBAL DE DUPLICIDADES — CONCILIAÇÃO + LANÇAMENTOS MANUAIS
-- =============================================================================
-- Cole cada SEÇÃO uma de cada vez no Supabase SQL Editor.
-- Tudo é READ-ONLY: nenhum SELECT abaixo altera dado. Pode rodar à vontade.
--
-- O que cada seção mostra:
--   0. Resumo geral por empresa (quantas duplicatas em cada empresa)
--   1. CR/CP "irmãos" — mesmo valor + janela de data, mais de 1 título
--   2. CR/CP com mais de 1 movimentação vinculada (o caso mais grave)
--   3. CR/CP criados pelo mesmo extrato (created_via_bank_tx_id duplicado)
--   4. Movimentações fantasma (sem FK) que coincidem com CR/CP existente
--   5. Bank_tx com múltiplos matches em bank_reconciliation_matches
--   6. Bank_tx "reconciled" apontando pra CR/CP soft-deletado (zumbi)
--   7. Saldo bancário divergente (current_balance ≠ inicial + movs)
--   8. Vendas duplicadas (mesmo cliente, mesma data, mesmo valor)
--   9. CR/CP marcados como "pago" mas SEM movimentação vinculada (fantasma reverso)
--  10. Movimentações com origem CR/CP mas FK NULL (lixo legado)
-- =============================================================================


-- =============================================================================
-- SEÇÃO 0 — RESUMO GERAL POR EMPRESA
-- =============================================================================
-- Visão de cima: cada empresa, quantos itens em cada categoria de problema.
-- Ordenado pela soma de problemas. Empresa com mais problemas em cima.

WITH cr_irmaos AS (
    SELECT cr.company_id, COUNT(*) AS qtd
    FROM contas_receber cr
    JOIN contas_receber cr2
      ON cr2.company_id = cr.company_id
     AND cr2.id <> cr.id
     AND ABS(cr2.valor - cr.valor) < 0.01
     AND ABS(cr2.data_vencimento - cr.data_vencimento) <= 3
     AND cr2.deleted_at IS NULL
    WHERE cr.deleted_at IS NULL
    GROUP BY cr.company_id
),
cp_irmaos AS (
    SELECT cp.company_id, COUNT(*) AS qtd
    FROM contas_pagar cp
    JOIN contas_pagar cp2
      ON cp2.company_id = cp.company_id
     AND cp2.id <> cp.id
     AND ABS(cp2.valor - cp.valor) < 0.01
     AND ABS(cp2.data_vencimento - cp.data_vencimento) <= 3
     AND cp2.deleted_at IS NULL
    WHERE cp.deleted_at IS NULL
    GROUP BY cp.company_id
),
mov_dup_cr AS (
    SELECT company_id, COUNT(*) AS qtd
    FROM (
        SELECT company_id, conta_receber_id
        FROM movimentacoes
        WHERE conta_receber_id IS NOT NULL
        GROUP BY company_id, conta_receber_id
        HAVING COUNT(*) > 1
    ) x
    GROUP BY company_id
),
mov_dup_cp AS (
    SELECT company_id, COUNT(*) AS qtd
    FROM (
        SELECT company_id, conta_pagar_id
        FROM movimentacoes
        WHERE conta_pagar_id IS NOT NULL
        GROUP BY company_id, conta_pagar_id
        HAVING COUNT(*) > 1
    ) x
    GROUP BY company_id
),
saldo_div AS (
    SELECT ba.company_id, COUNT(*) AS qtd
    FROM bank_accounts ba
    LEFT JOIN (
        SELECT conta_bancaria_id,
               SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END) AS soma
        FROM movimentacoes
        GROUP BY conta_bancaria_id
    ) m ON m.conta_bancaria_id = ba.id
    WHERE ba.is_active = TRUE
      AND ABS(COALESCE(ba.current_balance, 0)
              - (COALESCE(ba.initial_balance, 0) + COALESCE(m.soma, 0))) > 0.01
    GROUP BY ba.company_id
)
SELECT
    c.id AS company_id,
    c.nome_fantasia AS empresa,
    COALESCE(cr.qtd, 0) AS cr_irmaos,
    COALESCE(cp.qtd, 0) AS cp_irmaos,
    COALESCE(mcr.qtd, 0) AS cr_com_mov_duplicada,
    COALESCE(mcp.qtd, 0) AS cp_com_mov_duplicada,
    COALESCE(sd.qtd, 0) AS contas_com_saldo_errado,
    COALESCE(cr.qtd, 0) + COALESCE(cp.qtd, 0)
        + COALESCE(mcr.qtd, 0) + COALESCE(mcp.qtd, 0) AS total_problemas
FROM companies c
LEFT JOIN cr_irmaos cr ON cr.company_id = c.id
LEFT JOIN cp_irmaos cp ON cp.company_id = c.id
LEFT JOIN mov_dup_cr mcr ON mcr.company_id = c.id
LEFT JOIN mov_dup_cp mcp ON mcp.company_id = c.id
LEFT JOIN saldo_div sd ON sd.company_id = c.id
WHERE c.is_active = TRUE
  AND (COALESCE(cr.qtd, 0) + COALESCE(cp.qtd, 0)
       + COALESCE(mcr.qtd, 0) + COALESCE(mcp.qtd, 0) + COALESCE(sd.qtd, 0)) > 0
ORDER BY total_problemas DESC;


-- =============================================================================
-- SEÇÃO 1 — CR/CP "IRMÃOS" (mesmo valor + janela de 3 dias)
-- =============================================================================
-- Suspeitos de terem sido criados em duplicata pelo botão "Aprovar Selecionados"
-- ou por reimport do mesmo extrato. Mostra um exemplo por grupo.
--
-- COMO LER:
--   - Cada linha é um par. Se aparece "Aluguel Loja 2" duas vezes na mesma data,
--     é candidato a duplicata.
--   - "via_extrato_1" e "via_extrato_2": se um dos dois tem isso preenchido e o
--     outro não, é EXATAMENTE o bug do bulk (um veio da conciliação, outro era
--     o título manual).
--   - Filtre por company_id se quiser olhar 1 empresa de cada vez.

-- CR (Contas a Receber) duplicadas
SELECT
    cr.company_id,
    c.nome_fantasia AS empresa,
    cr.id AS cr_id_1,
    cr2.id AS cr_id_2,
    cr.pagador_nome,
    cr.valor,
    cr.data_vencimento AS venc_1,
    cr2.data_vencimento AS venc_2,
    cr.status AS status_1,
    cr2.status AS status_2,
    cr.created_via_bank_tx_id AS via_extrato_1,
    cr2.created_via_bank_tx_id AS via_extrato_2,
    cr.venda_id AS venda_1,
    cr2.venda_id AS venda_2,
    cr.created_at AS criado_em_1,
    cr2.created_at AS criado_em_2
FROM contas_receber cr
JOIN contas_receber cr2
  ON cr2.company_id = cr.company_id
 AND cr2.id > cr.id  -- evita listar (A,B) e (B,A)
 AND ABS(cr2.valor - cr.valor) < 0.01
 AND ABS(cr2.data_vencimento - cr.data_vencimento) <= 3
 AND cr2.deleted_at IS NULL
JOIN companies c ON c.id = cr.company_id
WHERE cr.deleted_at IS NULL
ORDER BY cr.company_id, cr.data_vencimento DESC, cr.valor DESC;

-- CP (Contas a Pagar) duplicadas — mesma lógica
SELECT
    cp.company_id,
    c.nome_fantasia AS empresa,
    cp.id AS cp_id_1,
    cp2.id AS cp_id_2,
    cp.credor_nome,
    cp.valor,
    cp.data_vencimento AS venc_1,
    cp2.data_vencimento AS venc_2,
    cp.status AS status_1,
    cp2.status AS status_2,
    cp.created_via_bank_tx_id AS via_extrato_1,
    cp2.created_via_bank_tx_id AS via_extrato_2,
    cp.created_at AS criado_em_1,
    cp2.created_at AS criado_em_2
FROM contas_pagar cp
JOIN contas_pagar cp2
  ON cp2.company_id = cp.company_id
 AND cp2.id > cp.id
 AND ABS(cp2.valor - cp.valor) < 0.01
 AND ABS(cp2.data_vencimento - cp.data_vencimento) <= 3
 AND cp2.deleted_at IS NULL
JOIN companies c ON c.id = cp.company_id
WHERE cp.deleted_at IS NULL
ORDER BY cp.company_id, cp.data_vencimento DESC, cp.valor DESC;


-- =============================================================================
-- SEÇÃO 2 — CR/CP COM MAIS DE 1 MOVIMENTAÇÃO VINCULADA
-- =============================================================================
-- ESTE É O CASO MAIS GRAVE. Significa que o mesmo título teve baixa registrada
-- 2x ou 3x na conta bancária. Saldo errado garantido.
--
-- Causa típica:
--   1) Você marcou o CP como pago manualmente (criou mov)
--   2) Subiu o extrato OU o robô do e-mail conciliou (criou OUTRA mov)
--
-- Mostra o CR/CP + todas as movs vinculadas, lado a lado.

-- CR (Receber)
SELECT
    cr.company_id,
    c.nome_fantasia AS empresa,
    cr.id AS cr_id,
    cr.pagador_nome,
    cr.valor AS cr_valor,
    cr.data_vencimento,
    cr.status AS cr_status,
    cr.data_pagamento,
    COUNT(m.id) AS qtd_movs,
    SUM(m.valor) AS soma_movs,
    STRING_AGG(m.id::text || ' (' || m.tipo || ' R$' || m.valor || ' em ' || m.data || ')', ' | ') AS movs_detalhe
FROM contas_receber cr
JOIN movimentacoes m ON m.conta_receber_id = cr.id
JOIN companies c ON c.id = cr.company_id
WHERE cr.deleted_at IS NULL
GROUP BY cr.id, cr.company_id, c.nome_fantasia, cr.pagador_nome, cr.valor,
         cr.data_vencimento, cr.status, cr.data_pagamento
HAVING COUNT(m.id) > 1
ORDER BY COUNT(m.id) DESC, cr.valor DESC;

-- CP (Pagar)
SELECT
    cp.company_id,
    c.nome_fantasia AS empresa,
    cp.id AS cp_id,
    cp.credor_nome,
    cp.valor AS cp_valor,
    cp.data_vencimento,
    cp.status AS cp_status,
    cp.data_pagamento,
    COUNT(m.id) AS qtd_movs,
    SUM(m.valor) AS soma_movs,
    STRING_AGG(m.id::text || ' (' || m.tipo || ' R$' || m.valor || ' em ' || m.data || ')', ' | ') AS movs_detalhe
FROM contas_pagar cp
JOIN movimentacoes m ON m.conta_pagar_id = cp.id
JOIN companies c ON c.id = cp.company_id
WHERE cp.deleted_at IS NULL
GROUP BY cp.id, cp.company_id, c.nome_fantasia, cp.credor_nome, cp.valor,
         cp.data_vencimento, cp.status, cp.data_pagamento
HAVING COUNT(m.id) > 1
ORDER BY COUNT(m.id) DESC, cp.valor DESC;


-- =============================================================================
-- SEÇÃO 3 — MÚLTIPLOS CR/CP CRIADOS PELO MESMO EXTRATO
-- =============================================================================
-- Se a mesma bank_transaction "deu à luz" 2+ CR/CP, foi o conciliar_lote
-- executado 2x sobre o mesmo extrato (clássico do re-import).

SELECT
    'CR' AS tipo,
    cr.company_id,
    c.nome_fantasia AS empresa,
    cr.created_via_bank_tx_id AS bank_tx_id,
    COUNT(*) AS qtd_titulos,
    STRING_AGG(cr.id::text || ' [' || cr.status || ' R$' || cr.valor || ']', ' | ') AS titulos
FROM contas_receber cr
JOIN companies c ON c.id = cr.company_id
WHERE cr.created_via_bank_tx_id IS NOT NULL
  AND cr.deleted_at IS NULL
GROUP BY cr.company_id, c.nome_fantasia, cr.created_via_bank_tx_id
HAVING COUNT(*) > 1
UNION ALL
SELECT
    'CP' AS tipo,
    cp.company_id,
    c.nome_fantasia AS empresa,
    cp.created_via_bank_tx_id AS bank_tx_id,
    COUNT(*) AS qtd_titulos,
    STRING_AGG(cp.id::text || ' [' || cp.status || ' R$' || cp.valor || ']', ' | ') AS titulos
FROM contas_pagar cp
JOIN companies c ON c.id = cp.company_id
WHERE cp.created_via_bank_tx_id IS NOT NULL
  AND cp.deleted_at IS NULL
GROUP BY cp.company_id, c.nome_fantasia, cp.created_via_bank_tx_id
HAVING COUNT(*) > 1
ORDER BY qtd_titulos DESC;


-- =============================================================================
-- SEÇÃO 4 — MOVS FANTASMA SEM FK QUE COINCIDEM COM CR/CP EXISTENTE
-- =============================================================================
-- Mov com origem='conta_receber'/'conta_pagar' MAS conta_receber_id/conta_pagar_id
-- NULL. Pode ser legado (versão antiga do código) — mas se há CR/CP no MESMO
-- valor+data+conta que ESTÁ vinculado a outra mov, é duplicata.

-- Movs fantasma de RECEITA
SELECT
    m.company_id,
    c.nome_fantasia AS empresa,
    m.id AS mov_fantasma_id,
    m.conta_bancaria_id,
    ba.name AS conta,
    m.data,
    m.valor,
    m.descricao,
    cr.id AS cr_provavelmente_associado,
    cr.pagador_nome,
    cr.status AS cr_status,
    (SELECT COUNT(*) FROM movimentacoes mm WHERE mm.conta_receber_id = cr.id) AS movs_ja_no_cr
FROM movimentacoes m
JOIN companies c ON c.id = m.company_id
JOIN bank_accounts ba ON ba.id = m.conta_bancaria_id
LEFT JOIN contas_receber cr
  ON cr.company_id = m.company_id
 AND ABS(cr.valor - m.valor) < 0.01
 AND ABS(cr.data_vencimento - m.data) <= 3
 AND cr.deleted_at IS NULL
WHERE m.origem = 'conta_receber'
  AND m.conta_receber_id IS NULL
  AND cr.id IS NOT NULL
ORDER BY m.data DESC, m.valor DESC;

-- Movs fantasma de DESPESA
SELECT
    m.company_id,
    c.nome_fantasia AS empresa,
    m.id AS mov_fantasma_id,
    m.conta_bancaria_id,
    ba.name AS conta,
    m.data,
    m.valor,
    m.descricao,
    cp.id AS cp_provavelmente_associado,
    cp.credor_nome,
    cp.status AS cp_status,
    (SELECT COUNT(*) FROM movimentacoes mm WHERE mm.conta_pagar_id = cp.id) AS movs_ja_no_cp
FROM movimentacoes m
JOIN companies c ON c.id = m.company_id
JOIN bank_accounts ba ON ba.id = m.conta_bancaria_id
LEFT JOIN contas_pagar cp
  ON cp.company_id = m.company_id
 AND ABS(cp.valor - m.valor) < 0.01
 AND ABS(cp.data_vencimento - m.data) <= 3
 AND cp.deleted_at IS NULL
WHERE m.origem = 'conta_pagar'
  AND m.conta_pagar_id IS NULL
  AND cp.id IS NOT NULL
ORDER BY m.data DESC, m.valor DESC;


-- =============================================================================
-- SEÇÃO 5 — BANK_TX COM MÚLTIPLOS MATCHES EM bank_reconciliation_matches
-- =============================================================================
-- Cada linha de extrato deveria ter NO MÁXIMO 1 match ativo. Se tem 2+, foi
-- conciliada várias vezes (provavelmente match → desfaz → match de novo, ou
-- bug no batch).

SELECT
    bt.company_id,
    c.nome_fantasia AS empresa,
    bt.id AS bank_tx_id,
    bt.date,
    bt.amount,
    bt.description,
    COUNT(brm.id) AS qtd_matches,
    STRING_AGG(brm.match_type || ' [' || brm.status || ']', ' | ') AS matches
FROM bank_transactions bt
JOIN bank_reconciliation_matches brm ON brm.bank_transaction_id = bt.id
JOIN companies c ON c.id = bt.company_id
WHERE brm.status = 'matched'
GROUP BY bt.id, bt.company_id, c.nome_fantasia, bt.date, bt.amount, bt.description
HAVING COUNT(brm.id) > 1
ORDER BY COUNT(brm.id) DESC;


-- =============================================================================
-- SEÇÃO 6 — BANK_TX RECONCILED APONTANDO PRA CR/CP SOFT-DELETADO (zumbi)
-- =============================================================================
-- bank_tx tem status='reconciled' mas o CR/CP que ele aponta foi excluído.
-- Significa que o extrato "ficou amarrado" num título morto. O saldo do banco
-- mostra como conciliado mas não existe o lançamento.

SELECT
    bt.company_id,
    c.nome_fantasia AS empresa,
    bt.id AS bank_tx_id,
    bt.date,
    bt.amount,
    bt.description,
    bt.reconciled_receivable_id AS cr_morto,
    bt.reconciled_payable_id AS cp_morto,
    cr.deleted_at AS cr_excluido_em,
    cp.deleted_at AS cp_excluido_em
FROM bank_transactions bt
JOIN companies c ON c.id = bt.company_id
LEFT JOIN contas_receber cr ON cr.id = bt.reconciled_receivable_id
LEFT JOIN contas_pagar cp ON cp.id = bt.reconciled_payable_id
WHERE bt.status = 'reconciled'
  AND ((bt.reconciled_receivable_id IS NOT NULL AND cr.deleted_at IS NOT NULL)
       OR (bt.reconciled_payable_id IS NOT NULL AND cp.deleted_at IS NOT NULL))
ORDER BY bt.date DESC;


-- =============================================================================
-- SEÇÃO 7 — SALDO BANCÁRIO DIVERGENTE
-- =============================================================================
-- Sintoma final do problema: o saldo que o sistema mostra na tela difere de
-- (saldo inicial + soma das movs). Diferença > R$ 0,01 já é red flag.

SELECT
    ba.company_id,
    c.nome_fantasia AS empresa,
    ba.id AS conta_id,
    ba.name AS conta,
    ba.initial_balance AS saldo_inicial,
    COALESCE(m.soma, 0) AS soma_movs,
    ba.current_balance AS saldo_atual_sistema,
    (COALESCE(ba.initial_balance, 0) + COALESCE(m.soma, 0)) AS saldo_calculado,
    ba.current_balance - (COALESCE(ba.initial_balance, 0) + COALESCE(m.soma, 0)) AS diferenca
FROM bank_accounts ba
JOIN companies c ON c.id = ba.company_id
LEFT JOIN (
    SELECT conta_bancaria_id,
           SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END) AS soma
    FROM movimentacoes
    GROUP BY conta_bancaria_id
) m ON m.conta_bancaria_id = ba.id
WHERE ba.is_active = TRUE
  AND ABS(COALESCE(ba.current_balance, 0)
          - (COALESCE(ba.initial_balance, 0) + COALESCE(m.soma, 0))) > 0.01
ORDER BY ABS(ba.current_balance - (COALESCE(ba.initial_balance, 0) + COALESCE(m.soma, 0))) DESC;


-- =============================================================================
-- SEÇÃO 8 — VENDAS DUPLICADAS
-- =============================================================================
-- Mesma data + valor + cliente. Pode acontecer se o user clicou 2x em "Salvar
-- venda" ou se o fluxo "Lançar como venda" da conciliação rodou duas vezes.

SELECT
    v.company_id,
    c.nome_fantasia AS empresa,
    v.cliente_nome,
    v.cliente_cpf_cnpj,
    v.data_venda,
    v.valor_total,
    COUNT(*) AS qtd_vendas,
    STRING_AGG(v.id::text, ' | ') AS venda_ids
FROM vendas v
JOIN companies c ON c.id = v.company_id
WHERE v.deleted_at IS NULL
GROUP BY v.company_id, c.nome_fantasia, v.cliente_nome, v.cliente_cpf_cnpj,
         v.data_venda, v.valor_total
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, v.data_venda DESC;


-- =============================================================================
-- SEÇÃO 9 — CR/CP "PAGOS" SEM MOVIMENTAÇÃO (fantasma reverso)
-- =============================================================================
-- O título consta como pago, mas não há registro de saída/entrada na conta.
-- Significa: o saldo bancário está MAIOR/MENOR do que deveria — o pagamento
-- nunca foi "registrado" como movimentação.
--
-- Causa típica: trigger bloqueou a inserção da mov, ou o fluxo manual marcou
-- pago sem criar mov (versões antigas do código).

SELECT
    'CR' AS tipo,
    cr.company_id,
    c.nome_fantasia AS empresa,
    cr.id,
    cr.pagador_nome AS contraparte,
    cr.valor,
    cr.data_pagamento,
    cr.forma_recebimento AS forma,
    cr.conta_bancaria_id
FROM contas_receber cr
JOIN companies c ON c.id = cr.company_id
LEFT JOIN movimentacoes m ON m.conta_receber_id = cr.id
WHERE cr.status = 'pago'
  AND cr.deleted_at IS NULL
  AND m.id IS NULL
UNION ALL
SELECT
    'CP' AS tipo,
    cp.company_id,
    c.nome_fantasia AS empresa,
    cp.id,
    cp.credor_nome AS contraparte,
    cp.valor,
    cp.data_pagamento,
    cp.forma_pagamento AS forma,
    cp.conta_bancaria_id
FROM contas_pagar cp
JOIN companies c ON c.id = cp.company_id
LEFT JOIN movimentacoes m ON m.conta_pagar_id = cp.id
WHERE cp.status = 'pago'
  AND cp.deleted_at IS NULL
  AND m.id IS NULL
ORDER BY data_pagamento DESC NULLS LAST;


-- =============================================================================
-- SEÇÃO 10 — MOVS COM ORIGEM CR/CP MAS FK NULL (lixo legado)
-- =============================================================================
-- Apenas contagem por empresa. Mov de origem 'conta_receber'/'conta_pagar' mas
-- sem o FK preenchido. São candidatos a re-vinculação (igual ao backfill que
-- já rodamos antes). Olhe SEÇÃO 4 pros casos com candidato CR/CP claro.

SELECT
    m.company_id,
    c.nome_fantasia AS empresa,
    m.origem,
    COUNT(*) AS qtd_movs_orfas,
    MIN(m.data) AS primeira_data,
    MAX(m.data) AS ultima_data,
    SUM(m.valor) AS valor_total
FROM movimentacoes m
JOIN companies c ON c.id = m.company_id
WHERE ((m.origem = 'conta_receber' AND m.conta_receber_id IS NULL)
    OR (m.origem = 'conta_pagar' AND m.conta_pagar_id IS NULL))
GROUP BY m.company_id, c.nome_fantasia, m.origem
ORDER BY qtd_movs_orfas DESC;


-- =============================================================================
-- FIM DA AUDITORIA
-- =============================================================================
-- Depois de rodar tudo, me passa um print/cópia das tabelas (especialmente
-- SEÇÃO 0 e SEÇÃO 2). Com base nos números a gente decide:
--
-- 1. Quanto de passivo histórico tem por empresa.
-- 2. Se vale a pena script de limpeza retroativa OU só corrigir daqui pra frente.
-- 3. Em que ordem aplicar os fixes do código (bulk → robô email → marcação).
-- =============================================================================
