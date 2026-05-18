# Plano Técnico — Cadastro Automatizado via WhatsApp

**Data:** 2026-05-18
**Status:** Pronto para implementação
**Escopo:** Funcionários e Fornecedores (PF/PJ)

---

## 1. Resumo Executivo

Sistema que dispara questionário via WhatsApp para funcionários/fornecedores preencherem dados cadastrais. Aceita resposta em texto OU foto/PDF de documentos (RG, CNH, comprovante residência, cartão CNPJ). Claude API extrai os campos estruturados (vision + texto), valida (dígito CPF/CNPJ) e escala para revisão manual em "Cadastros Pendentes" onde admin aprova antes de aplicar.

**Casos de uso:**
- Atualizar cadastro existente com campos faltando
- Criar novo cadastro do zero (admin cria stub só com nome + telefone)
- Lote: disparar para vários cadastros incompletos de uma vez

---

## 2. Pesquisa — Reaproveitamento da Infra Existente

### O que já está pronto

| Componente | Arquivo | Como usar |
|---|---|---|
| Envio WhatsApp | `supabase/functions/enviar-whatsapp/index.ts` | `supabase.functions.invoke('enviar-whatsapp', {body:{phone,text,mediaBase64?}})` |
| Validar telefone | `supabase/functions/validar-whatsapp/index.ts` | Pré-check antes de disparar |
| Webhook inbound | `supabase/functions/agente-orquestrador/index.ts` | Já recebe `MESSAGES_UPSERT` — adicionar roteamento de "cadastro mode" |
| Claude vision/PDF | `supabase/functions/ler-boleto/index.ts` | Padrão de extração estruturada com `claude-sonnet`/`opus-4-7` |
| Storage | bucket `documentos`, path `{company_id}/...` | Estender com subpath `cadastros/{solicitacao_id}/` |
| Validators | `src/lib/validators.ts` (`validarCPF`, `validarCNPJ`, `validarDocumento`) | Validação client-side e na Edge Function |
| Normalização telefone | `normalizePhone()` em `enviar-whatsapp` | Reaproveitar — extrair pra util compartilhado |
| Multi-tenant | `user_companies` + RLS via `company_id` | Padrão obrigatório nas tabelas novas |

### Decisão arquitetural-chave

O `agente-orquestrador` já é o webhook único do Evolution. Vamos **estender** com roteamento por estado, não criar webhook paralelo:

```
Evolution webhook → agente-orquestrador
  ├── SE telefone tem cadastro_solicitacao ativa → cadastro-processor (NOVO)
  └── SENÃO → fluxo atual do orquestrador
```

Isso preserva o agente existente sem regressão e mantém **um único endpoint** registrado no Evolution.

---

## 3. Arquitetura

```
┌─────────────────────┐       ┌──────────────────────┐
│  Funcionários.tsx   │       │  Fornecedores.tsx    │
│  Fornecedores.tsx   │       │                      │
│  + botão "Solicitar │       │  + botão "Solicitar  │
│    via WhatsApp"    │       │    via WhatsApp"     │
└──────────┬──────────┘       └──────────┬───────────┘
           │                              │
           ▼                              ▼
   ┌──────────────────────────────────────────────┐
   │  solicitar-cadastro (Edge Function NOVA)     │
   │  - cria cadastro_solicitacoes row            │
   │  - dispara template via enviar-whatsapp      │
   │  - registra mensagem em cadastro_mensagens   │
   └──────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────┐
   │  agente-orquestrador (EXISTENTE, EXTENDIDO)  │
   │  - checa se sender tem solicitacao ativa     │
   │  - SE SIM: chama cadastro-processor          │
   │  - SE NÃO: fluxo atual                       │
   └──────────────────────────────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │  cadastro-processor (Edge Function NOVA)     │
   │  1. baixa media (se imagem/PDF) → storage    │
   │  2. extrai campos via Claude (vision+texto)  │
   │  3. valida (CPF/CNPJ dígito, CEP, etc.)      │
   │  4. atualiza cadastro_solicitacoes.dados     │
   │  5. decide próximo passo:                    │
   │     - tudo OK → marca pronto p/ aprovação    │
   │     - falta campo → pergunta no WhatsApp     │
   │     - 2ª tentativa falha → marca revisão     │
   └──────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────┐
   │  /cadastros-pendentes (Página NOVA)          │
   │  - lista solicitações por status             │
   │  - drawer: histórico + dados extraídos +     │
   │    preview dos documentos                    │
   │  - botão Aprovar/Editar/Rejeitar             │
   │  - aprovar = aplica em employees/suppliers   │
   └──────────────────────────────────────────────┘
```

---

## 4. Schema do Banco

### 4.1 Migration: `20260518000000_cadastro_solicitacoes.sql`

```sql
-- Tabela principal: uma solicitação por cadastro/telefone
create table public.cadastro_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  -- Tipo + alvo (um dos dois, ou ambos nulos se for cadastro novo sem stub)
  tipo text not null check (tipo in ('funcionario','fornecedor')),
  employee_id uuid references employees(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,

  -- Identificação do destinatário
  nome_destinatario text not null,
  telefone text not null,  -- normalizado pra DDI+DDD+numero (55119...)

  -- Estado da conversa
  status text not null default 'aguardando_envio'
    check (status in (
      'aguardando_envio',
      'enviado',
      'em_conversa',         -- bot já recebeu pelo menos uma resposta
      'pronto_aprovacao',    -- todos os campos obrigatórios OK
      'requer_revisao',      -- bot desistiu, esperando admin
      'aprovado',            -- admin aplicou
      'rejeitado',
      'expirado'             -- 7 dias sem resposta final
    )),

  -- Dados estruturados extraídos das mensagens (merge incremental)
  dados_extraidos jsonb not null default '{}'::jsonb,
  -- ex: {"cpf":"123...","nome":"...","endereco":{...},"pix":{...}}

  -- Campos pendentes que o bot ainda precisa perguntar
  campos_faltando text[] not null default array[]::text[],

  -- Última pergunta enviada (pra interpretar follow-up)
  ultima_pergunta text,
  tentativas_por_campo jsonb not null default '{}'::jsonb,
  -- ex: {"cpf":1,"endereco":2}

  -- Permite pular campo? (config por solicitação)
  permite_skip boolean not null default true,

  -- Auditoria
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '7 days'),
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,
  observacao_admin text
);

create index on cadastro_solicitacoes (company_id, status);
create index on cadastro_solicitacoes (telefone) where status in ('enviado','em_conversa');

-- Histórico de mensagens (auditoria + contexto pra Claude)
create table public.cadastro_mensagens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references cadastro_solicitacoes(id) on delete cascade,
  direcao text not null check (direcao in ('enviada','recebida')),
  conteudo text,                        -- texto da mensagem
  media_path text,                      -- path no storage se foi anexo
  media_mime text,
  media_tipo text,                      -- 'imagem'|'pdf'|'documento'
  dados_extraidos_msg jsonb,            -- o que Claude extraiu desta msg específica
  evolution_message_id text,
  criado_em timestamptz not null default now()
);

create index on cadastro_mensagens (solicitacao_id, criado_em);

-- RLS multi-tenant (padrão do projeto)
alter table cadastro_solicitacoes enable row level security;
alter table cadastro_mensagens enable row level security;

create policy "solicitacoes_company" on cadastro_solicitacoes
  for all using (
    company_id in (
      select uc.company_id from user_companies uc where uc.user_id = auth.uid()
    )
  );

create policy "mensagens_via_solicitacao" on cadastro_mensagens
  for all using (
    solicitacao_id in (
      select id from cadastro_solicitacoes
      where company_id in (
        select uc.company_id from user_companies uc where uc.user_id = auth.uid()
      )
    )
  );

-- Service role bypass (Edge Functions usam service key, então OK)
```

### 4.2 Storage Bucket

Reaproveita `documentos`. Path:

```
{company_id}/cadastros/{solicitacao_id}/{timestamp}_{nome_original}
```

RLS já existe no bucket; só validar que paths começam com `company_id` do user.

---

## 5. Edge Functions

### 5.1 `solicitar-cadastro` (NOVA)

**Input:**
```ts
{
  tipo: 'funcionario' | 'fornecedor',
  employee_id?: string,
  supplier_id?: string,
  nome: string,
  telefone: string,
  campos_obrigatorios?: string[],  // override do default
  template_customizado?: string
}
```

**Lógica:**
1. Validar `telefone` via `normalizePhone`
2. (Opcional) Chamar `validar-whatsapp` pra pré-checar — se inválido, retornar erro
3. Computar `campos_faltando` analisando o registro atual (se `employee_id`/`supplier_id` informado)
4. Inserir `cadastro_solicitacoes` (status=`aguardando_envio`)
5. Renderizar template baseado em tipo + campos_faltando
6. Chamar `enviar-whatsapp`
7. Inserir `cadastro_mensagens` (direcao=`enviada`)
8. Atualizar status → `enviado`

**Template de funcionário (PF):**

```
Olá {nome}! 👋
A {empresa} precisa atualizar seus dados cadastrais.

Você pode responder de 3 formas:

📝 Texto: copie e preencha o formulário abaixo
📸 Foto: envie foto do RG/CNH + comprovante de residência
📄 PDF: envie PDF dos documentos

Se preferir TEXTO, copie e preencha:

Nome completo:
CPF:
RG:
Data de nascimento:
Endereço (rua, número, bairro, cidade, CEP):
PIX (chave):
Banco / Agência / Conta:

⚠️ O CPF é obrigatório. Demais campos pode pular respondendo "não sei".
Esta solicitação expira em 7 dias.
```

**Template de fornecedor PJ:**

```
Olá! A {empresa} precisa cadastrar/atualizar os dados da {nome_fornecedor}.

Você pode enviar:
📸 Foto do cartão CNPJ (mais rápido)
📝 Ou preencher abaixo:

CNPJ:
Razão social:
Nome fantasia:
Endereço:
Email:
Telefone:
PIX:
Banco / Agência / Conta:
Responsável (nome + cargo):

⚠️ CNPJ é obrigatório. Expira em 7 dias.
```

### 5.2 `cadastro-processor` (NOVA)

**Chamada por:** `agente-orquestrador` quando detecta mensagem de número com solicitação ativa.

**Input:**
```ts
{
  solicitacao_id: string,
  message: {
    type: 'text' | 'image' | 'document' | 'audio',
    text?: string,
    media_base64?: string,
    media_url?: string,
    mime?: string,
    evolution_message_id: string
  }
}
```

**Pipeline:**

```
1. SE media → baixa do Evolution → upload pro Storage
2. Insere cadastro_mensagens (direcao=recebida)
3. Carrega solicitacao (dados_extraidos atual, campos_faltando, ultima_pergunta)
4. Constrói prompt Claude:
   - System: "Você extrai dados cadastrais de respostas WhatsApp"
   - Context: tipo (funcionário/fornecedor), campos esperados, ultima_pergunta
   - User content:
     - Texto da mensagem
     - Se houver mídia: { type:'image'|'document', source:{base64,...} }
   - Schema JSON esperado (zod-like)
5. Parse resposta JSON, MERGE com dados_extraidos
6. Validação por campo:
   - CPF/CNPJ → validarDocumento + dígito verificador
   - Telefone → normalizePhone
   - CEP → regex + (opcional) ViaCEP
   - Email → regex
   - Data → parse multi-formato
7. Detecta campos pulados ("não sei", "pular", "skip")
   → remove de campos_faltando (exceto CPF/CNPJ)
8. Decide próximo passo:
   a) Todos OK → status=pronto_aprovacao, envia "Recebemos! Em breve confirmamos."
   b) Falta campo → envia pergunta específica
   c) Campo inválido + tentativas<2 → reenvia pergunta com hint
   d) Campo inválido + tentativas==2 → status=requer_revisao, avisa destinatário
9. Atualiza solicitacao
10. (Opcional) Realtime notification pro painel admin
```

**Schema de extração (Claude):**

```json
{
  "nome_completo": "string|null",
  "cpf": "string|null (apenas dígitos)",
  "cnpj": "string|null",
  "rg": "string|null",
  "data_nascimento": "ISO date|null",
  "endereco": {
    "logradouro": "string|null",
    "numero": "string|null",
    "complemento": "string|null",
    "bairro": "string|null",
    "cidade": "string|null",
    "uf": "string|null",
    "cep": "string|null"
  },
  "pix": {
    "tipo": "cpf|cnpj|email|telefone|aleatoria|null",
    "chave": "string|null"
  },
  "banco": {
    "codigo": "string|null",
    "agencia": "string|null",
    "conta": "string|null",
    "tipo": "corrente|poupanca|null"
  },
  "campos_pulados": ["string"],
  "razao_social": "string|null",
  "nome_fantasia": "string|null"
}
```

### 5.3 Modificação em `agente-orquestrador`

Adicionar bloco no início, ANTES da chamada ao Claude tools:

```ts
// Detecta se a mensagem é parte de fluxo de cadastro
const phone = normalizePhone(payload.key.remoteJid)
const { data: solicitacao } = await supabaseService
  .from('cadastro_solicitacoes')
  .select('*')
  .eq('telefone', phone)
  .in('status', ['enviado','em_conversa'])
  .order('criado_em', { ascending: false })
  .limit(1)
  .maybeSingle()

if (solicitacao) {
  // Roteia pro processor de cadastro e retorna
  await fetch(`${SUPABASE_URL}/functions/v1/cadastro-processor`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ solicitacao_id: solicitacao.id, message: extractMessage(payload) })
  })
  return new Response(JSON.stringify({ routed: 'cadastro' }), { status: 200 })
}

// ... fluxo atual continua aqui
```

### 5.4 `cadastro-aprovar` (NOVA)

**Input:** `{ solicitacao_id, dados_editados?, criar_se_novo?: boolean }`

**Lógica:**
1. Carrega solicitação (status deve ser `pronto_aprovacao` ou `requer_revisao`)
2. Mescla `dados_extraidos` com `dados_editados` (override do admin)
3. Se `employee_id`/`supplier_id` existe → UPDATE
4. Senão → INSERT em `employees` ou `suppliers`
5. Move documentos do storage de `cadastros/{id}/` para `funcionarios/{employee_id}/` ou `fornecedores/{supplier_id}/` (preserva referência)
6. Atualiza solicitacao: status=`aprovado`, `aprovado_por`, `aprovado_em`
7. (Opcional) Envia WhatsApp de confirmação ao destinatário

---

## 6. UI

### 6.1 Botão "Solicitar dados via WhatsApp"

**Em `src/pages/Funcionarios.tsx`:**
- Botão no header da página: "Solicitar via WhatsApp" (abre dialog de seleção)
- Botão em cada linha/drawer de funcionário com cadastro incompleto: ícone WhatsApp ao lado do nome

**Dialog de seleção em lote:**
- Lista funcionários com `cpf is null OR endereco is null OR ...` (configurável)
- Checkbox + "Disparar para selecionados"
- Mostra preview do template antes de enviar

**Mesma estrutura em `Fornecedores.tsx`.**

### 6.2 Nova página `/cadastros-pendentes`

**Path:** `src/pages/CadastrosPendentes.tsx`
**Menu:** adicionar em `menuConfig.ts` no grupo "Cadastros" ou "Configurações" (com `ownerOnly: false` por enquanto)

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ Cadastros Pendentes                          [+ Nova]        │
├──────────────────────────────────────────────────────────────┤
│ Filtros: [Status ▾] [Tipo ▾] [Período ▾]      Buscar: [___]  │
├──────────────────────────────────────────────────────────────┤
│ Nome           │ Tipo       │ Status         │ Criado │ Ação │
│ João Silva     │ Funcionário│ ✓ Pronto       │ 14/05  │ 👁    │
│ Maria S.       │ Funcionário│ ⏳ Aguardando  │ 15/05  │ 👁    │
│ Hair Brasil    │ Fornecedor │ ⚠️ Revisão req │ 12/05  │ 👁    │
└──────────────────────────────────────────────────────────────┘
```

**Drawer ao clicar:**

```
┌─ João Silva (Funcionário) ──────────────── Aprovar ▼ ────┐
│                                                            │
│ Dados extraídos (editar antes de aprovar):                │
│   Nome: [João da Silva________]                            │
│   CPF:  [123.456.789-00____] ✓                             │
│   RG:   [12.345.678-9_____]                                │
│   ...                                                      │
│                                                            │
│ Documentos enviados:                                       │
│   📎 rg_frente.jpg (preview)                               │
│   📎 comprovante_residencia.pdf                            │
│                                                            │
│ Histórico de mensagens:                                    │
│   14/05 09:00 → "Olá João..."                              │
│   14/05 09:15 ← [foto RG]                                  │
│   14/05 09:15 ← "Endereço: rua X..."                       │
│   14/05 09:16 → "Recebemos!"                               │
│                                                            │
│ [Aprovar] [Editar e Aprovar] [Pedir Revisão] [Rejeitar]   │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Componentes reutilizáveis

- `src/components/cadastros/SolicitarCadastroDialog.tsx`
- `src/components/cadastros/CadastrosPendentesTable.tsx`
- `src/components/cadastros/CadastroPendenteDrawer.tsx`
- `src/components/cadastros/HistoricoMensagens.tsx`

---

## 7. Fluxos Detalhados

### 7.1 Fluxo feliz (resposta completa em texto)

```
T0    Admin clica "Solicitar via WhatsApp" em João Silva
T0+1s solicitar-cadastro → cria solicitacao, envia template
T0+2m João responde: "João da Silva\nCPF: 123.456.789-00\nRG: 12.345.678-9\n..."
T0+2m cadastro-processor: extrai → valida → todos OK
       → status=pronto_aprovacao, envia "Recebemos! Confirmaremos em breve."
T0+1h Admin abre Cadastros Pendentes, revisa, clica Aprovar
       → cadastro-aprovar: UPDATE employees, status=aprovado
       → (opcional) WhatsApp "Cadastro confirmado!"
```

### 7.2 Fluxo com foto

```
T0+5m João envia foto do RG
T0+5m cadastro-processor: baixa do Evolution → storage
       → Claude vision extrai: nome, CPF, RG, data_nasc
       → ainda falta endereço, PIX, banco
       → envia: "Recebi os documentos! Agora preciso do seu endereço completo."
T0+8m João: "Rua Tal, 123, bairro X, cidade Y, CEP 12345-678"
       → extrai → valida CEP via regex → OK
       → ainda falta PIX, banco
       → envia: "E sua chave PIX?"
T0+9m João: "12345678900"
       → detecta tipo=CPF, valida → OK
       → ainda falta banco (mas admin marcou banco como skipável)
       → envia: "Banco/Agência/Conta? (responda 'pular' se não quiser informar)"
T0+10m João: "pular"
       → marca campo pulado
       → status=pronto_aprovacao, envia "Recebemos tudo! Obrigado."
```

### 7.3 Fluxo com erro + 2 tentativas

```
T0+5m João: "meu cpf é 0553156620/ 000.000-10"
       → Claude extrai dois números, sistema pega o primeiro
       → validarCPF falha (dígito errado)
       → tentativas.cpf = 1
       → envia: "O CPF '055.315.662-0' parece incompleto/incorreto.
                 Pode mandar só o CPF de novo? Ex: 123.456.789-00"
T0+7m João: "tenta 999.999.999-99"
       → validarCPF falha (todos dígitos iguais é inválido)
       → tentativas.cpf = 2
       → status=requer_revisao
       → envia: "Vou registrar o que tenho. A {empresa} entrará em contato 
                 para confirmar seu CPF. Obrigado!"
       → admin recebe notification no painel
```

### 7.4 Edge cases

| Cenário | Tratamento |
|---|---|
| Áudio recebido | Bot responde: "No momento aceito apenas texto, foto ou PDF." |
| Sticker/emoji só | Ignora, não conta tentativa |
| Resposta fora de contexto ("oi") | Reenvia template original (1x), depois ignora |
| Telefone diferente respondendo | Cria nova solicitação "órfã" em `requer_revisao` com alerta |
| Mesmo CPF já existe em outro employee | Bloqueia aprovação, admin precisa resolver merge |
| Expiração 7 dias sem resposta | Cron diário move pra `expirado` |

---

## 8. Validação & Erros

### 8.1 Validações por campo

| Campo | Regra | Reutiliza |
|---|---|---|
| CPF | 11 dígitos + dígito verificador + não-todos-iguais | `validarCPF` |
| CNPJ | 14 dígitos + dígito verificador | `validarCNPJ` |
| CEP | regex `^\d{5}-?\d{3}$` + (opcional) ViaCEP | NOVO util |
| Email | regex padrão | NOVO util |
| Telefone | `normalizePhone` | extrair do enviar-whatsapp |
| Data nascimento | parse multi-formato → ISO, idade entre 14 e 100 | NOVO util |
| Banco código | matching contra lista BACEN (estática, JSON) | NOVO util + JSON |
| PIX | tipo CPF/CNPJ/email/tel/aleatória + valida formato do tipo | NOVO util |

### 8.2 Mensagens de erro amigáveis

Cada validação retorna `{ valido, valor_normalizado, mensagem_erro }`. O bot usa `mensagem_erro` como hint na pergunta de retry.

---

## 9. Storage & Privacidade

- Bucket: `documentos` (reaproveitado)
- Path durante coleta: `{company_id}/cadastros/{solicitacao_id}/{filename}`
- Path após aprovação: move pra `{company_id}/funcionarios/{employee_id}/` ou `{company_id}/fornecedores/{supplier_id}/`
- Rejeitado/expirado: documentos permanecem por 90 dias depois deletados via cron (LGPD)
- RLS: já garante isolamento por company_id
- **NÃO** logar dados sensíveis (CPF completo, conta bancária) em logs de Edge Functions — usar mascaramento

---

## 10. Plano de Implementação (Ordem das Fases)

### Wave 1 — Fundação (sem UI ainda)

**Fase 1.1: Schema**
- Migration `20260518000000_cadastro_solicitacoes.sql`
- Aplicar e validar RLS

**Fase 1.2: Edge Function `solicitar-cadastro`**
- Implementar e testar via curl/postman
- Inclui geração de template

**Fase 1.3: Util compartilhado de normalização**
- Extrair `normalizePhone` para `_shared/phone.ts`
- Criar `_shared/validators.ts` (porting dos validadores do frontend)

### Wave 2 — Processamento (depende de 1)

**Fase 2.1: Edge Function `cadastro-processor` (texto only)**
- Pipeline completo mas sem vision
- Extração via Claude texto puro
- Validação + decisão próximo passo
- Testar com mensagens mockadas

**Fase 2.2: Suporte a vision**
- Download de mídia do Evolution
- Upload pro storage
- Adaptação do prompt Claude pra vision (reaproveitar padrão `ler-boleto`)

**Fase 2.3: Integração no `agente-orquestrador`**
- Adicionar bloco de roteamento
- Garantir backward compat (mensagens fora de cadastro → fluxo atual)
- Configurar webhook se necessário

### Wave 3 — Aprovação (depende de 2)

**Fase 3.1: Edge Function `cadastro-aprovar`**
- Aplicar dados em employees/suppliers
- Mover documentos no storage
- Soft-delete da solicitação

**Fase 3.2: Cron de expiração**
- pg_cron diário marca expirado após 7d
- pg_cron mensal deleta docs rejeitados/expirados >90d

### Wave 4 — UI (depende de 3)

**Fase 4.1: Página `/cadastros-pendentes`**
- Lista + filtros + busca
- Drawer com dados extraídos editáveis
- Preview de documentos (imagem/PDF)
- Histórico de mensagens

**Fase 4.2: Botões de disparo**
- Em Funcionários: botão individual + dialog em lote
- Em Fornecedores: mesma estrutura
- Indicador visual em cadastros com solicitação ativa

**Fase 4.3: Menu + notificações**
- Adicionar em `menuConfig.ts`
- Badge com contagem de "pronto_aprovacao" pendentes
- Realtime subscription pra atualizar lista

---

## 11. Riscos & Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Claude extrai CPF errado de foto borrada | Aprovar dado inválido | Validação dígito + admin revisa sempre |
| Custo Claude vision alto se muita foto | $$ | Haiku 4.5 vision (~R$0,02/doc), monitorar via Anthropic dashboard |
| Conflito com `agente-orquestrador` existente | Quebra agente atual | Roteamento DEPOIS de extrair payload, fail-open p/ fluxo atual |
| Telefone com várias solicitações ativas | Confusão | Constraint: 1 solicitação `enviado`/`em_conversa` por telefone+company |
| Resposta a solicitação antiga (após 7d) | Dados perdidos | Bot detecta expirada → responde "Solicitação expirou, peça à empresa" |
| Pessoa não tem WhatsApp | Falha silenciosa | Pré-check com `validar-whatsapp` no disparo |
| LGPD / vazamento documento | Risco legal | RLS + auditoria de quem aprovou + retenção 90d |
| Mudança de telefone do funcionário | Solicitação fica órfã | Admin pode editar telefone da solicitação |

---

## 12. Estimativa de Esforço

| Wave | Esforço | Dependências |
|---|---|---|
| Wave 1 (Fundação) | ~6h | nenhuma |
| Wave 2 (Processador) | ~10h | Wave 1 |
| Wave 3 (Aprovação) | ~4h | Wave 2 |
| Wave 4 (UI) | ~12h | Wave 3 |
| **Total** | **~32h** | sequencial |

Pode entregar Wave 1+2 funcional via curl/API antes da UI ficar pronta — útil pra testar com 1 funcionário real cedo.

---

## 13. Decisões Confirmadas

- [x] Documentos: guardar permanente após aprovação (em `{company_id}/funcionarios/{id}/`)
- [x] CPF/CNPJ: sempre obrigatório, demais opcionais
- [x] Aprovação: admin no painel, não no WhatsApp
- [x] Foto/PDF: aceitos via Claude vision
- [x] Tentativas: 2 por campo antes de escalar
- [x] **Modelo Claude:** `claude-haiku-4-5` pra tudo (vision + texto). Fallback pra Sonnet se qualidade não bater — flag de config
- [x] **Expiração:** 7 dias
- [x] **Confirmação pós-aprovação:** envia WhatsApp curto ("✓ Cadastro confirmado, obrigado!")
- [x] **Menu:** grupo "Cadastros" (junto com Funcionários/Fornecedores)

---

## 14. Próximos Passos

1. Você revisa esse plano
2. Confirma decisões pendentes (seção 13)
3. Começamos Wave 1.1 (migration + RLS) — entrego SQL pronto pra rodar
4. Validamos a migration antes de seguir pra Edge Functions

Pronto para começar.
