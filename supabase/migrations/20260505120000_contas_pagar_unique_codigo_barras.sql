-- Bloqueia duplicatas de contas_pagar por codigo_barras dentro do mesmo company_id.
-- Implementado via trigger (nao via UNIQUE INDEX) para nao falhar com duplicatas legadas:
-- a validacao so roda em INSERT/UPDATE, ignorando o estado historico do banco.
-- Linhas com codigo_barras vazio/nulo ou soft-deletadas sao ignoradas.

CREATE OR REPLACE FUNCTION trg_contas_pagar_unique_codigo_barras()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_barras IS NULL
     OR NEW.codigo_barras = ''
     OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM contas_pagar
    WHERE company_id = NEW.company_id
      AND codigo_barras = NEW.codigo_barras
      AND deleted_at IS NULL
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION
      'duplicate key value violates unique constraint "uq_contas_pagar_codigo_barras"'
      USING ERRCODE = '23505',
            HINT = 'Ja existe outra conta a pagar ativa com este codigo de barras nesta empresa.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contas_pagar_unique_codigo_barras ON contas_pagar;

CREATE TRIGGER contas_pagar_unique_codigo_barras
  BEFORE INSERT OR UPDATE OF codigo_barras, deleted_at, company_id ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION trg_contas_pagar_unique_codigo_barras();

COMMENT ON FUNCTION trg_contas_pagar_unique_codigo_barras IS
  'Bloqueia duas contas_pagar ativas com o mesmo codigo_barras na mesma empresa. So valida linhas novas/alteradas; duplicatas pre-existentes nao sao tocadas.';
