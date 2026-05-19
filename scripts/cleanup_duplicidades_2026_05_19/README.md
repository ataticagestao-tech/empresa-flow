# Limpeza retroativa de duplicidades — 2026-05-19

Resolve o passivo histórico identificado na auditoria
[scripts/audit_duplicidades_global.sql](../audit_duplicidades_global.sql).

## Foto do passivo (antes da limpeza)

| Vetor | Volume | Severidade |
|-------|--------|-----------|
| CRs irmãos "Antecipação" (assinatura do bug do bulk) | 26 CRs / 13 grupos | 💰 Dinheiro 2x |
| CRs com 2+ movs vinculadas | 14 CRs | 💰 Dinheiro 2x |
| Movs sem amarração (origem=CR/CP, FK NULL) | 18.302 movs | 🔗 Re-vincular |
| Bank_tx com 2+ matches em brm | 642 bank_tx | 🧹 Cosmético |
| Contas com saldo divergente | 16 contas | 📊 Sintoma |

## Ordem de execução

Rode **uma fase por vez** no Supabase SQL Editor. Cada fase tem `BEGIN/COMMIT`,
backup automático em tabela `backup_dedup_faseN_*_20260519`, validação no final
e seção de "como reverter" no rodapé.

1. **`fase1_movs_duplicadas_em_cr.sql`** — Deleta movs duplicadas dos 14 CRs.
   Backup: `backup_dedup_fase1_movs_20260519`.
2. **`fase2_revincular_movs_fantasma.sql`** — Pareia 1-pra-1 as movs sem FK
   com CRs/CPs candidatos. Backup: `backup_dedup_fase2_revinculo_20260519`.
3. **`fase3_dedup_bank_tx_matches.sql`** — Marca matches duplicados como
   `superseded` (mantém histórico). Backup: `backup_dedup_fase3_matches_20260519`.
4. **`fase4_dedup_crs_antecipacao_e_recalc_saldo.sql`** — Soft-deleta os 26
   CRs duplicados + recalcula `current_balance` de TODAS as contas.
   Backups: `backup_dedup_fase4_crs_20260519`, `_movs_20260519`, `_saldos_20260519`.

## Por que essa ordem

- **Fase 1 antes da Fase 2**: se eu re-vincular as fantasmas primeiro, posso
  recriar CRs com 2+ movs (recriaria o problema da Fase 1).
- **Fase 2 antes da Fase 4**: o recalc de saldo só funciona se as movs estiverem
  todas amarradas corretamente.
- **Fase 3 em qualquer momento**: não afeta saldo nem movs, é cosmético.
- **Fase 4 por último**: recalc final que depende de tudo estar limpo.

## Validação final

Após a Fase 4, descomenta a query no rodapé do arquivo dela. Tudo deve voltar
em 0 (exceto `movs_fantasma_*_restantes` se houver casos sem CR/CP candidato).

## Reversão

Cada arquivo tem o bloco SQL comentado de reversão no rodapé. Em emergência:
descomenta e roda. As backup tables ficam no banco até alguém apagar.

## Para limpar as backup tables depois (após uma semana funcionando):

```sql
DROP TABLE IF EXISTS backup_dedup_fase1_movs_20260519;
DROP TABLE IF EXISTS backup_dedup_fase2_revinculo_20260519;
DROP TABLE IF EXISTS backup_dedup_fase3_matches_20260519;
DROP TABLE IF EXISTS backup_dedup_fase4_crs_20260519;
DROP TABLE IF EXISTS backup_dedup_fase4_movs_20260519;
DROP TABLE IF EXISTS backup_dedup_fase4_saldos_20260519;
```
