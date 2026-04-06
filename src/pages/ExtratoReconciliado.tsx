import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search, Download, CheckCircle2, Clock, XCircle, Filter,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BankAccount {
  id: string;
  name: string;
  banco: string;
  current_balance: number | null;
  initial_balance: number | null;
}

interface BankTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  memo: string | null;
  status: "reconciled" | "pending" | "ignored";
  fit_id: string | null;
  source: string | null;
  reconciled_at: string | null;
  reconciliation_note: string | null;
  reconciled_payable_id: string | null;
  reconciled_receivable_id: string | null;
}

type StatusFilter = "all" | "reconciled" | "pending" | "ignored";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
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
/*  KPI Card                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  color = "#0a0a0a",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="border border-[#ccc] rounded-lg overflow-hidden">
      <div className="bg-[#1a2e4a] px-4 py-2">
        <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">
          {label}
        </h3>
      </div>
      <div className="p-4 bg-white">
        <p className="text-xl font-bold" style={{ color }}>
          {value}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: BankTransaction["status"] }) {
  if (status === "reconciled") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        <CheckCircle2 size={12} /> Conciliado
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        <Clock size={12} /> Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
      <XCircle size={12} /> Ignorado
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function exportCSV(
  rows: (BankTransaction & { runningBalance: number; linkedName: string })[],
) {
  const header = "Data;Descricao;Memo;Valor;Status;Vinculo;Saldo Acumulado";
  const lines = rows.map((r) =>
    [
      format(new Date(r.date + "T12:00:00"), "dd/MM/yyyy"),
      `"${(r.description || "").replace(/"/g, '""')}"`,
      `"${(r.memo || "").replace(/"/g, '""')}"`,
      r.amount.toFixed(2).replace(".", ","),
      r.status === "reconciled"
        ? "Conciliado"
        : r.status === "pending"
          ? "Pendente"
          : "Ignorado",
      `"${r.linkedName}"`,
      r.runningBalance.toFixed(2).replace(".", ","),
    ].join(";"),
  );
  const csv = "\uFEFF" + [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `extrato_reconciliado_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ExtratoReconciliado() {
  const { activeClient: db } = useAuth();
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id;

  /* --- local state ------------------------------------------------ */
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const monthOptions = useMemo(buildMonthOptions, []);

  /* --- derived dates ---------------------------------------------- */
  const startDate = useMemo(
    () => format(startOfMonth(new Date(selectedMonth + "-15")), "yyyy-MM-dd"),
    [selectedMonth],
  );
  const endDate = useMemo(
    () => format(endOfMonth(new Date(selectedMonth + "-15")), "yyyy-MM-dd"),
    [selectedMonth],
  );

  /* --- queries ---------------------------------------------------- */

  // Bank accounts
  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank_accounts_active", cId],
    queryFn: async () => {
      const { data, error } = await (db as any)
        .from("bank_accounts")
        .select("id, name, banco, current_balance, initial_balance")
        .eq("company_id", cId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!cId,
  });

  // Auto-select first account when loaded
  useMemo(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Bank transactions
  const {
    data: transactions = [],
    isLoading: loadingTx,
  } = useQuery<BankTransaction[]>({
    queryKey: ["bank_transactions", cId, selectedAccountId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await (db as any)
        .from("bank_transactions")
        .select(
          `id, date, amount, description, memo, status, fit_id, source,
           reconciled_at, reconciliation_note,
           reconciled_payable_id, reconciled_receivable_id`,
        )
        .eq("bank_account_id", selectedAccountId)
        .eq("company_id", cId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankTransaction[];
    },
    enabled: !!cId && !!selectedAccountId,
  });

  // Linked names (payable / receivable)
  const reconciledIds = useMemo(() => {
    const payIds: string[] = [];
    const recIds: string[] = [];
    transactions.forEach((t) => {
      if (t.reconciled_payable_id) payIds.push(t.reconciled_payable_id);
      if (t.reconciled_receivable_id) recIds.push(t.reconciled_receivable_id);
    });
    return { payIds, recIds };
  }, [transactions]);

  const { data: payableNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["payable_names", reconciledIds.payIds],
    queryFn: async () => {
      if (reconciledIds.payIds.length === 0) return {};
      const { data } = await (db as any)
        .from("contas_pagar")
        .select("id, credor_nome")
        .in("id", reconciledIds.payIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        map[r.id] = r.credor_nome || "";
      });
      return map;
    },
    enabled: reconciledIds.payIds.length > 0,
  });

  const { data: receivableNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["receivable_names", reconciledIds.recIds],
    queryFn: async () => {
      if (reconciledIds.recIds.length === 0) return {};
      const { data } = await (db as any)
        .from("contas_receber")
        .select("id, pagador_nome")
        .in("id", reconciledIds.recIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        map[r.id] = r.pagador_nome || "";
      });
      return map;
    },
    enabled: reconciledIds.recIds.length > 0,
  });

  /* --- computed --------------------------------------------------- */

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountBalance =
    selectedAccount?.current_balance ??
    selectedAccount?.initial_balance ??
    0;

  const totalEntradas = useMemo(
    () =>
      transactions
        .filter((t) => t.amount > 0)
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  const totalSaidas = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions],
  );

  const reconciledCount = transactions.filter(
    (t) => t.status === "reconciled",
  ).length;
  const totalCount = transactions.length;
  const reconciledPct =
    totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 0;

  // Filtered list
  const filtered = useMemo(() => {
    let list = transactions;
    if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          (t.description || "").toLowerCase().includes(q) ||
          (t.memo || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [transactions, statusFilter, search]);

  // Running balance
  const rowsWithBalance = useMemo(() => {
    let running = 0;
    return filtered.map((t) => {
      running += t.amount;
      const linkedName =
        (t.reconciled_payable_id
          ? payableNames[t.reconciled_payable_id]
          : t.reconciled_receivable_id
            ? receivableNames[t.reconciled_receivable_id]
            : "") || "";
      return { ...t, runningBalance: running, linkedName };
    });
  }, [filtered, payableNames, receivableNames]);

  /* --- tab helpers ------------------------------------------------ */
  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: transactions.length },
    {
      key: "reconciled",
      label: "Conciliadas",
      count: transactions.filter((t) => t.status === "reconciled").length,
    },
    {
      key: "pending",
      label: "Pendentes",
      count: transactions.filter((t) => t.status === "pending").length,
    },
    {
      key: "ignored",
      label: "Ignoradas",
      count: transactions.filter((t) => t.status === "ignored").length,
    },
  ];

  /* --- render ----------------------------------------------------- */
  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0a0a0a]">
              Extrato Reconciliado
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Extrato bancario importado via OFX com status de conciliacao
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 border-[#ccc] text-[#0a0a0a] hover:bg-gray-50"
            onClick={() => exportCSV(rowsWithBalance)}
            disabled={rowsWithBalance.length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
        </div>

        {/* Account + Month selectors */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a] block mb-1">
              Conta Bancaria
            </label>
            <select
              className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none w-full"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              {accounts.length === 0 && (
                <option value="">Nenhuma conta encontrada</option>
              )}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.banco ? `(${a.banco})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a] block mb-1">
              Periodo
            </label>
            <select
              className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none w-full"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Saldo da Conta" value={fmtBRL(accountBalance)} />
          <KpiCard
            label="Total Entradas"
            value={fmtBRL(totalEntradas)}
            color="#16a34a"
          />
          <KpiCard
            label="Total Saidas"
            value={fmtBRL(totalSaidas)}
            color="#dc2626"
          />
          <KpiCard
            label="Conciliadas"
            value={`${reconciledCount} de ${totalCount} (${reconciledPct}%)`}
            color="#1a2e4a"
          />
        </div>

        {/* Status tabs + search */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === tab.key
                    ? "bg-white text-[#0a0a0a] shadow-sm"
                    : "text-gray-500 hover:text-[#0a0a0a]"
                }`}
              >
                {tab.label}{" "}
                <span className="text-[10px] text-gray-400">
                  ({tab.count})
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              placeholder="Buscar por descricao ou memo..."
              className="pl-9 border-[#ccc] text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white">
          {loadingTx ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Carregando...
            </div>
          ) : rowsWithBalance.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Nenhuma transacao encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#1a2e4a]">
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest">
                      Data
                    </TableHead>
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest">
                      Descricao
                    </TableHead>
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest text-right">
                      Valor
                    </TableHead>
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest text-center">
                      Status
                    </TableHead>
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest">
                      Vinculo
                    </TableHead>
                    <TableHead className="text-[10px] font-bold text-white uppercase tracking-widest text-right">
                      Saldo Acum.
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithBalance.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className={
                        row.status === "pending"
                          ? "bg-amber-50/50"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50/50"
                      }
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(
                          new Date(row.date + "T12:00:00"),
                          "dd/MM/yyyy",
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-[#0a0a0a]">
                          {truncate(row.description || "", 60)}
                        </div>
                        {row.memo &&
                          row.memo !== row.description && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {truncate(row.memo, 80)}
                            </div>
                          )}
                      </TableCell>
                      <TableCell
                        className={`text-sm font-medium text-right whitespace-nowrap ${
                          row.amount >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {fmtBRL(row.amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[180px] truncate">
                        {row.linkedName || "-"}
                      </TableCell>
                      <TableCell
                        className={`text-sm font-medium text-right whitespace-nowrap ${
                          row.runningBalance >= 0
                            ? "text-[#0a0a0a]"
                            : "text-red-600"
                        }`}
                      >
                        {fmtBRL(row.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
