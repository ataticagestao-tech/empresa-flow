DO $$
DECLARE
  demo_uid UUID;
  co1 UUID;
  co2 UUID;
  -- chart_of_accounts (para accounts_receivable/payable/transactions)
  coa_rec UUID;
  coa_rec_vendas UUID;
  coa_rec_servicos UUID;
  coa_rec_projetos UUID;
  coa_rec_comissoes UUID;
  coa_desp UUID;
  coa_desp_adm UUID;
  coa_aluguel UUID;
  coa_energia UUID;
  coa_internet UUID;
  coa_desp_pessoal UUID;
  coa_salarios UUID;
  coa_desp_mkt UUID;
  coa_marketing UUID;
  coa_desp_imp UUID;
  coa_impostos UUID;
  coa_desp_terc UUID;
  coa_fornecedores UUID;
  coa_cloud UUID;
  -- bank accounts
  bank_bb UUID;
  bank_nu UUID;
  bank_cx UUID;
  -- clients
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID; c6 UUID; c7 UUID; c8 UUID;
  -- suppliers
  s1 UUID; s2 UUID; s3 UUID; s4 UUID; s5 UUID; s6 UUID;
BEGIN
  SELECT id INTO demo_uid FROM auth.users WHERE email = 'demo@taticagestao.com.br' LIMIT 1;
  IF demo_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario demo@taticagestao.com.br nao encontrado.';
  END IF;

  co1 := gen_random_uuid();
  co2 := gen_random_uuid();

  -- EMPRESAS
  INSERT INTO companies (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal, cnae, email, telefone, celular, contato_nome, site, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, endereco_complemento, natureza_juridica, regime_tributario, dados_bancarios_banco, dados_bancarios_agencia, dados_bancarios_conta, dados_bancarios_pix, dados_bancarios_titular_cpf_cnpj, dados_bancarios_titular_nome, is_active)
  VALUES (co1, 'NOVA TECH SOLUCOES DIGITAIS LTDA', 'Nova Tech Digital', '12.345.678/0001-90', '123.456.789.012', '12345678', '6201-5/00', 'contato@novatech.com.br', '(11) 3456-7890', '(11) 99876-5432', 'Carlos Mendes', 'www.novatech.com.br', '01310-100', 'Av. Paulista', '1578', 'Bela Vista', 'Sao Paulo', 'SP', 'Sala 1201', 'Sociedade Empresaria Limitada', 'Lucro Presumido', 'Banco do Brasil', '1234-5', '56789-0', 'contato@novatech.com.br', '12.345.678/0001-90', 'NOVA TECH SOLUCOES DIGITAIS LTDA', true);

  INSERT INTO companies (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, cnae, email, telefone, celular, contato_nome, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, natureza_juridica, regime_tributario, is_active)
  VALUES (co2, 'TECH STORE COMERCIO DE ELETRONICOS LTDA', 'Tech Store', '98.765.432/0001-10', '987.654.321.098', '4751-2/01', 'vendas@techstore.com.br', '(11) 2345-6789', '(11) 98765-4321', 'Ana Paula Costa', '04543-011', 'Rua Funchal', '411', 'Vila Olimpia', 'Sao Paulo', 'SP', 'Sociedade Empresaria Limitada', 'Simples Nacional', true);

  INSERT INTO user_companies (user_id, company_id, is_default) VALUES (demo_uid, co1, true), (demo_uid, co2, false);

  -- CATEGORIES (tabela categories - para listagem)
  INSERT INTO categories (company_id, name, type, code, description, is_active) VALUES
    (co1, 'Vendas de Software', 'income', 'REC-001', 'Licencas e assinaturas', true),
    (co1, 'Servicos de Consultoria', 'income', 'REC-002', 'Consultoria e implantacao', true),
    (co1, 'Projetos Sob Demanda', 'income', 'REC-003', 'Projetos customizados', true),
    (co1, 'Comissoes de Vendas', 'income', 'REC-004', 'Comissoes de parceiros', true),
    (co1, 'Folha de Pagamento', 'expense', 'DES-001', 'Salarios e encargos', true),
    (co1, 'Aluguel e Condominio', 'expense', 'DES-002', 'Escritorio', true),
    (co1, 'Marketing Digital', 'expense', 'DES-003', 'Ads e SEO', true),
    (co1, 'Impostos e Taxas', 'expense', 'DES-004', 'ISS, PIS, COFINS', true),
    (co1, 'Servicos de Terceiros', 'expense', 'DES-005', 'Freelancers', true),
    (co1, 'Infraestrutura e Cloud', 'expense', 'DES-006', 'AWS, Azure', true),
    (co1, 'Telecomunicacoes', 'expense', 'DES-007', 'Internet e telefone', true),
    (co1, 'Utilidades', 'expense', 'DES-008', 'Energia, agua', true);

  INSERT INTO categories (company_id, name, type, code, is_active) VALUES
    (co2, 'Vendas de Produtos', 'income', 'REC-001', true),
    (co2, 'Assistencia Tecnica', 'income', 'REC-002', true),
    (co2, 'Compra de Mercadorias', 'expense', 'DES-001', true),
    (co2, 'Folha de Pagamento', 'expense', 'DES-002', true),
    (co2, 'Aluguel Loja', 'expense', 'DES-003', true),
    (co2, 'Marketing e Publicidade', 'expense', 'DES-004', true);

  -- CHART OF ACCOUNTS (para vincular em accounts_receivable/payable/transactions)
  coa_rec := gen_random_uuid();
  coa_rec_vendas := gen_random_uuid();
  coa_rec_servicos := gen_random_uuid();
  coa_rec_projetos := gen_random_uuid();
  coa_rec_comissoes := gen_random_uuid();
  coa_desp := gen_random_uuid();
  coa_desp_adm := gen_random_uuid();
  coa_aluguel := gen_random_uuid();
  coa_energia := gen_random_uuid();
  coa_internet := gen_random_uuid();
  coa_desp_pessoal := gen_random_uuid();
  coa_salarios := gen_random_uuid();
  coa_desp_mkt := gen_random_uuid();
  coa_marketing := gen_random_uuid();
  coa_desp_imp := gen_random_uuid();
  coa_impostos := gen_random_uuid();
  coa_desp_terc := gen_random_uuid();
  coa_fornecedores := gen_random_uuid();
  coa_cloud := gen_random_uuid();

  INSERT INTO chart_of_accounts (id, company_id, code, name, account_type, account_nature, level, is_analytical, is_synthetic, parent_id) VALUES
    (coa_rec, co1, '1', 'RECEITAS', 'revenue', 'credit', 1, false, true, NULL),
    (coa_rec_vendas, co1, '1.01', 'Receita de Vendas de Software', 'revenue', 'credit', 2, true, false, coa_rec),
    (coa_rec_servicos, co1, '1.02', 'Receita de Servicos', 'revenue', 'credit', 2, true, false, coa_rec),
    (coa_rec_projetos, co1, '1.03', 'Receita de Projetos', 'revenue', 'credit', 2, true, false, coa_rec),
    (coa_rec_comissoes, co1, '1.04', 'Comissoes de Parceiros', 'revenue', 'credit', 2, true, false, coa_rec),
    (coa_desp, co1, '2', 'DESPESAS', 'expense', 'debit', 1, false, true, NULL),
    (coa_desp_adm, co1, '2.01', 'Despesas Administrativas', 'expense', 'debit', 2, false, true, coa_desp),
    (coa_aluguel, co1, '2.01.01', 'Aluguel e Condominio', 'expense', 'debit', 3, true, false, coa_desp_adm),
    (coa_energia, co1, '2.01.02', 'Energia Eletrica', 'expense', 'debit', 3, true, false, coa_desp_adm),
    (coa_internet, co1, '2.01.03', 'Internet e Telefone', 'expense', 'debit', 3, true, false, coa_desp_adm),
    (coa_desp_pessoal, co1, '2.02', 'Despesas com Pessoal', 'expense', 'debit', 2, false, true, coa_desp),
    (coa_salarios, co1, '2.02.01', 'Salarios e Ordenados', 'expense', 'debit', 3, true, false, coa_desp_pessoal),
    (coa_desp_mkt, co1, '2.03', 'Marketing e Vendas', 'expense', 'debit', 2, false, true, coa_desp),
    (coa_marketing, co1, '2.03.01', 'Marketing Digital', 'expense', 'debit', 3, true, false, coa_desp_mkt),
    (coa_desp_imp, co1, '2.04', 'Impostos e Tributos', 'expense', 'debit', 2, false, true, coa_desp),
    (coa_impostos, co1, '2.04.01', 'ISS/PIS/COFINS/IRPJ', 'expense', 'debit', 3, true, false, coa_desp_imp),
    (coa_desp_terc, co1, '2.05', 'Servicos de Terceiros', 'expense', 'debit', 2, false, true, coa_desp),
    (coa_fornecedores, co1, '2.05.01', 'Freelancers e Terceirizados', 'expense', 'debit', 3, true, false, coa_desp_terc),
    (coa_cloud, co1, '2.05.02', 'Infraestrutura Cloud', 'expense', 'debit', 3, true, false, coa_desp_terc);

  -- CONTAS BANCARIAS
  bank_bb := gen_random_uuid(); bank_nu := gen_random_uuid(); bank_cx := gen_random_uuid();

  INSERT INTO bank_accounts (id, company_id, name, type, banco, agencia, conta, pix_key, pix_type, initial_balance, current_balance, is_active) VALUES
    (bank_bb, co1, 'Banco do Brasil - Conta Principal', 'checking', 'Banco do Brasil', '1234-5', '56789-0', 'contato@novatech.com.br', 'email', 45000.00, 78543.27, true),
    (bank_nu, co1, 'Nubank - Reserva', 'checking', 'Nu Pagamentos', NULL, NULL, '12345678000190', 'cnpj', 20000.00, 32150.80, true),
    (bank_cx, co1, 'Caixa - Aplicacao', 'savings', 'Caixa Economica Federal', '0876', '13579-2', NULL, NULL, 100000.00, 115420.00, true);

  INSERT INTO bank_accounts (company_id, name, type, banco, agencia, conta, initial_balance, current_balance, is_active) VALUES
    (co2, 'Itau - Conta Principal', 'checking', 'Itau Unibanco', '5678', '12345-6', 30000.00, 47820.50, true);

  -- CLIENTES EMPRESA 1
  c1:=gen_random_uuid(); c2:=gen_random_uuid(); c3:=gen_random_uuid(); c4:=gen_random_uuid();
  c5:=gen_random_uuid(); c6:=gen_random_uuid(); c7:=gen_random_uuid(); c8:=gen_random_uuid();

  INSERT INTO clients (id, company_id, razao_social, nome_fantasia, tipo_pessoa, cpf_cnpj, email, telefone, celular, contato_nome, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado, is_active) VALUES
    (c1, co1, 'GRUPO ALPHA PARTICIPACOES S.A.', 'Grupo Alpha', 'PJ', '11.222.333/0001-44', 'financeiro@grupoalpha.com.br', '(11) 3100-2000', '(11) 99100-2000', 'Roberto Silva', '01310-100', 'Av. Paulista', '900', 'Bela Vista', 'Sao Paulo', 'SP', true),
    (c2, co1, 'BETA ENGENHARIA E CONSTRUCOES LTDA', 'Beta Engenharia', 'PJ', '22.333.444/0001-55', 'compras@betaeng.com.br', '(21) 3200-3000', '(21) 99200-3000', 'Fernanda Oliveira', '20040-020', 'Rua da Assembleia', '100', 'Centro', 'Rio de Janeiro', 'RJ', true),
    (c3, co1, 'GAMMA SAUDE E BEM ESTAR EIRELI', 'Clinica Gamma', 'PJ', '33.444.555/0001-66', 'admin@clinicagamma.com.br', '(11) 3300-4000', '(11) 99300-4000', 'Dr. Marcelo Souza', '04543-011', 'Rua Funchal', '200', 'Vila Olimpia', 'Sao Paulo', 'SP', true),
    (c4, co1, 'DELTA LOGISTICA E TRANSPORTES S.A.', 'Delta Log', 'PJ', '44.555.666/0001-77', 'ti@deltalog.com.br', '(19) 3400-5000', '(19) 99400-5000', 'Patricia Lima', '13015-904', 'Rua General Osorio', '500', 'Centro', 'Campinas', 'SP', true),
    (c5, co1, 'EPSILON EDUCACAO E TECNOLOGIA LTDA', 'Epsilon Edu', 'PJ', '55.666.777/0001-88', 'diretoria@epsilonedu.com.br', '(31) 3500-6000', '(31) 99500-6000', 'Lucas Pereira', '30130-000', 'Rua da Bahia', '1000', 'Centro', 'Belo Horizonte', 'MG', true),
    (c6, co1, 'ZETA COMERCIO VAREJISTA LTDA', 'Zeta Varejo', 'PJ', '66.777.888/0001-99', 'financeiro@zetavarejo.com.br', '(41) 3600-7000', '(41) 99600-7000', 'Amanda Santos', '80010-010', 'Rua XV de Novembro', '300', 'Centro', 'Curitiba', 'PR', true),
    (c7, co1, 'JOAO PEDRO ALMEIDA COSTA', 'Joao P. Costa', 'PF', '123.456.789-00', 'joaopedro@email.com', '(11) 3700-8000', '(11) 99700-8000', 'Joao Pedro', '01414-001', 'Rua Augusta', '1500', 'Consolacao', 'Sao Paulo', 'SP', true),
    (c8, co1, 'MARIA FERNANDA RODRIGUES ME', 'MF Consultoria', 'PJ', '77.888.999/0001-00', 'contato@mfconsultoria.com.br', '(51) 3800-9000', '(51) 99800-9000', 'Maria Fernanda', '90010-280', 'Rua dos Andradas', '800', 'Centro Historico', 'Porto Alegre', 'RS', true);

  -- CLIENTES EMPRESA 2
  INSERT INTO clients (company_id, razao_social, nome_fantasia, tipo_pessoa, cpf_cnpj, email, telefone, is_active) VALUES
    (co2, 'CARLOS EDUARDO MARTINS', 'Carlos E. Martins', 'PF', '987.654.321-00', 'carlos@email.com', '(11) 99111-2222', true),
    (co2, 'ESCRITORIO MODERNO LTDA', 'Escritorio Moderno', 'PJ', '88.999.000/0001-11', 'compras@escritoriomoderno.com.br', '(11) 3999-0000', true),
    (co2, 'ESCOLA FUTURO BRILHANTE LTDA', 'Escola Futuro', 'PJ', '99.000.111/0001-22', 'ti@escolafuturo.com.br', '(11) 3888-0000', true);

  -- FORNECEDORES
  s1:=gen_random_uuid(); s2:=gen_random_uuid(); s3:=gen_random_uuid();
  s4:=gen_random_uuid(); s5:=gen_random_uuid(); s6:=gen_random_uuid();

  INSERT INTO suppliers (id, company_id, razao_social, nome_fantasia, tipo_pessoa, cpf_cnpj, email, telefone, contato_nome, is_active) VALUES
    (s1, co1, 'AMAZON WEB SERVICES INC', 'AWS', 'PJ', '23.412.247/0001-00', 'vendas@aws.com', '(11) 4020-1000', 'Suporte AWS', true),
    (s2, co1, 'GOOGLE CLOUD BRASIL LTDA', 'Google Cloud', 'PJ', '33.456.789/0001-00', 'vendas@google.com', '(11) 4020-2000', 'Suporte GCP', true),
    (s3, co1, 'ALGAR TELECOM S.A.', 'Algar Telecom', 'PJ', '71.208.516/0001-74', 'empresarial@algartelecom.com.br', '(34) 3256-1000', 'Central Empresarial', true),
    (s4, co1, 'CRIATIVA MARKETING DIGITAL LTDA', 'Criativa Mkt', 'PJ', '44.567.890/0001-11', 'orcamento@criativamkt.com.br', '(11) 3456-0100', 'Julia Torres', true),
    (s5, co1, 'NEXO CONTABILIDADE E ASSESSORIA S/S', 'Nexo Contabilidade', 'PJ', '55.678.901/0001-22', 'contato@nexocontabil.com.br', '(11) 3567-0200', 'Contador Marcos', true),
    (s6, co1, 'IMOBILIARIA CENTRO EMPRESARIAL LTDA', 'ICE Imoveis', 'PJ', '66.789.012/0001-33', 'comercial@iceimoveis.com.br', '(11) 3678-0300', 'Gerente Paulo', true);

  -- CONTAS A RECEBER (category_id -> chart_of_accounts)
  INSERT INTO accounts_receivable (company_id, description, amount, due_date, receive_date, status, payment_method, client_id, category_id) VALUES
    (co1, 'Licenca SaaS - Plano Enterprise - Grupo Alpha', 15800.00, '2026-01-10', '2026-01-10', 'paid', 'pix', c1, coa_rec_vendas),
    (co1, 'Consultoria de Implantacao - Sprint 1 - Beta Eng', 28500.00, '2026-01-15', '2026-01-14', 'paid', 'transferencia', c2, coa_rec_servicos),
    (co1, 'Licenca SaaS - Plano Pro - Clinica Gamma', 4200.00, '2026-01-20', '2026-01-20', 'paid', 'boleto', c3, coa_rec_vendas),
    (co1, 'Projeto Customizado - Fase 1 - Delta Log', 42000.00, '2026-01-25', '2026-01-27', 'paid', 'transferencia', c4, coa_rec_projetos),
    (co1, 'Licenca SaaS - Plano Enterprise - Grupo Alpha', 15800.00, '2026-02-10', '2026-02-10', 'paid', 'pix', c1, coa_rec_vendas),
    (co1, 'Consultoria de Implantacao - Sprint 2 - Beta Eng', 28500.00, '2026-02-15', '2026-02-15', 'paid', 'transferencia', c2, coa_rec_servicos),
    (co1, 'Licenca SaaS - Plano Pro - Clinica Gamma', 4200.00, '2026-02-20', '2026-02-20', 'paid', 'boleto', c3, coa_rec_vendas),
    (co1, 'Plataforma E-learning - Epsilon Edu', 18900.00, '2026-02-28', '2026-02-28', 'paid', 'transferencia', c5, coa_rec_projetos),
    (co1, 'Integracao ERP - Zeta Varejo', 12600.00, '2026-02-28', '2026-03-02', 'paid', 'pix', c6, coa_rec_servicos),
    (co1, 'Licenca SaaS - Plano Enterprise - Grupo Alpha', 15800.00, '2026-03-10', '2026-03-10', 'paid', 'pix', c1, coa_rec_vendas),
    (co1, 'Consultoria de Implantacao - Sprint 3 - Beta Eng', 28500.00, '2026-03-15', '2026-03-15', 'paid', 'transferencia', c2, coa_rec_servicos),
    (co1, 'Licenca SaaS - Plano Pro - Clinica Gamma', 4200.00, '2026-03-20', '2026-03-20', 'paid', 'boleto', c3, coa_rec_vendas),
    (co1, 'Projeto Customizado - Fase 2 - Delta Log', 42000.00, '2026-03-25', '2026-03-25', 'paid', 'transferencia', c4, coa_rec_projetos),
    (co1, 'Comissao Parceiro - MF Consultoria', 3500.00, '2026-03-28', '2026-03-28', 'paid', 'pix', c8, coa_rec_comissoes),
    (co1, 'Licenca SaaS - Plano Enterprise - Grupo Alpha', 15800.00, '2026-04-10', NULL, 'pending', NULL, c1, coa_rec_vendas),
    (co1, 'Consultoria de Implantacao - Sprint 4 - Beta Eng', 28500.00, '2026-04-15', NULL, 'pending', NULL, c2, coa_rec_servicos),
    (co1, 'Licenca SaaS - Plano Pro - Clinica Gamma', 4200.00, '2026-04-20', NULL, 'pending', NULL, c3, coa_rec_vendas),
    (co1, 'Licenca SaaS - Plano Starter - Joao P. Costa', 1200.00, '2026-04-20', NULL, 'pending', NULL, c7, coa_rec_vendas),
    (co1, 'Plataforma E-learning - Fase 2 - Epsilon Edu', 22500.00, '2026-04-30', NULL, 'pending', NULL, c5, coa_rec_projetos),
    (co1, 'Licenca SaaS - Plano Enterprise - Grupo Alpha', 15800.00, '2026-05-10', NULL, 'pending', NULL, c1, coa_rec_vendas),
    (co1, 'Consultoria de Implantacao - Sprint 5 - Beta Eng', 28500.00, '2026-05-15', NULL, 'pending', NULL, c2, coa_rec_servicos),
    (co1, 'Manutencao Anual - Zeta Varejo', 8400.00, '2026-05-20', NULL, 'pending', NULL, c6, coa_rec_servicos),
    (co1, 'Projeto Mobile - Parcela 3 - Joao P. Costa', 5600.00, '2026-03-05', NULL, 'overdue', NULL, c7, coa_rec_projetos),
    (co1, 'Suporte Tecnico Premium - MF Consultoria', 2800.00, '2026-03-10', NULL, 'overdue', NULL, c8, coa_rec_servicos);

  -- CONTAS A PAGAR (category_id -> chart_of_accounts)
  INSERT INTO accounts_payable (company_id, description, amount, due_date, payment_date, status, payment_method, supplier_id, category_id) VALUES
    (co1, 'AWS - Servicos Cloud - Janeiro', 4850.00, '2026-01-05', '2026-01-05', 'paid', 'cartao_credito', s1, coa_cloud),
    (co1, 'Folha de Pagamento - Janeiro', 48500.00, '2026-01-05', '2026-01-05', 'paid', 'transferencia', NULL, coa_salarios),
    (co1, 'Aluguel Escritorio - Janeiro', 8500.00, '2026-01-10', '2026-01-10', 'paid', 'boleto', s6, coa_aluguel),
    (co1, 'Google Ads - Campanha Janeiro', 6200.00, '2026-01-15', '2026-01-15', 'paid', 'cartao_credito', s4, coa_marketing),
    (co1, 'Internet Empresarial - Janeiro', 890.00, '2026-01-20', '2026-01-20', 'paid', 'debito_automatico', s3, coa_internet),
    (co1, 'Energia Eletrica - Janeiro', 1250.00, '2026-01-22', '2026-01-22', 'paid', 'boleto', NULL, coa_energia),
    (co1, 'Contabilidade - Honorarios Janeiro', 3200.00, '2026-01-25', '2026-01-25', 'paid', 'pix', s5, coa_fornecedores),
    (co1, 'ISS/PIS/COFINS - Janeiro', 8750.00, '2026-01-28', '2026-01-28', 'paid', 'boleto', NULL, coa_impostos),
    (co1, 'AWS - Servicos Cloud - Fevereiro', 5120.00, '2026-02-05', '2026-02-05', 'paid', 'cartao_credito', s1, coa_cloud),
    (co1, 'Folha de Pagamento - Fevereiro', 48500.00, '2026-02-05', '2026-02-05', 'paid', 'transferencia', NULL, coa_salarios),
    (co1, 'Aluguel Escritorio - Fevereiro', 8500.00, '2026-02-10', '2026-02-10', 'paid', 'boleto', s6, coa_aluguel),
    (co1, 'Meta Ads - Campanha Fevereiro', 4800.00, '2026-02-15', '2026-02-15', 'paid', 'cartao_credito', s4, coa_marketing),
    (co1, 'Internet Empresarial - Fevereiro', 890.00, '2026-02-20', '2026-02-20', 'paid', 'debito_automatico', s3, coa_internet),
    (co1, 'Energia Eletrica - Fevereiro', 1180.00, '2026-02-22', '2026-02-22', 'paid', 'boleto', NULL, coa_energia),
    (co1, 'Contabilidade - Honorarios Fevereiro', 3200.00, '2026-02-25', '2026-02-25', 'paid', 'pix', s5, coa_fornecedores),
    (co1, 'ISS/PIS/COFINS - Fevereiro', 7950.00, '2026-02-28', '2026-02-28', 'paid', 'boleto', NULL, coa_impostos),
    (co1, 'AWS - Servicos Cloud - Marco', 5380.00, '2026-03-05', '2026-03-05', 'paid', 'cartao_credito', s1, coa_cloud),
    (co1, 'Folha de Pagamento - Marco', 52300.00, '2026-03-05', '2026-03-05', 'paid', 'transferencia', NULL, coa_salarios),
    (co1, 'Aluguel Escritorio - Marco', 8500.00, '2026-03-10', '2026-03-10', 'paid', 'boleto', s6, coa_aluguel),
    (co1, 'Google Ads - Campanha Marco', 7500.00, '2026-03-15', '2026-03-15', 'paid', 'cartao_credito', s4, coa_marketing),
    (co1, 'Internet Empresarial - Marco', 890.00, '2026-03-20', '2026-03-20', 'paid', 'debito_automatico', s3, coa_internet),
    (co1, 'Energia Eletrica - Marco', 1320.00, '2026-03-22', '2026-03-22', 'paid', 'boleto', NULL, coa_energia),
    (co1, 'Contabilidade - Honorarios Marco', 3200.00, '2026-03-25', '2026-03-25', 'paid', 'pix', s5, coa_fornecedores),
    (co1, 'ISS/PIS/COFINS - Marco', 9200.00, '2026-03-28', '2026-03-28', 'paid', 'boleto', NULL, coa_impostos),
    (co1, 'AWS - Servicos Cloud - Abril', 5500.00, '2026-04-05', NULL, 'pending', NULL, s1, coa_cloud),
    (co1, 'Folha de Pagamento - Abril', 52300.00, '2026-04-05', NULL, 'pending', NULL, NULL, coa_salarios),
    (co1, 'Aluguel Escritorio - Abril', 8500.00, '2026-04-10', NULL, 'pending', NULL, s6, coa_aluguel),
    (co1, 'Google Ads - Campanha Abril', 8000.00, '2026-04-15', NULL, 'pending', NULL, s4, coa_marketing),
    (co1, 'Internet Empresarial - Abril', 890.00, '2026-04-20', NULL, 'pending', NULL, s3, coa_internet),
    (co1, 'Energia Eletrica - Abril', 1350.00, '2026-04-22', NULL, 'pending', NULL, NULL, coa_energia),
    (co1, 'Contabilidade - Honorarios Abril', 3200.00, '2026-04-25', NULL, 'pending', NULL, s5, coa_fornecedores),
    (co1, 'ISS/PIS/COFINS - Abril', 9500.00, '2026-04-28', NULL, 'pending', NULL, NULL, coa_impostos),
    (co1, 'AWS - Servicos Cloud - Maio', 5500.00, '2026-05-05', NULL, 'pending', NULL, s1, coa_cloud),
    (co1, 'Folha de Pagamento - Maio', 52300.00, '2026-05-05', NULL, 'pending', NULL, NULL, coa_salarios),
    (co1, 'Aluguel Escritorio - Maio', 8500.00, '2026-05-10', NULL, 'pending', NULL, s6, coa_aluguel),
    (co1, 'Freelancer Design UX - Projeto Delta', 7800.00, '2026-03-20', NULL, 'overdue', NULL, NULL, coa_fornecedores);

  -- TRANSACOES BANCARIAS (category_id -> chart_of_accounts)
  INSERT INTO transactions (company_id, description, amount, date, type, bank_account_id, category_id) VALUES
    (co1, 'Recebimento - Grupo Alpha - Licenca SaaS', 15800.00, '2026-01-10', 'credit', bank_bb, coa_rec_vendas),
    (co1, 'Recebimento - Beta Eng - Consultoria Sprint 1', 28500.00, '2026-01-14', 'credit', bank_bb, coa_rec_servicos),
    (co1, 'Recebimento - Clinica Gamma - Licenca SaaS', 4200.00, '2026-01-20', 'credit', bank_nu, coa_rec_vendas),
    (co1, 'Recebimento - Delta Log - Projeto Fase 1', 42000.00, '2026-01-27', 'credit', bank_bb, coa_rec_projetos),
    (co1, 'Pagamento - Folha Janeiro', 48500.00, '2026-01-05', 'debit', bank_bb, coa_salarios),
    (co1, 'Pagamento - AWS Cloud', 4850.00, '2026-01-05', 'debit', bank_nu, coa_cloud),
    (co1, 'Pagamento - Aluguel', 8500.00, '2026-01-10', 'debit', bank_bb, coa_aluguel),
    (co1, 'Pagamento - Google Ads', 6200.00, '2026-01-15', 'debit', bank_nu, coa_marketing),
    (co1, 'Pagamento - Impostos', 8750.00, '2026-01-28', 'debit', bank_bb, coa_impostos),
    (co1, 'Transferencia para Aplicacao', 15000.00, '2026-01-30', 'debit', bank_bb, NULL),
    (co1, 'Aplicacao CDB', 15000.00, '2026-01-30', 'credit', bank_cx, NULL),
    (co1, 'Recebimento - Grupo Alpha - Licenca SaaS', 15800.00, '2026-02-10', 'credit', bank_bb, coa_rec_vendas),
    (co1, 'Recebimento - Beta Eng - Consultoria Sprint 2', 28500.00, '2026-02-15', 'credit', bank_bb, coa_rec_servicos),
    (co1, 'Recebimento - Clinica Gamma - Licenca SaaS', 4200.00, '2026-02-20', 'credit', bank_nu, coa_rec_vendas),
    (co1, 'Recebimento - Epsilon Edu - E-learning', 18900.00, '2026-02-28', 'credit', bank_bb, coa_rec_projetos),
    (co1, 'Recebimento - Zeta Varejo - Integracao ERP', 12600.00, '2026-03-02', 'credit', bank_nu, coa_rec_servicos),
    (co1, 'Pagamento - Folha Fevereiro', 48500.00, '2026-02-05', 'debit', bank_bb, coa_salarios),
    (co1, 'Pagamento - AWS Cloud', 5120.00, '2026-02-05', 'debit', bank_nu, coa_cloud),
    (co1, 'Pagamento - Aluguel', 8500.00, '2026-02-10', 'debit', bank_bb, coa_aluguel),
    (co1, 'Pagamento - Meta Ads', 4800.00, '2026-02-15', 'debit', bank_nu, coa_marketing),
    (co1, 'Pagamento - Impostos', 7950.00, '2026-02-28', 'debit', bank_bb, coa_impostos),
    (co1, 'Recebimento - Grupo Alpha - Licenca SaaS', 15800.00, '2026-03-10', 'credit', bank_bb, coa_rec_vendas),
    (co1, 'Recebimento - Beta Eng - Consultoria Sprint 3', 28500.00, '2026-03-15', 'credit', bank_bb, coa_rec_servicos),
    (co1, 'Recebimento - Clinica Gamma - Licenca SaaS', 4200.00, '2026-03-20', 'credit', bank_nu, coa_rec_vendas),
    (co1, 'Recebimento - Delta Log - Projeto Fase 2', 42000.00, '2026-03-25', 'credit', bank_bb, coa_rec_projetos),
    (co1, 'Recebimento - MF Consultoria - Comissao', 3500.00, '2026-03-28', 'credit', bank_nu, coa_rec_comissoes),
    (co1, 'Pagamento - Folha Marco', 52300.00, '2026-03-05', 'debit', bank_bb, coa_salarios),
    (co1, 'Pagamento - AWS Cloud', 5380.00, '2026-03-05', 'debit', bank_nu, coa_cloud),
    (co1, 'Pagamento - Aluguel', 8500.00, '2026-03-10', 'debit', bank_bb, coa_aluguel),
    (co1, 'Pagamento - Google Ads', 7500.00, '2026-03-15', 'debit', bank_nu, coa_marketing),
    (co1, 'Pagamento - Impostos', 9200.00, '2026-03-28', 'debit', bank_bb, coa_impostos);

  -- FUNCIONARIOS
  INSERT INTO employees (company_id, name, role, email, phone, cpf, hire_date, salary, salario_base, tipo_contrato, status) VALUES
    (co1, 'Carlos Mendes', 'CEO / Diretor Geral', 'carlos@novatech.com.br', '(11) 99876-5432', '111.222.333-44', '2020-03-01', 18000.00, 18000.00, 'clt', 'ativo'),
    (co1, 'Ana Beatriz Lima', 'Diretora Financeira', 'ana.lima@novatech.com.br', '(11) 99876-1111', '222.333.444-55', '2020-06-15', 15000.00, 15000.00, 'clt', 'ativo'),
    (co1, 'Rafael Costa Silva', 'Tech Lead / Desenvolvedor Senior', 'rafael@novatech.com.br', '(11) 99876-2222', '333.444.555-66', '2021-01-10', 14500.00, 14500.00, 'clt', 'ativo'),
    (co1, 'Juliana Ferreira Santos', 'Desenvolvedora Full Stack', 'juliana@novatech.com.br', '(11) 99876-3333', '444.555.666-77', '2021-08-01', 10500.00, 10500.00, 'clt', 'ativo'),
    (co1, 'Pedro Henrique Alves', 'Desenvolvedor Backend', 'pedro@novatech.com.br', '(11) 99876-4444', '555.666.777-88', '2022-03-15', 9800.00, 9800.00, 'clt', 'ativo'),
    (co1, 'Mariana Oliveira', 'Designer UX/UI', 'mariana@novatech.com.br', '(11) 99876-5555', '666.777.888-99', '2022-07-01', 8500.00, 8500.00, 'clt', 'ativo'),
    (co1, 'Lucas Ribeiro', 'Analista Comercial', 'lucas@novatech.com.br', '(11) 99876-6666', '777.888.999-00', '2023-01-10', 6500.00, 6500.00, 'clt', 'ativo'),
    (co1, 'Fernanda Martins', 'Analista de Suporte', 'fernanda@novatech.com.br', '(11) 99876-7777', '888.999.000-11', '2023-06-01', 5200.00, 5200.00, 'clt', 'ativo'),
    (co1, 'Gabriel Nascimento', 'Estagiario de Desenvolvimento', 'gabriel@novatech.com.br', '(11) 99876-8888', '999.000.111-22', '2025-02-01', 2000.00, 2000.00, 'estagio', 'ativo'),
    (co1, 'Camila Rodrigues', 'Assistente Administrativo', 'camila@novatech.com.br', '(11) 99876-9999', '000.111.222-33', '2024-04-01', 3800.00, 3800.00, 'clt', 'ativo');

  RAISE NOTICE 'SEED DEMO CONCLUIDO COM SUCESSO!';
  RAISE NOTICE 'Empresa 1: Nova Tech Digital (ID: %)', co1;
  RAISE NOTICE 'Empresa 2: Tech Store (ID: %)', co2;
END $$;
