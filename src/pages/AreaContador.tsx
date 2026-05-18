import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Download, FileSpreadsheet, Receipt } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BankAccount {
  id: string;
  name: string;
  banco: string | null;
}

interface Movimentacao {
  id: string;
  data: string;
  valor: number;                    // sempre positivo; sinal vem de tipo
  tipo: "credito" | "debito";
  descricao: string | null;
  origem: string;                   // 'manual' | 'ofx' | 'conta_receber' | 'conta_pagar' | 'transferencia'
  conta_bancaria_id: string;
  conta_contabil_id: string | null; // categoria preenchida diretamente na mov
  centro_custo_id: string | null;
  conta_receber_id: string | null;
  conta_pagar_id: string | null;
}

interface ContaPagar {
  id: string;
  credor_nome: string | null;
  descricao: string | null;
  conta_contabil_id: string | null;
  centro_custo_id: string | null;
}

interface ContaReceber {
  id: string;
  pagador_nome: string | null;
  descricao: string | null;
  conta_contabil_id: string | null;
  centro_custo_id: string | null;
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
}

interface CentroCusto {
  id: string;
  codigo: string | null;
  descricao: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateBR(d: string): string {
  return format(new Date(d + "T12:00:00"), "dd/MM/yyyy");
}

function buildMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    opts.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }
  return opts;
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function AreaContador() {
  const { activeClient: db } = useAuth();
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id;

  const monthOptions = useMemo(buildMonthOptions, []);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  const startDate = useMemo(
    () => format(startOfMonth(new Date(selectedMonth + "-15")), "yyyy-MM-dd"),
    [selectedMonth],
  );
  const endDate = useMemo(
    () => format(endOfMonth(new Date(selectedMonth + "-15")), "yyyy-MM-dd"),
    [selectedMonth],
  );

  /* ---- queries ---- */

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["ac_accounts", cId],
    queryFn: async () => {
      const { data, error } = await (db as any)
        .from("bank_accounts")
        .select("id, name, banco")
        .eq("company_id", cId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cId,
  });

  // Movimentações = fonte da verdade do fluxo de caixa (real activity).
  // Mudou de bank_transactions porque aquela só pegava txs vindas de
  // extrato OFX conciliado — perdia CR/CP quitados manualmente + ajustes.
  const {
    data: txs = [],
    isLoading: loadingTx,
  } = useQuery<Movimentacao[]>({
    queryKey: ["ac_movs", cId, selectedAccountId, startDate, endDate],
    queryFn: async () => {
      let q = (db as any)
        .from("movimentacoes")
        .select(
          `id, data, valor, tipo, descricao, origem,
           conta_bancaria_id, conta_contabil_id, centro_custo_id,
           conta_receber_id, conta_pagar_id`,
        )
        .eq("company_id", cId)
        .gte("data", startDate)
        .lte("data", endDate)
        .order("data", { ascending: true });
      if (selectedAccountId !== "all") {
        q = q.eq("conta_bancaria_id", selectedAccountId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Movimentacao[];
    },
    enabled: !!cId,
  });

  const payIds = useMemo(
    () =>
      Array.from(
        new Set(
          txs
            .map((t) => t.conta_pagar_id)
            .filter((x): x is string => !!x),
        ),
      ),
    [txs],
  );
  const recIds = useMemo(
    () =>
      Array.from(
        new Set(
          txs
            .map((t) => t.conta_receber_id)
            .filter((x): x is string => !!x),
        ),
      ),
    [txs],
  );

  const { data: payables = [] } = useQuery<ContaPagar[]>({
    queryKey: ["ac_payables", payIds],
    queryFn: async () => {
      if (payIds.length === 0) return [];
      const { data } = await (db as any)
        .from("contas_pagar")
        .select("id, credor_nome, descricao, conta_contabil_id, centro_custo_id")
        .in("id", payIds);
      return (data ?? []) as ContaPagar[];
    },
    enabled: payIds.length > 0,
  });

  const { data: receivables = [] } = useQuery<ContaReceber[]>({
    queryKey: ["ac_receivables", recIds],
    queryFn: async () => {
      if (recIds.length === 0) return [];
      const { data } = await (db as any)
        .from("contas_receber")
        .select("id, pagador_nome, descricao, conta_contabil_id, centro_custo_id")
        .in("id", recIds);
      return (data ?? []) as ContaReceber[];
    },
    enabled: recIds.length > 0,
  });

  const { data: chart = [] } = useQuery<ChartAccount[]>({
    queryKey: ["ac_chart", cId],
    queryFn: async () => {
      const { data } = await (db as any)
        .from("chart_of_accounts")
        .select("id, code, name")
        .eq("company_id", cId);
      return (data ?? []) as ChartAccount[];
    },
    enabled: !!cId,
  });

  const { data: centros = [] } = useQuery<CentroCusto[]>({
    queryKey: ["ac_centros", cId],
    queryFn: async () => {
      const { data } = await (db as any)
        .from("centros_custo")
        .select("id, codigo, descricao")
        .eq("company_id", cId);
      return (data ?? []) as CentroCusto[];
    },
    enabled: !!cId,
  });

  /* ---- lookup maps ---- */

  const accountById = useMemo(() => {
    const m = new Map<string, BankAccount>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);

  const payableById = useMemo(() => {
    const m = new Map<string, ContaPagar>();
    payables.forEach((r) => m.set(r.id, r));
    return m;
  }, [payables]);

  const receivableById = useMemo(() => {
    const m = new Map<string, ContaReceber>();
    receivables.forEach((r) => m.set(r.id, r));
    return m;
  }, [receivables]);

  const chartById = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chart.forEach((c) => m.set(c.id, c));
    return m;
  }, [chart]);

  const centroById = useMemo(() => {
    const m = new Map<string, CentroCusto>();
    centros.forEach((c) => m.set(c.id, c));
    return m;
  }, [centros]);

  /* ---- enriched rows ---- */

  type Row = {
    date: string;
    accountName: string;
    description: string;
    memo: string;
    amount: number;                                  // com sinal: credito=+, debito=-
    type: "Crédito (CR)" | "Débito (CP)" | "Transferência" | "Manual" | "OFX direto" | "Outro";
    counterparty: string;
    categoryCode: string;
    categoryName: string;
    centroCusto: string;
    note: string;
  };

  const rows: Row[] = useMemo(() => {
    return txs.map((t) => {
      const acc = accountById.get(t.conta_bancaria_id);

      // Sinal do valor vem do tipo: credito=+, debito=-
      const signedAmount = t.tipo === "credito" ? Number(t.valor) : -Number(t.valor);

      // Classifica o tipo pra exibir + label da contraparte vem do CR/CP linkado
      let type: Row["type"] = "Outro";
      let counterparty = "";
      // Categoria/centro tem prioridade na propria mov; fallback pro CR/CP linkado.
      let categoryId: string | null = t.conta_contabil_id;
      let centroId: string | null = t.centro_custo_id;

      if (t.conta_receber_id) {
        const r = receivableById.get(t.conta_receber_id);
        type = "Crédito (CR)";
        counterparty = r?.pagador_nome || "";
        if (!categoryId) categoryId = r?.conta_contabil_id ?? null;
        if (!centroId) centroId = r?.centro_custo_id ?? null;
      } else if (t.conta_pagar_id) {
        const p = payableById.get(t.conta_pagar_id);
        type = "Débito (CP)";
        counterparty = p?.credor_nome || "";
        if (!categoryId) categoryId = p?.conta_contabil_id ?? null;
        if (!centroId) centroId = p?.centro_custo_id ?? null;
      } else if (t.origem === "transferencia") {
        type = "Transferência";
      } else if (t.origem === "manual") {
        type = "Manual";
      } else if (t.origem === "ofx") {
        type = "OFX direto";
      }

      const cat = categoryId ? chartById.get(categoryId) : undefined;
      const cc = centroId ? centroById.get(centroId) : undefined;

      return {
        date: t.data,
        accountName: acc ? `${acc.banco || ""} ${acc.name}`.trim() : "",
        description: t.descricao || "",
        memo: "",                                    // movimentacoes nao tem memo separado
        amount: signedAmount,
        type,
        counterparty,
        categoryCode: cat?.code || "",
        categoryName: cat?.name || "",
        centroCusto: cc
          ? [cc.codigo, cc.descricao].filter(Boolean).join(" - ")
          : "",
        note: "",                                    // sem nota direta no movs (poderia adicionar depois)
      };
    });
  }, [
    txs,
    accountById,
    payableById,
    receivableById,
    chartById,
    centroById,
  ]);

  /* ---- KPIs ---- */

  const totalEntradas = rows
    .filter((r) => r.amount > 0)
    .reduce((s, r) => s + r.amount, 0);
  const totalSaidas = rows
    .filter((r) => r.amount < 0)
    .reduce((s, r) => s + Math.abs(r.amount), 0);

  const monthLabel = format(
    new Date(selectedMonth + "-15"),
    "MMMM yyyy",
    { locale: ptBR },
  );
  const companySlug = (() => {
    const raw = (selectedCompany as any)?.razao_social as string | undefined;
    if (!raw) return "empresa";
    return raw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .toLowerCase();
  })();

  /* ---- export: extrato ---- */

  function exportExtrato() {
    if (rows.length === 0) return;
    const wb = XLSX.utils.book_new();

    const groups = new Map<string, Row[]>();
    rows.forEach((r) => {
      const key = r.accountName || "Sem conta";
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    });

    groups.forEach((accRows, accName) => {
      let running = 0;
      const sheetData = [
        ["Data", "Descrição", "Memo", "Valor", "Saldo Acumulado"],
        ...accRows.map((r) => {
          running += r.amount;
          return [
            fmtDateBR(r.date),
            r.description,
            r.memo,
            r.amount,
            running,
          ];
        }),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws["!cols"] = [
        { wch: 12 },
        { wch: 50 },
        { wch: 30 },
        { wch: 14 },
        { wch: 16 },
      ];
      const safeName = accName.slice(0, 30).replace(/[\\/?*[\]:]/g, "_");
      XLSX.utils.book_append_sheet(wb, ws, safeName || "Extrato");
    });

    XLSX.writeFile(
      wb,
      `extrato_conciliado_${companySlug}_${selectedMonth}.xlsx`,
    );
  }

  /* ---- export: conciliações + categoria ---- */

  function exportConciliacoes() {
    if (rows.length === 0) return;
    const sheetData = [
      [
        "Data",
        "Conta Bancária",
        "Descrição",
        "Memo",
        "Valor",
        "Tipo",
        "Pagador / Credor",
        "Cód. Categoria",
        "Categoria",
        "Centro de Custo",
        "Observação",
      ],
      ...rows.map((r) => [
        fmtDateBR(r.date),
        r.accountName,
        r.description,
        r.memo,
        r.amount,
        r.type,
        r.counterparty,
        r.categoryCode,
        r.categoryName,
        r.centroCusto,
        r.note,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 40 },
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 30 },
      { wch: 20 },
      { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conciliações");
    XLSX.writeFile(
      wb,
      `conciliacoes_categorias_${companySlug}_${selectedMonth}.xlsx`,
    );
  }

  /* ---- render ---- */

  const hasData = rows.length > 0;
  const hasUncategorized = rows.some(
    (r) => !r.categoryCode && r.type !== "Outro",
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-[#1D2939]">
            <Receipt size={20} />
            <h1 className="text-xl font-semibold">Área do Contador</h1>
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Relatórios prontos para enviar à contabilidade. Selecione o
            período e a conta para baixar o extrato já conciliado e a
            planilha de conciliações com categorias.
          </p>
        </header>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#1D2939] mb-1">
              Mês
            </label>
            <select
              className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none min-w-[200px]"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#1D2939] mb-1">
              Conta Bancária
            </label>
            <select
              className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none min-w-[260px]"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="all">Todas as contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {[a.banco, a.name].filter(Boolean).join(" - ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                Movimentações conciliadas
              </div>
              <div className="text-2xl font-semibold text-[#1D2939] mt-1">
                {rows.length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                Entradas
              </div>
              <div className="text-2xl font-semibold text-[#059669] mt-1">
                {fmtBRL(totalEntradas)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                Saídas
              </div>
              <div className="text-2xl font-semibold text-[#DC2626] mt-1">
                {fmtBRL(totalSaidas)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Downloads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#1D2939]">
                <FileSpreadsheet size={18} />
                <h2 className="font-semibold">Extrato Conciliado</h2>
              </div>
              <p className="text-sm text-gray-600">
                Movimentação bancária do mês — apenas o que está conciliado.
                Uma aba por conta, com saldo acumulado. Formato Excel (.xlsx).
              </p>
              <Button
                onClick={exportExtrato}
                disabled={!hasData}
                className="bg-[#1D2939] hover:bg-[#0F1A2A] text-white gap-2"
              >
                <Download size={16} />
                Baixar Extrato ({monthLabel})
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[#E5E7EB]">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#1D2939]">
                <FileSpreadsheet size={18} />
                <h2 className="font-semibold">Conciliações + Categorias</h2>
              </div>
              <p className="text-sm text-gray-600">
                Planilha completa: cada conciliação com pagador/credor,
                categoria do plano de contas e centro de custo. É o que o
                contador usa pra lançar.
              </p>
              <Button
                onClick={exportConciliacoes}
                disabled={!hasData}
                className="bg-[#059669] hover:bg-[#047857] text-white gap-2"
              >
                <Download size={16} />
                Baixar Conciliações ({monthLabel})
              </Button>
              {hasUncategorized && (
                <p className="text-xs text-[#B45309] bg-[#FEF3C7] rounded px-2 py-1.5">
                  Há conciliações sem categoria — o contador vai precisar
                  classificar manualmente.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1D2939]">
              Pré-visualização — {monthLabel}
            </h3>
            <div className="text-xs text-gray-500">
              {rows.length} linha{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <Card className="border-[#E5E7EB]">
            <CardContent className="p-0">
              {loadingTx ? (
                <div className="p-4">
                  <TableSkeleton rows={6} />
                </div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  Nenhuma conciliação encontrada neste período.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Pagador / Credor</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 50).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap">
                            {fmtDateBR(r.date)}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {r.accountName}
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">
                            {r.description}
                          </TableCell>
                          <TableCell>{r.counterparty}</TableCell>
                          <TableCell className="text-xs">
                            {r.categoryCode ? (
                              <span className="text-[#1D2939]">
                                {r.categoryCode} — {r.categoryName}
                              </span>
                            ) : (
                              <span className="text-[#B45309]">
                                Sem categoria
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={
                              "text-right font-medium whitespace-nowrap " +
                              (r.amount >= 0
                                ? "text-[#059669]"
                                : "text-[#DC2626]")
                            }
                          >
                            {fmtBRL(r.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > 50 && (
                    <div className="p-3 text-xs text-gray-500 text-center border-t border-gray-100">
                      Mostrando 50 de {rows.length} linhas — baixe o arquivo
                      para ver tudo.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
