-- =====================================================
-- TEMPLATE: Plano de Contas - Clínica Capilar
-- Baseado na estrutura contábil de clínica de transplante capilar
-- =====================================================

-- 1. Criar template
INSERT INTO account_templates (id, name, description, industry, is_default)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-c11n1cacap11a',
    'Plano de Contas - Clínica Capilar',
    'Plano de contas especializado para clínicas de transplante capilar, com receitas de cirurgias, protocolos, produtos e estrutura completa de custos e despesas.',
    'saude',
    false
) ON CONFLICT DO NOTHING;

-- 2. Inserir itens do template
INSERT INTO account_template_items (template_id, code, name, parent_code, level, account_type, account_nature, is_analytical, show_in_dre, dre_group, dre_order)
SELECT
    'a1b2c3d4-e5f6-7890-abcd-c11n1cacap11a',
    code, name, parent_code, level, account_type::account_type, account_nature::account_nature, is_analytical, show_in_dre, dre_group, dre_order
FROM (VALUES
    -- ===================== GRUPO 1 — RECEITAS =====================
    ('1',       'RECEITAS',                                   NULL,   1, 'revenue', 'credit', false, true, 'Receita Bruta', 1),
    ('1.1',     'Receita Bruta de Serviços',                  '1',    2, 'revenue', 'credit', false, true, 'Receita Bruta', 2),
    ('1.1.01',  'Consultas Médicas',                          '1.1',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 3),
    ('1.1.02',  'Transplante Capilar — Sinal',                '1.1',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 4),
    ('1.1.03',  'Transplante Capilar — Parcela/Restante',     '1.1',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 5),
    ('1.1.04',  'Protocolo MMP — Pacote 3 Sessões',           '1.1',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 6),
    ('1.1.05',  'Protocolo MMP — Sessão Avulsa',              '1.1',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 7),

    ('1.2',     'Receita Bruta de Produtos',                  '1',    2, 'revenue', 'credit', false, true, 'Receita Bruta', 8),
    ('1.2.01',  'Minoxidil e Derivados',                      '1.2',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 9),
    ('1.2.02',  'Dutasterida / Finasterida',                  '1.2',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 10),
    ('1.2.03',  'Suplementos Vitamínicos',                    '1.2',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 11),
    ('1.2.04',  'Shampoos e Cosméticos',                      '1.2',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 12),
    ('1.2.05',  'Kits de Produtos / Pós-operatório',          '1.2',  3, 'revenue', 'credit', true,  true, 'Receita Bruta', 13),

    ('1.3',     'Outras Receitas',                            '1',    2, 'revenue', 'credit', false, true, 'Outras Receitas', 14),
    ('1.3.01',  'Crédito de Maquininha / Recebimentos Stone', '1.3',  3, 'revenue', 'credit', true,  true, 'Outras Receitas', 15),
    ('1.3.02',  'Outras Receitas Diversas',                   '1.3',  3, 'revenue', 'credit', true,  true, 'Outras Receitas', 16),

    -- ===================== GRUPO 2 — DEDUÇÕES DA RECEITA =====================
    ('2',       'DEDUÇÕES DA RECEITA',                        NULL,   1, 'revenue', 'debit',  false, true, 'Deduções', 17),
    ('2.1',     'Impostos e Taxas',                           '2',    2, 'revenue', 'debit',  false, true, 'Deduções', 18),
    ('2.1.01',  'DARF / Imposto Trimestral IR',               '2.1',  3, 'revenue', 'debit',  true,  true, 'Deduções', 19),
    ('2.1.02',  'DAM / ISS Municipal',                        '2.1',  3, 'revenue', 'debit',  true,  true, 'Deduções', 20),
    ('2.1.03',  'PIS',                                        '2.1',  3, 'revenue', 'debit',  true,  true, 'Deduções', 21),
    ('2.1.04',  'IPTU',                                       '2.1',  3, 'revenue', 'debit',  true,  true, 'Deduções', 22),

    -- ===================== GRUPO 3 — CSP =====================
    ('3',       'CUSTO DOS SERVIÇOS PRESTADOS (CSP)',         NULL,   1, 'cost',    'debit',  false, true, 'CSP', 23),
    ('3.1',     'Custos Diretos',                             '3',    2, 'cost',    'debit',  false, true, 'CSP', 24),
    ('3.1.01',  'Compra de Serviços Médicos / Cirúrgicos',    '3.1',  3, 'cost',    'debit',  true,  true, 'CSP', 25),
    ('3.1.02',  'Equipe Cirúrgica',                           '3.1',  3, 'cost',    'debit',  true,  true, 'CSP', 26),
    ('3.1.03',  'Compra de Mercadorias para Revenda',         '3.1',  3, 'cost',    'debit',  true,  true, 'CSP', 27),
    ('3.1.04',  'Comissões Comerciais',                       '3.1',  3, 'cost',    'debit',  true,  true, 'CSP', 28),
    ('3.1.05',  'Frete / SEDEX',                              '3.1',  3, 'cost',    'debit',  true,  true, 'CSP', 29),

    -- ===================== GRUPO 4 — DESPESAS OPERACIONAIS =====================
    ('4',       'DESPESAS OPERACIONAIS',                      NULL,   1, 'expense', 'debit',  false, true, 'Despesas Operacionais', 30),

    -- 4.1 Despesas com Pessoal
    ('4.1',     'Despesas com Pessoal',                       '4',    2, 'expense', 'debit',  false, true, 'Desp. Pessoal', 31),
    ('4.1.01',  'Salários e Ordenados',                       '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 32),
    ('4.1.02',  'Adiantamento Salarial',                      '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 33),
    ('4.1.03',  'Rescisão / Verbas Rescisórias',              '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 34),
    ('4.1.04',  'INSS Patronal',                              '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 35),
    ('4.1.05',  'Vale Transporte',                            '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 36),
    ('4.1.06',  'Plano de Saúde / Assistência Médica',        '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 37),
    ('4.1.07',  'Honorários — Contabilidade',                 '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 38),
    ('4.1.08',  'Honorários — Consultoria / BPO (Tática)',    '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 39),
    ('4.1.09',  'Honorários — Outros Profissionais',          '4.1',  3, 'expense', 'debit',  true,  true, 'Desp. Pessoal', 40),

    -- 4.2 Despesas Administrativas
    ('4.2',     'Despesas Administrativas',                   '4',    2, 'expense', 'debit',  false, true, 'Desp. Administrativas', 41),
    ('4.2.01',  'Aluguel e Condomínio',                       '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 42),
    ('4.2.02',  'Energia Elétrica',                           '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 43),
    ('4.2.03',  'Telefone e Internet — Empresa',              '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 44),
    ('4.2.04',  'Telefone — Uso Pessoal / Outros',            '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 45),
    ('4.2.05',  'Softwares e Assinaturas SaaS',               '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 46),
    ('4.2.06',  'Marketing e Publicidade',                    '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 47),
    ('4.2.07',  'Material de Escritório / Papelaria',         '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 48),
    ('4.2.08',  'Material de Limpeza e Higiene',              '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 49),
    ('4.2.09',  'Uniformes e EPIs',                           '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 50),
    ('4.2.10',  'Resíduos e Descarte (Pró Ambiental)',        '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 51),
    ('4.2.11',  'Reembolsos a Funcionários',                  '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 52),
    ('4.2.12',  'Hospital / Procedimentos Externos',          '4.2',  3, 'expense', 'debit',  true,  true, 'Desp. Administrativas', 53),

    -- 4.3 Despesas Variáveis / Manutenção
    ('4.3',     'Despesas Variáveis / Manutenção',            '4',    2, 'expense', 'debit',  false, true, 'Desp. Variáveis', 54),
    ('4.3.01',  'Manutenção e Reparos',                       '4.3',  3, 'expense', 'debit',  true,  true, 'Desp. Variáveis', 55),
    ('4.3.02',  'Equipamentos e Utensílios',                  '4.3',  3, 'expense', 'debit',  true,  true, 'Desp. Variáveis', 56),
    ('4.3.03',  'Higienização e Limpeza Especializada',       '4.3',  3, 'expense', 'debit',  true,  true, 'Desp. Variáveis', 57),
    ('4.3.04',  'Embalagens e Materiais de Expedição',        '4.3',  3, 'expense', 'debit',  true,  true, 'Desp. Variáveis', 58),

    -- 4.4 Despesas Financeiras
    ('4.4',     'Despesas Financeiras',                       '4',    2, 'expense', 'debit',  false, true, 'Desp. Financeiras', 59),
    ('4.4.01',  'Juros sobre Empréstimos',                    '4.4',  3, 'expense', 'debit',  true,  true, 'Desp. Financeiras', 60),
    ('4.4.02',  'Tarifas Bancárias',                          '4.4',  3, 'expense', 'debit',  true,  true, 'Desp. Financeiras', 61),
    ('4.4.03',  'Parcela de Empréstimo (Principal)',           '4.4',  3, 'expense', 'debit',  true,  true, 'Desp. Financeiras', 62),
    ('4.4.04',  'IOF e Outros Encargos',                      '4.4',  3, 'expense', 'debit',  true,  true, 'Desp. Financeiras', 63),
    ('4.4.05',  'Taxas de Maquininha / Antecipação',          '4.4',  3, 'expense', 'debit',  true,  true, 'Desp. Financeiras', 64),

    -- 4.5 Outras Despesas
    ('4.5',     'Outras Despesas',                            '4',    2, 'expense', 'debit',  false, true, 'Outras Despesas', 65),
    ('4.5.01',  'Despesas Médicas / Hospitalares (Não CSP)',   '4.5',  3, 'expense', 'debit',  true,  true, 'Outras Despesas', 66),
    ('4.5.02',  'Despesas Diversas Não Classificadas',        '4.5',  3, 'expense', 'debit',  true,  true, 'Outras Despesas', 67),

    -- ===================== GRUPO 5 — RESULTADO =====================
    ('5',       'RESULTADO / DISTRIBUIÇÃO',                   NULL,   1, 'equity',  'credit', false, true, 'Resultado', 68),
    ('5.1',     'Distribuição de Lucros',                     '5',    2, 'equity',  'credit', false, true, 'Resultado', 69),
    ('5.1.01',  'Antecipação de Lucros / Retirada do Sócio',  '5.1',  3, 'equity',  'debit',  true,  true, 'Resultado', 70),
    ('5.1.02',  'Reserva de Lucros',                          '5.1',  3, 'equity',  'credit', true,  true, 'Resultado', 71)

) AS t(code, name, parent_code, level, account_type, account_nature, is_analytical, show_in_dre, dre_group, dre_order)
ON CONFLICT DO NOTHING;
