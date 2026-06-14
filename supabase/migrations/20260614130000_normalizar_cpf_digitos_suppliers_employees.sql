-- ============================================================================
-- Normalização de CPF/CNPJ para dígitos puros — suppliers e employees
-- ----------------------------------------------------------------------------
-- Extensão de 20260614120000_normalizar_cpf_digitos.sql para as tabelas de
-- cadastro de fornecedores e funcionários, fechando a mesma classe de bug de
-- "match por documento não casa por causa do formato" (ver project_pix_credor_match:
-- vínculo de CP a funcionário/fornecedor compara credor_cpf_cnpj × cpf).
--
-- Reusa a função normalizar_doc_digitos() já criada na migration anterior.
--
-- Verificado em produção (dry-run em transação com ROLLBACK, 2026-06-14):
--   - employees: só triggers de updated_at; suppliers: updated_at + audit.
--     Nenhum bloqueio, nenhum efeito colateral (sem mov/folha/encargo disparado).
--   - Backfill afeta: employees.cpf 78, suppliers.cpf_cnpj 51,
--     suppliers.dados_bancarios_titular_cpf_cnpj 0.
--   - Exibição inalterada: Funcionarios.tsx exibe via formatCPF e agora também
--     formata o CPF na carga do form; SupplierForm já formata na carga (maskCPF/
--     maskCNPJ) e salva via unmask. Match já usa onlyDigits/replace(\D).
-- ============================================================================

-- 1) Backfill ----------------------------------------------------------------
UPDATE employees
   SET cpf = regexp_replace(cpf, '[^0-9]', '', 'g')
 WHERE cpf ~ '[^0-9]';

UPDATE suppliers
   SET cpf_cnpj = regexp_replace(cpf_cnpj, '[^0-9]', '', 'g')
 WHERE cpf_cnpj ~ '[^0-9]';

UPDATE suppliers
   SET dados_bancarios_titular_cpf_cnpj = regexp_replace(dados_bancarios_titular_cpf_cnpj, '[^0-9]', '', 'g')
 WHERE dados_bancarios_titular_cpf_cnpj ~ '[^0-9]';

-- 2) Enforcement na escrita (reusa normalizar_doc_digitos) --------------------
DROP TRIGGER IF EXISTS trg_norm_doc_employees ON employees;
CREATE TRIGGER trg_norm_doc_employees
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('cpf');

DROP TRIGGER IF EXISTS trg_norm_doc_suppliers ON suppliers;
CREATE TRIGGER trg_norm_doc_suppliers
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('cpf_cnpj');

DROP TRIGGER IF EXISTS trg_norm_doc_suppliers_titular ON suppliers;
CREATE TRIGGER trg_norm_doc_suppliers_titular
  BEFORE INSERT OR UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('dados_bancarios_titular_cpf_cnpj');
