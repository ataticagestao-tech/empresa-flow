-- ============================================================
-- Limpeza: vendas futuras de 008 TABOÃO AZUL importadas por engano
-- ============================================================
--
-- Contexto: o SELECT exploratório rodado antes da quitação retroativa
-- (20260410200000) revelou vendas confirmadas com data_venda entre
-- 2026-04-30 e 2026-12-02 em 008 TABOÃO AZUL. A operadora confirmou
-- em 2026-04-10 que esse bloco veio de um CSV com datas erradas —
-- não são agendamentos legítimos.
--
-- A contagem detalhada é:
--   • 661 vendas órfãs (sem nenhuma CR associada)
--   • 112 vendas com 1 CR em aberto cada, totalizando R$ 5.060
--   Total: 773 vendas a remover nesta transação.
--
-- Se ficassem na base causariam dois problemas:
--   1. O modo Caixa do Painel Gerencial mostraria dinheiro "recebido"
--      em meses futuros assim que qualquer quitação retroativa fosse
--      aplicada sobre essas CRs.
--   2. O modo Competência inflaria o faturamento projetado por unidade.
--
-- Escopo estritamente restrito a 008 TABOÃO AZUL:
--   • HAIR OF BRASIL LTDA (R$ 350k em 25 vendas futuras, incluindo
--     parceladas abertas e 8 pagas com movimentações reais) é cliente
--     legítimo — explicitamente NÃO TOCAR.
--   • Nova Tech Digital (3 vendas sem CR) fica de fora até confirmação.
--   • As outras 11 unidades do grupo não têm nenhuma venda futura.
--
-- Ordem de exclusão (contorna os triggers de imutabilidade financeira):
--   1. Soft-delete das CRs (trigger bloquear_edicao_pago permite
--      quando NEW.deleted_at vira NOT NULL a partir de NULL)
--   2. Hard-delete das CRs (trigger forcar_soft_delete permite
--      porque deleted_at já está setado)
--   3. Delete dos vendas_itens
--   4. Delete das vendas

BEGIN;

CREATE TEMP TABLE tmp_vendas_futuras_alvo ON COMMIT DROP AS
SELECT v.id
FROM public.vendas v
JOIN public.companies c ON c.id = v.company_id
WHERE v.data_venda > CURRENT_DATE
  AND v.status = 'confirmado'
  AND COALESCE(c.nome_fantasia, c.razao_social) = '008 TABOÃO AZUL';

-- 1. Soft-delete das CRs vinculadas (as 112 em aberto)
UPDATE public.contas_receber
SET deleted_at = now()
WHERE venda_id IN (SELECT id FROM tmp_vendas_futuras_alvo)
  AND deleted_at IS NULL;

-- 2. Hard-delete das CRs (trigger libera após deleted_at setado)
DELETE FROM public.contas_receber
WHERE venda_id IN (SELECT id FROM tmp_vendas_futuras_alvo);

-- 3. Delete dos itens das vendas
DELETE FROM public.vendas_itens
WHERE venda_id IN (SELECT id FROM tmp_vendas_futuras_alvo);

-- 4. Delete das vendas
DELETE FROM public.vendas
WHERE id IN (SELECT id FROM tmp_vendas_futuras_alvo);

COMMIT;
