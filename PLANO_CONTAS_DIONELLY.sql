-- =============================================================================
-- PLANO DE CONTAS — GRUPO DIONELLY
-- =============================================================================
-- Rodar no SQL Editor do Supabase (https://supabase.com/dashboard -> SQL).
-- O SQL Editor roda como superusuário (ignora RLS) e cada "Run" e uma
-- transacao isolada -> a aplicacao esta dentro de um unico DO block atomico.
--
-- ESTRATEGIA "substituir tudo" (segura, NAO-destrutiva):
--   * CR/CP/movimentacoes referenciam chart_of_accounts.conta_contabil_id SEM
--     ON DELETE -> Postgres usa RESTRICT: DELETE de conta com lancamento FALHA.
--   * Por isso NAO deletamos. O plano antigo e ARQUIVADO:
--       - code renomeado para 'ARQ-<code>' (libera os codigos para o novo plano)
--       - status = 'archived', show_in_dre = false, accepts_manual_entry = false
--       - os lancamentos antigos continuam apontando para a mesma conta (id),
--         agora arquivada. Voce remapeia para o novo plano pela tela depois.
--   * Idempotente: marca reference_code = 'DIONELLY_PLANO_V1' no plano novo e
--     pula empresas que ja tem esse plano.
-- =============================================================================


-- #############################################################################
-- PARTE 1 — DIAGNOSTICO (READ-ONLY). Selecione e rode SO esta parte primeiro.
-- #############################################################################

-- 1a. Empresas que serao afetadas (grupo DIONELLY OU razao/fantasia "dionelly")
WITH alvo AS (
  SELECT ge.company_id AS id
    FROM public.grupos_empresas ge
    JOIN public.grupos_empresariais g ON g.id = ge.grupo_id
   WHERE g.nome ILIKE '%dionelly%'
  UNION
  SELECT c.id
    FROM public.companies c
   WHERE c.razao_social ILIKE '%dionelly%'
      OR c.nome_fantasia ILIKE '%dionelly%'
)
SELECT c.id,
       c.razao_social,
       c.nome_fantasia,
       c.is_active,
       (SELECT count(*) FROM public.chart_of_accounts ca
         WHERE ca.company_id = c.id AND ca.status <> 'archived')              AS contas_ativas_hoje,
       (SELECT count(*) FROM public.contas_receber cr
         WHERE cr.company_id = c.id AND cr.conta_contabil_id IS NOT NULL)     AS cr_vinculados,
       (SELECT count(*) FROM public.contas_pagar cp
         WHERE cp.company_id = c.id AND cp.conta_contabil_id IS NOT NULL)     AS cp_vinculados,
       (SELECT count(*) FROM public.movimentacoes m
         WHERE m.company_id = c.id AND m.conta_contabil_id IS NOT NULL)       AS mov_vinculadas,
       (SELECT count(*) FROM public.bank_transactions bt
         WHERE bt.company_id = c.id AND bt.category_id IS NOT NULL)           AS bank_tx_categorizadas
  FROM public.companies c
 WHERE c.id IN (SELECT id FROM alvo)
 ORDER BY c.razao_social;

-- (Os numeros cr/cp/mov/bank_tx_vinculados = lancamentos que ficarao apontando
--  para contas ARQUIVADAS apos a migracao, e que voce precisara reclassificar.)


-- #############################################################################
-- PARTE 2 — APLICACAO. Confira a PARTE 1, depois selecione e rode SO esta parte.
-- #############################################################################
DO $$
DECLARE
  v_marker     text  := 'DIONELLY_PLANO_V1';
  v_company    uuid;
  v_companies  uuid[];
  v_arquivadas int;
  v_inseridas  int;
BEGIN
  ---------------------------------------------------------------------------
  -- 1) Empresas do grupo DIONELLY — LISTA FIXA (verificada no diagnostico de
  --    2026-05-27: grupo "GRUPO DIONELLY", 10 empresas, 43 contas ativas cada).
  ---------------------------------------------------------------------------
  v_companies := ARRAY[
    '75f93aa5-24e5-4990-b3ed-ed32a61924f1'::uuid,  -- 002 Floripa
    '6eb34e88-c184-4f5f-a752-0d3fae45ff82'::uuid,  -- 003 Itaquera
    '94d28a39-bf88-46c0-9d6b-960a1f85eafb'::uuid,  -- 005 Taboão Vermelho
    'c14f81d0-c764-4f81-b954-fb7dccc2ffbb'::uuid,  -- 006 Cantareira
    'b963790b-475b-423a-8856-29a75495d33b'::uuid,  -- 007 Camboriu
    '11dd36ea-6f9c-451a-8ec0-6c41569bd736'::uuid,  -- 008 Taboão Azul
    'ed0d68b0-e3b1-459f-b69b-5b81966345ec'::uuid,  -- 009 Itaquera 02
    '7d6e2dd1-3cc0-4d33-8598-f8ce5c1c9f4a'::uuid,  -- 010 Shopping Estação BH
    '0eb4d51a-dd58-469a-9606-49f5266019af'::uuid,  -- 012 Shopping Estação BH 2
    '539536e0-28c2-422e-ad60-6317ad3a1dc6'::uuid   -- Mubi Kids
  ];

  -- Trava: aborta (nada alterado) se alguma das 10 nao existir mais
  IF (SELECT count(*) FROM public.companies WHERE id = ANY(v_companies)) <> array_length(v_companies, 1) THEN
    RAISE EXCEPTION 'Uma ou mais das 10 empresas DIONELLY nao existe mais. Abortado (nada alterado).';
  END IF;
  RAISE NOTICE 'Empresas DIONELLY alvo: % (lista fixa).', array_length(v_companies, 1);

  ---------------------------------------------------------------------------
  -- 2) Definicao do plano (carregada uma vez numa temp table)
  --    synthetic = conta sintetica (agrupador, nao aceita lancamento)
  --    in_dre/dre_grp = aparece no DRE e em qual grupo
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE _plano_def (
    code text, name text, lvl int,
    a_type public.account_type, a_nature public.account_nature,
    synthetic boolean, in_dre boolean, dre_grp text, ord int
  ) ON COMMIT DROP;

  INSERT INTO _plano_def (code, name, lvl, a_type, a_nature, synthetic, in_dre, dre_grp) VALUES
  -- ===== 3. RECEITAS =====
  ('3',          'Receitas',                                       1, 'revenue', 'credit', true,  false, NULL),
  ('3.1',        'Receita Operacional',                            2, 'revenue', 'credit', true,  false, NULL),
  ('3.1.01',     'Receita de Vendas - Cartão/Máquinas',            3, 'revenue', 'credit', false, true,  'receita_bruta'),
  ('3.1.02',     'Receita de Recebíveis de Cartão',                3, 'revenue', 'credit', false, true,  'receita_bruta'),
  ('3.1.03',     'Receita de Cobranças',                           3, 'revenue', 'credit', false, true,  'receita_bruta'),
  ('3.1.04',     'Receita de Vendas - Dinheiro (Depósitos)',       3, 'revenue', 'credit', false, true,  'receita_bruta'),
  ('3.2',        'Outras Receitas',                                2, 'revenue', 'credit', true,  false, NULL),
  ('3.2.01',     'Receita de Parceiros Comerciais',                3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.02',     'Estornos e Devoluções a Receber',                3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.03',     'Rendimentos de Aplicações Financeiras',          3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.04',     'Receita de Consórcios',                          3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.05',     'Devoluções de Pessoal (estornos folha)',         3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.06',     'Devoluções de Fornecedores',                     3, 'revenue', 'credit', false, true,  'outras_receitas'),
  ('3.2.99',     'Outras Receitas Não Classificadas',              3, 'revenue', 'credit', false, true,  'outras_receitas'),
  -- 3.3 Movimentacoes internas: equity p/ NAO entrar em receita/despesa nem no DRE
  ('3.3',        'Movimentações Internas',                         2, 'equity',  'credit', true,  false, NULL),
  ('3.3.01',     'Aporte de Capital - Sócios',                     3, 'equity',  'credit', false, false, NULL),
  ('3.3.02',     'Transferência entre Empresas do Grupo',          3, 'equity',  'credit', false, false, NULL),
  ('3.3.03',     'Transferência entre Contas Próprias (Entrada)',  3, 'equity',  'credit', false, false, NULL),
  ('3.3.04',     'Transferência entre Contas Próprias (Saída)',    3, 'equity',  'debit',  false, false, NULL),

  -- ===== 4. DESPESAS =====
  ('4',          'Despesas',                                       1, 'expense', 'debit',  true,  false, NULL),

  -- 4.1 Custo dos Servicos Prestados (CSP)
  ('4.1',        'Custo dos Serviços Prestados (CSP)',             2, 'cost',    'debit',  true,  false, NULL),
  ('4.1.01',     'Aluguel',                                        3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.01.01',  'Aluguel - Shopping (Condomínio)',                4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.01.02',  'Aluguel - Shopping (Locação)',                   4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.02',     'Pessoal Operacional',                            3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.02.01',  'Pessoal Operacional - Supervisão',               4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.02.02',  'Pessoal Operacional - Operadores de Loja',       4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.03',     'Salários',                                       3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.03.01',  'Salários e Ordenados (CLT)',                     4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.04',     'Estagiários',                                    3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.04.01',  'Estagiários - Empresa de RH (Adonai)',           4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.05',     'Benefícios',                                     3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.05.01',  'Plano de Saúde (Notre Dame Intermédica)',        4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.06',     'Pró-labore',                                     3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.06.01',  'Pró-labore - Sócia Administradora',              4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.07',     'Mercadorias',                                    3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.07.01',  'CPV - Brinquedos e Peças (Uni-Art)',             4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.07.02',  'CPV - Brinquedos e Peças (Mimo)',                4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08',     'Fornecedores',                                   3, 'cost',    'debit',  true,  false, NULL),
  ('4.1.08.01',  'Fornecedores - Prestadores de Serviço (PF)',     4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08.02',  'Fornecedores - Materiais e Insumos',             4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08.03',  'Fornecedores - Serviços Jurídicos',              4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08.04',  'Fornecedores - Serviços Financeiros',            4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08.05',  'Fornecedores - Serviços de RH',                  4, 'cost',    'debit',  false, true,  'custos'),
  ('4.1.08.99',  'Fornecedores - Outros',                          4, 'cost',    'debit',  false, true,  'custos'),

  -- 4.2 Despesas Operacionais
  ('4.2',        'Despesas Operacionais',                          2, 'expense', 'debit',  true,  false, NULL),
  ('4.2.01',     'Impostos e Tributos',                            3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.01.01',  'Simples Nacional',                               4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.03',  'Receita Federal - Tributos',                     4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.04',  'Ministério da Fazenda - DAS/DARF',               4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.05',  'Tributos Estaduais/Municipais',                  4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.06',  'Tributos Municipais (ISS/Taxas)',                4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.07',  'FGTS/INSS (via CEF)',                            4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.08',  'Tributos via Banco do Brasil',                   4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.01.99',  'Outros Impostos e Tributos',                     4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.02',     'Contabilidade',                                  3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.02.01',  'Serviços Contábeis (F2M Contabilidade)',         4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.03',     'Marketing',                                      3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.03.01',  'Material de Marketing e Comunicação Visual',     4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.03.02',  'Marketing Digital - Meta/Facebook Ads',          4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.04',     'Consultorias',                                   3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.04.01',  'Consultoria de Gestão',                          4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.04.02',  'Consultoria Comercial (Una Barista)',            4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.04.03',  'Consultoria de Gestão (Duarte)',                 4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.04.04',  'Consultoria (B&L Consult)',                      4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.05',     'Pesquisa',                                       3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.05.01',  'Pesquisa de Mercado - Cliente Oculto (Datamótica)', 4, 'expense', 'debit', false, true, 'despesas_operacionais'),
  ('4.2.06',     'Telefonia e Internet',                           3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.06.01',  'Telefonia Móvel - Claro',                        4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.06.02',  'Telefonia/Internet - Vivo/Telefônica',           4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.06.03',  'Telefonia Móvel - TIM',                          4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.06.04',  'Internet - Alegria Telecom',                     4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.07',     'Utilidades',                                     3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.07.01',  'Energia Elétrica (Enel/Eletropaulo)',            4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.07.02',  'Água e Esgoto (Sabesp)',                         4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.08',     'Transporte',                                     3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.08.01',  'Transporte - Uber/App',                          4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.08.02',  'Transporte - Entregas (Lalamove)',               4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.08.03',  'Transporte - Frete',                             4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.08.04',  'Estacionamento',                                 4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.08.05',  'Combustível',                                    4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.09',     'Seguros',                                        3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.09.01',  'Seguro Empresarial (Tokio Marine)',              4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.09.02',  'Seguro (Yelum)',                                 4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.10',     'Tecnologia',                                     3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.10.01',  'ERP/Gestão - Omie',                              4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.10.02',  'Registro de Domínio (NIC.br)',                   4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.11',     'Alimentação',                                    3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.11.01',  'Alimentação e Refeições (equipe)',               4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12',     'Despesas Gerais',                                3, 'expense', 'debit',  true,  false, NULL),
  ('4.2.12.01',  'Correios e Envios',                              4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12.02',  'Material de Manutenção e Reparo',                4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12.03',  'Material de Uso e Consumo',                      4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12.04',  'Medicamentos/Primeiros Socorros',               4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12.05',  'Serviços Diversos',                              4, 'expense', 'debit',  false, true,  'despesas_operacionais'),
  ('4.2.12.99',  'Despesa Não Identificada',                       4, 'expense', 'debit',  false, true,  'despesas_operacionais'),

  -- 4.3 Despesas Financeiras
  ('4.3',        'Despesas Financeiras',                           2, 'expense', 'debit',  true,  false, NULL),
  ('4.3.01',     'Tarifas',                                        3, 'expense', 'debit',  true,  false, NULL),
  ('4.3.01.01',  'Tarifas Bancárias - Manutenção de Conta',        4, 'expense', 'debit',  false, true,  'resultado_financeiro'),
  ('4.3.01.02',  'Tarifas - Processadoras de Pagamento (mensalidade/fixo)', 4, 'expense', 'debit', false, true, 'resultado_financeiro'),
  ('4.3.01.03',  'Taxa da Maquininha - MDR Débito',                4, 'expense', 'debit',  false, true,  'resultado_financeiro'),
  ('4.3.01.04',  'Taxa da Maquininha - MDR Crédito à Vista',       4, 'expense', 'debit',  false, true,  'resultado_financeiro'),
  ('4.3.01.05',  'Taxa da Maquininha - MDR Crédito Parcelado',     4, 'expense', 'debit',  false, true,  'resultado_financeiro'),
  ('4.3.02',     'Encargos',                                       3, 'expense', 'debit',  true,  false, NULL),
  ('4.3.02.01',  'Juros e Encargos sobre Limite de Crédito',       4, 'expense', 'debit',  false, true,  'resultado_financeiro'),
  ('4.3.03',     'IOF',                                            3, 'expense', 'debit',  true,  false, NULL),
  ('4.3.03.01',  'IOF - Imposto sobre Operações Financeiras',      4, 'expense', 'debit',  false, true,  'resultado_financeiro');

  -- dre_order deterministico pela ordem do codigo
  UPDATE _plano_def d
     SET ord = sub.rn * 10
    FROM (SELECT code, row_number() OVER (ORDER BY string_to_array(code, '.')::int[]) AS rn
            FROM _plano_def) sub
   WHERE d.code = sub.code;

  ---------------------------------------------------------------------------
  -- 3) Aplicar empresa por empresa
  ---------------------------------------------------------------------------
  FOREACH v_company IN ARRAY v_companies LOOP

    -- 3a) Idempotencia: ja migrada? pula.
    IF EXISTS (SELECT 1 FROM public.chart_of_accounts
                WHERE company_id = v_company AND reference_code = v_marker) THEN
      RAISE NOTICE 'Empresa % ja possui plano DIONELLY -> pulando.', v_company;
      CONTINUE;
    END IF;

    -- 3b) Arquivar plano atual (libera codigos, preserva FKs dos lancamentos)
    UPDATE public.chart_of_accounts
       SET code                 = CASE WHEN code LIKE 'ARQ-%' THEN code ELSE 'ARQ-' || code END,
           status               = 'archived',
           show_in_dre          = false,
           accepts_manual_entry = false,
           updated_at           = now()
     WHERE company_id = v_company
       AND status <> 'archived'
       AND reference_code IS DISTINCT FROM v_marker;
    GET DIAGNOSTICS v_arquivadas = ROW_COUNT;

    -- 3c) Inserir novo plano
    INSERT INTO public.chart_of_accounts (
      company_id, code, name, level, account_type, account_nature,
      is_analytical, is_synthetic, accepts_manual_entry, show_in_dre,
      dre_group, dre_order, status, reference_code, created_at, updated_at)
    SELECT v_company, d.code, d.name, d.lvl, d.a_type, d.a_nature,
           NOT d.synthetic, d.synthetic, NOT d.synthetic, d.in_dre,
           d.dre_grp, d.ord, 'active', v_marker, now(), now()
      FROM _plano_def d;
    GET DIAGNOSTICS v_inseridas = ROW_COUNT;

    -- 3d) Resolver parent_id pelo prefixo do codigo (pai = code sem o ultimo nivel)
    UPDATE public.chart_of_accounts filho
       SET parent_id = pai.id
      FROM public.chart_of_accounts pai
     WHERE filho.company_id = v_company AND pai.company_id = v_company
       AND filho.reference_code = v_marker AND pai.reference_code = v_marker
       AND position('.' in reverse(filho.code)) > 0
       AND pai.code = left(filho.code, length(filho.code) - position('.' in reverse(filho.code)));

    RAISE NOTICE 'Empresa %: % contas arquivadas, % contas novas inseridas.',
                 v_company, v_arquivadas, v_inseridas;
  END LOOP;

  RAISE NOTICE 'Concluido. Plano DIONELLY aplicado.';
END $$;


-- #############################################################################
-- PARTE 3 — CONFERENCIA (opcional, READ-ONLY). Rode apos a PARTE 2.
-- #############################################################################
-- SELECT c.razao_social, ca.code, ca.name, ca.level, ca.account_type,
--        ca.account_nature, ca.is_synthetic, ca.show_in_dre, ca.dre_group
--   FROM public.chart_of_accounts ca
--   JOIN public.companies c ON c.id = ca.company_id
--  WHERE ca.reference_code = 'DIONELLY_PLANO_V1'
--  ORDER BY c.razao_social, string_to_array(ca.code, '.')::int[];


-- #############################################################################
-- PARTE 4 — DE-PARA do historico: move os lancamentos das 5 contas arquivadas
-- (que tinham vinculo) para as contas equivalentes do plano novo.
-- Reversivel: as contas ARQ-* continuam existindo. Para desfazer, inverta
-- de_code/para_code. Confirmado pelo diagnostico de 2026-05-27 (so 5 contas
-- arquivadas tinham lancamentos vinculados).
-- #############################################################################
DO $$
DECLARE
  v_marker    text := 'DIONELLY_PLANO_V1';
  v_company   uuid;
  v_old       uuid;
  v_new       uuid;
  v_cr int; v_cp int; v_mov int;
  m record;
  v_companies uuid[] := ARRAY[
    '75f93aa5-24e5-4990-b3ed-ed32a61924f1'::uuid,  -- 002 Floripa
    '6eb34e88-c184-4f5f-a752-0d3fae45ff82'::uuid,  -- 003 Itaquera
    '94d28a39-bf88-46c0-9d6b-960a1f85eafb'::uuid,  -- 005 Taboão Vermelho
    'c14f81d0-c764-4f81-b954-fb7dccc2ffbb'::uuid,  -- 006 Cantareira
    'b963790b-475b-423a-8856-29a75495d33b'::uuid,  -- 007 Camboriu
    '11dd36ea-6f9c-451a-8ec0-6c41569bd736'::uuid,  -- 008 Taboão Azul
    'ed0d68b0-e3b1-459f-b69b-5b81966345ec'::uuid,  -- 009 Itaquera 02
    '7d6e2dd1-3cc0-4d33-8598-f8ce5c1c9f4a'::uuid,  -- 010 Shopping Estação BH
    '0eb4d51a-dd58-469a-9606-49f5266019af'::uuid,  -- 012 Shopping Estação BH 2
    '539536e0-28c2-422e-ad60-6317ad3a1dc6'::uuid   -- Mubi Kids
  ];
BEGIN
  CREATE TEMP TABLE _depara (de_code text, para_code text) ON COMMIT DROP;
  INSERT INTO _depara VALUES
    ('ARQ-1.1', '3.1.01'),     -- Receita de servicos prestados   -> Receita de Vendas - Cartao/Maquinas
    ('ARQ-1.2', '3.1.01'),     -- Receita de venda de produtos     -> Receita de Vendas - Cartao/Maquinas
    ('ARQ-2.1', '4.2.01.01'),  -- Impostos e contrib. s/ vendas    -> Simples Nacional
    ('ARQ-3.1', '4.1.01.01'),  -- Aluguel, condominio, FPP         -> Aluguel - Shopping (Condominio)
    ('ARQ-3.2', '4.1.03.01');  -- Pessoal salarios e encargos CLT  -> Salarios e Ordenados (CLT)

  FOREACH v_company IN ARRAY v_companies LOOP
    FOR m IN SELECT de_code, para_code FROM _depara LOOP
      SELECT id INTO v_old FROM public.chart_of_accounts
        WHERE company_id = v_company AND code = m.de_code LIMIT 1;
      SELECT id INTO v_new FROM public.chart_of_accounts
        WHERE company_id = v_company AND code = m.para_code AND reference_code = v_marker LIMIT 1;

      IF v_old IS NULL OR v_new IS NULL THEN
        CONTINUE;  -- origem ou destino nao existe nessa empresa
      END IF;

      UPDATE public.contas_receber SET conta_contabil_id = v_new
        WHERE company_id = v_company AND conta_contabil_id = v_old;
      GET DIAGNOSTICS v_cr = ROW_COUNT;

      UPDATE public.contas_pagar SET conta_contabil_id = v_new
        WHERE company_id = v_company AND conta_contabil_id = v_old;
      GET DIAGNOSTICS v_cp = ROW_COUNT;

      UPDATE public.movimentacoes SET conta_contabil_id = v_new
        WHERE company_id = v_company AND conta_contabil_id = v_old;
      GET DIAGNOSTICS v_mov = ROW_COUNT;

      IF (v_cr + v_cp + v_mov) > 0 THEN
        RAISE NOTICE 'Empresa % | % -> %: % CR, % CP, % mov.',
                     v_company, m.de_code, m.para_code, v_cr, v_cp, v_mov;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'De-para concluido.';
END $$;
