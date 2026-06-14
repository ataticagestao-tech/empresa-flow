-- ============================================================================
-- Normalização de CPF/CNPJ para dígitos puros (sem máscara)
-- ----------------------------------------------------------------------------
-- Contexto: o CPF/CNPJ era gravado de forma inconsistente — umas linhas limpas
-- ("60572617333"), outras mascaradas ("605.726.173-33"). Isso quebrava o match
-- entre clients × vendas × contas_receber (ex.: histórico financeiro do cliente
-- aparecia vazio mesmo com CR pago vinculado, porque um .eq exato só casava UM
-- dos formatos).
--
-- O formato canônico do sistema é DÍGITOS PUROS: os forms já salvam via unmask()
-- e exibem via formatDoc()/maskCPF() (idempotentes). As máscaras no banco são
-- legado de imports e RPCs antigos.
--
-- Esta migration:
--   1) Backfill: tira a máscara de todas as linhas existentes (4 colunas).
--   2) Trigger BEFORE INSERT/UPDATE: mantém os dados em dígitos puros daqui pra
--      frente, qualquer que seja o caminho de escrita (form, RPC, import).
--
-- Verificado em produção (dry-run em transação com ROLLBACK, 2026-06-14):
--   - Nenhum trigger bloqueia o UPDATE do CPF em CR/CP pagos.
--   - O backfill NÃO cria movimentações nem repasses duplicados
--     (garantir_mov_ao_quitar é guardado por transição de status).
-- ============================================================================

-- 1) Backfill dos dados existentes -------------------------------------------
UPDATE clients
   SET cpf_cnpj = regexp_replace(cpf_cnpj, '[^0-9]', '', 'g')
 WHERE cpf_cnpj ~ '[^0-9]';

UPDATE vendas
   SET cliente_cpf_cnpj = regexp_replace(cliente_cpf_cnpj, '[^0-9]', '', 'g')
 WHERE cliente_cpf_cnpj ~ '[^0-9]';

UPDATE contas_receber
   SET pagador_cpf_cnpj = regexp_replace(pagador_cpf_cnpj, '[^0-9]', '', 'g')
 WHERE pagador_cpf_cnpj ~ '[^0-9]';

UPDATE contas_pagar
   SET credor_cpf_cnpj = regexp_replace(credor_cpf_cnpj, '[^0-9]', '', 'g')
 WHERE credor_cpf_cnpj ~ '[^0-9]';

-- 2) Enforcement na escrita ---------------------------------------------------
-- Função genérica: recebe o nome da coluna via TG_ARGV[0] e, se o valor tiver
-- qualquer caractere não-numérico, reescreve só essa coluna em dígitos puros.
-- Idempotente: valor já em dígitos passa intacto (não conta como "mudança",
-- então não dispara triggers de edição de linha paga).
CREATE OR REPLACE FUNCTION normalizar_doc_digitos()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col text := TG_ARGV[0];
  val text := to_jsonb(NEW) ->> (TG_ARGV[0]);
BEGIN
  IF val IS NOT NULL AND val ~ '[^0-9]' THEN
    NEW := jsonb_populate_record(
      NEW,
      jsonb_build_object(col, regexp_replace(val, '[^0-9]', '', 'g'))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_norm_doc_clients ON clients;
CREATE TRIGGER trg_norm_doc_clients
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('cpf_cnpj');

DROP TRIGGER IF EXISTS trg_norm_doc_vendas ON vendas;
CREATE TRIGGER trg_norm_doc_vendas
  BEFORE INSERT OR UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('cliente_cpf_cnpj');

DROP TRIGGER IF EXISTS trg_norm_doc_contas_receber ON contas_receber;
CREATE TRIGGER trg_norm_doc_contas_receber
  BEFORE INSERT OR UPDATE ON contas_receber
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('pagador_cpf_cnpj');

DROP TRIGGER IF EXISTS trg_norm_doc_contas_pagar ON contas_pagar;
CREATE TRIGGER trg_norm_doc_contas_pagar
  BEFORE INSERT OR UPDATE ON contas_pagar
  FOR EACH ROW EXECUTE FUNCTION normalizar_doc_digitos('credor_cpf_cnpj');
