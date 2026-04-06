-- ============================================================
-- SEED DEMO COMPLETO — Popula dados realistas para demo@taticagestao.com.br
-- Tabelas GESTAP (novas): chart_of_accounts, centros_custo, bank_accounts,
-- clients, suppliers, products, employees, vendas, vendas_itens,
-- contas_receber, contas_pagar, movimentacoes, contratos_recorrentes,
-- configuracao_taxas_pagamento
-- ============================================================

DO $$
DECLARE
  demo_uid UUID;
  co1 UUID;  -- Nova Tech Digital
  co2 UUID;  -- Tech Store

  -- Chart of accounts IDs (company 1)
  coa_1     UUID;  -- 1   Receita operacional bruta
  coa_1_1   UUID;  -- 1.1 Receita de serviços
  coa_1_2   UUID;  -- 1.2 Receita de produtos
  coa_1_3   UUID;  -- 1.3 Outras receitas operacionais
  coa_2     UUID;  -- 2   Deduções
  coa_2_1   UUID;  -- 2.1 Impostos s/ vendas
  coa_2_2   UUID;  -- 2.2 Taxas operadora
  coa_3     UUID;  -- 3   CSP
  coa_3_1   UUID;  -- 3.1 Aluguel/condomínio
  coa_3_2   UUID;  -- 3.2 Salários CLT
  coa_3_6   UUID;  -- 3.6 Licença software
  coa_3_8   UUID;  -- 3.8 Pró-labore
  coa_4     UUID;  -- 4   Despesas operacionais
  coa_4_1   UUID;  -- 4.1 Materiais
  coa_4_2   UUID;  -- 4.2 Contador/adm
  coa_4_3   UUID;  -- 4.3 Marketing
  coa_4_4   UUID;  -- 4.4 Outras despesas
  coa_5     UUID;  -- 5   Outras receitas
  coa_5_1   UUID;  -- 5.1 Juros/rendimentos
  coa_6     UUID;  -- 6   Resultado financeiro
  coa_6_2   UUID;  -- 6.2 Juros pagos
  coa_6_3   UUID;  -- 6.3 Tarifas bancárias
  coa_8     UUID;  -- 8   Financiamentos
  coa_8_3   UUID;  -- 8.3 Distribuição lucros

  -- Chart of accounts IDs (company 2 — simplified)
  coa2_1_1  UUID;
  coa2_3_2  UUID;
  coa2_4_1  UUID;
  coa2_4_3  UUID;

  -- Centros de custo (company 1)
  cc_adm    UUID;
  cc_com    UUID;
  cc_dev    UUID;
  cc_mkt    UUID;
  cc_sup    UUID;

  -- Centros de custo (company 2)
  cc2_loja  UUID;

  -- Bank accounts
  bank_bb   UUID;
  bank_nu   UUID;
  bank_cx   UUID;
  bank2_nu  UUID;  -- company 2

  -- Clients (company 1)
  cl1 UUID; cl2 UUID; cl3 UUID; cl4 UUID;
  cl5 UUID; cl6 UUID; cl7 UUID; cl8 UUID;

  -- Clients (company 2)
  cl2_1 UUID; cl2_2 UUID; cl2_3 UUID;

  -- Suppliers (company 1)
  sp1 UUID; sp2 UUID; sp3 UUID; sp4 UUID; sp5 UUID; sp6 UUID;

  -- Products (company 1)
  pr1 UUID; pr2 UUID; pr3 UUID; pr4 UUID; pr5 UUID;
  pr6 UUID; pr7 UUID; pr8 UUID; pr9 UUID; pr10 UUID;

  -- Products (company 2)
  pr2_1 UUID; pr2_2 UUID; pr2_3 UUID; pr2_4 UUID; pr2_5 UUID;

  -- Vendas (company 1) — 32 sales
  v1  UUID; v2  UUID; v3  UUID; v4  UUID; v5  UUID;
  v6  UUID; v7  UUID; v8  UUID; v9  UUID; v10 UUID;
  v11 UUID; v12 UUID; v13 UUID; v14 UUID; v15 UUID;
  v16 UUID; v17 UUID; v18 UUID; v19 UUID; v20 UUID;
  v21 UUID; v22 UUID; v23 UUID; v24 UUID; v25 UUID;
  v26 UUID; v27 UUID; v28 UUID; v29 UUID; v30 UUID;
  v31 UUID; v32 UUID;

  -- Vendas (company 2) — 10 sales
  v2_1 UUID; v2_2 UUID; v2_3 UUID; v2_4 UUID; v2_5 UUID;
  v2_6 UUID; v2_7 UUID; v2_8 UUID; v2_9 UUID; v2_10 UUID;

  -- Contas receber (company 1)
  cr1  UUID; cr2  UUID; cr3  UUID; cr4  UUID; cr5  UUID;
  cr6  UUID; cr7  UUID; cr8  UUID; cr9  UUID; cr10 UUID;
  cr11 UUID; cr12 UUID; cr13 UUID; cr14 UUID; cr15 UUID;
  cr16 UUID; cr17 UUID; cr18 UUID; cr19 UUID; cr20 UUID;
  cr21 UUID; cr22 UUID; cr23 UUID; cr24 UUID; cr25 UUID;
  cr26 UUID; cr27 UUID; cr28 UUID; cr29 UUID; cr30 UUID;
  cr31 UUID; cr32 UUID; cr33 UUID; cr34 UUID; cr35 UUID;

  -- Contas pagar (company 1) — 45 entries
  cp1  UUID; cp2  UUID; cp3  UUID; cp4  UUID; cp5  UUID;
  cp6  UUID; cp7  UUID; cp8  UUID; cp9  UUID; cp10 UUID;
  cp11 UUID; cp12 UUID; cp13 UUID; cp14 UUID; cp15 UUID;
  cp16 UUID; cp17 UUID; cp18 UUID; cp19 UUID; cp20 UUID;
  cp21 UUID; cp22 UUID; cp23 UUID; cp24 UUID; cp25 UUID;
  cp26 UUID; cp27 UUID; cp28 UUID; cp29 UUID; cp30 UUID;
  cp31 UUID; cp32 UUID; cp33 UUID; cp34 UUID; cp35 UUID;
  cp36 UUID; cp37 UUID; cp38 UUID; cp39 UUID; cp40 UUID;
  cp41 UUID; cp42 UUID; cp43 UUID; cp44 UUID; cp45 UUID;

  -- Contratos recorrentes
  ct1 UUID; ct2 UUID; ct3 UUID; ct4 UUID; ct5 UUID;

BEGIN
  -- ============================================================
  -- 0. FIND DEMO USER
  -- ============================================================
  SELECT id INTO demo_uid FROM auth.users WHERE email = 'demo@taticagestao.com.br' LIMIT 1;
  IF demo_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario demo@taticagestao.com.br nao encontrado em auth.users';
  END IF;

  -- ============================================================
  -- 1. FIND OR CREATE COMPANIES
  -- ============================================================
  SELECT c.id INTO co1
    FROM companies c
    JOIN user_companies uc ON uc.company_id = c.id AND uc.user_id = demo_uid
   WHERE c.nome_fantasia = 'Nova Tech Digital'
   LIMIT 1;

  SELECT c.id INTO co2
    FROM companies c
    JOIN user_companies uc ON uc.company_id = c.id AND uc.user_id = demo_uid
   WHERE c.nome_fantasia = 'Tech Store'
   LIMIT 1;

  IF co1 IS NULL THEN
    co1 := gen_random_uuid();
    INSERT INTO companies (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal,
      cnae, email, telefone, celular, contato_nome, site,
      endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado,
      endereco_complemento, natureza_juridica, regime_tributario, is_active)
    VALUES (co1, 'NOVA TECH SOLUCOES DIGITAIS LTDA', 'Nova Tech Digital', '12.345.678/0001-90',
      '123.456.789.012', '12345678', '6201-5/00', 'contato@novatech.com.br', '(11) 3456-7890',
      '(11) 99876-5432', 'Carlos Mendes', 'www.novatech.com.br', '01310-100', 'Av. Paulista', '1578',
      'Bela Vista', 'Sao Paulo', 'SP', 'Sala 1201', 'Sociedade Empresaria Limitada', 'Lucro Presumido', true);
    INSERT INTO user_companies (user_id, company_id, is_default) VALUES (demo_uid, co1, true)
      ON CONFLICT DO NOTHING;
  END IF;

  IF co2 IS NULL THEN
    co2 := gen_random_uuid();
    INSERT INTO companies (id, razao_social, nome_fantasia, cnpj, inscricao_estadual,
      cnae, email, telefone, celular, contato_nome,
      endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado,
      natureza_juridica, regime_tributario, is_active)
    VALUES (co2, 'TECH STORE COMERCIO DE ELETRONICOS LTDA', 'Tech Store', '98.765.432/0001-10',
      '987.654.321.098', '4751-2/01', 'vendas@techstore.com.br', '(11) 2345-6789',
      '(11) 98765-4321', 'Ana Paula Costa', '04543-011', 'Rua Funchal', '411',
      'Vila Olimpia', 'Sao Paulo', 'SP', 'Sociedade Empresaria Limitada', 'Simples Nacional', true);
    INSERT INTO user_companies (user_id, company_id, is_default) VALUES (demo_uid, co2, false)
      ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================================
  -- 2. CLEAN EXISTING DEMO DATA (to avoid duplicates)
  -- Order matters for FK constraints
  -- ============================================================
  DELETE FROM configuracao_taxas_pagamento WHERE company_id IN (co1, co2);
  DELETE FROM movimentacoes WHERE company_id IN (co1, co2);
  DELETE FROM vendas_itens WHERE venda_id IN (SELECT id FROM vendas WHERE company_id IN (co1, co2));
  DELETE FROM contas_receber WHERE company_id IN (co1, co2);
  DELETE FROM contas_pagar WHERE company_id IN (co1, co2);
  DELETE FROM vendas WHERE company_id IN (co1, co2);
  DELETE FROM contratos_recorrentes WHERE company_id IN (co1, co2);
  DELETE FROM employees WHERE company_id IN (co1, co2);
  DELETE FROM products WHERE company_id IN (co1, co2);
  DELETE FROM clients WHERE company_id IN (co1, co2);
  DELETE FROM suppliers WHERE company_id IN (co1, co2);
  DELETE FROM bank_accounts WHERE company_id IN (co1, co2);
  DELETE FROM centros_custo WHERE company_id IN (co1, co2);
  DELETE FROM chart_of_accounts WHERE company_id IN (co1, co2);

  -- ============================================================
  -- 3. CHART OF ACCOUNTS — Company 1 (Nova Tech Digital)
  -- ============================================================
  coa_1   := gen_random_uuid();
  coa_1_1 := gen_random_uuid();
  coa_1_2 := gen_random_uuid();
  coa_1_3 := gen_random_uuid();
  coa_2   := gen_random_uuid();
  coa_2_1 := gen_random_uuid();
  coa_2_2 := gen_random_uuid();
  coa_3   := gen_random_uuid();
  coa_3_1 := gen_random_uuid();
  coa_3_2 := gen_random_uuid();
  coa_3_6 := gen_random_uuid();
  coa_3_8 := gen_random_uuid();
  coa_4   := gen_random_uuid();
  coa_4_1 := gen_random_uuid();
  coa_4_2 := gen_random_uuid();
  coa_4_3 := gen_random_uuid();
  coa_4_4 := gen_random_uuid();
  coa_5   := gen_random_uuid();
  coa_5_1 := gen_random_uuid();
  coa_6   := gen_random_uuid();
  coa_6_2 := gen_random_uuid();
  coa_6_3 := gen_random_uuid();
  coa_8   := gen_random_uuid();
  coa_8_3 := gen_random_uuid();

  INSERT INTO chart_of_accounts (id, company_id, code, name, level, parent_id, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry, show_in_dre, dre_group, dre_order, reference_code, status)
  VALUES
  -- Grupo 1: Receitas
  (coa_1,   co1, '1',   'Receita operacional bruta',     1, NULL,   'revenue','credit', false, true,  false, true, 'receita_bruta', 100, 'DFC:Operacional', 'active'),
  (coa_1_1, co1, '1.1', 'Receita de servicos prestados', 2, coa_1,  'revenue','credit', true,  false, true,  true, 'receita_bruta', 110, 'DFC:Operacional', 'active'),
  (coa_1_2, co1, '1.2', 'Receita de venda de produtos',  2, coa_1,  'revenue','credit', true,  false, true,  true, 'receita_bruta', 120, 'DFC:Operacional', 'active'),
  (coa_1_3, co1, '1.3', 'Outras receitas operacionais',  2, coa_1,  'revenue','credit', true,  false, true,  true, 'receita_bruta', 130, 'DFC:Operacional', 'active'),
  -- Grupo 2: Deduções
  (coa_2,   co1, '2',   'Deducoes da receita bruta',          1, NULL,   'expense','debit', false, true,  false, true, 'deducoes', 200, 'DFC:Operacional', 'active'),
  (coa_2_1, co1, '2.1', 'Impostos e contribuicoes s/ vendas', 2, coa_2,  'expense','debit', true,  false, true,  true, 'deducoes', 210, 'DFC:Operacional', 'active'),
  (coa_2_2, co1, '2.2', 'Taxas de operadora / maquininha',    2, coa_2,  'expense','debit', true,  false, true,  true, 'deducoes', 220, 'DFC:Operacional', 'active'),
  -- Grupo 3: Custos
  (coa_3,   co1, '3',   'Custos dos servicos prestados (CSP)', 1, NULL,   'cost','debit', false, true,  false, true, 'custos', 300, 'DFC:Operacional', 'active'),
  (coa_3_1, co1, '3.1', 'Aluguel, condominio, FPP',            2, coa_3,  'cost','debit', true,  false, true,  true, 'custos', 310, 'DFC:Operacional', 'active'),
  (coa_3_2, co1, '3.2', 'Pessoal — salarios e encargos (CLT)', 2, coa_3,  'cost','debit', true,  false, true,  true, 'custos', 320, 'DFC:Operacional', 'active'),
  (coa_3_6, co1, '3.6', 'Licenca de uso — software',           2, coa_3,  'cost','debit', true,  false, true,  true, 'custos', 360, 'DFC:Operacional', 'active'),
  (coa_3_8, co1, '3.8', 'Pro-labore + INSS',                   2, coa_3,  'cost','debit', true,  false, true,  true, 'custos', 380, 'DFC:Operacional', 'active'),
  -- Grupo 4: Despesas operacionais
  (coa_4,   co1, '4',   'Despesas operacionais',       1, NULL,   'expense','debit', false, true,  false, true, 'despesas_operacionais', 400, 'DFC:Operacional', 'active'),
  (coa_4_1, co1, '4.1', 'Despesas com materiais',      2, coa_4,  'expense','debit', true,  false, true,  true, 'despesas_operacionais', 410, 'DFC:Operacional', 'active'),
  (coa_4_2, co1, '4.2', 'Contador e servicos adm.',    2, coa_4,  'expense','debit', true,  false, true,  true, 'despesas_operacionais', 420, 'DFC:Operacional', 'active'),
  (coa_4_3, co1, '4.3', 'Marketing e publicidade',     2, coa_4,  'expense','debit', true,  false, true,  true, 'despesas_operacionais', 430, 'DFC:Operacional', 'active'),
  (coa_4_4, co1, '4.4', 'Outras despesas operacionais',2, coa_4,  'expense','debit', true,  false, true,  true, 'despesas_operacionais', 440, 'DFC:Operacional', 'active'),
  -- Grupo 5: Depreciações (reusing as "Outras receitas" per user request)
  (coa_5,   co1, '5',   'Outras receitas e rendimentos', 1, NULL,   'revenue','credit', false, true,  false, true, 'outras_receitas', 500, NULL, 'active'),
  (coa_5_1, co1, '5.1', 'Juros recebidos / rendimentos', 2, coa_5,  'revenue','credit', true,  false, true,  true, 'outras_receitas', 510, NULL, 'active'),
  -- Grupo 6: Resultado financeiro
  (coa_6,   co1, '6',   'Resultado financeiro',            1, NULL,   'expense','debit', false, true,  false, true, 'resultado_financeiro', 600, 'DFC:Financiamento', 'active'),
  (coa_6_2, co1, '6.2', 'Juros pagos / encargos financ.', 2, coa_6,  'expense','debit', true,  false, true,  true, 'resultado_financeiro', 620, 'DFC:Financiamento', 'active'),
  (coa_6_3, co1, '6.3', 'Tarifas bancarias',              2, coa_6,  'expense','debit', true,  false, true,  true, 'resultado_financeiro', 630, 'DFC:Financiamento', 'active'),
  -- Grupo 8: Distribuição
  (coa_8,   co1, '8',   'Financiamentos e participacoes', 1, NULL,      'liability','credit', false, true,  false, false, NULL, 800, 'DFC:Financiamento', 'active'),
  (coa_8_3, co1, '8.3', 'Distribuicao de lucros',         2, coa_8,     'equity','debit',     true,  false, true,  false, NULL, 830, 'DFC:Financiamento', 'active');

  -- Chart of Accounts — Company 2 (simplified, reuse same pattern)
  coa2_1_1 := gen_random_uuid();
  coa2_3_2 := gen_random_uuid();
  coa2_4_1 := gen_random_uuid();
  coa2_4_3 := gen_random_uuid();

  INSERT INTO chart_of_accounts (id, company_id, code, name, level, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry, show_in_dre, dre_group, dre_order, status)
  VALUES
  (gen_random_uuid(), co2, '1',   'Receita operacional bruta',   1, 'revenue','credit', false, true,  false, true, 'receita_bruta', 100, 'active'),
  (coa2_1_1,          co2, '1.1', 'Receita de vendas',           2, 'revenue','credit', true,  false, true,  true, 'receita_bruta', 110, 'active'),
  (gen_random_uuid(), co2, '3',   'Custos',                      1, 'cost','debit',     false, true,  false, true, 'custos', 300, 'active'),
  (coa2_3_2,          co2, '3.2', 'Salarios e encargos',         2, 'cost','debit',     true,  false, true,  true, 'custos', 320, 'active'),
  (gen_random_uuid(), co2, '4',   'Despesas operacionais',       1, 'expense','debit',  false, true,  false, true, 'despesas_operacionais', 400, 'active'),
  (coa2_4_1,          co2, '4.1', 'Aluguel loja',                2, 'expense','debit',  true,  false, true,  true, 'despesas_operacionais', 410, 'active'),
  (coa2_4_3,          co2, '4.3', 'Marketing',                   2, 'expense','debit',  true,  false, true,  true, 'despesas_operacionais', 430, 'active');

  -- ============================================================
  -- 4. CENTROS DE CUSTO — Company 1
  -- ============================================================
  cc_adm := gen_random_uuid();
  cc_com := gen_random_uuid();
  cc_dev := gen_random_uuid();
  cc_mkt := gen_random_uuid();
  cc_sup := gen_random_uuid();

  INSERT INTO centros_custo (id, company_id, codigo, descricao, ativo) VALUES
  (cc_adm, co1, 'ADM',  'Administrativo',   true),
  (cc_com, co1, 'COM',  'Comercial',        true),
  (cc_dev, co1, 'DEV',  'Desenvolvimento',  true),
  (cc_mkt, co1, 'MKT',  'Marketing',        true),
  (cc_sup, co1, 'SUP',  'Suporte Tecnico',  true);

  -- Company 2
  cc2_loja := gen_random_uuid();
  INSERT INTO centros_custo (id, company_id, codigo, descricao, ativo) VALUES
  (cc2_loja, co2, 'LOJA', 'Loja Principal', true);

  -- ============================================================
  -- 5. BANK ACCOUNTS
  -- ============================================================
  bank_bb := gen_random_uuid();
  bank_nu := gen_random_uuid();
  bank_cx := gen_random_uuid();

  INSERT INTO bank_accounts (id, company_id, name, type, initial_balance, current_balance, is_active) VALUES
  (bank_bb, co1, 'BB Conta Corrente',     'checking', 45000.00, 78543.27, true),
  (bank_nu, co1, 'Nubank Conta Corrente', 'checking', 22000.00, 32150.80, true),
  (bank_cx, co1, 'Caixa Poupanca',        'savings',  15000.00, 15420.00, true);

  bank2_nu := gen_random_uuid();
  INSERT INTO bank_accounts (id, company_id, name, type, initial_balance, current_balance, is_active) VALUES
  (bank2_nu, co2, 'Nubank Tech Store', 'checking', 18000.00, 24820.50, true);

  -- ============================================================
  -- 6. CLIENTS — Company 1 (8 clients)
  -- ============================================================
  cl1 := gen_random_uuid(); cl2 := gen_random_uuid(); cl3 := gen_random_uuid(); cl4 := gen_random_uuid();
  cl5 := gen_random_uuid(); cl6 := gen_random_uuid(); cl7 := gen_random_uuid(); cl8 := gen_random_uuid();

  INSERT INTO clients (id, company_id, tipo_pessoa, cpf_cnpj, razao_social, nome_fantasia, email, telefone, celular,
    endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, is_active) VALUES
  (cl1, co1, 'PJ', '11.222.333/0001-44', 'ACME TECNOLOGIA LTDA',          'Acme Tech',         'financeiro@acmetech.com.br',    '(11) 3333-1111', '(11) 91111-2222', '01310-100', 'Av. Paulista',        '1000', 'Bela Vista',   'Sao Paulo', 'SP', true),
  (cl2, co1, 'PJ', '22.333.444/0001-55', 'CONSTRUTORA HORIZONTE SA',      'Horizonte',         'contato@horizonte.com.br',      '(11) 3333-2222', '(11) 92222-3333', '04543-011', 'Rua Funchal',         '300',  'Vila Olimpia', 'Sao Paulo', 'SP', true),
  (cl3, co1, 'PJ', '33.444.555/0001-66', 'HOSPITAL SAO LUCAS LTDA',       'Hospital Sao Lucas','compras@saolucas.com.br',       '(11) 3333-3333', '(11) 93333-4444', '01310-200', 'Rua Haddock Lobo',    '585',  'Cerqueira Cesar','Sao Paulo','SP', true),
  (cl4, co1, 'PJ', '44.555.666/0001-77', 'LOGISTICA RAPIDA EXPRESS LTDA', 'Rapida Express',    'ti@rapidaexpress.com.br',       '(11) 3333-4444', '(11) 94444-5555', '06454-000', 'Alameda Rio Negro',   '1030', 'Alphaville',   'Barueri',   'SP', true),
  (cl5, co1, 'PJ', '55.666.777/0001-88', 'ESCOLA CONECTA EDUCACAO SA',    'Conecta Educacao',  'diretoria@conectaedu.com.br',   '(11) 3333-5555', '(11) 95555-6666', '05424-150', 'Rua dos Pinheiros',   '870',  'Pinheiros',    'Sao Paulo', 'SP', true),
  (cl6, co1, 'PF', '123.456.789-09',     'MARCOS ANTONIO DA SILVA',       NULL,                'marcos.silva@email.com',        NULL,              '(11) 96666-7777', '01310-100', 'Av. Paulista',        '2300', 'Bela Vista',   'Sao Paulo', 'SP', true),
  (cl7, co1, 'PJ', '66.777.888/0001-99', 'FARMACIA VIDA E SAUDE LTDA',   'Vida e Saude',      'adm@vidaesaude.com.br',         '(11) 3333-7777', '(11) 97777-8888', '04547-005', 'Rua Olimpiadas',      '100',  'Vila Olimpia', 'Sao Paulo', 'SP', true),
  (cl8, co1, 'PJ', '77.888.999/0001-00', 'REDE DE RESTAURANTES SABOR SA', 'Sabor Restaurantes','compras@saborrestaur.com.br',   '(11) 3333-8888', '(11) 98888-9999', '01414-001', 'Rua Oscar Freire',    '725',  'Jardins',      'Sao Paulo', 'SP', true);

  -- Clients — Company 2 (3 clients)
  cl2_1 := gen_random_uuid(); cl2_2 := gen_random_uuid(); cl2_3 := gen_random_uuid();

  INSERT INTO clients (id, company_id, tipo_pessoa, cpf_cnpj, razao_social, nome_fantasia, email, telefone, is_active) VALUES
  (cl2_1, co2, 'PF', '987.654.321-00', 'JOAO PEDRO OLIVEIRA',        NULL,               'joao.pedro@email.com',  '(11) 91234-5678', true),
  (cl2_2, co2, 'PJ', '88.999.000/0001-11', 'ESCRITORIO CENTRAL LTDA','Escritorio Central','contato@esccentral.com','(11) 3456-7890',   true),
  (cl2_3, co2, 'PF', '456.789.123-00', 'MARIA FERNANDA COSTA',       NULL,               'maria.costa@email.com', '(11) 98765-1234',  true);

  -- ============================================================
  -- 7. SUPPLIERS — Company 1 (6 suppliers)
  -- ============================================================
  sp1 := gen_random_uuid(); sp2 := gen_random_uuid(); sp3 := gen_random_uuid();
  sp4 := gen_random_uuid(); sp5 := gen_random_uuid(); sp6 := gen_random_uuid();

  INSERT INTO suppliers (id, company_id, tipo_pessoa, cpf_cnpj, razao_social, nome_fantasia, email, telefone,
    endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado,
    dados_bancarios_banco, dados_bancarios_pix, is_active) VALUES
  (sp1, co1, 'PJ', '10.111.222/0001-33', 'AWS BRASIL SERVICOS LTDA',       'Amazon AWS',       'billing@aws.amazon.com',      '(11) 4000-1111', '04543-011', 'Rua Funchal',       '411', 'Vila Olimpia', 'Sao Paulo', 'SP', 'Itau',   '10.111.222/0001-33', true),
  (sp2, co1, 'PJ', '20.222.333/0001-44', 'IMOBILIARIA PAULISTA LTDA',      'Paulista Imoveis', 'financeiro@paulistaimov.com',  '(11) 4000-2222', '01310-100', 'Av. Paulista',      '1000','Bela Vista',   'Sao Paulo', 'SP', 'Bradesco','20.222.333/0001-44', true),
  (sp3, co1, 'PJ', '30.333.444/0001-55', 'CONTABILIDADE FISCAL PLUS LTDA', 'Fiscal Plus',      'atendimento@fiscalplus.com',  '(11) 4000-3333', '04543-020', 'Rua Gomes Freire',  '200', 'Liberdade',    'Sao Paulo', 'SP', 'BB',     '30.333.444/0001-55', true),
  (sp4, co1, 'PJ', '40.444.555/0001-66', 'GOOGLE CLOUD BRASIL LTDA',       'Google Cloud',     'billing@google.com',          '(11) 4000-4444', '04543-011', 'Rua Funchal',       '411', 'Vila Olimpia', 'Sao Paulo', 'SP', 'Itau',   '40.444.555/0001-66', true),
  (sp5, co1, 'PJ', '50.555.666/0001-77', 'ENERGISA DISTRIBUIDORA SA',      'Energisa',         'comercial@energisa.com.br',   '(11) 4000-5555', '01310-200', 'Rua Cerro Cora',    '123', 'Alto de Pinh.','Sao Paulo', 'SP', 'BB',     NULL,                 true),
  (sp6, co1, 'PJ', '60.666.777/0001-88', 'AGENCIA DIGITAL IMPULSO LTDA',   'Impulso Digital',  'contato@impulsodigital.com',  '(11) 4000-6666', '05424-150', 'Rua dos Pinheiros', '500', 'Pinheiros',    'Sao Paulo', 'SP', 'Nubank', 'contato@impulso.com',true);

  -- ============================================================
  -- 8. PRODUCTS — Company 1 (10 products/services)
  -- ============================================================
  pr1  := gen_random_uuid(); pr2  := gen_random_uuid(); pr3  := gen_random_uuid();
  pr4  := gen_random_uuid(); pr5  := gen_random_uuid(); pr6  := gen_random_uuid();
  pr7  := gen_random_uuid(); pr8  := gen_random_uuid(); pr9  := gen_random_uuid();
  pr10 := gen_random_uuid();

  INSERT INTO products (id, company_id, code, description, price, unidade_medida, is_active) VALUES
  (pr1,  co1, 'SRV-001', 'Consultoria em Transformacao Digital',     250.00, 'hr',  true),
  (pr2,  co1, 'SRV-002', 'Desenvolvimento de Software Sob Demanda',  180.00, 'hr',  true),
  (pr3,  co1, 'SRV-003', 'Suporte Tecnico Mensal',                  2500.00, 'mes', true),
  (pr4,  co1, 'SRV-004', 'Implantacao de ERP',                     15000.00, 'un',  true),
  (pr5,  co1, 'SRV-005', 'Treinamento e Capacitacao',                800.00, 'hr',  true),
  (pr6,  co1, 'LIC-001', 'Licenca SaaS — Plano Starter (mensal)',    299.00, 'mes', true),
  (pr7,  co1, 'LIC-002', 'Licenca SaaS — Plano Business (mensal)',   799.00, 'mes', true),
  (pr8,  co1, 'LIC-003', 'Licenca SaaS — Plano Enterprise (mensal)',1499.00, 'mes', true),
  (pr9,  co1, 'HW-001',  'Notebook Dell Latitude 5540',             5200.00, 'un',  true),
  (pr10, co1, 'HW-002',  'Monitor LG UltraWide 34"',               2800.00, 'un',  true);

  -- Products — Company 2 (5 products)
  pr2_1 := gen_random_uuid(); pr2_2 := gen_random_uuid(); pr2_3 := gen_random_uuid();
  pr2_4 := gen_random_uuid(); pr2_5 := gen_random_uuid();

  INSERT INTO products (id, company_id, code, description, price, unidade_medida, is_active) VALUES
  (pr2_1, co2, 'PROD-001', 'Smartphone Samsung Galaxy S24',      3999.00, 'un', true),
  (pr2_2, co2, 'PROD-002', 'Notebook Lenovo IdeaPad 3',          3200.00, 'un', true),
  (pr2_3, co2, 'PROD-003', 'Fone Bluetooth JBL Tune 520BT',      249.00, 'un', true),
  (pr2_4, co2, 'PROD-004', 'Tablet Apple iPad 10 geracao',       4500.00, 'un', true),
  (pr2_5, co2, 'PROD-005', 'Smartwatch Amazfit GTR 4',            899.00, 'un', true);

  -- ============================================================
  -- 9. EMPLOYEES — Company 1 (10 employees)
  -- ============================================================
  INSERT INTO employees (company_id, name, nome_completo, role, email, phone, cpf, hire_date, salary, salario_base,
    tipo_contrato, centro_custo_id) VALUES
  (co1, 'Carlos Eduardo Mendes',    'Carlos Eduardo Mendes',    'CEO / Diretor Geral',     'carlos@novatech.com.br',    '(11) 99876-5432', '111.222.333-44', '2020-03-15', 18000.00, 18000.00, 'pj',      cc_adm),
  (co1, 'Fernanda Oliveira Santos', 'Fernanda Oliveira Santos', 'Diretora Financeira',     'fernanda@novatech.com.br',  '(11) 99876-1111', '222.333.444-55', '2020-03-15', 15000.00, 15000.00, 'pj',      cc_adm),
  (co1, 'Rafael Costa Lima',        'Rafael Costa Lima',        'Tech Lead',               'rafael@novatech.com.br',    '(11) 99876-2222', '333.444.555-66', '2021-06-01', 14000.00, 14000.00, 'clt',     cc_dev),
  (co1, 'Juliana Pereira Gomes',    'Juliana Pereira Gomes',    'Desenvolvedora Full-Stack','juliana@novatech.com.br',  '(11) 99876-3333', '444.555.666-77', '2022-01-10', 10500.00, 10500.00, 'clt',     cc_dev),
  (co1, 'Lucas Ribeiro Alves',      'Lucas Ribeiro Alves',      'Desenvolvedor Back-End',  'lucas@novatech.com.br',     '(11) 99876-4444', '555.666.777-88', '2022-04-01', 9800.00,  9800.00,  'clt',     cc_dev),
  (co1, 'Mariana Silva Duarte',     'Mariana Silva Duarte',     'Designer UX/UI',          'mariana@novatech.com.br',   '(11) 99876-5555', '666.777.888-99', '2023-02-15', 8500.00,  8500.00,  'clt',     cc_dev),
  (co1, 'Andre Takahashi',          'Andre Takahashi',          'Gerente Comercial',       'andre@novatech.com.br',     '(11) 99876-6666', '777.888.999-00', '2021-09-01', 12000.00, 12000.00, 'clt',     cc_com),
  (co1, 'Patricia Moreira',         'Patricia Moreira',         'Analista de Marketing',   'patricia@novatech.com.br',  '(11) 99876-7777', '888.999.000-11', '2023-05-01',  7200.00,  7200.00, 'clt',     cc_mkt),
  (co1, 'Bruno Henrique Souza',     'Bruno Henrique Souza',     'Analista de Suporte',     'bruno@novatech.com.br',     '(11) 99876-8888', '999.000.111-22', '2023-08-15',  5500.00,  5500.00, 'clt',     cc_sup),
  (co1, 'Camila Ferreira',          'Camila Ferreira',          'Estagiaria Dev',          'camila@novatech.com.br',    '(11) 99876-9999', '000.111.222-33', '2025-07-01',  1800.00,  1800.00, 'estagio', cc_dev);

  -- ============================================================
  -- 10. VENDAS + VENDAS_ITENS — Company 1 (32 sales, Jan-Apr 2026)
  -- ============================================================
  v1  := gen_random_uuid(); v2  := gen_random_uuid(); v3  := gen_random_uuid(); v4  := gen_random_uuid();
  v5  := gen_random_uuid(); v6  := gen_random_uuid(); v7  := gen_random_uuid(); v8  := gen_random_uuid();
  v9  := gen_random_uuid(); v10 := gen_random_uuid(); v11 := gen_random_uuid(); v12 := gen_random_uuid();
  v13 := gen_random_uuid(); v14 := gen_random_uuid(); v15 := gen_random_uuid(); v16 := gen_random_uuid();
  v17 := gen_random_uuid(); v18 := gen_random_uuid(); v19 := gen_random_uuid(); v20 := gen_random_uuid();
  v21 := gen_random_uuid(); v22 := gen_random_uuid(); v23 := gen_random_uuid(); v24 := gen_random_uuid();
  v25 := gen_random_uuid(); v26 := gen_random_uuid(); v27 := gen_random_uuid(); v28 := gen_random_uuid();
  v29 := gen_random_uuid(); v30 := gen_random_uuid(); v31 := gen_random_uuid(); v32 := gen_random_uuid();

  INSERT INTO vendas (id, company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, forma_pagamento, parcelas, status) VALUES
  -- Janeiro 2026 (8 vendas)
  (v1,  co1, 'Acme Tech',         '11.222.333/0001-44', 'servico', 15000.00, '2026-01-05', 'pix',            1, 'confirmado'),
  (v2,  co1, 'Horizonte',         '22.333.444/0001-55', 'servico',  7500.00, '2026-01-10', 'boleto',         1, 'confirmado'),
  (v3,  co1, 'Hospital Sao Lucas','33.444.555/0001-66', 'servico', 25000.00, '2026-01-15', 'parcelado',      3, 'confirmado'),
  (v4,  co1, 'Rapida Express',    '44.555.666/0001-77', 'servico',  5000.00, '2026-01-18', 'pix',            1, 'confirmado'),
  (v5,  co1, 'Conecta Educacao',  '55.666.777/0001-88', 'servico',  2500.00, '2026-01-20', 'cartao_credito', 1, 'confirmado'),
  (v6,  co1, 'Marcos A. Silva',   '123.456.789-09',     'servico',  4000.00, '2026-01-22', 'pix',            1, 'confirmado'),
  (v7,  co1, 'Vida e Saude',      '66.777.888/0001-99', 'servico',  3500.00, '2026-01-25', 'boleto',         1, 'confirmado'),
  (v8,  co1, 'Sabor Restaurantes','77.888.999/0001-00', 'produto', 10400.00, '2026-01-28', 'cartao_credito', 2, 'confirmado'),
  -- Fevereiro 2026 (8 vendas)
  (v9,  co1, 'Acme Tech',         '11.222.333/0001-44', 'servico', 12000.00, '2026-02-03', 'pix',            1, 'confirmado'),
  (v10, co1, 'Horizonte',         '22.333.444/0001-55', 'servico', 18000.00, '2026-02-07', 'boleto',         1, 'confirmado'),
  (v11, co1, 'Hospital Sao Lucas','33.444.555/0001-66', 'servico',  7990.00, '2026-02-12', 'cartao_debito',  1, 'confirmado'),
  (v12, co1, 'Rapida Express',    '44.555.666/0001-77', 'servico',  9500.00, '2026-02-14', 'pix',            1, 'confirmado'),
  (v13, co1, 'Conecta Educacao',  '55.666.777/0001-88', 'servico',  2500.00, '2026-02-18', 'pix',            1, 'confirmado'),
  (v14, co1, 'Marcos A. Silva',   '123.456.789-09',     'produto',  5200.00, '2026-02-20', 'cartao_credito', 2, 'confirmado'),
  (v15, co1, 'Vida e Saude',      '66.777.888/0001-99', 'servico',  1499.00, '2026-02-22', 'pix',            1, 'confirmado'),
  (v16, co1, 'Sabor Restaurantes','77.888.999/0001-00', 'servico',  6000.00, '2026-02-27', 'boleto',         1, 'confirmado'),
  -- Marco 2026 (8 vendas)
  (v17, co1, 'Acme Tech',         '11.222.333/0001-44', 'servico', 20000.00, '2026-03-03', 'boleto',         1, 'confirmado'),
  (v18, co1, 'Horizonte',         '22.333.444/0001-55', 'servico',  8500.00, '2026-03-06', 'pix',            1, 'confirmado'),
  (v19, co1, 'Hospital Sao Lucas','33.444.555/0001-66', 'servico', 14990.00, '2026-03-10', 'parcelado',      2, 'confirmado'),
  (v20, co1, 'Rapida Express',    '44.555.666/0001-77', 'servico',  3200.00, '2026-03-12', 'cartao_debito',  1, 'confirmado'),
  (v21, co1, 'Conecta Educacao',  '55.666.777/0001-88', 'servico',  7990.00, '2026-03-17', 'cartao_credito', 1, 'confirmado'),
  (v22, co1, 'Marcos A. Silva',   '123.456.789-09',     'servico',  2000.00, '2026-03-20', 'pix',            1, 'confirmado'),
  (v23, co1, 'Vida e Saude',      '66.777.888/0001-99', 'produto',  8000.00, '2026-03-24', 'cartao_credito', 3, 'confirmado'),
  (v24, co1, 'Sabor Restaurantes','77.888.999/0001-00', 'servico',  4500.00, '2026-03-28', 'pix',            1, 'confirmado'),
  -- Abril 2026 (8 vendas)
  (v25, co1, 'Acme Tech',         '11.222.333/0001-44', 'servico', 15000.00, '2026-04-01', 'pix',            1, 'confirmado'),
  (v26, co1, 'Horizonte',         '22.333.444/0001-55', 'servico', 11000.00, '2026-04-03', 'boleto',         1, 'confirmado'),
  (v27, co1, 'Hospital Sao Lucas','33.444.555/0001-66', 'servico',  7990.00, '2026-04-05', 'cartao_credito', 1, 'confirmado'),
  (v28, co1, 'Rapida Express',    '44.555.666/0001-77', 'servico',  6400.00, '2026-04-08', 'pix',            1, 'confirmado'),
  (v29, co1, 'Conecta Educacao',  '55.666.777/0001-88', 'servico',  2500.00, '2026-04-10', 'cartao_debito',  1, 'confirmado'),
  (v30, co1, 'Marcos A. Silva',   '123.456.789-09',     'produto',  2800.00, '2026-04-12', 'pix',            1, 'confirmado'),
  (v31, co1, 'Vida e Saude',      '66.777.888/0001-99', 'servico',  1499.00, '2026-04-15', 'boleto',         1, 'confirmado'),
  (v32, co1, 'Sabor Restaurantes','77.888.999/0001-00', 'servico', 12000.00, '2026-04-18', 'parcelado',      3, 'confirmado');

  -- VENDAS_ITENS for each sale
  INSERT INTO vendas_itens (venda_id, descricao, quantidade, valor_unitario) VALUES
  -- Jan
  (v1,  'Implantacao de ERP — fase 1',                1,  15000.00),
  (v2,  'Consultoria em Transformacao Digital',       30,    250.00),
  (v3,  'Implantacao de ERP completo',                1,  25000.00),
  (v4,  'Suporte Tecnico Mensal — jan',               2,   2500.00),
  (v5,  'Suporte Tecnico Mensal — jan',               1,   2500.00),
  (v6,  'Desenvolvimento sob demanda — app mobile',  20,    200.00),
  (v7,  'Licenca SaaS Business + customizacao',       1,   3500.00),
  (v8,  'Notebook Dell Latitude 5540',                2,   5200.00),
  -- Feb
  (v9,  'Consultoria Transformacao Digital',          48,    250.00),
  (v10, 'Desenvolvimento sistema logistica',         100,    180.00),
  (v11, 'Licenca SaaS Enterprise — fev',              1,   7990.00),
  (v12, 'Suporte Tecnico + melhorias',                1,   9500.00),
  (v13, 'Suporte Tecnico Mensal — fev',               1,   2500.00),
  (v14, 'Notebook Dell Latitude 5540',                1,   5200.00),
  (v15, 'Licenca SaaS Enterprise — fev',              1,   1499.00),
  (v16, 'Desenvolvimento modulo financeiro',          1,   6000.00),
  -- Mar
  (v17, 'Implantacao ERP — fase 2',                   1,  20000.00),
  (v18, 'Consultoria arquitetura cloud',              34,    250.00),
  (v19, 'Licenca SaaS Enterprise — trimestral',       1,  14990.00),
  (v20, 'Treinamento equipe TI',                      4,    800.00),
  (v21, 'Licenca SaaS Enterprise — mar',              1,   7990.00),
  (v22, 'Suporte avulso',                             1,   2000.00),
  (v23, 'Monitor LG UltraWide 34"',                   2,   2800.00),
  (v23, 'Teclado + Mouse Logitech MX',                1,   2400.00),
  (v24, 'Desenvolvimento modulo RH',                  1,   4500.00),
  -- Apr
  (v25, 'Consultoria estrategia digital',            60,    250.00),
  (v26, 'Desenvolvimento portal web',                 1,  11000.00),
  (v27, 'Licenca SaaS Enterprise — abr',              1,   7990.00),
  (v28, 'Suporte Tecnico + manutencao',               1,   6400.00),
  (v29, 'Suporte Tecnico Mensal — abr',               1,   2500.00),
  (v30, 'Monitor LG UltraWide 34"',                   1,   2800.00),
  (v31, 'Licenca SaaS Enterprise — abr',              1,   1499.00),
  (v32, 'Desenvolvimento sistema vendas completo',     1,  12000.00);

  -- ============================================================
  -- VENDAS — Company 2 (10 sales)
  -- ============================================================
  v2_1 := gen_random_uuid(); v2_2 := gen_random_uuid(); v2_3 := gen_random_uuid();
  v2_4 := gen_random_uuid(); v2_5 := gen_random_uuid(); v2_6 := gen_random_uuid();
  v2_7 := gen_random_uuid(); v2_8 := gen_random_uuid(); v2_9 := gen_random_uuid();
  v2_10 := gen_random_uuid();

  INSERT INTO vendas (id, company_id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, forma_pagamento, parcelas, status) VALUES
  (v2_1,  co2, 'Joao Pedro Oliveira',   '987.654.321-00',     'produto', 3999.00, '2026-01-08', 'cartao_credito', 3, 'confirmado'),
  (v2_2,  co2, 'Escritorio Central',     '88.999.000/0001-11', 'produto', 6400.00, '2026-01-20', 'boleto',         1, 'confirmado'),
  (v2_3,  co2, 'Maria Fernanda Costa',   '456.789.123-00',     'produto',  249.00, '2026-02-05', 'pix',            1, 'confirmado'),
  (v2_4,  co2, 'Joao Pedro Oliveira',    '987.654.321-00',     'produto',  899.00, '2026-02-14', 'cartao_debito',  1, 'confirmado'),
  (v2_5,  co2, 'Escritorio Central',     '88.999.000/0001-11', 'produto', 4500.00, '2026-02-25', 'boleto',         1, 'confirmado'),
  (v2_6,  co2, 'Maria Fernanda Costa',   '456.789.123-00',     'produto', 3200.00, '2026-03-05', 'cartao_credito', 2, 'confirmado'),
  (v2_7,  co2, 'Joao Pedro Oliveira',    '987.654.321-00',     'produto',  249.00, '2026-03-15', 'pix',            1, 'confirmado'),
  (v2_8,  co2, 'Escritorio Central',     '88.999.000/0001-11', 'produto', 7998.00, '2026-03-22', 'boleto',         1, 'confirmado'),
  (v2_9,  co2, 'Maria Fernanda Costa',   '456.789.123-00',     'produto', 3999.00, '2026-04-02', 'cartao_credito', 3, 'confirmado'),
  (v2_10, co2, 'Joao Pedro Oliveira',    '987.654.321-00',     'produto',  899.00, '2026-04-10', 'cartao_debito',  1, 'confirmado');

  INSERT INTO vendas_itens (venda_id, descricao, quantidade, valor_unitario) VALUES
  (v2_1,  'Smartphone Samsung Galaxy S24', 1, 3999.00),
  (v2_2,  'Notebook Lenovo IdeaPad 3',     2, 3200.00),
  (v2_3,  'Fone Bluetooth JBL Tune 520BT', 1,  249.00),
  (v2_4,  'Smartwatch Amazfit GTR 4',       1,  899.00),
  (v2_5,  'Tablet Apple iPad 10 geracao',   1, 4500.00),
  (v2_6,  'Notebook Lenovo IdeaPad 3',      1, 3200.00),
  (v2_7,  'Fone Bluetooth JBL Tune 520BT',  1,  249.00),
  (v2_8,  'Smartphone Samsung Galaxy S24',   2, 3999.00),
  (v2_9,  'Smartphone Samsung Galaxy S24',   1, 3999.00),
  (v2_10, 'Smartwatch Amazfit GTR 4',        1,  899.00);

  -- ============================================================
  -- 11. CONTAS A RECEBER — Company 1
  -- Generated from vendas + some standalone
  -- ~60% pago, ~25% aberto, ~15% vencido
  -- ============================================================
  cr1  := gen_random_uuid(); cr2  := gen_random_uuid(); cr3  := gen_random_uuid();
  cr4  := gen_random_uuid(); cr5  := gen_random_uuid(); cr6  := gen_random_uuid();
  cr7  := gen_random_uuid(); cr8  := gen_random_uuid(); cr9  := gen_random_uuid();
  cr10 := gen_random_uuid(); cr11 := gen_random_uuid(); cr12 := gen_random_uuid();
  cr13 := gen_random_uuid(); cr14 := gen_random_uuid(); cr15 := gen_random_uuid();
  cr16 := gen_random_uuid(); cr17 := gen_random_uuid(); cr18 := gen_random_uuid();
  cr19 := gen_random_uuid(); cr20 := gen_random_uuid(); cr21 := gen_random_uuid();
  cr22 := gen_random_uuid(); cr23 := gen_random_uuid(); cr24 := gen_random_uuid();
  cr25 := gen_random_uuid(); cr26 := gen_random_uuid(); cr27 := gen_random_uuid();
  cr28 := gen_random_uuid(); cr29 := gen_random_uuid(); cr30 := gen_random_uuid();
  cr31 := gen_random_uuid(); cr32 := gen_random_uuid(); cr33 := gen_random_uuid();
  cr34 := gen_random_uuid(); cr35 := gen_random_uuid();

  INSERT INTO contas_receber (id, company_id, venda_id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago,
    data_vencimento, data_pagamento, status, forma_recebimento, conta_contabil_id, centro_custo_id) VALUES
  -- JANEIRO — mostly pago
  (cr1,  co1, v1,   'Acme Tech',          '11.222.333/0001-44', 15000.00, 15000.00, '2026-01-10', '2026-01-08', 'pago',   'pix',            coa_1_1, cc_com),
  (cr2,  co1, v2,   'Horizonte',           '22.333.444/0001-55',  7500.00,  7500.00, '2026-01-15', '2026-01-14', 'pago',   'boleto',         coa_1_1, cc_com),
  (cr3,  co1, v3,   'Hospital Sao Lucas',  '33.444.555/0001-66',  8333.33,  8333.33, '2026-01-20', '2026-01-20', 'pago',   'boleto',         coa_1_1, cc_com),  -- parcela 1/3
  (cr4,  co1, v3,   'Hospital Sao Lucas',  '33.444.555/0001-66',  8333.33,  8333.33, '2026-02-20', '2026-02-19', 'pago',   'boleto',         coa_1_1, cc_com),  -- parcela 2/3
  (cr5,  co1, v3,   'Hospital Sao Lucas',  '33.444.555/0001-66',  8333.34,  8333.34, '2026-03-20', '2026-03-20', 'pago',   'boleto',         coa_1_1, cc_com),  -- parcela 3/3
  (cr6,  co1, v4,   'Rapida Express',      '44.555.666/0001-77',  5000.00,  5000.00, '2026-01-25', '2026-01-23', 'pago',   'pix',            coa_1_1, cc_sup),
  (cr7,  co1, v5,   'Conecta Educacao',    '55.666.777/0001-88',  2500.00,  2500.00, '2026-01-25', '2026-01-24', 'pago',   'cartao_credito', coa_1_1, cc_sup),
  (cr8,  co1, v6,   'Marcos A. Silva',     '123.456.789-09',      4000.00,  4000.00, '2026-01-27', '2026-01-26', 'pago',   'pix',            coa_1_1, cc_dev),
  (cr9,  co1, v7,   'Vida e Saude',        '66.777.888/0001-99',  3500.00,  3500.00, '2026-01-30', '2026-01-29', 'pago',   'boleto',         coa_1_1, cc_com),
  (cr10, co1, v8,   'Sabor Restaurantes',  '77.888.999/0001-00',  5200.00,  5200.00, '2026-02-05', '2026-02-04', 'pago',   'cartao_credito', coa_1_2, cc_com),  -- parcela 1/2
  (cr11, co1, v8,   'Sabor Restaurantes',  '77.888.999/0001-00',  5200.00,  5200.00, '2026-03-05', '2026-03-04', 'pago',   'cartao_credito', coa_1_2, cc_com),  -- parcela 2/2
  -- FEVEREIRO — mostly pago
  (cr12, co1, v9,   'Acme Tech',           '11.222.333/0001-44', 12000.00, 12000.00, '2026-02-08', '2026-02-06', 'pago',   'pix',            coa_1_1, cc_com),
  (cr13, co1, v10,  'Horizonte',            '22.333.444/0001-55', 18000.00, 18000.00, '2026-02-12', '2026-02-11', 'pago',   'boleto',         coa_1_1, cc_dev),
  (cr14, co1, v11,  'Hospital Sao Lucas',   '33.444.555/0001-66',  7990.00,  7990.00, '2026-02-17', '2026-02-16', 'pago',   'cartao_debito',  coa_1_1, cc_com),
  (cr15, co1, v12,  'Rapida Express',       '44.555.666/0001-77',  9500.00,  9500.00, '2026-02-19', '2026-02-18', 'pago',   'pix',            coa_1_1, cc_sup),
  (cr16, co1, v13,  'Conecta Educacao',     '55.666.777/0001-88',  2500.00,  2500.00, '2026-02-23', '2026-02-21', 'pago',   'pix',            coa_1_1, cc_sup),
  (cr17, co1, v14,  'Marcos A. Silva',      '123.456.789-09',      2600.00,  2600.00, '2026-02-25', '2026-02-24', 'pago',   'cartao_credito', coa_1_2, cc_com),  -- parcela 1/2
  (cr18, co1, v14,  'Marcos A. Silva',      '123.456.789-09',      2600.00,     NULL, '2026-03-25', NULL,          'vencido','cartao_credito', coa_1_2, cc_com),  -- parcela 2/2 vencido
  (cr19, co1, v15,  'Vida e Saude',         '66.777.888/0001-99',  1499.00,  1499.00, '2026-02-27', '2026-02-25', 'pago',   'pix',            coa_1_1, cc_com),
  (cr20, co1, v16,  'Sabor Restaurantes',   '77.888.999/0001-00',  6000.00,  6000.00, '2026-03-05', '2026-03-04', 'pago',   'boleto',         coa_1_1, cc_dev),
  -- MARCO — mix pago/aberto
  (cr21, co1, v17,  'Acme Tech',            '11.222.333/0001-44', 20000.00, 20000.00, '2026-03-08', '2026-03-07', 'pago',   'boleto',         coa_1_1, cc_com),
  (cr22, co1, v18,  'Horizonte',             '22.333.444/0001-55',  8500.00,  8500.00, '2026-03-11', '2026-03-10', 'pago',   'pix',            coa_1_1, cc_com),
  (cr23, co1, v19,  'Hospital Sao Lucas',    '33.444.555/0001-66',  7495.00,  7495.00, '2026-03-15', '2026-03-14', 'pago',   'boleto',         coa_1_1, cc_com),  -- parcela 1/2
  (cr24, co1, v19,  'Hospital Sao Lucas',    '33.444.555/0001-66',  7495.00,     NULL, '2026-04-15', NULL,          'aberto', 'boleto',         coa_1_1, cc_com),  -- parcela 2/2
  (cr25, co1, v20,  'Rapida Express',        '44.555.666/0001-77',  3200.00,  3200.00, '2026-03-17', '2026-03-16', 'pago',   'cartao_debito',  coa_1_1, cc_sup),
  (cr26, co1, v21,  'Conecta Educacao',      '55.666.777/0001-88',  7990.00,     NULL, '2026-03-22', NULL,          'vencido','cartao_credito', coa_1_1, cc_com),
  (cr27, co1, v24,  'Sabor Restaurantes',    '77.888.999/0001-00',  4500.00,  4500.00, '2026-04-02', '2026-04-01', 'pago',   'pix',            coa_1_1, cc_dev),
  -- ABRIL — mix aberto/pago
  (cr28, co1, v25,  'Acme Tech',             '11.222.333/0001-44', 15000.00, 15000.00, '2026-04-06', '2026-04-04', 'pago',   'pix',            coa_1_1, cc_com),
  (cr29, co1, v26,  'Horizonte',              '22.333.444/0001-55', 11000.00,     NULL, '2026-04-10', NULL,          'aberto', 'boleto',         coa_1_1, cc_dev),
  (cr30, co1, v27,  'Hospital Sao Lucas',     '33.444.555/0001-66',  7990.00,     NULL, '2026-04-12', NULL,          'aberto', 'cartao_credito', coa_1_1, cc_com),
  (cr31, co1, v28,  'Rapida Express',         '44.555.666/0001-77',  6400.00,  6400.00, '2026-04-13', '2026-04-10', 'pago',   'pix',            coa_1_1, cc_sup),
  (cr32, co1, v29,  'Conecta Educacao',       '55.666.777/0001-88',  2500.00,     NULL, '2026-04-15', NULL,          'aberto', 'cartao_debito',  coa_1_1, cc_sup),
  -- Standalone (not from vendas)
  (cr33, co1, NULL, 'Acme Tech',              '11.222.333/0001-44',  5000.00,     NULL, '2026-04-30', NULL,          'aberto', 'pix',            coa_1_3, cc_com),
  (cr34, co1, NULL, 'Horizonte',               '22.333.444/0001-55',  3500.00,     NULL, '2026-05-05', NULL,          'aberto', 'boleto',         coa_1_3, cc_dev),
  (cr35, co1, NULL, 'Rapida Express',          '44.555.666/0001-77',  2000.00,     NULL, '2026-03-10', NULL,          'vencido','pix',            coa_1_1, cc_sup);

  -- Contas Receber — Company 2 (15 entries)
  INSERT INTO contas_receber (company_id, venda_id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago,
    data_vencimento, data_pagamento, status, forma_recebimento, conta_contabil_id) VALUES
  (co2, v2_1,  'Joao Pedro Oliveira',  '987.654.321-00',     1333.00, 1333.00, '2026-01-15', '2026-01-14', 'pago',   'cartao_credito', coa2_1_1),
  (co2, v2_1,  'Joao Pedro Oliveira',  '987.654.321-00',     1333.00, 1333.00, '2026-02-15', '2026-02-14', 'pago',   'cartao_credito', coa2_1_1),
  (co2, v2_1,  'Joao Pedro Oliveira',  '987.654.321-00',     1333.00,    NULL, '2026-03-15', NULL,          'vencido','cartao_credito', coa2_1_1),
  (co2, v2_2,  'Escritorio Central',    '88.999.000/0001-11', 6400.00, 6400.00, '2026-01-25', '2026-01-24', 'pago',   'boleto',         coa2_1_1),
  (co2, v2_3,  'Maria Fernanda Costa',  '456.789.123-00',      249.00,  249.00, '2026-02-10', '2026-02-08', 'pago',   'pix',            coa2_1_1),
  (co2, v2_4,  'Joao Pedro Oliveira',   '987.654.321-00',      899.00,  899.00, '2026-02-19', '2026-02-18', 'pago',   'cartao_debito',  coa2_1_1),
  (co2, v2_5,  'Escritorio Central',     '88.999.000/0001-11', 4500.00, 4500.00, '2026-03-02', '2026-03-01', 'pago',   'boleto',         coa2_1_1),
  (co2, v2_6,  'Maria Fernanda Costa',   '456.789.123-00',     1600.00, 1600.00, '2026-03-10', '2026-03-09', 'pago',   'cartao_credito', coa2_1_1),
  (co2, v2_6,  'Maria Fernanda Costa',   '456.789.123-00',     1600.00,    NULL, '2026-04-10', NULL,          'aberto', 'cartao_credito', coa2_1_1),
  (co2, v2_7,  'Joao Pedro Oliveira',    '987.654.321-00',      249.00,  249.00, '2026-03-20', '2026-03-18', 'pago',   'pix',            coa2_1_1),
  (co2, v2_8,  'Escritorio Central',      '88.999.000/0001-11', 7998.00, 7998.00, '2026-03-27', '2026-03-26', 'pago',   'boleto',         coa2_1_1),
  (co2, v2_9,  'Maria Fernanda Costa',    '456.789.123-00',     1333.00,    NULL, '2026-04-07', NULL,          'aberto', 'cartao_credito', coa2_1_1),
  (co2, v2_9,  'Maria Fernanda Costa',    '456.789.123-00',     1333.00,    NULL, '2026-05-07', NULL,          'aberto', 'cartao_credito', coa2_1_1),
  (co2, v2_9,  'Maria Fernanda Costa',    '456.789.123-00',     1333.00,    NULL, '2026-06-07', NULL,          'aberto', 'cartao_credito', coa2_1_1),
  (co2, v2_10, 'Joao Pedro Oliveira',     '987.654.321-00',      899.00,    NULL, '2026-04-15', NULL,          'aberto', 'cartao_debito',  coa2_1_1);

  -- ============================================================
  -- 12. CONTAS A PAGAR — Company 1 (45 entries)
  -- ============================================================
  cp1  := gen_random_uuid(); cp2  := gen_random_uuid(); cp3  := gen_random_uuid();
  cp4  := gen_random_uuid(); cp5  := gen_random_uuid(); cp6  := gen_random_uuid();
  cp7  := gen_random_uuid(); cp8  := gen_random_uuid(); cp9  := gen_random_uuid();
  cp10 := gen_random_uuid(); cp11 := gen_random_uuid(); cp12 := gen_random_uuid();
  cp13 := gen_random_uuid(); cp14 := gen_random_uuid(); cp15 := gen_random_uuid();
  cp16 := gen_random_uuid(); cp17 := gen_random_uuid(); cp18 := gen_random_uuid();
  cp19 := gen_random_uuid(); cp20 := gen_random_uuid(); cp21 := gen_random_uuid();
  cp22 := gen_random_uuid(); cp23 := gen_random_uuid(); cp24 := gen_random_uuid();
  cp25 := gen_random_uuid(); cp26 := gen_random_uuid(); cp27 := gen_random_uuid();
  cp28 := gen_random_uuid(); cp29 := gen_random_uuid(); cp30 := gen_random_uuid();
  cp31 := gen_random_uuid(); cp32 := gen_random_uuid(); cp33 := gen_random_uuid();
  cp34 := gen_random_uuid(); cp35 := gen_random_uuid(); cp36 := gen_random_uuid();
  cp37 := gen_random_uuid(); cp38 := gen_random_uuid(); cp39 := gen_random_uuid();
  cp40 := gen_random_uuid(); cp41 := gen_random_uuid(); cp42 := gen_random_uuid();
  cp43 := gen_random_uuid(); cp44 := gen_random_uuid(); cp45 := gen_random_uuid();

  INSERT INTO contas_pagar (id, company_id, credor_nome, credor_cpf_cnpj, valor, valor_pago,
    data_vencimento, data_pagamento, status, forma_pagamento, conta_contabil_id, centro_custo_id,
    conta_bancaria_id, competencia) VALUES
  -- ═══════════ JANEIRO 2026 ═══════════
  -- Folha de pagamento
  (cp1,  co1, 'Folha de Pagamento — Jan/26',  NULL, 65000.00, 65000.00, '2026-01-05', '2026-01-05', 'pago', 'transferencia', coa_3_2, cc_adm, bank_bb, '2026-01'),
  -- Pró-labore
  (cp2,  co1, 'Pro-labore Carlos — Jan/26',    '111.222.333-44', 18000.00, 18000.00, '2026-01-05', '2026-01-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-01'),
  (cp3,  co1, 'Pro-labore Fernanda — Jan/26',  '222.333.444-55', 15000.00, 15000.00, '2026-01-05', '2026-01-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-01'),
  -- Aluguel
  (cp4,  co1, 'Paulista Imoveis — Aluguel Jan', '20.222.333/0001-44', 8500.00, 8500.00, '2026-01-10', '2026-01-09', 'pago', 'boleto', coa_3_1, cc_adm, bank_bb, '2026-01'),
  -- Cloud
  (cp5,  co1, 'Amazon AWS — Jan/26',            '10.111.222/0001-33', 4200.00, 4200.00, '2026-01-15', '2026-01-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-01'),
  (cp6,  co1, 'Google Cloud — Jan/26',           '40.444.555/0001-66', 1800.00, 1800.00, '2026-01-15', '2026-01-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-01'),
  -- Contabilidade
  (cp7,  co1, 'Fiscal Plus — Contabilidade Jan', '30.333.444/0001-55', 2200.00, 2200.00, '2026-01-20', '2026-01-19', 'pago', 'boleto', coa_4_2, cc_adm, bank_bb, '2026-01'),
  -- Marketing
  (cp8,  co1, 'Google Ads — Jan/26',             NULL, 3500.00, 3500.00, '2026-01-20', '2026-01-19', 'pago', 'cartao_credito', coa_4_3, cc_mkt, bank_nu, '2026-01'),
  (cp9,  co1, 'Impulso Digital — Gestao Redes', '60.666.777/0001-88', 2800.00, 2800.00, '2026-01-25', '2026-01-24', 'pago', 'pix', coa_4_3, cc_mkt, bank_nu, '2026-01'),
  -- Impostos
  (cp10, co1, 'ISS sobre NF — Jan/26',           NULL, 3800.00, 3800.00, '2026-01-20', '2026-01-20', 'pago', 'boleto', coa_2_1, cc_adm, bank_bb, '2026-01'),
  -- Energia
  (cp11, co1, 'Energisa — Energia Jan/26',       '50.555.666/0001-77',   680.00,   680.00, '2026-01-28', '2026-01-27', 'pago', 'boleto', coa_4_4, cc_adm, bank_bb, '2026-01'),

  -- ═══════════ FEVEREIRO 2026 ═══════════
  (cp12, co1, 'Folha de Pagamento — Fev/26',  NULL, 65000.00, 65000.00, '2026-02-05', '2026-02-05', 'pago', 'transferencia', coa_3_2, cc_adm, bank_bb, '2026-02'),
  (cp13, co1, 'Pro-labore Carlos — Fev/26',    '111.222.333-44', 18000.00, 18000.00, '2026-02-05', '2026-02-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-02'),
  (cp14, co1, 'Pro-labore Fernanda — Fev/26',  '222.333.444-55', 15000.00, 15000.00, '2026-02-05', '2026-02-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-02'),
  (cp15, co1, 'Paulista Imoveis — Aluguel Fev', '20.222.333/0001-44', 8500.00, 8500.00, '2026-02-10', '2026-02-09', 'pago', 'boleto', coa_3_1, cc_adm, bank_bb, '2026-02'),
  (cp16, co1, 'Amazon AWS — Fev/26',            '10.111.222/0001-33', 4500.00, 4500.00, '2026-02-15', '2026-02-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-02'),
  (cp17, co1, 'Google Cloud — Fev/26',           '40.444.555/0001-66', 1900.00, 1900.00, '2026-02-15', '2026-02-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-02'),
  (cp18, co1, 'Fiscal Plus — Contabilidade Fev', '30.333.444/0001-55', 2200.00, 2200.00, '2026-02-20', '2026-02-19', 'pago', 'boleto', coa_4_2, cc_adm, bank_bb, '2026-02'),
  (cp19, co1, 'Google Ads — Fev/26',             NULL, 4200.00, 4200.00, '2026-02-20', '2026-02-19', 'pago', 'cartao_credito', coa_4_3, cc_mkt, bank_nu, '2026-02'),
  (cp20, co1, 'Impulso Digital — Gestao Redes', '60.666.777/0001-88', 2800.00, 2800.00, '2026-02-25', '2026-02-24', 'pago', 'pix', coa_4_3, cc_mkt, bank_nu, '2026-02'),
  (cp21, co1, 'ISS sobre NF — Fev/26',           NULL, 4100.00, 4100.00, '2026-02-20', '2026-02-20', 'pago', 'boleto', coa_2_1, cc_adm, bank_bb, '2026-02'),
  (cp22, co1, 'Energisa — Energia Fev/26',       '50.555.666/0001-77',   720.00,   720.00, '2026-02-28', '2026-02-27', 'pago', 'boleto', coa_4_4, cc_adm, bank_bb, '2026-02'),

  -- ═══════════ MARCO 2026 ═══════════
  (cp23, co1, 'Folha de Pagamento — Mar/26',  NULL, 65000.00, 65000.00, '2026-03-05', '2026-03-05', 'pago', 'transferencia', coa_3_2, cc_adm, bank_bb, '2026-03'),
  (cp24, co1, 'Pro-labore Carlos — Mar/26',    '111.222.333-44', 18000.00, 18000.00, '2026-03-05', '2026-03-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-03'),
  (cp25, co1, 'Pro-labore Fernanda — Mar/26',  '222.333.444-55', 15000.00, 15000.00, '2026-03-05', '2026-03-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-03'),
  (cp26, co1, 'Paulista Imoveis — Aluguel Mar', '20.222.333/0001-44', 8500.00, 8500.00, '2026-03-10', '2026-03-09', 'pago', 'boleto', coa_3_1, cc_adm, bank_bb, '2026-03'),
  (cp27, co1, 'Amazon AWS — Mar/26',            '10.111.222/0001-33', 4800.00, 4800.00, '2026-03-15', '2026-03-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-03'),
  (cp28, co1, 'Google Cloud — Mar/26',           '40.444.555/0001-66', 2100.00, 2100.00, '2026-03-15', '2026-03-14', 'pago', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-03'),
  (cp29, co1, 'Fiscal Plus — Contabilidade Mar', '30.333.444/0001-55', 2200.00, 2200.00, '2026-03-20', '2026-03-19', 'pago', 'boleto', coa_4_2, cc_adm, bank_bb, '2026-03'),
  (cp30, co1, 'Google Ads — Mar/26',             NULL, 5000.00, 5000.00, '2026-03-20', '2026-03-19', 'pago', 'cartao_credito', coa_4_3, cc_mkt, bank_nu, '2026-03'),
  (cp31, co1, 'Impulso Digital — Gestao Redes', '60.666.777/0001-88', 2800.00,    NULL, '2026-03-25', NULL,         'vencido', 'pix', coa_4_3, cc_mkt, bank_nu, '2026-03'),
  (cp32, co1, 'ISS sobre NF — Mar/26',           NULL, 5200.00, 5200.00, '2026-03-20', '2026-03-20', 'pago', 'boleto', coa_2_1, cc_adm, bank_bb, '2026-03'),
  (cp33, co1, 'Energisa — Energia Mar/26',       '50.555.666/0001-77',   750.00,    NULL, '2026-03-28', NULL,         'vencido', 'boleto', coa_4_4, cc_adm, bank_bb, '2026-03'),

  -- ═══════════ ABRIL 2026 ═══════════
  (cp34, co1, 'Folha de Pagamento — Abr/26',  NULL, 65000.00, 65000.00, '2026-04-05', '2026-04-05', 'pago', 'transferencia', coa_3_2, cc_adm, bank_bb, '2026-04'),
  (cp35, co1, 'Pro-labore Carlos — Abr/26',    '111.222.333-44', 18000.00, 18000.00, '2026-04-05', '2026-04-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-04'),
  (cp36, co1, 'Pro-labore Fernanda — Abr/26',  '222.333.444-55', 15000.00, 15000.00, '2026-04-05', '2026-04-05', 'pago', 'transferencia', coa_3_8, cc_adm, bank_bb, '2026-04'),
  (cp37, co1, 'Paulista Imoveis — Aluguel Abr', '20.222.333/0001-44', 8500.00, 8500.00, '2026-04-10', '2026-04-09', 'pago', 'boleto', coa_3_1, cc_adm, bank_bb, '2026-04'),
  (cp38, co1, 'Amazon AWS — Abr/26',            '10.111.222/0001-33', 5100.00,    NULL, '2026-04-15', NULL,          'aberto', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-04'),
  (cp39, co1, 'Google Cloud — Abr/26',           '40.444.555/0001-66', 2200.00,    NULL, '2026-04-15', NULL,          'aberto', 'cartao_credito', coa_3_6, cc_dev, bank_nu, '2026-04'),
  (cp40, co1, 'Fiscal Plus — Contabilidade Abr', '30.333.444/0001-55', 2200.00,    NULL, '2026-04-20', NULL,          'aberto', 'boleto', coa_4_2, cc_adm, bank_bb, '2026-04'),
  (cp41, co1, 'Google Ads — Abr/26',             NULL, 4800.00,    NULL, '2026-04-20', NULL,          'aberto', 'cartao_credito', coa_4_3, cc_mkt, bank_nu, '2026-04'),
  (cp42, co1, 'ISS sobre NF — Abr/26',           NULL, 4500.00,    NULL, '2026-04-20', NULL,          'aberto', 'boleto', coa_2_1, cc_adm, bank_bb, '2026-04'),
  (cp43, co1, 'Energisa — Energia Abr/26',       '50.555.666/0001-77',   700.00,    NULL, '2026-04-28', NULL,          'aberto', 'boleto', coa_4_4, cc_adm, bank_bb, '2026-04'),
  -- Maio preview
  (cp44, co1, 'Paulista Imoveis — Aluguel Mai', '20.222.333/0001-44', 8500.00,    NULL, '2026-05-10', NULL,          'aberto', 'boleto', coa_3_1, cc_adm, bank_bb, '2026-05'),
  (cp45, co1, 'Folha de Pagamento — Mai/26',    NULL, 65000.00,    NULL, '2026-05-05', NULL,          'aberto', 'transferencia', coa_3_2, cc_adm, bank_bb, '2026-05');

  -- Contas Pagar — Company 2 (15 entries)
  INSERT INTO contas_pagar (company_id, credor_nome, credor_cpf_cnpj, valor, valor_pago,
    data_vencimento, data_pagamento, status, forma_pagamento, conta_contabil_id, conta_bancaria_id, competencia) VALUES
  (co2, 'Aluguel Loja — Jan/26',     NULL, 6500.00, 6500.00, '2026-01-10', '2026-01-09', 'pago',   'boleto',        coa2_4_1, bank2_nu, '2026-01'),
  (co2, 'Folha — Jan/26',            NULL, 12000.00,12000.00,'2026-01-05', '2026-01-05', 'pago',   'transferencia', coa2_3_2, bank2_nu, '2026-01'),
  (co2, 'Google Ads — Jan/26',       NULL, 1500.00, 1500.00, '2026-01-20', '2026-01-19', 'pago',   'cartao_credito',coa2_4_3, bank2_nu, '2026-01'),
  (co2, 'Aluguel Loja — Fev/26',     NULL, 6500.00, 6500.00, '2026-02-10', '2026-02-09', 'pago',   'boleto',        coa2_4_1, bank2_nu, '2026-02'),
  (co2, 'Folha — Fev/26',            NULL, 12000.00,12000.00,'2026-02-05', '2026-02-05', 'pago',   'transferencia', coa2_3_2, bank2_nu, '2026-02'),
  (co2, 'Instagram Ads — Fev/26',    NULL, 1200.00, 1200.00, '2026-02-20', '2026-02-19', 'pago',   'cartao_credito',coa2_4_3, bank2_nu, '2026-02'),
  (co2, 'Aluguel Loja — Mar/26',     NULL, 6500.00, 6500.00, '2026-03-10', '2026-03-09', 'pago',   'boleto',        coa2_4_1, bank2_nu, '2026-03'),
  (co2, 'Folha — Mar/26',            NULL, 12000.00,12000.00,'2026-03-05', '2026-03-05', 'pago',   'transferencia', coa2_3_2, bank2_nu, '2026-03'),
  (co2, 'Google Ads — Mar/26',       NULL, 1800.00, 1800.00, '2026-03-20', '2026-03-19', 'pago',   'cartao_credito',coa2_4_3, bank2_nu, '2026-03'),
  (co2, 'Aluguel Loja — Abr/26',     NULL, 6500.00, 6500.00, '2026-04-10', '2026-04-09', 'pago',   'boleto',        coa2_4_1, bank2_nu, '2026-04'),
  (co2, 'Folha — Abr/26',            NULL, 12000.00,12000.00,'2026-04-05', '2026-04-05', 'pago',   'transferencia', coa2_3_2, bank2_nu, '2026-04'),
  (co2, 'Instagram Ads — Abr/26',    NULL, 1500.00,    NULL, '2026-04-20', NULL,          'aberto', 'cartao_credito',coa2_4_3, bank2_nu, '2026-04'),
  (co2, 'Aluguel Loja — Mai/26',     NULL, 6500.00,    NULL, '2026-05-10', NULL,          'aberto', 'boleto',        coa2_4_1, bank2_nu, '2026-05'),
  (co2, 'Folha — Mai/26',            NULL, 12000.00,   NULL, '2026-05-05', NULL,          'aberto', 'transferencia', coa2_3_2, bank2_nu, '2026-05'),
  (co2, 'Google Ads — Mai/26',       NULL, 1800.00,    NULL, '2026-05-20', NULL,          'aberto', 'cartao_credito',coa2_4_3, bank2_nu, '2026-05');

  -- ============================================================
  -- 13. MOVIMENTACOES — Company 1
  -- One per paid CR (credito) and paid CP (debito)
  -- ============================================================

  -- CREDITOS from paid contas_receber
  INSERT INTO movimentacoes (company_id, conta_bancaria_id, conta_contabil_id, centro_custo_id,
    conta_receber_id, tipo, valor, data, descricao, origem) VALUES
  -- Jan
  (co1, bank_bb, coa_1_1, cc_com, cr1,  'credito', 15000.00, '2026-01-08', 'Recebimento Acme Tech — ERP fase 1',          'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr2,  'credito',  7500.00, '2026-01-14', 'Recebimento Horizonte — Consultoria',          'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr3,  'credito',  8333.33, '2026-01-20', 'Recebimento Hosp Sao Lucas — parcela 1/3',     'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_sup, cr6,  'credito',  5000.00, '2026-01-23', 'Recebimento Rapida Express — Suporte jan',     'conta_receber'),
  (co1, bank_nu, coa_1_1, cc_sup, cr7,  'credito',  2500.00, '2026-01-24', 'Recebimento Conecta Educacao — cartao',        'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_dev, cr8,  'credito',  4000.00, '2026-01-26', 'Recebimento Marcos Silva — dev mobile',        'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr9,  'credito',  3500.00, '2026-01-29', 'Recebimento Vida e Saude — SaaS',              'conta_receber'),
  -- Feb
  (co1, bank_nu, coa_1_2, cc_com, cr10, 'credito',  5200.00, '2026-02-04', 'Recebimento Sabor Rest — notebook 1/2',        'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr4,  'credito',  8333.33, '2026-02-19', 'Recebimento Hosp Sao Lucas — parcela 2/3',     'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr12, 'credito', 12000.00, '2026-02-06', 'Recebimento Acme Tech — consultoria fev',      'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_dev, cr13, 'credito', 18000.00, '2026-02-11', 'Recebimento Horizonte — sistema logistica',    'conta_receber'),
  (co1, bank_nu, coa_1_1, cc_com, cr14, 'credito',  7990.00, '2026-02-16', 'Recebimento Hosp Sao Lucas — SaaS fev',        'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_sup, cr15, 'credito',  9500.00, '2026-02-18', 'Recebimento Rapida Express — suporte fev',     'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_sup, cr16, 'credito',  2500.00, '2026-02-21', 'Recebimento Conecta Educacao — suporte fev',   'conta_receber'),
  (co1, bank_nu, coa_1_2, cc_com, cr17, 'credito',  2600.00, '2026-02-24', 'Recebimento Marcos Silva — notebook 1/2',      'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr19, 'credito',  1499.00, '2026-02-25', 'Recebimento Vida e Saude — SaaS fev',          'conta_receber'),
  -- Mar
  (co1, bank_nu, coa_1_2, cc_com, cr11, 'credito',  5200.00, '2026-03-04', 'Recebimento Sabor Rest — notebook 2/2',        'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_dev, cr20, 'credito',  6000.00, '2026-03-04', 'Recebimento Sabor Rest — modulo financeiro',   'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr21, 'credito', 20000.00, '2026-03-07', 'Recebimento Acme Tech — ERP fase 2',           'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr22, 'credito',  8500.00, '2026-03-10', 'Recebimento Horizonte — arq cloud',            'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr23, 'credito',  7495.00, '2026-03-14', 'Recebimento Hosp Sao Lucas — SaaS 1/2',        'conta_receber'),
  (co1, bank_nu, coa_1_1, cc_sup, cr25, 'credito',  3200.00, '2026-03-16', 'Recebimento Rapida Express — treinamento',     'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr5,  'credito',  8333.34, '2026-03-20', 'Recebimento Hosp Sao Lucas — parcela 3/3',     'conta_receber'),
  -- Apr
  (co1, bank_bb, coa_1_1, cc_dev, cr27, 'credito',  4500.00, '2026-04-01', 'Recebimento Sabor Rest — modulo RH',           'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_com, cr28, 'credito', 15000.00, '2026-04-04', 'Recebimento Acme Tech — consultoria abr',      'conta_receber'),
  (co1, bank_bb, coa_1_1, cc_sup, cr31, 'credito',  6400.00, '2026-04-10', 'Recebimento Rapida Express — suporte abr',     'conta_receber');

  -- DEBITOS from paid contas_pagar (Company 1)
  INSERT INTO movimentacoes (company_id, conta_bancaria_id, conta_contabil_id, centro_custo_id,
    conta_pagar_id, tipo, valor, data, descricao, origem) VALUES
  -- Jan
  (co1, bank_bb, coa_3_2, cc_adm, cp1,  'debito', 65000.00, '2026-01-05', 'Folha de Pagamento — Jan/26',           'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp2,  'debito', 18000.00, '2026-01-05', 'Pro-labore Carlos — Jan/26',            'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp3,  'debito', 15000.00, '2026-01-05', 'Pro-labore Fernanda — Jan/26',          'conta_pagar'),
  (co1, bank_bb, coa_3_1, cc_adm, cp4,  'debito',  8500.00, '2026-01-09', 'Aluguel escritorio — Jan/26',           'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp5,  'debito',  4200.00, '2026-01-14', 'Amazon AWS — Jan/26',                   'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp6,  'debito',  1800.00, '2026-01-14', 'Google Cloud — Jan/26',                 'conta_pagar'),
  (co1, bank_bb, coa_4_2, cc_adm, cp7,  'debito',  2200.00, '2026-01-19', 'Contabilidade Fiscal Plus — Jan/26',    'conta_pagar'),
  (co1, bank_nu, coa_4_3, cc_mkt, cp8,  'debito',  3500.00, '2026-01-19', 'Google Ads — Jan/26',                   'conta_pagar'),
  (co1, bank_nu, coa_4_3, cc_mkt, cp9,  'debito',  2800.00, '2026-01-24', 'Impulso Digital — Redes Jan/26',        'conta_pagar'),
  (co1, bank_bb, coa_2_1, cc_adm, cp10, 'debito',  3800.00, '2026-01-20', 'ISS sobre NF — Jan/26',                 'conta_pagar'),
  (co1, bank_bb, coa_4_4, cc_adm, cp11, 'debito',   680.00, '2026-01-27', 'Energisa — Jan/26',                     'conta_pagar'),
  -- Feb
  (co1, bank_bb, coa_3_2, cc_adm, cp12, 'debito', 65000.00, '2026-02-05', 'Folha de Pagamento — Fev/26',           'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp13, 'debito', 18000.00, '2026-02-05', 'Pro-labore Carlos — Fev/26',            'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp14, 'debito', 15000.00, '2026-02-05', 'Pro-labore Fernanda — Fev/26',          'conta_pagar'),
  (co1, bank_bb, coa_3_1, cc_adm, cp15, 'debito',  8500.00, '2026-02-09', 'Aluguel escritorio — Fev/26',           'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp16, 'debito',  4500.00, '2026-02-14', 'Amazon AWS — Fev/26',                   'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp17, 'debito',  1900.00, '2026-02-14', 'Google Cloud — Fev/26',                 'conta_pagar'),
  (co1, bank_bb, coa_4_2, cc_adm, cp18, 'debito',  2200.00, '2026-02-19', 'Contabilidade Fiscal Plus — Fev/26',    'conta_pagar'),
  (co1, bank_nu, coa_4_3, cc_mkt, cp19, 'debito',  4200.00, '2026-02-19', 'Google Ads — Fev/26',                   'conta_pagar'),
  (co1, bank_nu, coa_4_3, cc_mkt, cp20, 'debito',  2800.00, '2026-02-24', 'Impulso Digital — Redes Fev/26',        'conta_pagar'),
  (co1, bank_bb, coa_2_1, cc_adm, cp21, 'debito',  4100.00, '2026-02-20', 'ISS sobre NF — Fev/26',                 'conta_pagar'),
  (co1, bank_bb, coa_4_4, cc_adm, cp22, 'debito',   720.00, '2026-02-27', 'Energisa — Fev/26',                     'conta_pagar'),
  -- Mar
  (co1, bank_bb, coa_3_2, cc_adm, cp23, 'debito', 65000.00, '2026-03-05', 'Folha de Pagamento — Mar/26',           'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp24, 'debito', 18000.00, '2026-03-05', 'Pro-labore Carlos — Mar/26',            'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp25, 'debito', 15000.00, '2026-03-05', 'Pro-labore Fernanda — Mar/26',          'conta_pagar'),
  (co1, bank_bb, coa_3_1, cc_adm, cp26, 'debito',  8500.00, '2026-03-09', 'Aluguel escritorio — Mar/26',           'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp27, 'debito',  4800.00, '2026-03-14', 'Amazon AWS — Mar/26',                   'conta_pagar'),
  (co1, bank_nu, coa_3_6, cc_dev, cp28, 'debito',  2100.00, '2026-03-14', 'Google Cloud — Mar/26',                 'conta_pagar'),
  (co1, bank_bb, coa_4_2, cc_adm, cp29, 'debito',  2200.00, '2026-03-19', 'Contabilidade Fiscal Plus — Mar/26',    'conta_pagar'),
  (co1, bank_nu, coa_4_3, cc_mkt, cp30, 'debito',  5000.00, '2026-03-19', 'Google Ads — Mar/26',                   'conta_pagar'),
  (co1, bank_bb, coa_2_1, cc_adm, cp32, 'debito',  5200.00, '2026-03-20', 'ISS sobre NF — Mar/26',                 'conta_pagar'),
  -- Apr
  (co1, bank_bb, coa_3_2, cc_adm, cp34, 'debito', 65000.00, '2026-04-05', 'Folha de Pagamento — Abr/26',           'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp35, 'debito', 18000.00, '2026-04-05', 'Pro-labore Carlos — Abr/26',            'conta_pagar'),
  (co1, bank_bb, coa_3_8, cc_adm, cp36, 'debito', 15000.00, '2026-04-05', 'Pro-labore Fernanda — Abr/26',          'conta_pagar'),
  (co1, bank_bb, coa_3_1, cc_adm, cp37, 'debito',  8500.00, '2026-04-09', 'Aluguel escritorio — Abr/26',           'conta_pagar');

  -- Movimentacoes — Company 2 (paid entries only)
  INSERT INTO movimentacoes (company_id, conta_bancaria_id, conta_contabil_id, tipo, valor, data, descricao, origem) VALUES
  (co2, bank2_nu, coa2_1_1, 'credito', 1333.00,  '2026-01-14', 'Recebimento Joao Pedro — Samsung 1/3',  'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito', 6400.00,  '2026-01-24', 'Recebimento Escritorio Central — notebooks', 'conta_receber'),
  (co2, bank2_nu, coa2_4_1, 'debito',  6500.00,  '2026-01-09', 'Aluguel Loja — Jan/26',                 'conta_pagar'),
  (co2, bank2_nu, coa2_3_2, 'debito',  12000.00, '2026-01-05', 'Folha — Jan/26',                        'conta_pagar'),
  (co2, bank2_nu, coa2_4_3, 'debito',  1500.00,  '2026-01-19', 'Google Ads — Jan/26',                   'conta_pagar'),
  (co2, bank2_nu, coa2_1_1, 'credito', 1333.00,  '2026-02-14', 'Recebimento Joao Pedro — Samsung 2/3',  'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito',  249.00,  '2026-02-08', 'Recebimento Maria — fone JBL',          'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito',  899.00,  '2026-02-18', 'Recebimento Joao Pedro — smartwatch',   'conta_receber'),
  (co2, bank2_nu, coa2_4_1, 'debito',  6500.00,  '2026-02-09', 'Aluguel Loja — Fev/26',                 'conta_pagar'),
  (co2, bank2_nu, coa2_3_2, 'debito',  12000.00, '2026-02-05', 'Folha — Fev/26',                        'conta_pagar'),
  (co2, bank2_nu, coa2_4_3, 'debito',  1200.00,  '2026-02-19', 'Instagram Ads — Fev/26',                'conta_pagar'),
  (co2, bank2_nu, coa2_1_1, 'credito', 4500.00,  '2026-03-01', 'Recebimento Escritorio Central — iPad', 'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito', 1600.00,  '2026-03-09', 'Recebimento Maria — notebook 1/2',      'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito',  249.00,  '2026-03-18', 'Recebimento Joao Pedro — fone JBL',     'conta_receber'),
  (co2, bank2_nu, coa2_1_1, 'credito', 7998.00,  '2026-03-26', 'Recebimento Escritorio Central — 2x Samsung', 'conta_receber'),
  (co2, bank2_nu, coa2_4_1, 'debito',  6500.00,  '2026-03-09', 'Aluguel Loja — Mar/26',                 'conta_pagar'),
  (co2, bank2_nu, coa2_3_2, 'debito',  12000.00, '2026-03-05', 'Folha — Mar/26',                        'conta_pagar'),
  (co2, bank2_nu, coa2_4_3, 'debito',  1800.00,  '2026-03-19', 'Google Ads — Mar/26',                   'conta_pagar'),
  (co2, bank2_nu, coa2_4_1, 'debito',  6500.00,  '2026-04-09', 'Aluguel Loja — Abr/26',                 'conta_pagar'),
  (co2, bank2_nu, coa2_3_2, 'debito',  12000.00, '2026-04-05', 'Folha — Abr/26',                        'conta_pagar');

  -- ============================================================
  -- 14. CONTRATOS RECORRENTES — Company 1
  -- ============================================================
  ct1 := gen_random_uuid(); ct2 := gen_random_uuid(); ct3 := gen_random_uuid();
  ct4 := gen_random_uuid(); ct5 := gen_random_uuid();

  INSERT INTO contratos_recorrentes (id, company_id, tipo, descricao, contraparte_nome, contraparte_cpf_cnpj,
    valor, periodicidade, data_inicio, proximo_vencimento, conta_contabil_id, centro_custo_id, status) VALUES
  (ct1, co1, 'pagar',   'Aluguel escritorio Av. Paulista',         'Paulista Imoveis',   '20.222.333/0001-44', 8500.00,  'mensal', '2024-01-01', '2026-05-10', coa_3_1, cc_adm, 'ativo'),
  (ct2, co1, 'pagar',   'Licenca AWS — infraestrutura cloud',      'Amazon AWS',         '10.111.222/0001-33', 4500.00,  'mensal', '2023-06-01', '2026-05-15', coa_3_6, cc_dev, 'ativo'),
  (ct3, co1, 'pagar',   'Contabilidade mensal — Fiscal Plus',      'Fiscal Plus',        '30.333.444/0001-55', 2200.00,  'mensal', '2022-01-01', '2026-05-20', coa_4_2, cc_adm, 'ativo'),
  (ct4, co1, 'receber', 'SaaS Enterprise — Hospital Sao Lucas',    'Hospital Sao Lucas', '33.444.555/0001-66', 7990.00,  'mensal', '2025-09-01', '2026-05-12', coa_1_1, cc_com, 'ativo'),
  (ct5, co1, 'receber', 'Suporte Tecnico Mensal — Conecta Educacao','Conecta Educacao',  '55.666.777/0001-88', 2500.00,  'mensal', '2025-06-01', '2026-05-18', coa_1_1, cc_sup, 'ativo');

  -- ============================================================
  -- 15. CONFIGURACAO TAXAS PAGAMENTO — Company 1 (bank_bb)
  -- ============================================================
  INSERT INTO configuracao_taxas_pagamento (company_id, bank_account_id, meio_pagamento,
    taxa_percentual, max_parcelas, dias_recebimento, antecipacao_ativa, taxa_antecipacao, ativo) VALUES
  (co1, bank_bb, 'cartao_credito', 4.990, 12, 30, true,  2.990, true),
  (co1, bank_bb, 'cartao_debito',  2.490,  1,  1, false, 0.000, true),
  (co1, bank_bb, 'boleto',         1.500,  1,  2, false, 0.000, true),
  (co1, bank_bb, 'pix',            0.000,  1,  0, false, 0.000, true);

  -- Also for Nubank
  INSERT INTO configuracao_taxas_pagamento (company_id, bank_account_id, meio_pagamento,
    taxa_percentual, max_parcelas, dias_recebimento, antecipacao_ativa, taxa_antecipacao, ativo) VALUES
  (co1, bank_nu, 'cartao_credito', 3.990, 12, 30, true,  1.990, true),
  (co1, bank_nu, 'cartao_debito',  1.990,  1,  1, false, 0.000, true),
  (co1, bank_nu, 'pix',            0.000,  1,  0, false, 0.000, true);

  RAISE NOTICE 'Seed demo completo executado com sucesso! co1=%, co2=%', co1, co2;
END;
$$;
