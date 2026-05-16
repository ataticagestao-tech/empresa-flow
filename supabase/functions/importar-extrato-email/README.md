# importar-extrato-email

Polla uma caixa Gmail, lê emails não lidos com anexo OFX, importa as transações pra
`bank_transactions` e (opcionalmente) auto-concilia matches de alta confiança.

## Como funciona

1. Cron (pg_cron) chama esta função de hora em hora.
2. Função autentica no Gmail via OAuth refresh_token.
3. Lista emails não lidos que casam com `GMAIL_QUERY` (padrão: `is:unread has:attachment (filename:ofx OR filename:OFX)`).
4. Pra cada email:
   - Lê o anexo `.ofx`.
   - Extrai `ACCTID` do header OFX.
   - Procura `bank_accounts` com `ofx_acctid = ACCTID`.
   - Se não achar conta: registra `unmatched_account` em `email_import_log` e **deixa o email não-lido** pra você ver e cadastrar o ACCTID.
   - Se achar: faz upsert das transações em `bank_transactions` (dedup via `fit_id`).
   - Se a conta tem `auto_conciliacao_policy = 'rule_only'`: chama RPC `auto_conciliar_extrato` que aplica matches de regra Alta confiança + acao=auto-conciliar.
   - Marca email como lido.

Idempotência: o `message_id` do Gmail é UNIQUE em `email_import_log` — re-execuções não reprocessam.

## Setup inicial (uma vez)

### 1. Criar credenciais OAuth no Google Cloud

- Vá em https://console.cloud.google.com/apis/credentials
- Use o **mesmo projeto** que já hospeda Google Calendar (reusa o consent screen).
- Crie **OAuth 2.0 Client ID** tipo "Desktop app" (ou Web, tanto faz pra esse uso).
- Habilite a **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
- Anote `client_id` e `client_secret`.

### 2. Conseguir o refresh_token (OAuth Playground)

Caminho mais rápido (sem código):

1. Abra https://developers.google.com/oauthplayground/
2. Clique no ícone de engrenagem (canto superior direito) → marque **"Use your own OAuth credentials"** → cole `client_id` e `client_secret`.
3. No painel da esquerda, role até **"Gmail API v1"** e selecione:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify` (precisa pra marcar como lido)
4. Clique **"Authorize APIs"** → faça login na caixa que vai receber os extratos (ex: `extratos@suaempresa.com.br`).
5. Clique **"Exchange authorization code for tokens"** → copie o `refresh_token`.

### 3. Cadastrar secrets na Supabase

No projeto Supabase (Dashboard > Project Settings > Edge Functions > Secrets):

| Secret | Valor |
|--------|-------|
| `GMAIL_CLIENT_ID` | do passo 1 |
| `GMAIL_CLIENT_SECRET` | do passo 1 |
| `GMAIL_REFRESH_TOKEN` | do passo 2 |
| `GMAIL_QUERY` (opcional) | filtro Gmail customizado |
| `GMAIL_MAX_PER_RUN` (opcional) | default 20 |

Ou via CLI:

```bash
supabase secrets set GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=...
```

### 4. Cadastrar secrets do Vault (pra cron chamar a função)

No SQL Editor:

```sql
SELECT vault.create_secret('https://SEUPROJETO.supabase.co', 'supabase_url');
SELECT vault.create_secret('eyJh...service_role_key', 'service_role_key');
```

(O service_role_key está em Dashboard > Project Settings > API.)

### 5. Aplicar as migrations

```bash
supabase db push
```

Isso cria:
- `bank_accounts.ofx_acctid`, `auto_conciliacao_policy`
- Tabela `email_import_log`
- RPC `auto_conciliar_extrato`
- Cron job `importar-extrato-email-hourly`

### 6. Deploy da função

```bash
supabase functions deploy importar-extrato-email
```

### 7. Cadastrar o ACCTID em cada bank_account

- Pegue um OFX recente do banco, abra em editor de texto.
- Procure por `<ACCTID>NUMERODACONTA</ACCTID>`.
- Em **Contas Bancárias > Editar**, cole no campo "ID da conta no OFX (ACCTID)".
- Defina **"Auto-conciliar ao importar"** como `Sim, só via regra de alta confiança` se quiser que matches Alta+auto-conciliar sejam aplicados sozinhos.

### 8. Testar manualmente

Envie um email pra caixa configurada com um `.ofx` anexo e dispare a função:

```bash
curl -X POST https://SEUPROJETO.supabase.co/functions/v1/importar-extrato-email \
  -H "Authorization: Bearer SERVICE_ROLE_KEY"
```

Resposta esperada:
```json
{
  "processed": 1,
  "imported": 12,
  "auto_reconciled": 7,
  "skipped_already_processed": 0,
  "unmatched_account": 0,
  "errors": 0,
  "details": [...]
}
```

Verifique:
- `SELECT * FROM email_import_log ORDER BY processed_at DESC LIMIT 5;`
- A tela de Conciliação Bancária deve mostrar as novas transações importadas (status pending) ou já conciliadas.

## Política de auto-conciliação

A RPC `auto_conciliar_extrato` é **conservadora** por design:

✅ **Aplica match quando:**
- Existe regra ativa com `acao='auto-conciliar'`, `confianca='Alta'`, `account_id` preenchido.
- A regra bate por palavra-chave (caso-insensitive, sem acento).
- O tipo da transação (debit/credit) bate com `rule.tipo_transacao` (ou regra é genérica).
- **E** existe CR/CP em aberto com valor exato (±0.01) e data ±3 dias → conecta a esse lançamento.
- **OU** a regra tem `valor_referencia` que bate ±1% → cria CR/CP novo via `conciliar_lote`.

🚫 **Não aplica auto-match quando:**
- Bate só o fallback IA por keyword genérica (score ≤ 35 — cai pro bucket "Revisar" na UI).
- Não há CR/CP correspondente E a regra não tem `valor_referencia`.
- Tipo de transação não bate (débito vs crédito).

Tudo que não auto-concilia fica `status='pending'` em `bank_transactions` e aparece na Conciliação Bancária pra revisão manual.

## Auditoria

```sql
-- Últimos imports
SELECT processed_at, from_address, subject, status,
       transactions_inserted, transactions_auto_reconciled, error_detail
FROM email_import_log
ORDER BY processed_at DESC
LIMIT 20;

-- Auto-conciliações recentes (match_type = 'auto_email')
SELECT m.created_at, m.matched_amount, m.matched_date, m.note,
       cp.credor_nome AS cp_credor, cr.pagador_nome AS cr_pagador
FROM bank_reconciliation_matches m
LEFT JOIN contas_pagar cp ON cp.id = m.payable_id
LEFT JOIN contas_receber cr ON cr.id = m.receivable_id
WHERE m.match_type = 'auto_email'
ORDER BY m.created_at DESC
LIMIT 50;
```

## Desfazer um match automático

Mesmo fluxo de qualquer outra conciliação: ir em Conciliação Bancária, escolher
"Desfazer" no item. A trigger normal cuida de:
- Reverter CR/CP (soft-delete se foi criado pelo extrato; volta pra 'aberto' se era preexistente)
- Remover movimentação e ajustar saldo
- Voltar `bank_transactions.status = 'pending'`

## Troubleshooting

| Sintoma | Causa provável | Como ver |
|---------|----------------|----------|
| `unmatched_account` em massa | ACCTID não cadastrado em `bank_accounts.ofx_acctid` | `SELECT ofx_acctid, error_detail FROM email_import_log WHERE status='unmatched_account'` |
| Email não é processado | Não bate `GMAIL_QUERY` (sem anexo OFX, já lido, etc.) | Verifique label/filtro no Gmail |
| `Gmail OAuth refresh falhou` | `refresh_token` expirou (usuário revogou ou inatividade >6 meses) | Refazer passo 2 e atualizar secret |
| Auto-conciliação não aplica | Conta não tem `auto_conciliacao_policy='rule_only'` OU regras não são `Alta+auto-conciliar` | Edite a conta; revise regras em Conciliação > Regras |
| Cron não dispara | `pg_cron` ou `pg_net` não habilitado, ou vault sem secrets | `SELECT * FROM cron.job WHERE jobname='importar-extrato-email-hourly';` |
