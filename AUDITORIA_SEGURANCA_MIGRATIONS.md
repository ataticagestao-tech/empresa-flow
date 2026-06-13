# Auditoria de Segurança Multi-Tenant — empresa-flow

Data: 2026-05-27
Escopo: `supabase/migrations/` (~180 arquivos), `supabase/functions/`, `src/`
Método: cálculo da policy EFETIVA (última definição por ordem de timestamp, considerando DROP+CREATE e nomes de policy distintos). Findings conservadores: só marcados quando a definição mais recente é realmente frouxa.

---

## RESUMO EXECUTIVO

O isolamento por tenant das **tabelas de dados** (vendas, CR, CP, movimentações, clients, suppliers, employees, chart_of_accounts, bank_accounts, centros_custo, etc.) está **bem feito** via RLS `company_id IN (SELECT ... FROM user_companies WHERE user_id = auth.uid())`, reforçado por uma camada RBAC RESTRICTIVE (`has_role_in_company`) em `20260520140000_roles_permissoes.sql`.

**PORÉM**, o modelo de tenancy é minado por dois problemas estruturais:

1. **Triggers de autolink** (`20251228004000_user_companies_autolink.sql`) vinculam **todo usuário a todas as empresas** e **toda empresa nova a todos os usuários**. Isso faz com que o `user_companies` — base de toda a RLS — conceda acesso universal. Na prática, o isolamento multi-tenant **não existe** enquanto esses triggers estiverem ativos.
2. **Funções SECURITY DEFINER e uma Edge Function sem `verify_jwt`** que aceitam `company_id` do cliente sem validar ownership, permitindo leitura/escrita cross-tenant contornando a RLS.

Achado mais grave: **`import-omie-data`** (`verify_jwt = false` + service_role + `companyId` do body, sem auth) — escrita não autenticada em qualquer empresa.

---

## 1. POLICIES PERMISSIVAS/FROUXAS (EFETIVAS)

### 1.1 `companies` INSERT — `WITH CHECK (true)` — **ALTA**
- Arquivo efetivo: `20260101000000_vps_fix_rls_final.sql:45-49` (policy `companies_insert_policy`), posterior a `20251229021000_fix_companies_rls.sql:8-12`.
- Expressão: `FOR INSERT TO authenticated WITH CHECK (true)`.
- Risco: qualquer usuário autenticado cria empresas livremente. Combinado com o trigger `handle_new_company` (que vincula a empresa nova a TODOS os usuários) e com `delete_company_cascade` (qualquer membro deleta), vira vetor de poluição/DoS. Não vaza dados de outras empresas por si só, mas é entrada de abuso.
- Observação: a migration RBAC (20260520140000) **não** adiciona policy RESTRICTIVE de INSERT em `companies` (só UPDATE/DELETE), então o `WITH CHECK (true)` permanece efetivo para INSERT.

### 1.2 `user_companies` INSERT — `WITH CHECK (auth.uid() = user_id)` — **MÉDIA**
- Arquivo efetivo permissivo: `20260101000000_vps_fix_rls_final.sql:90-94` (`user_companies_insert_policy`).
- Camada RBAC posterior: `20260520140000_roles_permissoes.sql:337-339` adiciona policy RESTRICTIVE `rbac_user_companies_insert` exigindo `has_role_in_company(auth.uid(), company_id, 'owner')`.
- Expressão efetiva combinada (PERMISSIVE AND RESTRICTIVE): `auth.uid() = user_id` **AND** `has_role_in_company(uid, company_id,'owner')`.
- Risco: **mitigado** pela camada RBAC — o usuário só consegue se auto-vincular a uma empresa da qual já é owner. Antes da migration 20260520140000 era frouxo (qualquer um se vinculava a qualquer empresa passando o próprio user_id). Hoje a definição efetiva está OK. Mantido como MÉDIA apenas porque a proteção depende de `has_role_in_company` cujo fallback considera `companies.owner_id` (ver 4.1) e da integridade do `user_companies` já contaminado pelos triggers.

### 1.3 `account_templates` / `account_template_items` SELECT — `USING (true)` — **BAIXA (aceitável)**
- Arquivos: `20260103140000_chart_of_accounts.sql:169-175` e `20260103140001_chart_tables.sql:122-128`.
- São templates públicos de plano de contas (não contêm dados de empresa). `USING (true)` é intencional e aceitável. Listado para o panorama; não é brecha de tenant.

### 1.4 `chart_of_accounts` SELECT — duas policies coexistindo — **OK (informativo)**
- `20251230170000_secure_chart_of_accounts.sql:8` cria `"Users can view chart of accounts for their companies"` (via `user_companies`).
- `20260103140000_chart_of_accounts.sql:145` e `20260103140001_chart_tables.sql:99` criam `"Users can view their company accounts"` (via `companies.owner_id`), **com nome diferente** — não dropam a anterior.
- Efetivo: ambas PERMISSIVE coexistem → SELECT permitido se `user_companies` OU `owner_id`. Nenhuma é `true`. Tenant-scoped corretamente. Não é brecha.

### 1.5 `consolidado_cache` / `log_atividades` INSERT — `WITH CHECK (auth.role() = 'service_role')` — **OK**
- `20260319200000_gestap_multiempresa.sql:253-258`, `20260319210000_gestap_sistema.sql:193-195`. Escrita só por service_role; leitura tenant-scoped. Correto.

---

## 2. INSERT SEM VALIDAÇÃO DE TENANT

| Tabela | Definição efetiva | Validação | Veredito |
|---|---|---|---|
| `companies` | `vps_fix_rls_final.sql:45` `WITH CHECK (true)` | nenhuma | **FROUXO (ver 1.1)** — nenhuma migration posterior a `20251229021000` corrigiu; ao contrário, `20260101000000` reafirmou `true`. |
| `user_companies` | `vps_fix_rls_final.sql:90` `auth.uid()=user_id` + RBAC `owner` (`roles_permissoes.sql:337`) | só self-link + owner | **OK na definição efetiva** (corrigido pela camada RBAC de 20260520140000). |
| `vendas/CR/CP/mov/clients/suppliers/employees/...` | `company_id IN (user_companies...)` + RBAC operador | tenant + role | **OK** |

Conclusão do item 2: o `companies INSERT WITH CHECK(true)` **NÃO** foi corrigido por migration posterior — segue frouxo. O `user_companies INSERT` **foi** endurecido pela RBAC.

---

## 3. RLS EM TABELAS-CHAVE

Todas as tabelas-chave têm `ENABLE ROW LEVEL SECURITY` em alguma migration:

- `companies` — `20251226224600...:155`, reforçado em `20260101000000:20`
- `user_companies` — `20251226224600...:156`, `20260101000000:21`
- `chart_of_accounts` — `20251230170000:2` (e 20251230160000, 20260103140000/140001)
- `vendas`, `contas_receber`, `contas_pagar`, `movimentacoes` — `20260319120000:368-372`
- `bank_accounts` — `20251226224600...:160` (e 20260102160000:18)
- `clients`, `suppliers` — `20251226224600...:157-158`
- `employees` — `20260325200000:59`
- `grupos_empresariais`, `grupos_empresas` — `20260319200000:201-202`

**Nenhuma tabela-chave sem ENABLE RLS detectada.** RLS presente em todas.

> Nota: tabelas legadas `accounts_payable` / `accounts_receivable` / `transactions` (`20251226233033...:77-79`) têm RLS via `has_company_access`, mas parecem ser o esquema antigo (o app usa `contas_pagar`/`contas_receber`/`movimentacoes`). Sem brecha, apenas observação.

---

## 4. FUNÇÕES SECURITY DEFINER

### 4.1 `has_role_in_company` — `20260520140000_roles_permissoes.sql:45` — **OK (com ressalva)**
- Valida via `user_companies` + fallback `companies.owner_id`. Correto. Ressalva: o fallback de owner_id é defensável, mas significa que quem for `owner_id` de uma company tem owner mesmo sem row em `user_companies`.

### 4.2 `has_company_access` — `20251226224600...:179` — **OK**
- `EXISTS (SELECT 1 FROM user_companies WHERE user_id=_user_id AND company_id=_company_id)`. Correto. A fragilidade está nos DADOS de `user_companies` (item 5), não na função.

### 4.3 `import-omie-data` (Edge) → escreve direto — ver item 6.1

### 4.4 `calcular_consolidado_grupo(p_grupo_id, p_competencia)` — `20260319200000_gestap_multiempresa.sql:276` — **ALTA**
- SECURITY DEFINER. **NÃO valida** que `auth.uid()` é dono de `p_grupo_id`. Lê receita/despesa/caixa/CR/CP de todas as empresas do grupo (`mv_dre_mensal`, `v_saldo_contas_bancarias`, `contas_receber`, `contas_pagar`) e grava em `consolidado_cache`.
- Risco: se exposta a `authenticated` (RPC), qualquer usuário passa um `grupo_id` arbitrário e dispara o cálculo, populando `consolidado_cache`. A leitura do cache é tenant-scoped (`select` por owner do grupo), mas a função em si computa sobre dados de empresas que o chamador pode não acessar. Verificar GRANT EXECUTE.

### 4.5 `fn_relatorio_fluxo(p_company_id, ...)` — `20260413150000_fn_relatorio_fluxo.sql:3` — **ALTA**
- SECURITY DEFINER, **sem qualquer check** de `p_company_id`. Retorna `movimentacoes` (lançamentos financeiros detalhados) de QUALQUER empresa.
- Risco: exfiltração cross-tenant de dados financeiros se chamável por `authenticated` via RPC. Contorna a RLS de `movimentacoes` (que é correta). **Adicionar guard `has_company_access(auth.uid(), p_company_id)`.**

### 4.6 `copiar_produtos_entre_empresas(p_origem_id, p_destino_id)` — `20260403120000:6` — **MÉDIA**
- SECURITY DEFINER, valida só origem ≠ destino. **Não valida acesso** do chamador a origem nem destino. Permite copiar catálogo de produtos entre empresas arbitrárias (leitura de products de origem + escrita em destino).

### 4.7 `copiar_plano_template(p_company_id)` — `20260325150000_plano_contas_template.sql:194` — **MÉDIA**
- SECURITY DEFINER, **sem check** de acesso a `p_company_id`. Insere plano de contas template em qualquer empresa. Impacto menor (dados de template, não exfiltração), mas é escrita cross-tenant.

### 4.8 `delete_company_cascade(p_company_id)` — `20260415160000:5` — **ALTA**
- SECURITY DEFINER, GRANT EXECUTE TO authenticated. Valida `owner_id = auth.uid() OR membro em user_companies`. O check de **owner é razoável, mas o ramo "membro"** combinado com o autolink (item 5) significa que **qualquer usuário é "membro" de toda empresa** → qualquer usuário pode deletar (cascade) qualquer empresa. Deveria exigir `has_role_in_company(..., 'owner')` em vez de mera membership.

### 4.9 `handle_new_user` / `handle_new_company` — `20251228004000_user_companies_autolink.sql` — ver item 5 (raiz do problema).

---

## 5. AUTOLINK — QUEBRA ESTRUTURAL DO MODELO MULTI-TENANT — **CRÍTICA**

Arquivo: `20251228004000_user_companies_autolink.sql`

- `handle_new_user` (trigger AFTER INSERT em `auth.users`), linhas 22-25: ao criar um usuário, insere row em `user_companies` para **TODAS as companies existentes**.
- `handle_new_company` (trigger AFTER INSERT em `companies`), linhas 63-66: ao criar uma empresa, insere row em `user_companies` para **TODOS os usuários** (`FROM auth.users u`).
- Backfill linhas 78-82: `CROSS JOIN` populando todo (user × company).

Consequência: como **toda** a RLS de dados depende de `company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())`, e `user_companies` contém o produto cartesiano usuário×empresa, **todo usuário autenticado enxerga e edita os dados de todas as empresas**. A RLS está sintaticamente correta mas semanticamente neutralizada.

Risco: vazamento total cross-tenant de vendas, CR/CP, movimentações, clientes, fornecedores, funcionários, contas bancárias, etc. Esta é a brecha de maior superfície de impacto, mesmo com as policies "bem escritas".

> Mitigação parcial recente: a camada RBAC (20260520140000) faz backfill `role='operador'` para vínculos não-owner. Isso **não** resolve SELECT (RBAC não cobre SELECT) — todos continuam lendo tudo. E em INSERT/UPDATE de tabelas operacionais, `operador` é suficiente, então a escrita cross-tenant também persiste para tabelas operacionais.

Recomendação: remover/neutralizar os triggers de autolink e popular `user_companies` apenas com vínculos reais; adicionar policy SELECT RESTRICTIVE ou revisar a estratégia.

---

## 6. EDGE FUNCTIONS

### 6.1 `import-omie-data` — **CRÍTICA**
- `supabase/config.toml:3-4`: `verify_jwt = false`.
- `supabase/functions/import-omie-data/index.ts:180-216`: usa `SUPABASE_SERVICE_ROLE_KEY`, lê `companyId` do body, **sem nenhuma autenticação/checagem de ownership**, e cria empresa (`companies.insert`) ou escreve categorias/clients/suppliers/CP/CR para `targetCompanyId` arbitrário (linhas 268, 330, 445, 522...).
- Risco: endpoint **público** (sem JWT) que injeta/sobrescreve dados financeiros em qualquer empresa, e cria empresas. Contorna toda a RLS via service_role. Exposição direta de escrita cross-tenant não autenticada.
- Ação: exigir JWT (`verify_jwt = true`), validar super-admin ou `has_company_access` do chamador sobre `companyId`.

### 6.2 Tools do agente (`agente-tool-*`) — **MÉDIA**
- Ex.: `agente-tool-consultar_saldo/index.ts`, `agente-tool-lancar_cp/index.ts`. Usam service_role e validam acesso via RPC `agente_pode_acessar_empresa(p_user_id, p_acesso_id, p_company_id)`.
- Porém a **identidade vem do header `x-agente-user-id`** (não do JWT). Como essas funções **não** estão em `config.toml`, herdam `verify_jwt = true` — então o chamador precisa de um JWT válido qualquer, mas pode passar um `x-agente-user-id` de **outro** usuário. O check então roda contra o user injetado, não contra o dono do JWT.
- Risco: um usuário autenticado pode se passar por outro user_id (que tenha acesso à empresa-alvo) e ler/escrever dados dessa empresa. Vetor de impersonação. Mitigado parcialmente porque o fluxo pretendido é o orquestrador chamar; e `lancar_cp` ainda revalida `credor_id` por company. Recomenda-se derivar a identidade do JWT (`auth.getUser()`) em vez de confiar no header, ou exigir um segredo compartilhado do orquestrador.

### 6.3 `admin-set-user-password` — **OK (modelo correto)**
- `index.ts:48-80`: exige `Authorization: Bearer`, faz `auth.getUser()` com anon key, e checa whitelist de super-admin / `admin_users.is_super_admin` antes de usar service_role. Bom padrão de referência.

### 6.4 `whatsapp-cloud-webhook` — `verify_jwt = false`
- Webhook externo (Meta) — legítimo não ter JWT. Verificar se valida assinatura/verify-token da Meta (fora do escopo de tenancy; não auditado em profundidade aqui).

---

## 7. FRONTEND (`src/`)

### 7.1 Chave hardcoded em `src/integrations/supabase/client.ts:6` — **OK (não é brecha)**
- A chave embutida é a **anon key** (`"role":"anon"` no JWT). Anon key é pública por design no Supabase; RLS protege os dados. **Nenhuma chave service_role versionada** em `src/` ou `.env`.
- `.env` (linhas 1-3) contém apenas `VITE_SUPABASE_URL` + anon/publishable key. `.gitignore` cobre `.env` e `*_supabase.env`.

### 7.2 `supabase` direto vs `activeClient` — **NÃO é bypass de RLS**
- Há ~105 usos de `.from('vendas'|'contas_receber'|...)` em 30 arquivos. Independentemente de usarem o singleton `supabase` ou `activeClient`, **ambos rodam com a anon key + JWT do usuário no browser** → RLS sempre se aplica. Não há como o browser obter service_role.
- O risco de `supabase` vs `activeClient` é de **correção multi-tenant físico** (qual banco), não de bypass de segurança (já documentado em memória `feedback_db_vs_activeclient`). Fora do escopo de "RLS bypass".

---

## TABELA-RESUMO PRIORIZADA

| # | Severidade | Achado | Local |
|---|---|---|---|
| 5 | **CRÍTICA** | Triggers de autolink vinculam todo user a toda empresa → RLS neutralizada, vazamento total cross-tenant | `20251228004000_user_companies_autolink.sql:22-25,63-66,78-82` |
| 6.1 | **CRÍTICA** | `import-omie-data` `verify_jwt=false` + service_role + `companyId` do body sem auth → escrita não autenticada em qualquer empresa | `config.toml:3`; `functions/import-omie-data/index.ts:180-216` |
| 4.5 | **ALTA** | `fn_relatorio_fluxo` SECURITY DEFINER sem check → lê movimentações de qualquer empresa | `20260413150000_fn_relatorio_fluxo.sql:3` |
| 4.4 | **ALTA** | `calcular_consolidado_grupo` SECURITY DEFINER sem check de owner do grupo | `20260319200000_gestap_multiempresa.sql:276` |
| 4.8 | **ALTA** | `delete_company_cascade` aceita mero "membro" (+autolink) → qualquer user deleta qualquer empresa | `20260415160000_delete_company_cascade.sql:14-25` |
| 1.1 / 2 | **ALTA** | `companies` INSERT `WITH CHECK (true)`, não corrigido por migration posterior | `20260101000000_vps_fix_rls_final.sql:45-49` |
| 6.2 | **MÉDIA** | Tools do agente confiam em `x-agente-user-id` (header) p/ identidade em vez do JWT → impersonação | `functions/agente-tool-*/index.ts` |
| 4.6 | **MÉDIA** | `copiar_produtos_entre_empresas` sem check de acesso a origem/destino | `20260403120000:6` |
| 4.7 | **MÉDIA** | `copiar_plano_template` sem check de acesso ao company_id | `20260325150000_plano_contas_template.sql:194` |
| 1.2 | **MÉDIA** | `user_companies` INSERT self-link (mitigado por RBAC owner; depende de dados limpos) | `20260101000000:90` + `20260520140000:337` |
| 1.3 | BAIXA | `account_templates` SELECT `true` (intencional, dados públicos) | `20260103140000:169-175` |

---

## O QUE ESTÁ CORRETO (panorama equilibrado)

- **RLS tenant-scoped bem escrita** em vendas, vendas_itens, contas_receber, contas_pagar, movimentacoes, contratos_recorrentes, recibos_v2, clients, suppliers, employees, chart_of_accounts, bank_accounts, centros_custo, conciliation, cadastro_solicitacoes — todas via `company_id IN (user_companies...)`.
- **Camada RBAC RESTRICTIVE** (`20260520140000`) endurece INSERT/UPDATE/DELETE com `has_role_in_company`, separando owner/operador/visualizador, e corrige o INSERT frouxo de `user_companies`.
- **`integracoes`/`log_atividades`/`consolidado_cache`**: escrita limitada a service_role; leitura tenant-scoped. (Ressalva: `integracoes` SELECT em `20260325140000` expõe a linha inteira por company — a coluna `config`/secrets só é "protegida" por o frontend não selecionar; recomenda-se view sem `config` ou coluna separada — **BAIXA/MÉDIA**.)
- **`grupos_empresariais`/`grupos_empresas`/`transferencias_intercompany`**: scoping por `owner_id = auth.uid()`. Correto.
- **`admin-set-user-password`**: padrão de referência — valida JWT + super-admin antes de usar service_role.
- **`has_company_access` / `has_role_in_company`**: implementação correta; o problema está nos dados de `user_companies`, não nas funções.
- **Sem service_role no frontend**; chave embutida é anon (pública por design). `.env` gitignorado.
- **RLS habilitada em todas as tabelas-chave.**

---

## RECOMENDAÇÕES PRIORITÁRIAS

1. **(CRÍTICA)** Remover/neutralizar os triggers `handle_new_user` e `handle_new_company` de autolink e limpar `user_companies` para conter só vínculos reais. Sem isso, todo o resto da RLS é cosmético.
2. **(CRÍTICA)** `import-omie-data`: `verify_jwt = true` + validar super-admin/`has_company_access` do chamador sobre `companyId`.
3. **(ALTA)** Adicionar `IF NOT public.has_company_access(auth.uid(), p_company_id) THEN RAISE EXCEPTION` no início de `fn_relatorio_fluxo`, `copiar_produtos_entre_empresas` (origem e destino), `copiar_plano_template`, e validar owner do grupo em `calcular_consolidado_grupo`.
4. **(ALTA)** `delete_company_cascade`: trocar o check de "membro" por `has_role_in_company(auth.uid(), p_company_id, 'owner')`.
5. **(ALTA)** `companies` INSERT: trocar `WITH CHECK (true)` por algo como `WITH CHECK (owner_id = auth.uid())`.
6. **(MÉDIA)** Tools do agente: derivar identidade do JWT (`auth.getUser`) em vez de confiar em `x-agente-user-id`, ou exigir segredo do orquestrador.
7. **(MÉDIA)** `integracoes`: expor leitura via view sem a coluna `config`/secrets.
