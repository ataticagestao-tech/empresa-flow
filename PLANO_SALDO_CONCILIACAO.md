# Plano — Saldo ancorado no extrato + Conciliação que fecha + Cartão/Taxas

> Objetivo: deixar o saldo bancário **100% confiável**, com a conciliação realmente
> "fechando" contra o banco, e o cartão (Stone) entrando pela **agenda de recebíveis**
> em vez de ser chutado pelo sistema. Origem: investigação 2026-06-02 (HAIR).

## LIMPEZA DO RAZÃO (2026-06-02)
- **Ajuste de saldo FAKE removido:** mov id `f0a5153e-1dae-4c92-b2f1-d23ed9ae2999` (Stone HAIR, 13/05, −R$ 661.863,63, "Ajuste de saldo de abertura", categoria "Ajuste de Saldo (Saída)"). Era o band-aid do botão "Ajustar saldo automaticamente". **Backup completo (jsonb) em `movimentacoes_arquivadas`** (motivo + data) — restaurável reinserindo `dados` em `movimentacoes`. Saldo NÃO mudou (ancorado no banco). Removeu R$661k de lixo do DRE/razão.
- **PENDENTE:** repasses de cartão DUPLICADOS no razão (Stone movimentado pós-remoção = +521k vs banco +37k → ~484k de crédito inflado/duplicado: 130 CR-credito R$477k + 90 manual-credito R$224k, muito em dobro). Investigar/limpar com calma — NÃO afeta o saldo (ancorado), só o DRE.

## ESTADO ATUAL (2026-06-02) — nada deployado, só local
- ✅ **Fase 1** — divergência banco × sistema visível (painel + captura do LEDGERBAL no import OFX).
- ✅ **Fase 2** — saldo ancorado no extrato. AGORA GLOBAL: a view `v_saldo_contas_bancarias` usa o LEDGERBAL como saldo_atual quando há extrato (senão fallback). Migration `20260602210000_saldo_ancorado_extrato.sql` aplicada. HAIR Stone: razão −140k → saldo +37.467,72 (banco). Só contas com extrato mudam. DRE/razão ainda sujo (ver abaixo) — separado do saldo agora.
- ✅ **Fase 3** — conciliação que zera: 3.1 diagnóstico (coluna "a conciliar") + 3.2 fechar período + trava (não desconcilia mês fechado) + reabrir.
- ✅ **Fase 4.1/4.2** — agenda Stone importada + substituição dos CR de cartão (APLICADA na HAIR: 209 errados → 303 corretos, R$ 293.171,42 líquido).
- 🟡 **Fase 4.3** — taxa de cartão: visível por mês + integrada como DEDUÇÃO na margem/Composição do Resultado dos Indicadores (faturamento bruto → −taxa → receita líquida). Lançamento formal no razão NÃO feito (decisão pendente).
- **Deploy:** tudo local. Publicar = `git push fork main` + `npx vercel --prod --yes`. Migrations já aplicadas em prod.
- **Próximos:** completar agenda mensalmente (recorrente), Fase 3, e decidir os CP manuais de taxa.

## 1. Diagnóstico (a causa-raiz)

- O saldo da UI vem da view `v_saldo_contas_bancarias`:
  `saldo_atual = initial_balance + Σ(movimentacoes: credito − debito)`.
  **Ignora o extrato** (`bank_transactions`) por completo.
- **Conciliar** só liga a linha do extrato a um CR/CP (categoriza). **Não corrige o saldo.**
  Por isso o saldo nunca bate com o banco mesmo conciliando 100%.
- Evidência HAIR / conta Stone:
  - Razão interno: créditos R$ 702k − débitos R$ 842k = **−R$ 140k** → saldo −99k.
  - Extrato real (192 linhas, jan–mai): líquido **+R$ 12k**.
  - **~R$ 150k de divergência**, com 138/192 linhas já conciliadas.
- **Cartão lançado no bruto como caixa** + **taxa da operadora inexistente** no sistema →
  DRE infla a margem, o caixa não fecha, e o relatório precisa de ajuste manual.

## 2. Princípio do conserto

> **Fonte externa = verdade.** O **extrato** manda no saldo. A **agenda da operadora**
> manda no cartão. O razão (`movimentacoes`) serve pra DRE/categoria — não pro saldo.

Hoje está invertido (o razão manda, o banco é ignorado). Inverter isso é o conserto.

## 3. O que o sistema JÁ tem a favor

- OFX parser (`src/lib/parsers/ofx.ts`) **já lê** `closingBalance` (LEDGERBAL/BALAMT) +
  `closingDate` (DTASOF) — hoje só alimenta o popup de import e é descartado.
- `bank_transactions`: `date, amount, status, reconciled_payable_id, reconciled_receivable_id,
  reconciled_at, source, import_file_id, category_id`. (Sem coluna de saldo.)
- `bank_accounts`: `initial_balance, current_balance (inutilizado), data_saldo_inicial,
  ofx_acctid, auto_conciliacao_policy`.
- "Conciliar com diferença" já cria **CP/CR auxiliar com categoria** → gancho pronto pra taxa.
- Gate de segurança no import (`statementSecurity.ts`) já compara saldo na importação.

## 4. Premissas do cartão (confirmadas com a Izabel — 2026-06-02)

- Operadora: **majoritariamente Stone**.
- Agenda de recebíveis: obtida por **relatório Excel** (download).
- Empresas que **não antecipam recebem em D+1** → todo cartão (incl. parcelado) liquida
  **líquido em D+1**. Logo os CR de cartão espalhados por meses estão ERRADOS e serão
  substituídos pela agenda. "A receber de cartão" vira só o pipeline de ~1 dia (≈ caixa).
- Empresas que antecipam: a agenda reflete a antecipação (reimportar quando muda).

## 5. Fases (cada uma entrega valor sozinha)

### Fase 1 — Tornar a divergência VISÍVEL  *(risco zero, não muda saldo)*  ✅ FEITO 2026-06-02 (não deployado)
- Migration aplicada em prod: `supabase/migrations/20260602130000_bank_statement_balances.sql`.
- Captura: `src/modules/finance/application/statementBalance.ts` (`recordStatementBalance`) chamada no `uploadOFX` ([useBankReconciliation.ts]).
- Painel: `src/components/dashboard/SaldoBancoVsSistema.tsx` + hook `useSaldoBancoVsSistema` (em `useContasSaldo.ts`), plugado no topo de `ContasBancarias.tsx`.
- O painel só popula após a PRÓXIMA importação de OFX (o saldo histórico foi descartado). Pendência: também capturar no import por e-mail (`importar-extrato-email`).

- Persistir o saldo do banco por importação. Preferência: tabela
  `bank_statement_balances (id, bank_account_id, company_id, as_of_date, closing_balance,
  import_file_id, created_at)` — guarda histórico de cada extrato.
  (Alternativa mínima: colunas `extrato_saldo` + `extrato_saldo_data` em `bank_accounts`.)
- Gravar `closingBalance`/`closingDate` no fluxo de import OFX (já vêm do parser).
- Painel **"Banco × Sistema × Diferença"** por conta (em ContasBancarias e/ou Conciliação).
- Nenhum saldo muda ainda — só fica visível o buraco (a Stone vai gritar).

### Fase 2 — Saldo ancorado no extrato  *(resolve o Fluxo de Caixa de vez)*  ✅ FEITO 2026-06-02 (parcial, não deployado)
- `useSaldoBancoVsSistema` agora devolve `saldoEfetivo` (= banco quando tem extrato, senão sistema) + `fonte`.
- O editor de Saldo do **Fluxo de Caixa Projetado** usa `saldoEfetivo` por conta (mostra "banco · extrato DD/MM" ou "sistema"). Stone deixa de ser −99k e vira +37k. Override manual mantido pra exceções.
- **Escopo:** só o Fluxo foi ancorado. A view global `v_saldo_contas_bancarias` e os dashboards/Contas Bancárias AINDA mostram o saldo antigo (o painel de divergência revela o gap). Propagar pro global é o próximo incremento (mais arriscado — afeta todas as telas).

- Saldo real = `closing_balance` (último extrato) + `Σ(bank_transactions com date > as_of_date)`
  + lançamentos pendentes ainda não no extrato.
- Conta sem extrato importado → fallback no modelo antigo (não quebra quem não usa OFX).
- Fluxo de Caixa Projetado e dashboards passam a usar esse saldo → **acaba o override manual**.

### Fase 3 — Conciliação que ZERA  *(o "fechar" de verdade)*

**3.1 — Diagnóstico de fechamento** ✅ FEITO 2026-06-02 (não deployado)
- "Conciliado" = `bank_transactions.status='reconciled'`; "pendente" = `'pending'` (HAIR: 641 rec / 116 pend / 1 ignored).
- Painel `SaldoBancoVsSistema` (em Conciliação + ContasBancarias) ganhou coluna **"A conciliar"** = nº de lançamentos pendentes por conta (hook `useSaldoBancoVsSistema` agrega bank_transactions status=pending). Mostra o que falta conciliar pra a diferença zerar. Read-only.
**3.2 — Fechar período + travar** ✅ FEITO 2026-06-02 (não deployado, não testado com fechamento real)
- Migration `20260602190000_reconciliation_closings.sql` (aplicada): tabela `reconciliation_closings` (company/conta/period_end/closing_balance/system_balance/difference/closed_at/closed_by) + RLS.
- TRAVA via trigger `trg_block_unreconcile_closed` em bank_transactions (BEFORE UPDATE, security definer): bloqueia DESCONCILIAR (status reconciled→outro ou reconciled_at→null) lançamento com date <= período fechado. Estreita — só a transição de desconciliar; resto passa.
- UI: painel `SaldoBancoVsSistema` ganhou coluna "Fechamento" — botão "Fechar" por conta (verde se diferença=0; branco+aviso se ≠0) que grava o closing; quando fechado mostra 🔒 data + "Reabrir" (deleta o closing → destrava). Funções fechar/reabrir no componente via activeClient.
- Fase 3 COMPLETA (3.1 diagnóstico + 3.2 fechar/travar).

- Fechamento por período: `saldo_inicial_periodo + Σ(cleared) == closing_balance?`
  → mostra a diferença a explicar; resolve item a item até **dar zero**; **trava o período**.
- Usa `bank_transactions.status` (pendente/conciliado) como "cleared".

### Fase 4 — Cartão & taxas (agenda Stone como verdade)

**4.1 — Modelo + importador da agenda** ✅ FEITO 2026-06-02 (não deployado)
- Migration `supabase/migrations/20260602150000_card_receivables.sql` (tabela `card_receivables`, RLS has_company_access) — aplicada em prod.
- Parser `src/lib/parsers/stoneAgenda.ts` — colunas reais da Agenda Stone (1 linha/parcela): DATA DE VENCIMENTO = liquidação, VALOR LÍQUIDO, DESCONTO DE MDR/ANTECIPAÇÃO. Hash estável por parcela (Stone ID vem truncado em notação científica → não usar sozinho).
- Tela `src/pages/RecebiveisCartao.tsx` (rota `/recebiveis-cartao`, menu Financeiro › Cobrança › Recebíveis de Cartão): upload Excel/CSV → prévia (bruto/líquido/taxa/período) → importar (upsert por content_hash, não duplica).
- AINDA NÃO toca contas_receber (4.2) nem lança taxa (4.3) nem concilia (4.4).

**4.2 — Substituir os CR de cartão errados** 🟡 EM ANDAMENTO 2026-06-02
- Preview "antes × depois" FEITO (em RecebiveisCartao.tsx): compara CR de cartão abertos no sistema × agenda importada, com avisos (agenda vazia / parcial / completa). Read-only, não muda nada.
- DADOS HAIR: 209 CR de cartão abertos = R$ 242.487,79, TODOS sem conciliação (0 linkados ao banco) → substituir é baixo risco. Agenda ainda VAZIA (Izabel só pré-visualizou; arquivo de amostra tinha 36 parcelas vs 209 do sistema → PRECISA do relatório COMPLETO).
- APLICAR + DESFAZER FEITO 2026-06-02 (não deployado, NÃO testado em apply real — agenda HAIR ainda incompleta, botão fica desabilitado até verde):
  - Migration `20260602170000_cr_card_receivable_link.sql` (aplicada): `contas_receber.card_receivable_id` (liga CR gerado à agenda) + `substituido_em` (marca originais arquivados).
  - Guard: botão só habilita quando agenda ≥ 90% da contagem de CR (verde). aplicarSubstituicao re-checa isso antes de rodar.
  - Apply: soft-delete dos CR originais (deleted_at + substituido_em) + INSERT pela agenda (valor=líquido, data certa, forma=cartao_credito, pagador="Stone (repasse cartão)", competencia=mês da venda, SEM venda link, SEM conta_contabil_id). Dedup por card_receivable_id.
  - Desfazer: arquiva os gerados (card_receivable_id not null) + restaura os originais (substituido_em not null → deleted_at=null).
- RECORRÊNCIA (2026-06-02): a agenda é VIVA — meses futuros crescem com novas vendas. A substituição é idempotente/incremental: re-importar a agenda completa + Aplicar de novo dobra só as vendas novas (dedup por card_receivable_id), sem duplicar nem mexer no já feito. Painel mostra "antes × depois" sempre que houver CR originais a corrigir (mesmo com substituição ativa) + bloco "Substituição ativa + Desfazer". Completude mira o TOTAL (originais + já gerados) → exige re-import da agenda COMPLETA a cada rodada.
- PENDENTE: testar o apply real quando a agenda estiver completa. Refinamento: categoria (conta_contabil_id) nos CR gerados.


- **Importador de agenda Stone (Excel):** parse → itens
  `{ data prevista, bruto, líquido, taxa, bandeira, parcela, antecipado? }`.
- Importou → **substitui (soft-delete) os CR de cartão errados**; entram os corretos (líquidos).
- **Taxa = bruto − líquido** → despesa de adquirência no DRE (captura, não chute).

**4.3 — Taxa como despesa** 🟡 PARCIAL 2026-06-02
- DESCOBERTA: dois "DREs" divergentes. `fn_gerar_dre` (RPC) é MOVIMENTAÇÃO-based → já vê o cartão no LÍQUIDO (taxa implícita). `useMargens` (painel Indicadores) é COMPETÊNCIA-based (vendas bruto + CP) → margem aparece MAIOR que a real.
- BLOQUEIO p/ lançar formalmente: (a) HAIR já tem ~R$ 41k de taxa lançada manual como CP (4.4.05 R$1.184 + 4.4.06 R$39.966) → somar agenda duplicaria; (b) useMargens é GLOBAL/multi-empresa → regra "descontar da agenda" quebraria empresas sem agenda. Categoria pronta: 4.4.05 "Taxas de Maquininha".
- FEITO (seguro): card "Custo de adquirência (taxa) por mês" em RecebiveisCartao.tsx (taxa da agenda pelo mês da venda). Só visibilidade.
- GOTCHA DESCOBERTO: os "R$41k de taxa" não eram MDR! 4.4.06 "Cartão de Crédito" (R$39.966) = FATURA do cartão da EMPRESA (despesa real separada). Só 4.4.05 "Taxas de Maquininha" (R$1.184, jan) é MDR de verdade. Excluir "cartão" cegamente teria apagado R$39k de despesa legítima.
- INTEGRADO NA MARGEM (FEITO 2026-06-02): `fetchMargensRaw` (useMargens, usado por useContextoIndicadores → painel Indicadores) agora soma a taxa MDR da agenda (por data_venda) como DEDUÇÃO em despesaOperacional → reduz o Resultado, faturamento fica BRUTO. Anti-duplicata: quando a agenda tem taxa, pula só CP de categoria "maquininha/adquir/mdr" (`isTaxaMaquininha` por NOME), mantém "Cartão de Crédito"/fatura intacto. Multi-empresa seguro: sem agenda → taxaCartao=0, nada muda.
- Repasse no banco **concilia contra o item da agenda**.
- Antecipação: reimportar a agenda quando muda.
- *Tabela de taxas (opcional)* = só **estimativa** pra projetar o que ainda não tem agenda.

### ⚡ Ganho rápido (antes da Fase 4)
- Já dá pra lançar a **taxa como despesa na "conciliação com diferença"** ao conciliar um
  repasse de cartão — usando o que já existe. Melhora DRE/fechamento sem esperar a estrutura.

## 6. Ordem sugerida
Fase 1 → Fase 2 (saldo confiável + Fluxo) → Fase 4 (cartão, o que mais dói no fechamento)
→ Fase 3 (fechamento formal). Ajustável conforme prioridade.

## 7. Princípios de segurança ao implementar
- Migrations sempre aditivas; conta sem extrato continua no modelo antigo (fallback).
- Substituição de CR de cartão = **soft-delete** (`deleted_at`), nunca DELETE.
- Validar com a HAIR (conta Stone) como caso de teste antes de generalizar.
