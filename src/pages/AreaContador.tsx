import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Mail, FileText, Eye, ChevronDown } from "lucide-react";

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

interface BankTxRow {
  id: string;
  date: string;
  amount: number;            // já com sinal: +entrada / -saída
  description: string | null;
  memo: string | null;
  status: string;            // 'pending' | 'reconciled' | 'ignored'
  bank_account_id: string;
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

  // ─── Padrão de planilha: colunas ajustáveis + ocultáveis ─────
  const PREVIEW_COL_ORDER = ['data', 'conta', 'descricao', 'contraparte', 'categoria', 'valor'];
  const COL_LABELS: Record<string, string> = {
    data: 'Data', conta: 'Conta', descricao: 'Descrição',
    contraparte: 'Pagador / Credor', categoria: 'Categoria', valor: 'Valor',
  };
  const COL_WIDTHS_DEFAULT: Record<string, number> = {
    data: 100, conta: 160, descricao: 280, contraparte: 200, categoria: 240, valor: 130,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const s = localStorage.getItem('areacontador_col_widths');
      if (s) return { ...COL_WIDTHS_DEFAULT, ...JSON.parse(s) };
    } catch { /* ignore */ }
    return COL_WIDTHS_DEFAULT;
  });
  useEffect(() => { localStorage.setItem('areacontador_col_widths', JSON.stringify(colWidths)); }, [colWidths]);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('areacontador_hidden_cols');
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => { localStorage.setItem('areacontador_hidden_cols', JSON.stringify([...hiddenCols])); }, [hiddenCols]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const isColVisible = (k: string) => !hiddenCols.has(k);
  const toggleColVisible = (k: string) => setHiddenCols(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const visiblePreviewCols = PREVIEW_COL_ORDER.filter(isColVisible);
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? COL_WIDTHS_DEFAULT[key] };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const newW = Math.max(60, r.startW + (ev.clientX - r.startX));
      setColWidths(prev => ({ ...prev, [r.key]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const monthOptions = useMemo(buildMonthOptions, []);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  // Email modal state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [emailIncluir, setEmailIncluir] = useState({ extrato: true, conciliado: true, categorias: true });
  const [sendingEmail, setSendingEmail] = useState(false);

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

  // bank_transactions = extrato bruto do mês, conforme veio do banco.
  // Usado pra gerar "Extrato do mês" (todas as txs) e "Extrato conciliado" (status=reconciled).
  const { data: bankTxs = [] } = useQuery<BankTxRow[]>({
    queryKey: ["ac_bank_txs", cId, selectedAccountId, startDate, endDate],
    queryFn: async () => {
      let q = (db as any)
        .from("bank_transactions")
        .select("id, date, amount, description, memo, status, bank_account_id")
        .eq("company_id", cId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
      if (selectedAccountId !== "all") {
        q = q.eq("bank_account_id", selectedAccountId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BankTxRow[];
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
  // Entradas/Saídas vêm do extrato bancário conciliado (bank_transactions status=reconciled),
  // não de movimentacoes. O contador só considera o que foi efetivamente apurado contra o banco;
  // movs manuais sem espelho no extrato ficam de fora.
  const reconciledBankTxs = useMemo(
    () => bankTxs.filter((t) => t.status === "reconciled"),
    [bankTxs],
  );

  const totalEntradas = reconciledBankTxs
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalSaidas = reconciledBankTxs
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

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

  /* ---- builders: cada relatório gera um workbook + filename ---- */

  // 1. Extrato do mês — TODAS as transações do extrato bancário, conciliadas ou não.
  //    Vem de bank_transactions. Inclui coluna Status pra mostrar o que falta conciliar.
  function buildExtratoBrutoWb(): { wb: XLSX.WorkBook; filename: string } {
    const wb = XLSX.utils.book_new();
    const statusLabel: Record<string, string> = {
      pending: "Pendente",
      reconciled: "Conciliado",
      ignored: "Ignorado",
    };

    const groups = new Map<string, BankTxRow[]>();
    bankTxs.forEach((t) => {
      const acc = accountById.get(t.bank_account_id);
      const key = acc ? `${acc.banco || ""} ${acc.name}`.trim() : "Sem conta";
      const arr = groups.get(key) || [];
      arr.push(t);
      groups.set(key, arr);
    });

    groups.forEach((accTxs, accName) => {
      let running = 0;
      const sheetData = [
        ["Data", "Descrição", "Memo", "Valor", "Status", "Saldo Acumulado"],
        ...accTxs.map((t) => {
          running += Number(t.amount);
          return [
            fmtDateBR(t.date),
            t.description || "",
            t.memo || "",
            Number(t.amount),
            statusLabel[t.status] || t.status,
            running,
          ];
        }),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
      const safeName = accName.slice(0, 30).replace(/[\\/?*[\]:]/g, "_");
      XLSX.utils.book_append_sheet(wb, ws, safeName || "Extrato");
    });

    return { wb, filename: `extrato_do_mes_${companySlug}_${selectedMonth}.xlsx` };
  }

  // 2. Extrato conciliado — movimentações conciliadas (do fluxo de caixa real)
  //    Vem de movimentacoes (que é a fonte da verdade do fluxo)
  function buildExtratoConciliadoWb(): { wb: XLSX.WorkBook; filename: string } {
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
        ["Data", "Descrição", "Pagador / Credor", "Valor", "Saldo Acumulado"],
        ...accRows.map((r) => {
          running += r.amount;
          return [fmtDateBR(r.date), r.description, r.counterparty, r.amount, running];
        }),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 28 }, { wch: 14 }, { wch: 16 }];
      const safeName = accName.slice(0, 30).replace(/[\\/?*[\]:]/g, "_");
      XLSX.utils.book_append_sheet(wb, ws, safeName || "Conciliado");
    });

    return { wb, filename: `extrato_conciliado_${companySlug}_${selectedMonth}.xlsx` };
  }

  function exportExtratoBruto() {
    if (bankTxs.length === 0) return;
    const { wb, filename } = buildExtratoBrutoWb();
    XLSX.writeFile(wb, filename);
  }

  function exportExtrato() {
    if (rows.length === 0) return;
    const { wb, filename } = buildExtratoConciliadoWb();
    XLSX.writeFile(wb, filename);
  }

  /* ---- export: conciliações + categoria ---- */

  function buildConciliacoesWb(): { wb: XLSX.WorkBook; filename: string } {
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
      { wch: 12 }, { wch: 24 }, { wch: 40 }, { wch: 24 }, { wch: 14 },
      { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conciliações");
    return { wb, filename: `conciliacoes_categorias_${companySlug}_${selectedMonth}.xlsx` };
  }

  function exportConciliacoes() {
    if (rows.length === 0) return;
    const { wb, filename } = buildConciliacoesWb();
    XLSX.writeFile(wb, filename);
  }

  /* ---- envio por email — gera os 3 XLSX em base64 e chama enviar-email ---- */

  function wbToBase64(wb: XLSX.WorkBook): string {
    return XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  }

  async function handleEnviarEmail() {
    if (!emailDestinatario.trim()) {
      toast.error("Informe o email do destinatário");
      return;
    }
    if (!emailIncluir.extrato && !emailIncluir.conciliado && !emailIncluir.categorias) {
      toast.error("Selecione pelo menos um relatório pra enviar");
      return;
    }

    setSendingEmail(true);
    try {
      const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const anexos: Array<{ conteudoBase64: string; nomeArquivo: string; contentType: string }> = [];

      if (emailIncluir.extrato && bankTxs.length > 0) {
        const { wb, filename } = buildExtratoBrutoWb();
        anexos.push({ conteudoBase64: wbToBase64(wb), nomeArquivo: filename, contentType: xlsxMime });
      }
      if (emailIncluir.conciliado && rows.length > 0) {
        const { wb, filename } = buildExtratoConciliadoWb();
        anexos.push({ conteudoBase64: wbToBase64(wb), nomeArquivo: filename, contentType: xlsxMime });
      }
      if (emailIncluir.categorias && rows.length > 0) {
        const { wb, filename } = buildConciliacoesWb();
        anexos.push({ conteudoBase64: wbToBase64(wb), nomeArquivo: filename, contentType: xlsxMime });
      }

      if (anexos.length === 0) {
        toast.error("Não há dados no período selecionado para anexar");
        return;
      }

      const empresaNome = (selectedCompany as any)?.razao_social || "Empresa";
      const corpo = `Olá,

Segue em anexo os relatórios financeiros de ${empresaNome} referentes a ${monthLabel}.

Arquivos anexados:
${anexos.map(a => `  • ${a.nomeArquivo}`).join("\n")}

Qualquer dúvida estou à disposição.

Atenciosamente,
${empresaNome}`;

      const { data, error } = await (db as any).functions.invoke("enviar-email", {
        body: {
          destinatario: emailDestinatario.trim(),
          assunto: `Relatórios financeiros — ${empresaNome} — ${monthLabel}`,
          corpo,
          anexos,
        },
      });

      if (error) {
        const ctx: any = (error as any).context;
        let detail = error.message || "Falha ao enviar email";
        try {
          if (ctx && typeof ctx.json === "function") {
            const parsed = await ctx.clone().json();
            detail = parsed?.erro || parsed?.error || JSON.stringify(parsed);
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data && (data as any).ok === false) {
        throw new Error((data as any).erro || "Falha ao enviar email");
      }

      toast.success(`Email enviado para ${emailDestinatario} com ${anexos.length} anexo${anexos.length === 1 ? "" : "s"}`);
      setShowEmailDialog(false);
    } catch (e: any) {
      toast.error("Erro: " + (e.message || String(e)));
    } finally {
      setSendingEmail(false);
    }
  }

  /* ---- render ---- */

  const hasData = rows.length > 0;
  const hasUncategorized = rows.some(
    (r) => !r.categoryCode && r.type !== "Outro",
  );

  return (
    <AppLayout title="Área do Contador">
      <div>
        {/* Header */}
        <PagePanel
          title="Área do Contador"
          subtitle="Relatórios prontos para enviar à contabilidade. Selecione o período e a conta para baixar o extrato já conciliado e a planilha de conciliações com categorias."
        >

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#1D2939] mb-1">
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
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#1D2939] mb-1">
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
              <div className="text-[11px] uppercase font-bold text-gray-500 tracking-wider">
                Movimentações conciliadas
              </div>
              <div className="text-2xl font-semibold text-[#1D2939] mt-1">
                {reconciledBankTxs.length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-4">
              <div className="text-[11px] uppercase font-bold text-gray-500 tracking-wider">
                Entradas
              </div>
              <div className="text-2xl font-semibold text-[#059669] mt-1">
                {fmtBRL(totalEntradas)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#E5E7EB]">
            <CardContent className="p-4">
              <div className="text-[11px] uppercase font-bold text-gray-500 tracking-wider">
                Saídas
              </div>
              <div className="text-2xl font-semibold text-[#DC2626] mt-1">
                {fmtBRL(totalSaidas)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Downloads — 3 relatórios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          <Card className="border-[#E5E7EB] h-full">
            <CardContent className="p-5 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2 text-[#1D2939]">
                <FileText size={18} />
                <h2 className="font-semibold">Extrato do Mês</h2>
              </div>
              <p className="text-sm text-gray-600 flex-1">
                Extrato bruto do banco — todas as transações (conciliadas e pendentes), com status e saldo acumulado.
              </p>
              <Button
                onClick={exportExtratoBruto}
                disabled={bankTxs.length === 0}
                className="bg-[#475569] hover:bg-[#334155] text-white gap-2 w-full"
              >
                <Download size={16} />
                Baixar
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[#E5E7EB] h-full">
            <CardContent className="p-5 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2 text-[#1D2939]">
                <FileSpreadsheet size={18} />
                <h2 className="font-semibold">Extrato Conciliado</h2>
              </div>
              <p className="text-sm text-gray-600 flex-1">
                Movimentação bancária do mês com pagador/credor identificado. Uma aba por conta.
              </p>
              <Button
                onClick={exportExtrato}
                disabled={!hasData}
                className="bg-[#1D2939] hover:bg-[#0F1A2A] text-white gap-2 w-full"
              >
                <Download size={16} />
                Baixar
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[#E5E7EB] h-full">
            <CardContent className="p-5 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2 text-[#1D2939]">
                <FileSpreadsheet size={18} />
                <h2 className="font-semibold">Conciliações + Categorias</h2>
              </div>
              <p className="text-sm text-gray-600 flex-1">
                Planilha completa pra o contador: categoria do plano de contas + centro de custo.
              </p>
              <Button
                onClick={exportConciliacoes}
                disabled={!hasData}
                className="bg-[#059669] hover:bg-[#047857] text-white gap-2 w-full"
              >
                <Download size={16} />
                Baixar
              </Button>
              {hasUncategorized && (
                <p className="text-xs text-[#B45309] bg-[#FEF3C7] rounded px-2 py-1.5">
                  Há conciliações sem categoria — precisa classificar manualmente.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Enviar por email */}
        <Card className="border-[#1D4ED8] bg-[#EFF6FF]">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#1D2939]">
                <Mail size={18} />
                <h2 className="font-semibold">Enviar ao contador por email</h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Anexa os 3 relatórios e dispara em um único email pro endereço da contabilidade.
              </p>
            </div>
            <Button
              onClick={() => setShowEmailDialog(true)}
              disabled={!hasData && bankTxs.length === 0}
              className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 whitespace-nowrap"
            >
              <Mail size={16} />
              Enviar email
            </Button>
          </CardContent>
        </Card>

        {/* Dialog de envio por email */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Enviar relatórios ao contador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#1D2939] mb-1 block">
                  Email do destinatário
                </label>
                <input
                  type="email"
                  value={emailDestinatario}
                  onChange={(e) => setEmailDestinatario(e.target.value)}
                  placeholder="contador@empresa.com.br"
                  className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#1D4ED8] focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#1D2939] mb-2 block">
                  Quais relatórios anexar
                </label>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailIncluir.extrato}
                      onChange={(e) => setEmailIncluir((s) => ({ ...s, extrato: e.target.checked }))}
                      className="w-4 h-4 accent-[#1D4ED8]"
                    />
                    Extrato do mês ({bankTxs.length} transações)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailIncluir.conciliado}
                      onChange={(e) => setEmailIncluir((s) => ({ ...s, conciliado: e.target.checked }))}
                      className="w-4 h-4 accent-[#1D4ED8]"
                    />
                    Extrato conciliado ({rows.length} movimentações)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailIncluir.categorias}
                      onChange={(e) => setEmailIncluir((s) => ({ ...s, categorias: e.target.checked }))}
                      className="w-4 h-4 accent-[#1D4ED8]"
                    />
                    Conciliações + Categorias ({rows.length} linhas)
                  </label>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Período: {monthLabel} · Empresa: {(selectedCompany as any)?.razao_social}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={sendingEmail}>
                Cancelar
              </Button>
              <Button
                onClick={handleEnviarEmail}
                disabled={sendingEmail || !emailDestinatario.trim()}
                className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white"
              >
                {sendingEmail ? "Enviando..." : "Enviar agora"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview */}
        <div className="space-y-2">
          <Card className="border-[#E5E7EB] overflow-hidden">
            <CardContent className="p-0">
              {/* Barra de título escura */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#000000]">
                <h3 className="text-sm font-semibold text-white m-0">
                  Pré-visualização — {monthLabel}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-white/70 font-medium">
                    {rows.length} linha{rows.length === 1 ? "" : "s"}
                  </span>
                  <div className="relative self-center">
                    <button
                      onClick={() => setColMenuOpen((o) => !o)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/20 text-[12px] text-white hover:bg-white/10"
                      title="Mostrar/ocultar colunas"
                    >
                      <Eye size={14} className="text-white/70" /> Colunas
                      <ChevronDown size={13} className={`text-white/60 transition-transform ${colMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {colMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                        <div className="absolute right-0 mt-1 z-50 bg-white border border-[#EAECF0] rounded-lg shadow-xl py-1 min-w-[190px]">
                          <p className="px-3 py-1.5 text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider">Exibir colunas</p>
                          {Object.entries(COL_LABELS).map(([k, label]) => (
                            <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1D2939] hover:bg-[#F6F2EB] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isColVisible(k)}
                                onChange={() => toggleColVisible(k)}
                                className="w-4 h-4 rounded border-[#D0D5DD] text-[#059669] focus:ring-[#059669]/30"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

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
                  <table className="text-sm" style={{ tableLayout: 'fixed', width: visiblePreviewCols.reduce((a, k) => a + (colWidths[k] ?? COL_WIDTHS_DEFAULT[k]), 0), minWidth: '100%' }}>
                    <colgroup>
                      {PREVIEW_COL_ORDER.map((k) => (
                        <col key={k} className={isColVisible(k) ? '' : 'hidden'} style={{ width: colWidths[k] ?? COL_WIDTHS_DEFAULT[k] }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-white text-[12px] font-bold text-[#1D2939] uppercase tracking-wider whitespace-nowrap border-b-2 border-[#D0D5DD]">
                        <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('data') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('data')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Data
                        </th>
                        <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('conta') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('conta')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Conta
                        </th>
                        <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('descricao') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('descricao')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Descrição
                        </th>
                        <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('contraparte') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('contraparte')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Pagador / Credor
                        </th>
                        <th className={`text-left px-3 py-2 relative border-r border-[#EAECF0] ${isColVisible('categoria') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('categoria')} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Categoria
                        </th>
                        <th className={`text-right px-3 py-2 relative ${isColVisible('valor') ? '' : 'hidden'}`}>
                          <span onMouseDown={startResize('valor')} className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize hover:bg-black/10 z-10" title="Arraste para ajustar a largura" />
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-b border-[#F1F3F5]">
                          <td className={`px-3 py-1 text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('data') ? '' : 'hidden'}`} title={fmtDateBR(r.date)}>
                            {fmtDateBR(r.date)}
                          </td>
                          <td className={`px-3 py-1 text-xs text-gray-600 truncate border-r border-[#F1F3F5] ${isColVisible('conta') ? '' : 'hidden'}`} title={r.accountName}>
                            {r.accountName}
                          </td>
                          <td className={`px-3 py-1 text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('descricao') ? '' : 'hidden'}`} title={r.description}>
                            {r.description}
                          </td>
                          <td className={`px-3 py-1 text-[#1D2939] truncate border-r border-[#F1F3F5] ${isColVisible('contraparte') ? '' : 'hidden'}`} title={r.counterparty}>
                            {r.counterparty}
                          </td>
                          <td className={`px-3 py-1 text-xs truncate border-r border-[#F1F3F5] ${isColVisible('categoria') ? '' : 'hidden'}`} title={r.categoryCode ? `${r.categoryCode} — ${r.categoryName}` : 'Sem categoria'}>
                            {r.categoryCode ? (
                              <span className="text-[#1D2939]">
                                {r.categoryCode} — {r.categoryName}
                              </span>
                            ) : (
                              <span className="text-[#B45309]">
                                Sem categoria
                              </span>
                            )}
                          </td>
                          <td
                            className={
                              "px-3 py-1 text-right font-medium truncate " +
                              (r.amount >= 0
                                ? "text-[#059669]"
                                : "text-[#DC2626]") +
                              (isColVisible('valor') ? '' : ' hidden')
                            }
                          >
                            {fmtBRL(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
        </PagePanel>
      </div>
    </AppLayout>
  );
}
