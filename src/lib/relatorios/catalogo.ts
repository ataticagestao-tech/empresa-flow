import { format } from "date-fns";
import { maskCNPJ, maskCPF, maskPhone } from "@/utils/masks";
import type { ColunaRelatorio } from "./gerar-relatorio";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface RelatorioCtx {
  /** activeClient (multi-tenant físico) — nunca o supabase global. */
  client: any;
  companyId: string;
  range: { start: string; end: string };
}

export type GrupoRelatorio = "financeiro" | "vendas" | "despesas" | "rh" | "cadastros";

export interface RelatorioDef<T = any> {
  id: string;
  grupo: GrupoRelatorio;
  titulo: string;
  descricao: string;
  /** Se true, usa o filtro de período da página. Listas de cadastro = false. */
  usaPeriodo: boolean;
  pdfOrientacao?: "portrait" | "landscape";
  corPrimaria?: string;
  columns: ColunaRelatorio<T>[];
  carregar: (ctx: RelatorioCtx) => Promise<T[]>;
}

export const GRUPOS_RELATORIO: { id: GrupoRelatorio; label: string }[] = [
  { id: "financeiro", label: "Financeiro" },
  { id: "vendas", label: "Vendas" },
  { id: "despesas", label: "Despesas" },
  { id: "rh", label: "RH & Folha" },
  { id: "cadastros", label: "Cadastros" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return format(new Date(String(d).slice(0, 10) + "T12:00:00"), "dd/MM/yyyy");
  } catch {
    return String(d);
  }
};

const fmtDoc = (doc?: string | null) => {
  const digits = String(doc || "").replace(/\D/g, "");
  if (!digits) return "—";
  return digits.length > 11 ? maskCNPJ(digits) : maskCPF(digits);
};

const fmtFone = (v?: string | null) => {
  const digits = String(v || "").replace(/\D/g, "");
  return digits ? maskPhone(digits) : "—";
};

const titleCase = (s?: string | null) =>
  String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
  crediario: "Crediário",
  multiplo: "Múltiplas formas",
};

const STATUS_TITULO: Record<string, string> = {
  aberto: "Aberto",
  parcial: "Parcial",
  vencido: "Vencido",
  pago: "Pago",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

/** Busca todas as linhas em páginas (evita o teto de 1000 do PostgREST). */
async function paginar<T = any>(makeQuery: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

const empName = (e: any) => e?.nome_completo || e?.name || "Sem nome";

/* ------------------------------------------------------------------ */
/*  Catálogo                                                           */
/* ------------------------------------------------------------------ */

export const catalogoRelatorios: RelatorioDef[] = [
  /* ===================== FINANCEIRO ===================== */
  {
    id: "resultado-categoria",
    grupo: "financeiro",
    titulo: "Resultado por Categoria",
    descricao:
      "DRE gerencial (regime de caixa): receitas e despesas agrupadas por categoria do plano de contas, com resultado.",
    usaPeriodo: true,
    columns: [
      { header: "Categoria", value: (r: any) => r.categoria, pdfFlex: 26, excelWidth: 38 },
      { header: "Receitas", value: (r: any) => fmtBRL(r.receitas), numericValue: (r: any) => r.receitas, align: "right", pdfFlex: 11 },
      { header: "Despesas", value: (r: any) => fmtBRL(r.despesas), numericValue: (r: any) => r.despesas, align: "right", pdfFlex: 11 },
      { header: "Resultado", value: (r: any) => fmtBRL(r.receitas - r.despesas), numericValue: (r: any) => r.receitas - r.despesas, align: "right", pdfFlex: 11 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const movs = await paginar(() =>
        client
          .from("movimentacoes")
          .select("valor, tipo, category:chart_of_accounts(name)")
          .eq("company_id", companyId)
          .gte("data", range.start)
          .lte("data", range.end)
          .order("data", { ascending: true }),
      );
      const map = new Map<string, { categoria: string; receitas: number; despesas: number }>();
      for (const m of movs as any[]) {
        const nome = m.category?.name || "Sem categoria";
        const prev = map.get(nome) || { categoria: nome, receitas: 0, despesas: 0 };
        const v = Number(m.valor || 0);
        if (m.tipo === "credito") prev.receitas += v;
        else prev.despesas += v;
        map.set(nome, prev);
      }
      return Array.from(map.values()).sort(
        (a, b) => b.receitas + b.despesas - (a.receitas + a.despesas),
      );
    },
  },
  {
    id: "fluxo-caixa-mensal",
    grupo: "financeiro",
    titulo: "Fluxo de Caixa Mensal",
    descricao: "Entradas, saídas e resultado líquido de cada mês do período (regime de caixa).",
    usaPeriodo: true,
    pdfOrientacao: "portrait",
    columns: [
      { header: "Mês", value: (r: any) => r.mes, pdfFlex: 14 },
      { header: "Entradas", value: (r: any) => fmtBRL(r.entradas), numericValue: (r: any) => r.entradas, align: "right", pdfFlex: 14 },
      { header: "Saídas", value: (r: any) => fmtBRL(r.saidas), numericValue: (r: any) => r.saidas, align: "right", pdfFlex: 14 },
      { header: "Resultado", value: (r: any) => fmtBRL(r.entradas - r.saidas), numericValue: (r: any) => r.entradas - r.saidas, align: "right", pdfFlex: 14 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const movs = await paginar(() =>
        client
          .from("movimentacoes")
          .select("data, valor, tipo")
          .eq("company_id", companyId)
          .gte("data", range.start)
          .lte("data", range.end)
          .order("data", { ascending: true }),
      );
      const map = new Map<string, { key: string; mes: string; entradas: number; saidas: number }>();
      for (const m of movs as any[]) {
        const key = String(m.data).slice(0, 7);
        const prev = map.get(key) || {
          key,
          mes: format(new Date(`${key}-01T12:00:00`), "MM/yyyy"),
          entradas: 0,
          saidas: 0,
        };
        const v = Number(m.valor || 0);
        if (m.tipo === "credito") prev.entradas += v;
        else prev.saidas += v;
        map.set(key, prev);
      }
      return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    },
  },
  {
    id: "contas-pagar",
    grupo: "financeiro",
    titulo: "Contas a Pagar",
    descricao: "Títulos a pagar com vencimento no período — credor, descrição, valor e status.",
    usaPeriodo: true,
    columns: [
      { header: "Vencimento", value: (r: any) => fmtDate(r.data_vencimento), align: "center", pdfFlex: 9 },
      { header: "Credor", value: (r: any) => r.credor_nome || "—", pdfFlex: 22, excelWidth: 30 },
      { header: "Descrição", value: (r: any) => r.descricao || "—", pdfFlex: 24, excelWidth: 34 },
      { header: "Status", value: (r: any) => STATUS_TITULO[r.status] || titleCase(r.status), align: "center", pdfFlex: 8 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => Number(r.valor || 0), align: "right", pdfFlex: 11 },
    ],
    carregar: async ({ client, companyId, range }) =>
      paginar(() =>
        client
          .from("contas_pagar")
          .select("data_vencimento, credor_nome, descricao, valor, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cancelado")
          .gte("data_vencimento", range.start)
          .lte("data_vencimento", range.end)
          .order("data_vencimento", { ascending: true }),
      ),
  },
  {
    id: "contas-receber",
    grupo: "financeiro",
    titulo: "Contas a Receber",
    descricao: "Títulos a receber com vencimento no período — pagador, valor, recebido e status.",
    usaPeriodo: true,
    columns: [
      { header: "Vencimento", value: (r: any) => fmtDate(r.data_vencimento), align: "center", pdfFlex: 9 },
      { header: "Pagador", value: (r: any) => r.pagador_nome || "—", pdfFlex: 24, excelWidth: 30 },
      { header: "Descrição", value: (r: any) => r.descricao || "—", pdfFlex: 22, excelWidth: 32 },
      { header: "Status", value: (r: any) => STATUS_TITULO[r.status] || titleCase(r.status), align: "center", pdfFlex: 8 },
      { header: "Recebido", value: (r: any) => fmtBRL(r.valor_pago || 0), numericValue: (r: any) => Number(r.valor_pago || 0), align: "right", pdfFlex: 11 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => Number(r.valor || 0), align: "right", pdfFlex: 11 },
    ],
    carregar: async ({ client, companyId, range }) =>
      paginar(() =>
        client
          .from("contas_receber")
          .select("data_vencimento, pagador_nome, descricao, valor, valor_pago, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cancelado")
          .gte("data_vencimento", range.start)
          .lte("data_vencimento", range.end)
          .order("data_vencimento", { ascending: true }),
      ),
  },
  {
    id: "extrato-movimentacoes",
    grupo: "financeiro",
    titulo: "Extrato de Movimentações",
    descricao: "Todas as movimentações de caixa/banco do período, com conta, categoria e valor (entrada/saída).",
    usaPeriodo: true,
    columns: [
      { header: "Data", value: (r: any) => fmtDate(r.data), align: "center", pdfFlex: 8 },
      { header: "Conta", value: (r: any) => r.conta || "—", pdfFlex: 16, excelWidth: 24 },
      { header: "Descrição", value: (r: any) => r.descricao || "—", pdfFlex: 24, excelWidth: 34 },
      { header: "Categoria", value: (r: any) => r.categoria || "—", pdfFlex: 18, excelWidth: 26 },
      { header: "Tipo", value: (r: any) => (r.tipo === "credito" ? "Entrada" : "Saída"), align: "center", pdfFlex: 7 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valorAssinado), numericValue: (r: any) => r.valorAssinado, align: "right", pdfFlex: 11 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const [movs, contasRes] = await Promise.all([
        paginar(() =>
          client
            .from("movimentacoes")
            .select("data, valor, tipo, descricao, conta_bancaria_id, category:chart_of_accounts(name)")
            .eq("company_id", companyId)
            .gte("data", range.start)
            .lte("data", range.end)
            .order("data", { ascending: true }),
        ),
        client.from("bank_accounts").select("id, name, banco").eq("company_id", companyId),
      ]);
      const contaById = new Map<string, any>();
      (contasRes.data || []).forEach((a: any) => contaById.set(a.id, a));
      return (movs as any[]).map((m) => {
        const acc = contaById.get(m.conta_bancaria_id);
        const v = Number(m.valor || 0);
        return {
          data: m.data,
          conta: acc ? [acc.banco, acc.name].filter(Boolean).join(" - ") : "",
          descricao: m.descricao,
          categoria: m.category?.name || "",
          tipo: m.tipo,
          valorAssinado: m.tipo === "credito" ? v : -v,
        };
      });
    },
  },

  /* ===================== VENDAS ===================== */
  {
    id: "vendas-detalhado",
    grupo: "vendas",
    titulo: "Vendas (detalhado)",
    descricao: "Lista de todas as vendas do período — cliente, tipo, forma de pagamento, status e valor.",
    usaPeriodo: true,
    corPrimaria: "#2563EB",
    columns: [
      { header: "Data", value: (r: any) => fmtDate(r.data_venda), align: "center", pdfFlex: 8 },
      { header: "Cliente", value: (r: any) => r.cliente_nome || "—", pdfFlex: 26, excelWidth: 34 },
      { header: "Tipo", value: (r: any) => titleCase(r.tipo) || "—", align: "center", pdfFlex: 9 },
      { header: "Forma pgto", value: (r: any) => FORMA_LABEL[r.forma_pagamento] || titleCase(r.forma_pagamento) || "—", pdfFlex: 12 },
      { header: "Status", value: (r: any) => titleCase(r.status) || "—", align: "center", pdfFlex: 8 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor_total), numericValue: (r: any) => Number(r.valor_total || 0), align: "right", pdfFlex: 11 },
    ],
    carregar: async ({ client, companyId, range }) =>
      paginar(() =>
        client
          .from("vendas")
          .select("data_venda, cliente_nome, tipo, forma_pagamento, status, valor_total")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("data_venda", range.start)
          .lte("data_venda", range.end)
          .order("data_venda", { ascending: false }),
      ),
  },
  {
    id: "vendas-por-produto",
    grupo: "vendas",
    titulo: "Vendas por Produto",
    descricao: "Itens vendidos no período agregados por produto/serviço — quantidade e valor total.",
    usaPeriodo: true,
    corPrimaria: "#2563EB",
    columns: [
      { header: "Produto / Serviço", value: (r: any) => r.produto, pdfFlex: 30, excelWidth: 42 },
      { header: "Quantidade", value: (r: any) => r.quantidade, numericValue: (r: any) => r.quantidade, align: "right", pdfFlex: 10 },
      { header: "Valor total", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const vendas = await paginar<any>(() =>
        client
          .from("vendas")
          .select("id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("data_venda", range.start)
          .lte("data_venda", range.end)
          .order("data_venda", { ascending: false }),
      );
      const ids = vendas.map((v) => v.id);
      const map = new Map<string, { produto: string; quantidade: number; valor: number }>();
      const chunkSize = 300;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data: itens, error } = await client
          .from("vendas_itens")
          .select("descricao, quantidade, valor_total")
          .in("venda_id", chunk);
        if (error) throw error;
        for (const it of (itens || []) as any[]) {
          const nome = it.descricao || "Sem descrição";
          const prev = map.get(nome) || { produto: nome, quantidade: 0, valor: 0 };
          prev.quantidade += Number(it.quantidade || 0);
          prev.valor += Number(it.valor_total || 0);
          map.set(nome, prev);
        }
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },
  {
    id: "vendas-por-cliente",
    grupo: "vendas",
    titulo: "Vendas por Cliente",
    descricao: "Vendas do período agregadas por cliente — número de vendas e valor total.",
    usaPeriodo: true,
    corPrimaria: "#2563EB",
    pdfOrientacao: "portrait",
    columns: [
      { header: "Cliente", value: (r: any) => r.cliente, pdfFlex: 30, excelWidth: 40 },
      { header: "Nº vendas", value: (r: any) => r.vendas, numericValue: (r: any) => r.vendas, align: "right", pdfFlex: 8 },
      { header: "Valor total", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const vendas = await paginar<any>(() =>
        client
          .from("vendas")
          .select("cliente_nome, valor_total")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("data_venda", range.start)
          .lte("data_venda", range.end),
      );
      const map = new Map<string, { cliente: string; vendas: number; valor: number }>();
      for (const v of vendas) {
        const nome = v.cliente_nome || "Sem cliente";
        const prev = map.get(nome) || { cliente: nome, vendas: 0, valor: 0 };
        prev.vendas += 1;
        prev.valor += Number(v.valor_total || 0);
        map.set(nome, prev);
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },
  {
    id: "vendas-por-forma",
    grupo: "vendas",
    titulo: "Vendas por Forma de Pagamento",
    descricao: "Vendas do período agregadas por forma de pagamento — número de vendas e valor total.",
    usaPeriodo: true,
    corPrimaria: "#2563EB",
    pdfOrientacao: "portrait",
    columns: [
      { header: "Forma de pagamento", value: (r: any) => r.forma, pdfFlex: 24 },
      { header: "Nº vendas", value: (r: any) => r.vendas, numericValue: (r: any) => r.vendas, align: "right", pdfFlex: 8 },
      { header: "Valor total", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const vendas = await paginar<any>(() =>
        client
          .from("vendas")
          .select("forma_pagamento, valor_total")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("data_venda", range.start)
          .lte("data_venda", range.end),
      );
      const map = new Map<string, { forma: string; vendas: number; valor: number }>();
      for (const v of vendas) {
        const key = v.forma_pagamento || "indefinido";
        const label = FORMA_LABEL[key] || titleCase(key);
        const prev = map.get(key) || { forma: label, vendas: 0, valor: 0 };
        prev.vendas += 1;
        prev.valor += Number(v.valor_total || 0);
        map.set(key, prev);
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },

  /* ===================== DESPESAS ===================== */
  {
    id: "despesas-por-categoria",
    grupo: "despesas",
    titulo: "Despesas por Categoria",
    descricao: "Saídas de caixa do período agrupadas por categoria do plano de contas.",
    usaPeriodo: true,
    corPrimaria: "#DC2626",
    pdfOrientacao: "portrait",
    columns: [
      { header: "Categoria", value: (r: any) => r.categoria, pdfFlex: 30, excelWidth: 40 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const movs = await paginar(() =>
        client
          .from("movimentacoes")
          .select("valor, tipo, category:chart_of_accounts(name)")
          .eq("company_id", companyId)
          .eq("tipo", "debito")
          .gte("data", range.start)
          .lte("data", range.end),
      );
      const map = new Map<string, { categoria: string; valor: number }>();
      for (const m of movs as any[]) {
        const nome = m.category?.name || "Sem categoria";
        const prev = map.get(nome) || { categoria: nome, valor: 0 };
        prev.valor += Number(m.valor || 0);
        map.set(nome, prev);
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },
  {
    id: "despesas-por-centro",
    grupo: "despesas",
    titulo: "Despesas por Centro de Custo",
    descricao: "Saídas de caixa do período agrupadas por centro de custo.",
    usaPeriodo: true,
    corPrimaria: "#DC2626",
    pdfOrientacao: "portrait",
    columns: [
      { header: "Centro de custo", value: (r: any) => r.centro, pdfFlex: 30, excelWidth: 40 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const [movs, centrosRes] = await Promise.all([
        paginar(() =>
          client
            .from("movimentacoes")
            .select("valor, tipo, centro_custo_id")
            .eq("company_id", companyId)
            .eq("tipo", "debito")
            .gte("data", range.start)
            .lte("data", range.end),
        ),
        client.from("centros_custo").select("id, codigo, descricao").eq("company_id", companyId),
      ]);
      const centroById = new Map<string, any>();
      (centrosRes.data || []).forEach((c: any) => centroById.set(c.id, c));
      const map = new Map<string, { centro: string; valor: number }>();
      for (const m of movs as any[]) {
        const c = m.centro_custo_id ? centroById.get(m.centro_custo_id) : null;
        const nome = c ? [c.codigo, c.descricao].filter(Boolean).join(" - ") : "Sem centro de custo";
        const prev = map.get(nome) || { centro: nome, valor: 0 };
        prev.valor += Number(m.valor || 0);
        map.set(nome, prev);
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },
  {
    id: "despesas-por-fornecedor",
    grupo: "despesas",
    titulo: "Despesas por Fornecedor",
    descricao: "Contas a pagar com vencimento no período agregadas por fornecedor/credor.",
    usaPeriodo: true,
    corPrimaria: "#DC2626",
    pdfOrientacao: "portrait",
    columns: [
      { header: "Fornecedor / Credor", value: (r: any) => r.fornecedor, pdfFlex: 28, excelWidth: 40 },
      { header: "Nº títulos", value: (r: any) => r.titulos, numericValue: (r: any) => r.titulos, align: "right", pdfFlex: 8 },
      { header: "Valor", value: (r: any) => fmtBRL(r.valor), numericValue: (r: any) => r.valor, align: "right", pdfFlex: 12 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const cps = await paginar<any>(() =>
        client
          .from("contas_pagar")
          .select("credor_nome, valor")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cancelado")
          .gte("data_vencimento", range.start)
          .lte("data_vencimento", range.end),
      );
      const map = new Map<string, { fornecedor: string; titulos: number; valor: number }>();
      for (const c of cps) {
        const nome = c.credor_nome || "Sem credor";
        const prev = map.get(nome) || { fornecedor: nome, titulos: 0, valor: 0 };
        prev.titulos += 1;
        prev.valor += Number(c.valor || 0);
        map.set(nome, prev);
      }
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
  },

  /* ===================== RH & FOLHA ===================== */
  {
    id: "folha-pagamento",
    grupo: "rh",
    titulo: "Folha de Pagamento",
    descricao: "Folhas das competências dentro do período — proventos, descontos, líquido e encargos por funcionário.",
    usaPeriodo: true,
    corPrimaria: "#7C3AED",
    columns: [
      { header: "Funcionário", value: (r: any) => r.funcionario, pdfFlex: 20, excelWidth: 28 },
      { header: "Competência", value: (r: any) => r.competencia, align: "center", pdfFlex: 9 },
      { header: "Salário base", value: (r: any) => fmtBRL(r.salario_base), numericValue: (r: any) => r.salario_base, align: "right", pdfFlex: 10 },
      { header: "Proventos", value: (r: any) => fmtBRL(r.total_proventos), numericValue: (r: any) => r.total_proventos, align: "right", pdfFlex: 10 },
      { header: "Descontos", value: (r: any) => fmtBRL(r.total_descontos), numericValue: (r: any) => r.total_descontos, align: "right", pdfFlex: 10 },
      { header: "Líquido", value: (r: any) => fmtBRL(r.valor_liquido), numericValue: (r: any) => r.valor_liquido, align: "right", pdfFlex: 10 },
      { header: "FGTS", value: (r: any) => fmtBRL(r.fgts_mes), numericValue: (r: any) => r.fgts_mes, align: "right", pdfFlex: 9 },
    ],
    carregar: async ({ client, companyId, range }) => {
      const startYM = range.start.slice(0, 7);
      const endYM = range.end.slice(0, 7);
      const [folhasRes, empsRes] = await Promise.all([
        client
          .from("folha_pagamento")
          .select("employee_id, competencia, salario_base, total_proventos, total_descontos, valor_liquido, fgts_mes")
          .eq("company_id", companyId)
          .gte("competencia", startYM)
          .lte("competencia", endYM)
          .order("competencia", { ascending: true }),
        client.from("employees").select("id, nome_completo, name").eq("company_id", companyId),
      ]);
      if (folhasRes.error) throw folhasRes.error;
      const empById = new Map<string, any>();
      (empsRes.data || []).forEach((e: any) => empById.set(e.id, e));
      return (folhasRes.data || []).map((f: any) => ({
        funcionario: empName(empById.get(f.employee_id)),
        competencia: f.competencia,
        salario_base: Number(f.salario_base || 0),
        total_proventos: Number(f.total_proventos || 0),
        total_descontos: Number(f.total_descontos || 0),
        valor_liquido: Number(f.valor_liquido || 0),
        fgts_mes: Number(f.fgts_mes || 0),
      }));
    },
  },
  {
    id: "funcionarios",
    grupo: "rh",
    titulo: "Funcionários (cadastro)",
    descricao: "Lista completa de funcionários cadastrados — cargo, contrato, salário e status.",
    usaPeriodo: false,
    corPrimaria: "#7C3AED",
    columns: [
      { header: "Nome", value: (e: any) => empName(e), pdfFlex: 20, excelWidth: 28 },
      { header: "CPF", value: (e: any) => fmtDoc(e.cpf), pdfFlex: 12 },
      { header: "Cargo", value: (e: any) => e.role || "—", pdfFlex: 14 },
      { header: "Admissão", value: (e: any) => fmtDate(e.hire_date), align: "center", pdfFlex: 9 },
      { header: "Salário", value: (e: any) => fmtBRL(Number(e.salario_base || e.salary || 0)), numericValue: (e: any) => Number(e.salario_base || e.salary || 0), align: "right", pdfFlex: 11 },
      { header: "Telefone", value: (e: any) => fmtFone(e.phone), pdfFlex: 12 },
      { header: "Status", value: (e: any) => (String(e.status || "").toLowerCase().includes("ativ") && !String(e.status || "").toLowerCase().includes("inativ") ? "Ativo" : e.status ? "Inativo" : "—"), align: "center", pdfFlex: 8 },
    ],
    carregar: async ({ client, companyId }) =>
      paginar(() =>
        client
          .from("employees")
          .select("nome_completo, name, cpf, role, hire_date, salario_base, salary, phone, status")
          .eq("company_id", companyId)
          .order("nome_completo", { ascending: true }),
      ),
  },

  /* ===================== CADASTROS ===================== */
  {
    id: "clientes",
    grupo: "cadastros",
    titulo: "Clientes (cadastro)",
    descricao: "Lista completa de clientes — documento, cidade, contato e status.",
    usaPeriodo: false,
    columns: [
      { header: "Razão Social / Nome", value: (c: any) => c.razao_social || c.nome_fantasia || "—", pdfFlex: 24, excelWidth: 34 },
      { header: "CPF / CNPJ", value: (c: any) => fmtDoc(c.cpf_cnpj), pdfFlex: 13 },
      { header: "Cidade/UF", value: (c: any) => [c.endereco_cidade, c.endereco_estado].filter(Boolean).join("/") || "—", pdfFlex: 11 },
      { header: "Telefone", value: (c: any) => fmtFone(c.celular || c.telefone), pdfFlex: 11 },
      { header: "E-mail", value: (c: any) => c.email || "—", pdfFlex: 16, excelWidth: 24 },
      { header: "Status", value: (c: any) => (c.is_active ? "Ativo" : "Inativo"), align: "center", pdfFlex: 7 },
    ],
    carregar: async ({ client, companyId }) =>
      paginar(() =>
        client
          .from("clients")
          .select("razao_social, nome_fantasia, cpf_cnpj, endereco_cidade, endereco_estado, celular, telefone, email, is_active")
          .eq("company_id", companyId)
          .order("razao_social", { ascending: true }),
      ),
  },
  {
    id: "fornecedores",
    grupo: "cadastros",
    titulo: "Fornecedores (cadastro)",
    descricao: "Lista completa de fornecedores — documento, cidade, contato e status.",
    usaPeriodo: false,
    columns: [
      { header: "Razão Social / Nome", value: (s: any) => s.razao_social || s.nome_fantasia || "—", pdfFlex: 24, excelWidth: 34 },
      { header: "CPF / CNPJ", value: (s: any) => fmtDoc(s.cpf_cnpj), pdfFlex: 13 },
      { header: "Cidade/UF", value: (s: any) => [s.endereco_cidade, s.endereco_estado].filter(Boolean).join("/") || "—", pdfFlex: 11 },
      { header: "Telefone", value: (s: any) => fmtFone(s.celular || s.telefone), pdfFlex: 11 },
      { header: "Status", value: (s: any) => (s.is_active ? "Ativo" : "Inativo"), align: "center", pdfFlex: 7 },
    ],
    carregar: async ({ client, companyId }) =>
      paginar(() =>
        client
          .from("suppliers")
          .select("razao_social, nome_fantasia, cpf_cnpj, endereco_cidade, endereco_estado, celular, telefone, is_active")
          .eq("company_id", companyId)
          .order("razao_social", { ascending: true }),
      ),
  },
  {
    id: "produtos",
    grupo: "cadastros",
    titulo: "Produtos / Estoque",
    descricao: "Lista de produtos cadastrados — estoque atual, custo médio e status.",
    usaPeriodo: false,
    columns: [
      { header: "Código", value: (p: any) => p.code || "—", pdfFlex: 9 },
      { header: "Descrição", value: (p: any) => p.description || "—", pdfFlex: 30, excelWidth: 42 },
      { header: "Estoque", value: (p: any) => Number(p.estoque_atual || 0), numericValue: (p: any) => Number(p.estoque_atual || 0), align: "right", pdfFlex: 9 },
      { header: "Custo médio", value: (p: any) => fmtBRL(Number(p.custo_medio || 0)), numericValue: (p: any) => Number(p.custo_medio || 0), align: "right", pdfFlex: 11 },
      { header: "Status", value: (p: any) => (p.is_active ? "Ativo" : "Inativo"), align: "center", pdfFlex: 7 },
    ],
    carregar: async ({ client, companyId }) =>
      paginar(() =>
        client
          .from("products")
          .select("code, description, estoque_atual, custo_medio, is_active")
          .eq("company_id", companyId)
          .order("description", { ascending: true }),
      ),
  },
];
