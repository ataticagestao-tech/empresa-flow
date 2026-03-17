-- Adiciona grupo "TRANSFERÊNCIAS" ao plano de contas de todas as empresas
DO $$
DECLARE
    r_company RECORD;
    v_transf_id UUID;
BEGIN
    FOR r_company IN SELECT id FROM companies LOOP

        -- Só insere se ainda não existe o grupo 3 (Transferências)
        IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = r_company.id AND code = '3') THEN

            -- 3. TRANSFERÊNCIAS
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic)
            VALUES (gen_random_uuid(), r_company.id, '3', 'TRANSFERÊNCIAS', 'receita', false)
            RETURNING id INTO v_transf_id;

            -- 3.01 Transferência entre Contas Correntes
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.01', 'Transferência entre Contas Correntes', 'receita', true, v_transf_id);

            -- 3.02 Aplicação Financeira
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.02', 'Aplicação Financeira', 'receita', true, v_transf_id);

            -- 3.03 Resgate de Aplicação
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.03', 'Resgate de Aplicação', 'receita', true, v_transf_id);

            -- 3.04 Aporte de Capital / Sócios
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.04', 'Aporte de Capital / Sócios', 'receita', true, v_transf_id);

            -- 3.05 Empréstimo Recebido
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.05', 'Empréstimo Recebido', 'receita', true, v_transf_id);

            -- 3.06 Devolução / Estorno
            INSERT INTO chart_of_accounts (id, company_id, code, name, type, is_analytic, parent_id)
            VALUES (gen_random_uuid(), r_company.id, '3.06', 'Devolução / Estorno', 'receita', true, v_transf_id);

        END IF;
    END LOOP;
END $$;
