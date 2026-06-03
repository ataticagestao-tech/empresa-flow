/**
 * Fonte única da verdade da modularização por pacote (plano comercial Tática).
 *
 * - `PlanoId`  → pacote contratado pela empresa-cliente (Assistente / Controller / Gestor).
 * - `ModuleId` → blocos funcionais do sistema que cada pacote libera.
 * - `PLANS`    → matriz pacote → módulos liberados + limites quantitativos.
 *
 * Regras:
 * - O módulo `core` (dashboard, cadastros, vendas, CR/CP, recibos, DRE, conciliação)
 *   fica SEMPRE liberado, em qualquer pacote.
 * - Empresa SEM plano definido (`plano = null`) é tratada como acesso TOTAL (legado),
 *   pra não travar clientes existentes até a Izabel atribuir o pacote.
 * - Super-admin (Izabel) ignora todo o gating — tratado na camada de UI/hook.
 * - `plano_config` (jsonb na tabela companies) permite exceções por empresa:
 *   liberar um módulo extra ou ajustar um limite sem trocar o pacote.
 */

export type PlanoId = "assistente" | "controller" | "gestor";

export type ModuleId =
  | "core"
  | "fiscal"
  | "cobranca"
  | "rh"
  | "documentos"
  | "relatorios"
  | "precificacao"
  | "estoque"
  | "projecao"
  | "multiempresa";

export interface PlanLimits {
  /** NFSe emitidas por mês */
  nfse_per_month: number;
  /** Interações de WhatsApp (Assistente) por mês */
  whatsapp_per_month: number;
}

export type LimitKey = keyof PlanLimits;

export interface PlanDefinition {
  id: PlanoId;
  label: string;
  /** Resumo comercial curto (reaproveita o Checkout). */
  resumo: string;
  modules: ModuleId[];
  limits: PlanLimits;
}

/** Override por empresa, guardado em companies.plano_config (jsonb). */
export interface PlanoConfig {
  /** Módulos liberados ALÉM do pacote. */
  extra_modules?: ModuleId[];
  /** Ajustes pontuais de limite (sobrescrevem o pacote). */
  limits?: Partial<PlanLimits>;
}

/** Todos os módulos existentes — usado como "acesso total" (legado/super-admin). */
export const ALL_MODULES: ModuleId[] = [
  "core",
  "fiscal",
  "cobranca",
  "rh",
  "documentos",
  "relatorios",
  "precificacao",
  "estoque",
  "projecao",
  "multiempresa",
];

/** Rótulo amigável de cada módulo (telas de upgrade, gestão de plano). */
export const MODULE_LABELS: Record<ModuleId, string> = {
  core: "Essencial (Dashboard, Cadastros, Financeiro, DRE, Conciliação)",
  fiscal: "NFSe / Fiscal",
  cobranca: "Régua de Cobrança",
  rh: "RH & Folha",
  documentos: "Documentos",
  relatorios: "Relatórios completos",
  precificacao: "Precificação",
  estoque: "Estoque",
  projecao: "Projeção / FP&A",
  multiempresa: "Multi-empresa",
};

/**
 * Matriz aprovada (2026-06-02): módulos × pacote + limites do Checkout.
 * `core` é implícito em todos os pacotes (sempre liberado).
 */
export const PLANS: Record<PlanoId, PlanDefinition> = {
  assistente: {
    id: "assistente",
    label: "Assistente",
    resumo: "Ideal para MEI e microempresas iniciando a estruturação financeira.",
    modules: ["core", "fiscal"],
    limits: {
      nfse_per_month: 10,
      whatsapp_per_month: 100,
    },
  },
  controller: {
    id: "controller",
    label: "Controller",
    resumo: "Para pequenas e médias empresas que precisam de controle mensal robusto.",
    modules: ["core", "fiscal", "cobranca", "rh", "documentos", "relatorios"],
    limits: {
      nfse_per_month: 50,
      whatsapp_per_month: 300,
    },
  },
  gestor: {
    id: "gestor",
    label: "Gestor",
    resumo: "Para médias empresas com necessidade de FP&A e gestão mensal próxima.",
    modules: [...ALL_MODULES],
    limits: {
      nfse_per_month: 100,
      whatsapp_per_month: 1000,
    },
  },
};

export const PLAN_ORDER: PlanoId[] = ["assistente", "controller", "gestor"];

const UNLIMITED: PlanLimits = {
  nfse_per_month: Infinity,
  whatsapp_per_month: Infinity,
};

export function isPlanoId(value: unknown): value is PlanoId {
  return value === "assistente" || value === "controller" || value === "gestor";
}

/**
 * Conjunto de módulos liberados para uma empresa.
 * `plano` nulo/desconhecido → acesso total (legado). `core` sempre incluído.
 */
export function getPlanModules(
  plano?: string | null,
  config?: PlanoConfig | null,
): Set<ModuleId> {
  if (!isPlanoId(plano)) return new Set(ALL_MODULES);
  const set = new Set<ModuleId>(PLANS[plano].modules);
  set.add("core");
  for (const extra of config?.extra_modules ?? []) set.add(extra);
  return set;
}

/** Limites efetivos da empresa (pacote + overrides). Sem plano = ilimitado (legado). */
export function getPlanLimits(
  plano?: string | null,
  config?: PlanoConfig | null,
): PlanLimits {
  const base = isPlanoId(plano) ? PLANS[plano].limits : UNLIMITED;
  return { ...base, ...(config?.limits ?? {}) };
}

/** `core` é sempre verdadeiro; demais conforme o conjunto liberado. */
export function hasModule(modules: Set<ModuleId>, moduleId?: ModuleId | null): boolean {
  if (!moduleId || moduleId === "core") return true;
  return modules.has(moduleId);
}
