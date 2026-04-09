-- ============================================================
-- RESTAURAR PLANO DE CONTAS ORIGINAL — A C CRAVEIRO
-- company_id: 468f32f8-3e89-48a3-8e43-2570ef20262f
-- ============================================================

DO $$
DECLARE
  v_cid UUID := '468f32f8-3e89-48a3-8e43-2570ef20262f';
BEGIN
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM public.chart_of_accounts WHERE company_id = v_cid;
  SET LOCAL session_replication_role = 'origin';

  -- ══════════════════════════════════════════════════════════════
  -- NÍVEL 1
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.chart_of_accounts
    (company_id, code, name, level, account_type, account_nature,
     is_analytical, is_synthetic, accepts_manual_entry,
     show_in_dre, dre_group, dre_order, reference_code, status)
  VALUES
  (v_cid, '1', 'RECEITAS', 1, 'revenue', 'credit', false, true, true, true, 'Receita Bruta', 1, NULL, 'active'),
  (v_cid, '2', 'DEDUÇÕES DA RECEITA', 1, 'revenue', 'debit', false, true, true, true, 'Deduções', 17, NULL, 'active'),
  (v_cid, '3', 'CUSTOS DOS SERVIÇOS PRESTADOS (CSP)', 1, 'cost', 'debit', false, true, true, true, 'CSP', 23, NULL, 'active'),
  (v_cid, '4', 'DESPESAS OPERACIONAIS', 1, 'expense', 'debit', false, true, true, true, 'Despesas Operacionais', 30, NULL, 'active'),
  (v_cid, '5', 'RESULTADO / DISTRIBUIÇÃO', 1, 'equity', 'credit', false, true, true, true, 'Resultado', 68, NULL, 'active'),
  (v_cid, '6', 'MOVIMENTAÇÕES PATRIMONIAIS', 1, 'asset', 'credit', false, true, true, true, 'Não DRE', 72, NULL, 'active');

  -- ══════════════════════════════════════════════════════════════
  -- NÍVEL 2
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.chart_of_accounts
    (company_id, code, name, level, account_type, account_nature,
     is_analytical, is_synthetic, accepts_manual_entry,
     show_in_dre, dre_group, dre_order, reference_code, status)
  VALUES
  (v_cid, '1.1', 'Receita Bruta de Serviços', 2, 'revenue', 'credit', false, true, true, true, 'receita_bruta', 2, NULL, 'active'),
  (v_cid, '1.2', 'Receita Bruta de Produtos', 2, 'revenue', 'credit', false, true, true, true, 'Receita Bruta', 8, NULL, 'active'),
  (v_cid, '1.3', 'Outras Receitas', 2, 'revenue', 'credit', false, true, true, true, 'Outras Receitas', 14, NULL, 'active'),
  (v_cid, '2.1', 'Impostos e Taxas', 2, 'revenue', 'debit', false, true, true, true, 'Deduções', 18, NULL, 'active'),
  (v_cid, '3.1', 'Custos Diretos', 2, 'cost', 'debit', false, true, true, true, 'custos', 24, NULL, 'active'),
  (v_cid, '4.1', 'Despesas com Pessoal', 2, 'expense', 'debit', false, true, true, true, 'Despesas Operacionais', 31, NULL, 'active'),
  (v_cid, '4.2', 'Despesas Administrativas', 2, 'expense', 'debit', false, true, true, true, 'Despesas Operacionais', 41, NULL, 'active'),
  (v_cid, '4.3', 'Despesas Variáveis / Manutenção', 2, 'expense', 'debit', false, true, true, true, 'Despesas Operacionais', 54, NULL, 'active'),
  (v_cid, '4.4', 'Despesas Financeiras', 2, 'expense', 'debit', false, true, true, true, 'Despesas Financeiras', 59, NULL, 'active'),
  (v_cid, '4.5', 'Outras Despesas', 2, 'expense', 'debit', false, true, true, true, 'Outras Despesas', 65, NULL, 'active'),
  (v_cid, '5.1', 'Distribuição de Lucros', 2, 'equity', 'credit', false, true, true, true, 'Resultado', 69, NULL, 'active'),
  (v_cid, '6.1', 'Transferências entre Contas', 2, 'asset', 'credit', false, true, true, true, 'Não DRE', 73, NULL, 'active');

  -- ══════════════════════════════════════════════════════════════
  -- NÍVEL 3
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.chart_of_accounts
    (company_id, code, name, level, account_type, account_nature,
     is_analytical, is_synthetic, accepts_manual_entry,
     show_in_dre, dre_group, dre_order, reference_code, status)
  VALUES
  -- 1.1.x Receita de Serviços
  (v_cid, '1.1.01', 'Consultas Médicas', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 3, NULL, 'inactive'),
  (v_cid, '1.1.02', 'Transplante Capilar — Sinal', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 4, NULL, 'inactive'),
  (v_cid, '1.1.03', 'Transplante Capilar — Parcela/Restante', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 5, NULL, 'inactive'),
  (v_cid, '1.1.04', 'Protocolo MMP — Pacote 3 Sessões', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 6, NULL, 'inactive'),
  (v_cid, '1.1.05', 'Protocolo MMP — Sessão Avulsa', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 7, NULL, 'inactive'),
  (v_cid, '1.1.1', 'Aplicação', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.10', 'Drenagem', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.11', 'EMNSELLA', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.12', 'Endolaser', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.13', 'Harmonização Facial', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.14', 'Harmonyca', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.15', 'Hidratação', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.16', 'Injetaveis', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.17', 'Lábios', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.18', 'Laser', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.19', 'Laser 3D', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.2', 'Avaliação', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.20', 'Photon Capilar', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.21', 'Ultrassom', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.22', 'PRP Face', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.23', 'Pool Facial', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.24', 'Laser Remoção de tatuagem', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.25', 'Laser Yag', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.26', 'Limpeza Terapêutica', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.27', 'Massagem', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.28', 'Peeling', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.29', 'Perfiloplastia', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.3', 'Bioestimulador', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.30', 'Plasma', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.31', 'Plasma Cicatriz', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.32', 'Termolaser', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.33', 'Profhilo', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.34', 'Restauração Labios', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.35', 'Radiofrequência', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.36', 'Retirada de Acido Hialurônico', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.37', 'Retirada de Cisto', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.38', 'Retorno', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.39', 'ULTHERA', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.4', 'Biopsia', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.40', 'Radiofrequência Microagulhada', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.41', 'Rinomodelação', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.42', 'Ultrassom Microfocado - Ulthera', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.43', 'Crystal PDRN', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.44', 'HAC (victa)', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.45', 'Harmonização de bumbum', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.46', 'Microagulhamento', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.47', 'Preenchimento', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.48', 'Remoção de micropigmentação', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.49', 'Revitalize total Pescoço e colo', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.5', 'Blefaroplastia', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.50', 'Sculptra', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.51', 'SkinVive', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.52', 'Trio de Vitaminas (Injetável)', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.53', 'Vitamina D 600.00 UI (Injetável)', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.6', 'Botox', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.7', 'Cauterização', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.8', 'Consulta', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.1.9', 'Fios de tração', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),

  -- 1.2.x Receita de Produtos
  (v_cid, '1.2.01', 'Minoxidil e Derivados', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 9, NULL, 'inactive'),
  (v_cid, '1.2.02', 'Dutasterida / Finasterida', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 10, NULL, 'inactive'),
  (v_cid, '1.2.03', 'Suplementos Vitamínicos', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 11, NULL, 'inactive'),
  (v_cid, '1.2.04', 'Shampoos e Cosméticos', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 12, NULL, 'inactive'),
  (v_cid, '1.2.05', 'Kits de Produtos / Pós-operatório', 3, 'revenue', 'credit', true, false, true, true, 'Receita Bruta', 13, NULL, 'inactive'),
  (v_cid, '1.2.1', 'Cremes', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.2.2', 'Filtro Solar', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),
  (v_cid, '1.2.3', 'Óleo Ozonizado', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', NULL, NULL, 'active'),

  -- 1.3.x Outras Receitas
  (v_cid, '1.3.01', 'Crédito de Maquininha / Recebimentos Stone', 3, 'revenue', 'credit', true, false, true, true, 'Outras Receitas', 15, NULL, 'active'),
  (v_cid, '1.3.02', 'Outras Receitas Diversas', 3, 'revenue', 'credit', true, false, true, true, 'Outras Receitas', 16, NULL, 'active'),

  -- 2.1.x Impostos e Taxas
  (v_cid, '2.1.01', 'DARF / Imposto Trimestral IR', 3, 'cost', 'debit', true, false, true, true, 'deducoes', 19, NULL, 'active'),
  (v_cid, '2.1.02', 'DAM / ISS Municipal', 3, 'cost', 'debit', true, false, true, true, 'deducoes', 20, NULL, 'active'),
  (v_cid, '2.1.03', 'PIS', 3, 'cost', 'debit', true, false, true, true, 'deducoes', 21, NULL, 'active'),
  (v_cid, '2.1.04', 'IPTU', 3, 'cost', 'debit', true, false, true, true, 'deducoes', 22, NULL, 'active'),
  (v_cid, '2.1.05', 'DAS', 3, 'cost', 'debit', true, false, true, true, 'deducoes', NULL, NULL, 'active'),
  (v_cid, '2.1.06', 'Taxas Bancárias', 3, 'cost', 'debit', true, false, true, true, 'deducoes', NULL, NULL, 'active'),
  (v_cid, '2.1.07', 'ICMS', 3, 'cost', 'debit', true, false, true, true, 'custos', NULL, NULL, 'active'),
  (v_cid, '2.1.08', 'FGTS', 3, 'cost', 'debit', true, false, true, true, 'custos', NULL, NULL, 'active'),

  -- 3.1.x Custos Diretos
  (v_cid, '3.1.01', 'Honorários Médicos', 3, 'cost', 'debit', true, false, true, true, 'custos', 25, NULL, 'active'),
  (v_cid, '3.1.02', 'Injetáveis', 3, 'cost', 'debit', true, false, true, true, 'custos', 26, NULL, 'active'),
  (v_cid, '3.1.03', 'Compra de Mercadorias para Revenda', 3, 'cost', 'debit', true, false, true, true, 'custos', 27, NULL, 'active'),
  (v_cid, '3.1.04', 'Comissões Comerciais', 3, 'cost', 'debit', true, false, true, true, 'custos', 28, NULL, 'active'),
  (v_cid, '3.1.05', 'Frete / SEDEX', 3, 'cost', 'debit', true, false, true, true, 'custos', 29, NULL, 'active'),
  (v_cid, '3.1.06', 'Manipulados', 3, 'cost', 'debit', true, false, true, true, 'custos', NULL, NULL, 'active'),
  (v_cid, '3.1.07', 'Outros Produtos', 3, 'cost', 'debit', true, false, true, true, 'custos', NULL, NULL, 'active'),
  (v_cid, '3.1.08', 'Honorário Técnico', 3, 'cost', 'debit', true, false, true, true, 'custos', NULL, NULL, 'active'),
  (v_cid, '3.1.09', 'Divisão de Despesas', 3, 'cost', 'credit', true, false, true, true, 'custos', NULL, NULL, 'inactive'),

  -- 4.1.x Despesas com Pessoal
  (v_cid, '4.1.01', 'Salários e Ordenados', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 32, NULL, 'active'),
  (v_cid, '4.1.02', 'Adiantamento Salarial', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 33, NULL, 'active'),
  (v_cid, '4.1.03', 'Rescisão / Verbas Rescisórias', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 34, NULL, 'active'),
  (v_cid, '4.1.04', 'INSS Patronal', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 35, NULL, 'active'),
  (v_cid, '4.1.05', 'Vale Transporte', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 36, NULL, 'active'),
  (v_cid, '4.1.06', 'Plano de Saúde / Assistência Médica', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 37, NULL, 'active'),
  (v_cid, '4.1.07', 'Honorários — Contabilidade', 3, 'expense', 'debit', true, false, true, true, 'Desp. Pessoal', 38, NULL, 'inactive'),
  (v_cid, '4.1.08', 'Honorários — Consultoria / BPO (Tática)', 3, 'expense', 'debit', true, false, true, true, 'Desp. Pessoal', 39, NULL, 'inactive'),
  (v_cid, '4.1.09', 'Honorários — Outros Profissionais', 3, 'expense', 'debit', true, false, true, true, 'Desp. Pessoal', 40, NULL, 'inactive'),

  -- 4.2.x Despesas Administrativas
  (v_cid, '4.2.01', 'Aluguel e Condomínio', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 42, NULL, 'active'),
  (v_cid, '4.2.02', 'Energia Elétrica', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 43, NULL, 'active'),
  (v_cid, '4.2.03', 'Telefone e Internet — Empresa', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 44, NULL, 'active'),
  (v_cid, '4.2.04', 'Telefone — Uso Pessoal / Outros', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 45, NULL, 'active'),
  (v_cid, '4.2.05', 'Softwares e Assinaturas SaaS', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 46, NULL, 'active'),
  (v_cid, '4.2.06', 'Marketing e Publicidade', 3, 'expense', 'debit', true, false, true, true, 'Desp. Administrativas', 47, NULL, 'active'),
  (v_cid, '4.2.07', 'Material de Escritório / Papelaria', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 48, NULL, 'active'),
  (v_cid, '4.2.08', 'Material de Limpeza e Higiene', 3, 'expense', 'debit', true, false, true, true, 'Desp. Administrativas', 49, NULL, 'active'),
  (v_cid, '4.2.09', 'Uniformes e EPIs', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 50, NULL, 'active'),
  (v_cid, '4.2.10', 'Resíduos e Descarte (Pró Ambiental)', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 51, NULL, 'active'),
  (v_cid, '4.2.11', 'Reembolsos a Funcionários', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 52, NULL, 'active'),
  (v_cid, '4.2.12', 'Honorários — Contabilidade', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 53, NULL, 'active'),
  (v_cid, '4.2.13', 'Honorários — Consultoria / BPO (Tática)', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),
  (v_cid, '4.2.14', 'Companhia de Saneamento / Copasa', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),
  (v_cid, '4.2.15', ' Associações Médicas Voluntárias', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),
  (v_cid, '4.2.16', 'Mentoria', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),

  -- 4.3.x Despesas Variáveis / Manutenção
  (v_cid, '4.3.01', 'Manutenção e Reparos', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 55, NULL, 'active'),
  (v_cid, '4.3.02', 'Equipamentos e Utensílios', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 56, NULL, 'active'),
  (v_cid, '4.3.03', 'Higienização e Limpeza Especializada', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 57, NULL, 'active'),
  (v_cid, '4.3.04', 'Embalagens e Materiais de Expedição', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 58, NULL, 'active'),
  (v_cid, '4.3.05', 'Marketing', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),

  -- 4.4.x Despesas Financeiras
  (v_cid, '4.4.01', 'Juros sobre Empréstimos', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 60, NULL, 'active'),
  (v_cid, '4.4.02', 'Tarifas Bancárias', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 61, NULL, 'active'),
  (v_cid, '4.4.03', 'Parcela de Empréstimo (Principal)', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 62, NULL, 'active'),
  (v_cid, '4.4.04', 'IOF e Outros Encargos', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 63, NULL, 'active'),
  (v_cid, '4.4.05', 'Taxas de Maquininha / Antecipação', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 64, NULL, 'active'),
  (v_cid, '4.4.06', 'Cartão de Crédito / Clinica', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', NULL, NULL, 'active'),

  -- 4.5.x Outras Despesas
  (v_cid, '4.5.01', 'Despesas Médicas / Hospitalares (Não CSP)', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 66, NULL, 'active'),
  (v_cid, '4.5.02', 'Despesas Diversas Não Classificadas', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 67, NULL, 'active'),
  (v_cid, '4.5.03', 'Divisão de Despesas', 3, 'cost', 'debit', true, false, true, true, 'outras_despesas', NULL, NULL, 'inactive'),

  -- 5.1.x Distribuição
  (v_cid, '5.1.01', 'Antecipação de Lucros / Retirada do Sócio', 3, 'equity', 'debit', true, false, true, true, 'outras_despesas', 70, NULL, 'active'),
  (v_cid, '5.1.02', 'Reserva de Lucros', 3, 'equity', 'credit', true, false, true, true, 'Resultado', 71, NULL, 'active'),

  -- 6.1.x Movimentações Patrimoniais
  (v_cid, '6.1.01', 'Transferência entre Contas Bancárias', 3, 'asset', 'credit', true, false, true, true, 'Não DRE', 74, NULL, 'active'),
  (v_cid, '6.1.02', 'Aplicação / Resgate de Investimentos', 3, 'asset', 'credit', true, false, true, true, 'Não DRE', 75, NULL, 'active'),
  (v_cid, '6.1.03', 'Empréstimo entre Empresas / Sócios', 3, 'asset', 'credit', true, false, true, true, 'Não DRE', 76, NULL, 'active');

  -- ══════════════════════════════════════════════════════════════
  -- ATUALIZAR parent_id — Nível 2 → Nível 1
  -- ══════════════════════════════════════════════════════════════
  UPDATE public.chart_of_accounts filho
  SET parent_id = pai.id
  FROM public.chart_of_accounts pai
  WHERE filho.company_id = v_cid
    AND pai.company_id   = v_cid
    AND filho.level = 2
    AND pai.level = 1
    AND LEFT(filho.code, POSITION('.' IN filho.code) - 1) = pai.code;

  -- ══════════════════════════════════════════════════════════════
  -- ATUALIZAR parent_id — Nível 3 → Nível 2
  -- ══════════════════════════════════════════════════════════════
  UPDATE public.chart_of_accounts filho
  SET parent_id = pai.id
  FROM public.chart_of_accounts pai
  WHERE filho.company_id = v_cid
    AND pai.company_id   = v_cid
    AND filho.level = 3
    AND pai.level = 2
    AND SUBSTRING(filho.code FROM '^[^.]+\.[^.]+') = pai.code;

  RAISE NOTICE 'Plano de contas A C CRAVEIRO restaurado com % contas',
    (SELECT count(*) FROM public.chart_of_accounts WHERE company_id = v_cid);

END;
$$;
