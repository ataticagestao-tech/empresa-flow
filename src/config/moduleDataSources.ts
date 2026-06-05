/**
 * Mapa "tela do menu → fonte de dados" usado pelo MENU ENXUTO (lean menu).
 *
 * Quando um usuário tem `user_companies.lean_menu = true`, o menu só mostra as
 * telas que têm dado lançado na empresa selecionada. Aqui ficam:
 *   1. DATA_SOURCES   — as tabelas a contar (e a coluna que filtra por empresa).
 *   2. MODULE_PRESENCE — a regra de presença de cada rota.
 *   3. resolvePresenceForPath — acha a regra da rota atual (maior prefixo).
 *
 * Princípio de segurança: o hook que consome isto (useModulesWithData) "falha
 * mostrando" — se uma contagem der erro, a tela aparece. Nunca escondemos uma
 * tela com dado por engano.
 */

export interface DataSource {
  /** Nome da tabela no Supabase. */
  table: string;
  /** Coluna que filtra por empresa (quase sempre company_id). */
  companyCol: string;
  /** Tabela usa soft-delete (deleted_at) — filtra registros ativos ao contar. */
  softDelete?: boolean;
}

/**
 * Tabelas contadas (uma vez por empresa, em lote). A chave é o "source key"
 * referenciado em MODULE_PRESENCE.
 */
export const DATA_SOURCES: Record<string, DataSource> = {
  clients: { table: "clients", companyCol: "company_id" },
  suppliers: { table: "suppliers", companyCol: "company_id" },
  employees: { table: "employees", companyCol: "company_id" },
  chart_of_accounts: { table: "chart_of_accounts", companyCol: "company_id" },
  centros_custo: { table: "centros_custo", companyCol: "company_id" },
  bank_accounts: { table: "bank_accounts", companyCol: "company_id" },
  products: { table: "products", companyCol: "company_id" },
  departments: { table: "departments", companyCol: "company_id" },
  vendas: { table: "vendas", companyCol: "company_id", softDelete: true },
  contas_receber: { table: "contas_receber", companyCol: "company_id", softDelete: true },
  contas_pagar: { table: "contas_pagar", companyCol: "company_id", softDelete: true },
  recibos: { table: "recibos", companyCol: "company_id" },
  nfses: { table: "nfses", companyCol: "company_id" },
  pontos: { table: "pontos", companyCol: "company_id" },
  ferias_afastamentos: { table: "ferias_afastamentos", companyCol: "company_id" },
  folha_pagamento: { table: "folha_pagamento", companyCol: "company_id" },
  encargos: { table: "encargos", companyCol: "company_id" },
  ordens_compra: { table: "ordens_compra", companyCol: "company_id" },
  inventario_headers: { table: "inventario_headers", companyCol: "company_id" },
  reguas_cobranca: { table: "reguas_cobranca", companyCol: "company_id" },
  movimentacoes: { table: "movimentacoes", companyCol: "company_id" },
  admissoes_demissoes: { table: "admissoes_demissoes", companyCol: "empresa_id" },
  apuracao_impostos: { table: "apuracao_impostos", companyCol: "company_id" },
  importacao_xmls: { table: "importacao_xmls", companyCol: "empresa_id" },
};

export type PresenceRule =
  | { kind: "always" } // sempre visível (ex.: Dashboard / home)
  | { kind: "hideWhenLean" } // some no menu enxuto (hubs, config, ferramentas localStorage)
  | { kind: "anyOf"; sources: string[] }; // visível se QUALQUER fonte tiver dado

/**
 * Regra de presença por rota (URL do menuConfig). Rotas não listadas aqui não
 * são gateadas pelo menu enxuto (resolvePresenceForPath → undefined → mostra).
 */
export const MODULE_PRESENCE: Record<string, PresenceRule> = {
  // — Dashboard —
  "/dashboard": { kind: "always" },
  "/indicadores": { kind: "anyOf", sources: ["contas_receber", "contas_pagar", "movimentacoes"] },
  "/multiempresa": { kind: "hideWhenLean" },

  // — Cadastrar —
  "/cadastros": { kind: "hideWhenLean" }, // hub de cadastros
  "/empresas": { kind: "anyOf", sources: ["bank_accounts", "chart_of_accounts", "clients", "vendas"] },
  "/clientes": { kind: "anyOf", sources: ["clients"] },
  "/fornecedores": { kind: "anyOf", sources: ["suppliers"] },
  "/funcionarios": { kind: "anyOf", sources: ["employees"] },
  "/plano-contas": { kind: "anyOf", sources: ["chart_of_accounts"] },
  "/centros-custo": { kind: "anyOf", sources: ["centros_custo"] },
  "/contas-bancarias": { kind: "anyOf", sources: ["bank_accounts"] },
  "/operacional": { kind: "anyOf", sources: ["products", "departments"] },

  // — Precificação (ferramentas localStorage; somem no menu enxuto) —
  "/ficha-tecnica": { kind: "hideWhenLean" },
  "/composicao-custo": { kind: "hideWhenLean" },
  "/margens-desconto": { kind: "hideWhenLean" },
  "/tabela-precos": { kind: "hideWhenLean" },
  "/markup-simulador": { kind: "hideWhenLean" },

  // — Operar —
  "/vendas": { kind: "anyOf", sources: ["vendas"] },
  "/contas-receber": { kind: "anyOf", sources: ["contas_receber"] },
  "/contas-pagar": { kind: "anyOf", sources: ["contas_pagar"] },
  "/recibos": { kind: "anyOf", sources: ["recibos"] },
  "/configuracoes/asaas": { kind: "hideWhenLean" }, // config de gateway

  // — Fiscal —
  "/area-contador": { kind: "anyOf", sources: ["contas_receber", "contas_pagar", "movimentacoes", "nfses"] },
  "/nfse": { kind: "anyOf", sources: ["nfses"] },
  "/configuracoes/nfse": { kind: "hideWhenLean" },
  "/previsao-impostos": { kind: "anyOf", sources: ["apuracao_impostos", "vendas", "contas_receber"] },
  "/importacao-xml": { kind: "anyOf", sources: ["importacao_xmls"] },

  // — RH & Folha —
  "/admissoes-demissoes": { kind: "anyOf", sources: ["admissoes_demissoes", "employees"] },
  "/ponto-eletronico": { kind: "anyOf", sources: ["pontos"] },
  "/ferias-afastamentos": { kind: "anyOf", sources: ["ferias_afastamentos"] },
  "/folha-pagamento": { kind: "anyOf", sources: ["folha_pagamento"] },
  "/encargos": { kind: "anyOf", sources: ["encargos"] },

  // — Estoque —
  "/estoque": { kind: "anyOf", sources: ["products"] },
  "/ordens-compra": { kind: "anyOf", sources: ["ordens_compra"] },
  "/inventario": { kind: "anyOf", sources: ["inventario_headers"] },

  // — Conciliar —
  "/conciliacao": { kind: "anyOf", sources: ["movimentacoes", "contas_receber", "contas_pagar"] },
  "/recebiveis-cartao": { kind: "anyOf", sources: ["contas_receber", "movimentacoes"] },
  "/regua-cobranca": { kind: "anyOf", sources: ["reguas_cobranca"] },

  // — Analisar —
  "/dre": { kind: "anyOf", sources: ["contas_receber", "contas_pagar"] },
  "/demonstrativos/dfc": { kind: "anyOf", sources: ["movimentacoes"] },
  "/relatorios": { kind: "anyOf", sources: ["contas_receber", "contas_pagar", "movimentacoes", "vendas"] },

  // — Projeção —
  "/fluxo-caixa-projetado": { kind: "anyOf", sources: ["contas_receber", "contas_pagar"] },
  "/orcamento": { kind: "anyOf", sources: ["contas_receber", "contas_pagar"] },
  "/previsao-receitas": { kind: "anyOf", sources: ["contas_receber", "vendas"] },
  "/cenarios": { kind: "anyOf", sources: ["contas_receber", "contas_pagar"] },
};

/**
 * Acha a regra de presença da rota, casando o caminho mais específico (maior
 * prefixo de URL). Retorna undefined quando a rota não está mapeada (ex.:
 * /ajuda, /equipe) → essas nunca são escondidas pelo menu enxuto.
 */
export function resolvePresenceForPath(pathname: string): PresenceRule | undefined {
  let best: { len: number; rule: PresenceRule } | null = null;
  for (const [url, rule] of Object.entries(MODULE_PRESENCE)) {
    if (pathname === url || pathname.startsWith(url + "/")) {
      if (!best || url.length > best.len) best = { len: url.length, rule };
    }
  }
  return best?.rule;
}
