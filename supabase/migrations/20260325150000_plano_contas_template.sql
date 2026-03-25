-- ============================================================
-- GESTAP — Plano de Contas Template Genérico
-- Adaptado para schema real: companies(razao_social, cnpj)
-- ============================================================

-- 1. EMPRESA TEMPLATE (ID fixo)
insert into public.companies (
  id, razao_social, cnpj, is_active
) values (
  '00000000-0000-0000-0000-000000000001',
  '__TEMPLATE_TATICA__',
  '00000000000000',
  false
)
on conflict (id) do nothing;

-- Limpar plano anterior do template
delete from public.chart_of_accounts
where company_id = '00000000-0000-0000-0000-000000000001';

-- 2. PLANO DE CONTAS GENÉRICO (54 contas, 3 níveis)

insert into public.chart_of_accounts
  (id, company_id, code, name, level, account_type, account_nature,
   is_analytical, is_synthetic, accepts_manual_entry, show_in_dre, dre_group, dre_order, status)
values

-- ── GRUPO 1: RECEITAS ──
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '1', 'RECEITAS', 1, 'revenue', 'credit', false, true, false, true, 'receita_bruta', 10, 'active'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 '1.1', 'Receita bruta de serviços', 2, 'revenue', 'credit', false, true, false, true, 'receita_bruta', 11, 'active'),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 '1.2', 'Receita bruta de produtos', 2, 'revenue', 'credit', false, true, false, true, 'receita_bruta', 12, 'active'),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 '1.3', 'Outras receitas', 2, 'revenue', 'credit', false, true, false, true, 'outras_receitas', 13, 'active'),
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 '1.1.01', 'Receita de serviços — geral', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', 11, 'active'),
('10000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 '1.2.01', 'Receita de produtos — geral', 3, 'revenue', 'credit', true, false, true, true, 'receita_bruta', 12, 'active'),
('10000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001',
 '1.3.01', 'Juros e rendimentos', 3, 'revenue', 'credit', true, false, true, true, 'outras_receitas', 13, 'active'),
('10000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
 '1.3.02', 'Receitas diversas', 3, 'revenue', 'credit', true, false, true, true, 'outras_receitas', 14, 'active'),

-- ── GRUPO 2: DEDUÇÕES DA RECEITA ──
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '2', 'DEDUÇÕES DA RECEITA', 1, 'expense', 'debit', false, true, false, true, 'deducoes', 20, 'active'),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 '2.1', 'Impostos sobre a receita', 2, 'expense', 'debit', false, true, false, true, 'deducoes', 21, 'active'),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 '2.2', 'Devoluções e cancelamentos', 2, 'expense', 'debit', false, true, false, true, 'deducoes', 22, 'active'),
('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 '2.1.01', 'ISS — Imposto sobre serviços', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 21, 'active'),
('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 '2.1.02', 'PIS', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 22, 'active'),
('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
 '2.1.03', 'COFINS', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 23, 'active'),
('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
 '2.1.04', 'DAS — Simples Nacional', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 24, 'active'),
('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001',
 '2.1.05', 'IRPJ', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 25, 'active'),
('20000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001',
 '2.1.06', 'CSLL', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 26, 'active'),
('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 '2.2.01', 'Devoluções de serviços', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 27, 'active'),
('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001',
 '2.2.02', 'Devoluções de produtos', 3, 'expense', 'debit', true, false, true, true, 'deducoes', 28, 'active'),

-- ── GRUPO 3: CUSTOS ──
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '3', 'CUSTOS', 1, 'expense', 'debit', false, true, false, true, 'custos', 30, 'active'),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 '3.1', 'Custo dos serviços prestados (CSP)', 2, 'expense', 'debit', false, true, false, true, 'custos', 31, 'active'),
('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 '3.2', 'Custo das mercadorias vendidas (CMV)', 2, 'expense', 'debit', false, true, false, true, 'custos', 32, 'active'),
('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 '3.1.01', 'Materiais e insumos diretos', 3, 'expense', 'debit', true, false, true, true, 'custos', 31, 'active'),
('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 '3.1.02', 'Mão de obra direta', 3, 'expense', 'debit', true, false, true, true, 'custos', 32, 'active'),
('30000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
 '3.1.03', 'Terceiros e subcontratados', 3, 'expense', 'debit', true, false, true, true, 'custos', 33, 'active'),
('30000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 '3.2.01', 'Custo de mercadorias', 3, 'expense', 'debit', true, false, true, true, 'custos', 34, 'active'),

-- ── GRUPO 4: DESPESAS OPERACIONAIS ──
('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '4', 'DESPESAS OPERACIONAIS', 1, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 40, 'active'),

-- 4.1 Pessoal
('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 '4.1', 'Pessoal e encargos', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 41, 'active'),
('40000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 '4.1.01', 'Salários e ordenados', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 41, 'active'),
('40000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 '4.1.02', 'FGTS', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 42, 'active'),
('40000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
 '4.1.03', 'INSS patronal', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 43, 'active'),
('40000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
 '4.1.04', 'Vale transporte', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 44, 'active'),
('40000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001',
 '4.1.05', 'Vale refeição / alimentação', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 45, 'active'),
('40000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001',
 '4.1.06', 'Plano de saúde', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 46, 'active'),
('40000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001',
 '4.1.07', 'Pró-labore', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 47, 'active'),
('40000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000001',
 '4.1.08', 'Férias e 13º salário', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 48, 'active'),

-- 4.2 Ocupação
('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 '4.2', 'Ocupação', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 49, 'active'),
('40000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 '4.2.01', 'Aluguel', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 49, 'active'),
('40000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001',
 '4.2.02', 'Condomínio', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 50, 'active'),
('40000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001',
 '4.2.03', 'IPTU', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 51, 'active'),
('40000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001',
 '4.2.04', 'Energia elétrica', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 52, 'active'),
('40000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001',
 '4.2.05', 'Água e saneamento', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 53, 'active'),

-- 4.3 Administrativas
('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 '4.3', 'Despesas administrativas', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 54, 'active'),
('40000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001',
 '4.3.01', 'Honorários contábeis', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 54, 'active'),
('40000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
 '4.3.02', 'Honorários jurídicos', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 55, 'active'),
('40000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001',
 '4.3.03', 'Material de escritório', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 56, 'active'),
('40000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000001',
 '4.3.04', 'Limpeza e conservação', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 57, 'active'),
('40000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000001',
 '4.3.05', 'Seguros', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 58, 'active'),
('40000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000001',
 '4.3.06', 'Despesas bancárias', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 59, 'active'),

-- 4.4 Marketing
('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 '4.4', 'Marketing e vendas', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 60, 'active'),
('40000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001',
 '4.4.01', 'Publicidade e propaganda', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 60, 'active'),
('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001',
 '4.4.02', 'Redes sociais e mídia digital', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 61, 'active'),
('40000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001',
 '4.4.03', 'Comissões de vendas', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 62, 'active'),

-- 4.5 Tecnologia
('40000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 '4.5', 'Tecnologia e sistemas', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 63, 'active'),
('40000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001',
 '4.5.01', 'Software e assinaturas SaaS', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 63, 'active'),
('40000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
 '4.5.02', 'Internet e telefonia', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 64, 'active'),
('40000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001',
 '4.5.03', 'Equipamentos e manutenção', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 65, 'active'),

-- 4.6 Financeiras
('40000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 '4.6', 'Despesas financeiras', 2, 'expense', 'debit', false, true, false, true, 'despesas_operacionais', 66, 'active'),
('40000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001',
 '4.6.01', 'Juros e multas', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 66, 'active'),
('40000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001',
 '4.6.02', 'IOF', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 67, 'active'),
('40000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001',
 '4.6.03', 'Tarifas bancárias', 3, 'expense', 'debit', true, false, true, true, 'despesas_operacionais', 68, 'active'),

-- ── GRUPO 5: OUTRAS DESPESAS ──
('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 '5', 'OUTRAS DESPESAS', 1, 'expense', 'debit', false, true, false, true, 'outras_despesas', 70, 'active'),
('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 '5.1', 'Impostos e taxas', 2, 'expense', 'debit', false, true, false, true, 'outras_despesas', 71, 'active'),
('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 '5.2', 'Depreciação e amortização', 2, 'expense', 'debit', false, true, false, true, 'outras_despesas', 72, 'active'),
('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 '5.3', 'Outras despesas não operacionais', 2, 'expense', 'debit', false, true, false, true, 'outras_despesas', 73, 'active'),
('50000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 '5.1.01', 'Alvará e licenças', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 71, 'active'),
('50000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 '5.1.02', 'Taxas municipais e estaduais', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 72, 'active'),
('50000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 '5.2.01', 'Depreciação de equipamentos', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 73, 'active'),
('50000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001',
 '5.2.02', 'Amortização de intangíveis', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 74, 'active'),
('50000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001',
 '5.3.01', 'Perdas e sinistros', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 75, 'active'),
('50000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
 '5.3.02', 'Despesas diversas', 3, 'expense', 'debit', true, false, true, true, 'outras_despesas', 76, 'active');


-- 3. FUNÇÃO — copiar plano template para nova empresa
create or replace function public.copiar_plano_template(p_company_id uuid)
returns integer language plpgsql security definer as $$
begin
  insert into public.chart_of_accounts (
    company_id, code, name, description,
    level, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry,
    show_in_dre, dre_group, dre_order,
    status, created_at
  )
  select
    p_company_id,
    code, name, description,
    level, account_type, account_nature,
    is_analytical, is_synthetic, accepts_manual_entry,
    show_in_dre, dre_group, dre_order,
    status, now()
  from public.chart_of_accounts
  where company_id = '00000000-0000-0000-0000-000000000001'
  order by level, code;

  -- Atualizar parent_id baseado no code
  update public.chart_of_accounts filho
  set parent_id = pai.id
  from public.chart_of_accounts pai
  where filho.company_id = p_company_id
    and pai.company_id   = p_company_id
    and filho.code like pai.code || '.%'
    and length(filho.code) - length(replace(filho.code, '.', ''))
      = length(pai.code) - length(replace(pai.code, '.', '')) + 1;

  return (select count(*) from public.chart_of_accounts where company_id = p_company_id);
end;
$$;
