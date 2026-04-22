import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PendenciasBanner } from "@/modules/finance/presentation/components/PendenciasBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ChevronRight, ChevronDown, Banknote, Settings2, TrendingUp, TrendingDown, FileText, Pencil, Search, AlertTriangle } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

interface DFCLinha {
  codigo: string;
  nome: string;
  nivel: number;
  atividade_dfc: string | null;
  valor: number;
  ordem: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const CORES_ATIVIDADE: Record<string, string> = {
  operacional: "#039855",
  investimento: "#e65100",
  financiamento: "#059669",
};

export default function FluxoCaixa() {
  const { selectedCompany } = useCompany();
  const { activeClient, isUsingSecondary } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();

  // Modal editar categoria
  const [editModal, setEditModal] = useState<{ id: string; descricao: string; valor: number; contaContabilId: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editContaId, setEditContaId] = useState("");

  const { data: contasContabeis = [] } = useQuery({
    queryKey: ["chart_of_accounts", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db.from("chart_of_accounts").select("id, code, name").eq("company_id", selectedCompany.id).order("code");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const abrirEditCategoria = useCallback((lanc: { id: string; descricao: string; valor: number; contaBancariaId: string }, contaContabilId: string) => {
    setEditContaId(contaContabilId || "");
    setEditModal({ id: lanc.id, descricao: lanc.descricao, valor: lanc.valor, contaContabilId: contaContabilId || "" });
  }, []);

  const salvarCategoria = async () => {
    if (!editModal) return;
    setEditSaving(true);
    try {
      const { error } = await db.from("movimentacoes").update({ conta_contabil_id: editContaId || null }).eq("id", editModal.id);
      if (error) { console.error("Erro ao atualizar categoria:", error); return; }
      queryClient.invalidateQueries({ queryKey: ["relatorio_fluxo"] });
      setEditModal(null);
    } finally {
      setEditSaving(false);
    }
  };

  const hoje = new Date();
  const [mesInicio, setMesInicio] = useState(format(startOfMonth(subMonths(hoje, 2)), "yyyy-MM"));
  const [mesFim, setMesFim] = useState(format(hoje, "yyyy-MM"));

  const mesesOpcoes = useMemo(() => {
    const opts: string[] = [];
    for (let i = 0; i < 24; i++) {
      opts.push(format(subMonths(hoje, i), "yyyy-MM"));
    }
    return opts;
  }, []);

  const dataInicio = `${mesInicio}-01`;
  const dataFim = format(endOfMonth(new Date(`${mesFim}-15`)), "yyyy-MM-dd");

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["dfc_contabil", selectedCompany?.id, dataInicio, dataFim, isUsingSecondary],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];

      const { data, error } = await db.rpc("fn_gerar_dfc", {
        p_company_id: selectedCompany.id,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      });

      if (error) {
        console.error("Erro fn_gerar_dfc:", error);
        return [];
      }

      return (data || []).map((d: any) => ({
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.nivel,
        atividade_dfc: d.atividade_dfc,
        valor: Number(d.valor || 0),
        ordem: d.ordem,
      })) as DFCLinha[];
    },
    enabled: !!selectedCompany?.id,
  });

  // KPIs
  const caixaOperacional = linhas.find((l) => l.codigo === "DFC.OP.T")?.valor || 0;
  const caixaInvestimento = linhas.find((l) => l.codigo === "DFC.INV.T")?.valor || 0;
  const caixaFinanciamento = linhas.find((l) => l.codigo === "DFC.FIN.T")?.valor || 0;
  const variacaoLiquida = linhas.find((l) => l.codigo === "DFC.VAR")?.valor || 0;

  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const toggleExpand = (codigo: string) =>
    setExpandidos((p) => ({ ...p, [codigo]: !p[codigo] }));

  // Agrupar por atividade
  const atividades = useMemo(() => {
    const groups: { header: DFCLinha; filhos: DFCLinha[]; total: DFCLinha | null }[] = [];
    const nivel1Soma = linhas.filter((l) => l.nivel === 1 && l.codigo.match(/^DFC\.(OP|INV|FIN)$/));
    nivel1Soma.forEach((header) => {
      const prefixo = header.codigo + ".";
      const filhos = linhas.filter(
        (l) => l.nivel === 2 && l.codigo.startsWith(prefixo)
      );
      const total = linhas.find(
        (l) => l.nivel === 1 && l.codigo.startsWith(header.codigo + ".T")
      ) || null;
      groups.push({ header, filhos, total });
    });
    return groups;
  }, [linhas]);

  const variacaoLinha = linhas.find((l) => l.codigo === "DFC.VAR");

  function exportarExcel() {
    const wsData: any[][] = [
      ["DFC — Demonstração dos Fluxos de Caixa"],
      [`Empresa: ${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}`],
      [`Período: ${mesInicio} a ${mesFim}`],
      [],
      ["Código", "Descrição", "Atividade", "Valor (R$)"],
    ];
    linhas.forEach((l) => {
      wsData.push([l.codigo, l.nivel === 1 ? l.nome.toUpperCase() : `   ${l.nome}`, l.atividade_dfc || "", l.valor]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "DFC");
    XLSX.writeFile(wb, `DFC_${mesInicio}_${mesFim}.xlsx`);
  }

  // ── Relatório por Categoria ──
  const { data: relatorioRaw = [], isLoading: isLoadingRelatorio } = useQuery({
    queryKey: ["relatorio_fluxo", selectedCompany?.id, dataInicio, dataFim, isUsingSecondary],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await db.rpc("fn_relatorio_fluxo", {
        p_company_id: selectedCompany.id,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      });
      if (error) { console.error("Erro fn_relatorio_fluxo:", error); return []; }
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const movimentacoes = relatorioRaw; // keep reference for length check

  // ── Diagnóstico de Categorias ──
  const { data: diagnosticoRaw = [], isLoading: isLoadingDiagnostico } = useQuery({
    queryKey: ["diagnostico_categorias", selectedCompany?.id, dataInicio, dataFim, isUsingSecondary],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await db.rpc("fn_diagnostico_categorias", {
        p_company_id: selectedCompany.id,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      });
      if (error) { console.error("Erro fn_diagnostico_categorias:", error); return []; }
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const diagnostico = useMemo(() => {
    const rows = diagnosticoRaw as any[];
    const semCategoria = rows.filter((r) => !r.cod_categoria);
    const comCategoria = rows.filter((r) => !!r.cod_categoria);
    const totalReceita = rows.filter((r) => r.tipo === "RECEITA").reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    const totalDespesa = rows.filter((r) => r.tipo === "DESPESA").reduce((s: number, r: any) => s + Math.abs(Number(r.valor || 0)), 0);
    const categorias = new Map<string, { cod: string; nome: string; total: number; count: number }>();
    for (const r of comCategoria) {
      const key = r.cod_categoria;
      const prev = categorias.get(key) || { cod: r.cod_categoria, nome: r.nome_categoria, total: 0, count: 0 };
      prev.total += Number(r.valor || 0);
      prev.count += 1;
      categorias.set(key, prev);
    }
    const categoriasOrdenadas = [...categorias.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return { rows, semCategoria, comCategoria, totalReceita, totalDespesa, categoriasOrdenadas };
  }, [diagnosticoRaw]);

  const isExcluidoFaturamento = (nome: string) =>
    /transfer[eê]ncia/i.test(nome) || /aplica[cç][aã]o.*resgate|resgate.*investimento/i.test(nome);

  const relatorio = useMemo(() => {
    const entradas: [string, { nome: string; total: number; isTransf: boolean; lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[] }][] = [];
    const saidas: [string, { nome: string; total: number; isTransf: boolean; lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[] }][] = [];
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const row of relatorioRaw) {
      const catId = row.cat_id || "_sem_categoria";
      const nome = row.cat_nome || "Sem categoria";
      const isTransf = isExcluidoFaturamento(nome);
      const lancamentos = (row.lancamentos || []).map((l: any) => ({
        id: l.id || "",
        data: l.data,
        valor: Number(l.valor || 0),
        descricao: l.descricao || "—",
        contaBancariaId: l.conta_bancaria_id || "",
      }));
      const total = Number(row.total || 0);

      if (row.tipo === "credito") {
        entradas.push([catId, { nome, total, isTransf, lancamentos }]);
        if (!isTransf) totalEntradas += total;
      } else {
        saidas.push([catId, { nome, total, isTransf, lancamentos }]);
        if (!isTransf) totalSaidas += total;
      }
    }

    entradas.sort((a, b) => b[1].total - a[1].total);
    saidas.sort((a, b) => b[1].total - a[1].total);

    return { entradas, saidas, totalEntradas, totalSaidas };
  }, [relatorioRaw]);

  const [relExpandidos, setRelExpandidos] = useState<Record<string, boolean>>({});
  const toggleRelExpand = (key: string) =>
    setRelExpandidos((p) => ({ ...p, [key]: !p[key] }));
  const [entradasAberto, setEntradasAberto] = useState(false);
  const [saidasAberto, setSaidasAberto] = useState(false);

  function exportarRelatorioExcel() {
    const wsData: any[][] = [
      ["Relatório de Fluxo de Caixa — Entradas e Saídas por Categoria"],
      [`Empresa: ${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}`],
      [`Período: ${mesInicio} a ${mesFim}`],
      [],
      ["Tipo", "Categoria", "Data", "Descrição", "Valor (R$)"],
    ];
    for (const [, cat] of relatorio.entradas) {
      wsData.push(["ENTRADA", cat.nome, "", "", cat.total]);
      for (const l of cat.lancamentos) {
        wsData.push(["", "", l.data, l.descricao, l.valor]);
      }
    }
    wsData.push(["", "", "", "TOTAL ENTRADAS", relatorio.totalEntradas]);
    wsData.push([]);
    for (const [, cat] of relatorio.saidas) {
      wsData.push(["SAÍDA", cat.nome, "", "", cat.total]);
      for (const l of cat.lancamentos) {
        wsData.push(["", "", l.data, l.descricao, l.valor]);
      }
    }
    wsData.push(["", "", "", "TOTAL SAÍDAS", relatorio.totalSaidas]);
    wsData.push(["", "", "", "SALDO", relatorio.totalEntradas - relatorio.totalSaidas]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 10 }, { wch: 35 }, { wch: 12 }, { wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `Relatorio_Fluxo_${mesInicio}_${mesFim}.xlsx`);
  }

  // ── PDF helpers ──
  const empresa = selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "";
  const periodo = `${mesInicio} a ${mesFim}`;

  function pdfHeader(doc: jsPDF, titulo: string, W: number, margin: number) {
    doc.setFillColor(26, 46, 74);
    doc.rect(0, 0, W, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(titulo, margin, 8);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${empresa}  |  ${periodo}`, margin, 14);
  }

  function pdfNewPageIfNeeded(doc: jsPDF, y: number, limit: number, cols: { label: string; x: number }[], contentW: number, margin: number) {
    if (y > limit) {
      doc.addPage();
      let ny = 12;
      doc.setFillColor(240, 244, 248);
      doc.rect(margin, ny, contentW, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
      cols.forEach((c) => doc.text(c.label, c.x + 1, ny + 4));
      ny += 7;
      doc.setFont("helvetica", "normal");
      return ny;
    }
    return y;
  }

  function exportarRelatorioPDF() {
    if (relatorio.entradas.length === 0 && relatorio.saidas.length === 0) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const W = 297;
    const margin = 12;
    const contentW = W - margin * 2;

    pdfHeader(doc, "RELATÓRIO DE FLUXO DE CAIXA", W, margin);

    let y = 24;
    const saldo = relatorio.totalEntradas - relatorio.totalSaidas;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Entradas: ${fmt(relatorio.totalEntradas)}    |    Saídas: ${fmt(relatorio.totalSaidas)}    |    Saldo: ${fmt(saldo)}`, margin, y);
    y += 8;

    const cols = [
      { label: "Tipo", x: margin },
      { label: "Categoria", x: margin + 22 },
      { label: "Data", x: margin + 120 },
      { label: "Descrição", x: margin + 148 },
      { label: "Valor (R$)", x: margin + 240 },
    ];

    doc.setFillColor(240, 244, 248);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 30, 30);
    cols.forEach((c) => doc.text(c.label, c.x + 1, y + 4));
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);

    const renderSection = (items: typeof relatorio.entradas, tipo: string) => {
      for (const [, cat] of items) {
        y = pdfNewPageIfNeeded(doc, y, 195, cols, contentW, margin);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(tipo, cols[0].x + 1, y + 3);
        doc.text(cat.nome, cols[1].x + 1, y + 3);
        doc.text(cat.isTransf ? "—" : fmt(cat.total), cols[4].x + 1, y + 3);
        y += 5;
        doc.setFont("helvetica", "normal");
        for (const l of cat.lancamentos) {
          y = pdfNewPageIfNeeded(doc, y, 195, cols, contentW, margin);
          doc.setTextColor(80, 80, 80);
          doc.text(l.data, cols[2].x + 1, y + 3);
          doc.text((l.descricao || "—").substring(0, 60), cols[3].x + 1, y + 3);
          doc.text(cat.isTransf ? "—" : fmt(l.valor), cols[4].x + 1, y + 3);
          y += 4.5;
        }
        y += 1;
      }
    };

    renderSection(relatorio.entradas, "ENTRADA");
    y += 3;
    renderSection(relatorio.saidas, "SAÍDA");

    y += 6;
    doc.setDrawColor(26, 46, 74);
    doc.line(margin, y, W - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(10, 92, 46);
    doc.text(`Total Entradas: ${fmt(relatorio.totalEntradas)}`, margin, y);
    doc.setTextColor(180, 30, 30);
    doc.text(`Total Saídas: ${fmt(relatorio.totalSaidas)}`, margin + 70, y);
    doc.setTextColor(26, 46, 74);
    doc.text(`Saldo: ${fmt(saldo)}`, margin + 140, y);

    doc.save(`Relatorio_Fluxo_${mesInicio}_${mesFim}.pdf`);
  }

  function exportarDFCpdf() {
    if (linhas.length === 0) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const W = 210;
    const margin = 14;
    const contentW = W - margin * 2;

    pdfHeader(doc, "DFC — DEMONSTRAÇÃO DOS FLUXOS DE CAIXA", W, margin);

    let y = 24;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Método direto · CPC 03 (R2)`, margin, y);
    y += 8;

    const cols = [
      { label: "Código", x: margin },
      { label: "Descrição", x: margin + 30 },
      { label: "Valor (R$)", x: margin + 140 },
    ];

    doc.setFillColor(240, 244, 248);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    cols.forEach((c) => doc.text(c.label, c.x + 1, y + 4));
    y += 7;

    for (const l of linhas) {
      if (y > 275) {
        doc.addPage();
        y = 14;
        doc.setFillColor(240, 244, 248);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(30, 30, 30);
        cols.forEach((c) => doc.text(c.label, c.x + 1, y + 4));
        y += 7;
      }

      const isHeader = l.nivel === 1;
      const isTotal = l.codigo.includes(".T") || l.codigo === "DFC.VAR";

      if (isHeader || isTotal) {
        doc.setFont("helvetica", "bold");
        if (isTotal) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, y - 1, contentW, 5.5, "F");
        }
      } else {
        doc.setFont("helvetica", "normal");
      }

      doc.setFontSize(6.5);
      doc.setTextColor(isHeader ? 26 : 60, isHeader ? 46 : 60, isHeader ? 74 : 60);
      doc.text(l.codigo, cols[0].x + (isHeader ? 0 : 4), y + 3);
      doc.text(isHeader ? l.nome.toUpperCase() : l.nome, cols[1].x + (isHeader ? 0 : 4), y + 3);

      const cor = l.valor >= 0 ? [10, 92, 46] : [180, 30, 30];
      doc.setTextColor(cor[0], cor[1], cor[2]);
      doc.text(fmt(l.valor), cols[2].x + 1, y + 3);

      y += isHeader ? 6 : 5;
    }

    doc.save(`DFC_${mesInicio}_${mesFim}.pdf`);
  }

  function exportarDiagnosticoPDF() {
    if (diagnostico.rows.length === 0) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const W = 297;
    const margin = 12;
    const contentW = W - margin * 2;

    pdfHeader(doc, "DIAGNÓSTICO DE CATEGORIAS", W, margin);

    let y = 24;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Receitas: ${fmt(diagnostico.totalReceita)}    |    Despesas: ${fmt(diagnostico.totalDespesa)}    |    Sem categoria: ${diagnostico.semCategoria.length}    |    Total: ${diagnostico.rows.length} transações`,
      margin, y
    );
    y += 8;

    const cols = [
      { label: "Data", x: margin },
      { label: "Descrição", x: margin + 22 },
      { label: "Tipo", x: margin + 110 },
      { label: "Vínculo", x: margin + 128 },
      { label: "Beneficiário", x: margin + 146 },
      { label: "Categoria", x: margin + 200 },
      { label: "Valor (R$)", x: margin + 252 },
    ];

    doc.setFillColor(240, 244, 248);
    doc.rect(margin, y, contentW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 30, 30);
    cols.forEach((c) => doc.text(c.label, c.x + 1, y + 4));
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);

    for (const r of diagnostico.rows) {
      if (y > 195) {
        doc.addPage();
        y = 12;
        doc.setFillColor(240, 244, 248);
        doc.rect(margin, y, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(30, 30, 30);
        cols.forEach((c) => doc.text(c.label, c.x + 1, y + 4));
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
      }

      const semCat = !r.cod_categoria;
      if (semCat) {
        doc.setFillColor(255, 251, 235);
        doc.rect(margin, y - 1, contentW, 4.5, "F");
      }

      doc.setTextColor(80, 80, 80);
      doc.text(r.data || "", cols[0].x + 1, y + 3);
      doc.text((r.descricao_banco || "").substring(0, 55), cols[1].x + 1, y + 3);

      const isReceita = r.tipo === "RECEITA";
      doc.setTextColor(isReceita ? 10 : 180, isReceita ? 92 : 30, isReceita ? 46 : 30);
      doc.text(r.tipo, cols[2].x + 1, y + 3);

      doc.setTextColor(80, 80, 80);
      doc.text(r.vinculo, cols[3].x + 1, y + 3);
      doc.text((r.beneficiario || "—").substring(0, 35), cols[4].x + 1, y + 3);
      doc.text(
        semCat ? "SEM CATEGORIA" : `${r.cod_categoria} — ${(r.nome_categoria || "").substring(0, 30)}`,
        cols[5].x + 1, y + 3
      );

      const val = Number(r.valor || 0);
      doc.setTextColor(val >= 0 ? 10 : 180, val >= 0 ? 92 : 30, val >= 0 ? 46 : 30);
      doc.text(fmt(val), cols[6].x + 1, y + 3);

      y += 4.5;
    }

    doc.save(`Diagnostico_Categorias_${mesInicio}_${mesFim}.pdf`);
  }

  return (
    <AppLayout title="Fluxo de Caixa">
      <div className="space-y-5 animate-fade-in">

        <PendenciasBanner variant="full" filter="all" />
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Fluxo de Caixa
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Demonstrativo e relatório de entradas e saídas
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={mesInicio} onValueChange={setMesInicio}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesOpcoes.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">a</span>
            <Select value={mesFim} onValueChange={setMesFim}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesOpcoes.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to="/demonstrativos/mapeamento">
              <Button variant="outline" size="sm">
                <Settings2 className="h-3.5 w-3.5 mr-1" /> Mapeamento
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="relatorio" className="w-full">
          <TabsList>
            <TabsTrigger value="relatorio" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Relatório
            </TabsTrigger>
            <TabsTrigger value="dfc" className="text-xs gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> DFC
            </TabsTrigger>
            <TabsTrigger value="diagnostico" className="text-xs gap-1.5">
              <Search className="h-3.5 w-3.5" /> Diagnóstico
            </TabsTrigger>
          </TabsList>

          {/* ═══ ABA RELATÓRIO ═══ */}
          <TabsContent value="relatorio">
            <div className="space-y-4">
              {/* KPIs Relatório */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total Entradas</p>
                    <p className="text-lg font-bold mt-1 text-emerald-600">{fmt(relatorio.totalEntradas)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total Saídas</p>
                    <p className="text-lg font-bold mt-1 text-red-600">{fmt(relatorio.totalSaidas)}</p>
                  </CardContent>
                </Card>
                <Card className="col-span-2 md:col-span-1">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Saldo</p>
                    <p className="text-lg font-bold mt-1" style={{ color: relatorio.totalEntradas - relatorio.totalSaidas >= 0 ? "#059669" : "#D92D20" }}>
                      {fmt(relatorio.totalEntradas - relatorio.totalSaidas)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {isLoadingRelatorio ? (
                <div className="text-center py-16">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Carregando relatório...</p>
                </div>
              ) : movimentacoes.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-16">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-muted-foreground text-sm">Nenhuma movimentação encontrada no período.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {/* ENTRADAS */}
                  <Card>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors border-b"
                      onClick={() => setEntradasAberto(!entradasAberto)}
                    >
                      <div className="flex items-center gap-2">
                        {entradasAberto ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-emerald-600" />}
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-bold text-foreground">Entradas</span>
                        <span className="text-xs text-muted-foreground">({relatorio.entradas.length} categorias)</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">{fmt(relatorio.totalEntradas)}</span>
                    </div>
                    {entradasAberto && (
                      <CardContent className="p-0">
                        <table className="w-full text-[12.5px]">
                          <tbody>
                            {relatorio.entradas.map(([catId, cat]) => {
                              const isOpen = relExpandidos[`e_${catId}`] ?? false;
                              return (
                                <CategoriaExpandivel
                                  key={catId}
                                  catId={`e_${catId}`}
                                  contaContabilId={catId}
                                  nome={cat.nome}
                                  total={cat.total}
                                  isTransf={cat.isTransf}
                                  lancamentos={cat.lancamentos}
                                  isOpen={isOpen}
                                  onToggle={() => toggleRelExpand(`e_${catId}`)}
                                  onEditCategoria={abrirEditCategoria}
                                  cor="#059669"
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </CardContent>
                    )}
                  </Card>

                  {/* SAÍDAS */}
                  <Card>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors border-b"
                      onClick={() => setSaidasAberto(!saidasAberto)}
                    >
                      <div className="flex items-center gap-2">
                        {saidasAberto ? <ChevronDown className="h-4 w-4 text-red-600" /> : <ChevronRight className="h-4 w-4 text-red-600" />}
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-bold text-foreground">Saídas</span>
                        <span className="text-xs text-muted-foreground">({relatorio.saidas.length} categorias)</span>
                      </div>
                      <span className="text-sm font-bold text-red-600 tabular-nums">{fmt(relatorio.totalSaidas)}</span>
                    </div>
                    {saidasAberto && (
                      <CardContent className="p-0">
                        <table className="w-full text-[12.5px]">
                          <tbody>
                            {relatorio.saidas.map(([catId, cat]) => {
                              const isOpen = relExpandidos[`s_${catId}`] ?? false;
                              return (
                                <CategoriaExpandivel
                                  key={catId}
                                  catId={`s_${catId}`}
                                  contaContabilId={catId}
                                  nome={cat.nome}
                                  total={cat.total}
                                  isTransf={cat.isTransf}
                                  lancamentos={cat.lancamentos}
                                  isOpen={isOpen}
                                  onToggle={() => toggleRelExpand(`s_${catId}`)}
                                  onEditCategoria={abrirEditCategoria}
                                  cor="#D92D20"
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </CardContent>
                    )}
                  </Card>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={exportarRelatorioPDF}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Exportar PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportarRelatorioExcel}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Exportar Excel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══ ABA DFC ═══ */}
          <TabsContent value="dfc">
            <div className="space-y-4">
              {/* KPIs DFC */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Caixa Operacional", value: fmt(caixaOperacional), color: CORES_ATIVIDADE.operacional },
                  { label: "Caixa Investimento", value: fmt(caixaInvestimento), color: CORES_ATIVIDADE.investimento },
                  { label: "Caixa Financiamento", value: fmt(caixaFinanciamento), color: CORES_ATIVIDADE.financiamento },
                  { label: "Variação Líquida", value: fmt(variacaoLiquida), color: variacaoLiquida >= 0 ? "#039855" : "#D92D20" },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <CardContent className="p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                      <p className="text-lg font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tabela DFC */}
              <Card>
                <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#059669" }}>
                  <CardTitle className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
                    <Banknote className="h-4 w-4" /> DFC — Demonstração dos Fluxos de Caixa
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="text-center py-16">
                      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Gerando DFC...</p>
                    </div>
                  ) : linhas.length === 0 ? (
                    <div className="text-center py-16">
                      <Banknote className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                      <p className="text-muted-foreground text-sm">Nenhum dado encontrado.</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Configure o{" "}
                        <Link to="/demonstrativos/mapeamento" className="text-primary underline">
                          mapeamento contábil
                        </Link>{" "}
                        para vincular contas aos demonstrativos.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-4 font-semibold w-[120px]">Código</th>
                            <th className="text-left py-2.5 px-4 font-semibold">Descrição</th>
                            <th className="text-right py-2.5 px-4 font-semibold w-[160px]">Valor (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {atividades.map((atv) => {
                            const isOpen = expandidos[atv.header.codigo] ?? false;
                            const corAtividade = CORES_ATIVIDADE[atv.header.atividade_dfc || ""] || "#888";
                            return (
                              <AtividadeDFC
                                key={atv.header.codigo}
                                header={atv.header}
                                filhos={atv.filhos}
                                total={atv.total}
                                isOpen={isOpen}
                                onToggle={() => toggleExpand(atv.header.codigo)}
                                corAtividade={corAtividade}
                              />
                            );
                          })}
                          {variacaoLinha && (
                            <tr className="border-t-2 border-foreground bg-muted/50 font-bold">
                              <td className="py-3 px-4 font-mono text-[11px]">{variacaoLinha.codigo}</td>
                              <td className="py-3 px-4">{variacaoLinha.nome}</td>
                              <td
                                className="text-right py-3 px-4 tabular-nums"
                                style={{ color: variacaoLinha.valor >= 0 ? "#039855" : "#D92D20" }}
                              >
                                {fmt(variacaoLinha.valor)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={exportarDFCpdf}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportarExcel}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar Excel
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ═══ ABA DIAGNÓSTICO ═══ */}
          <TabsContent value="diagnostico">
            <div className="space-y-4">
              {/* KPIs Diagnóstico */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Transações</p>
                    <p className="text-lg font-bold mt-1 text-foreground">{diagnostico.rows.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Receitas</p>
                    <p className="text-lg font-bold mt-1 text-emerald-600">{fmt(diagnostico.totalReceita)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Despesas</p>
                    <p className="text-lg font-bold mt-1 text-red-600">{fmt(diagnostico.totalDespesa)}</p>
                  </CardContent>
                </Card>
                <Card className={diagnostico.semCategoria.length > 0 ? "border-amber-300" : ""}>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      {diagnostico.semCategoria.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      Sem categoria
                    </p>
                    <p className="text-lg font-bold mt-1" style={{ color: diagnostico.semCategoria.length > 0 ? "#F79009" : "#059669" }}>
                      {diagnostico.semCategoria.length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {isLoadingDiagnostico ? (
                <div className="text-center py-16">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Carregando diagnóstico...</p>
                </div>
              ) : diagnostico.rows.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-16">
                    <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-muted-foreground text-sm">Nenhuma transação conciliada encontrada no período.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {/* Resumo por categoria */}
                  {diagnostico.categoriasOrdenadas.length > 0 && (
                    <Card>
                      <CardHeader className="border-b border-border py-3">
                        <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2">
                          <Banknote className="h-4 w-4" /> Resumo por categoria
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-[12.5px]">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left py-2.5 px-4 font-semibold w-[100px]">Código</th>
                                <th className="text-left py-2.5 px-4 font-semibold">Categoria</th>
                                <th className="text-right py-2.5 px-4 font-semibold w-[60px]">Qtd</th>
                                <th className="text-right py-2.5 px-4 font-semibold w-[140px]">Total (R$)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diagnostico.categoriasOrdenadas.map((cat) => (
                                <tr key={cat.cod} className="border-b border-border/50 hover:bg-muted/10">
                                  <td className="py-2 px-4 font-mono text-muted-foreground text-[11px]">{cat.cod}</td>
                                  <td className="py-2 px-4">{cat.nome}</td>
                                  <td className="text-right py-2 px-4 text-muted-foreground">{cat.count}</td>
                                  <td className="text-right py-2 px-4 font-semibold tabular-nums" style={{ color: cat.total >= 0 ? "#059669" : "#D92D20" }}>
                                    {fmt(cat.total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Transações sem categoria */}
                  {diagnostico.semCategoria.length > 0 && (
                    <Card className="border-amber-300">
                      <CardHeader className="border-b border-amber-200 py-3 bg-amber-50">
                        <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="h-4 w-4" /> Transações sem categoria ({diagnostico.semCategoria.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-[12.5px]">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left py-2.5 px-4 font-semibold w-[100px]">Data</th>
                                <th className="text-left py-2.5 px-4 font-semibold">Descrição</th>
                                <th className="text-left py-2.5 px-4 font-semibold w-[80px]">Vínculo</th>
                                <th className="text-left py-2.5 px-4 font-semibold">Beneficiário</th>
                                <th className="text-right py-2.5 px-4 font-semibold w-[130px]">Valor (R$)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diagnostico.semCategoria.map((r: any) => (
                                <tr key={r.bank_tx_id} className="border-b border-border/50 hover:bg-muted/10">
                                  <td className="py-2 px-4 text-muted-foreground text-[11px]">{r.data}</td>
                                  <td className="py-2 px-4">{r.descricao_banco}</td>
                                  <td className="py-2 px-4">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      r.vinculo === "CR" ? "bg-emerald-100 text-emerald-700" :
                                      r.vinculo === "CP" ? "bg-red-100 text-red-700" :
                                      "bg-gray-100 text-gray-600"
                                    }`}>{r.vinculo}</span>
                                  </td>
                                  <td className="py-2 px-4 text-muted-foreground">{r.beneficiario}</td>
                                  <td className="text-right py-2 px-4 font-semibold tabular-nums" style={{ color: Number(r.valor) >= 0 ? "#059669" : "#D92D20" }}>
                                    {fmt(Number(r.valor))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Todas as transações */}
                  <Card>
                    <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#059669" }}>
                      <CardTitle className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
                        <Search className="h-4 w-4" /> Todas as transações conciliadas ({diagnostico.rows.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-2.5 px-4 font-semibold w-[100px]">Data</th>
                              <th className="text-left py-2.5 px-4 font-semibold">Descrição</th>
                              <th className="text-left py-2.5 px-4 font-semibold w-[70px]">Tipo</th>
                              <th className="text-left py-2.5 px-4 font-semibold w-[80px]">Vínculo</th>
                              <th className="text-left py-2.5 px-4 font-semibold">Beneficiário</th>
                              <th className="text-left py-2.5 px-4 font-semibold">Categoria</th>
                              <th className="text-right py-2.5 px-4 font-semibold w-[130px]">Valor (R$)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnostico.rows.map((r: any) => (
                              <tr key={r.bank_tx_id} className="border-b border-border/50 hover:bg-muted/10">
                                <td className="py-2 px-4 text-muted-foreground text-[11px]">{r.data}</td>
                                <td className="py-2 px-4">{r.descricao_banco}</td>
                                <td className="py-2 px-4">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    r.tipo === "RECEITA" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                  }`}>{r.tipo}</span>
                                </td>
                                <td className="py-2 px-4">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    r.vinculo === "CR" ? "bg-emerald-100 text-emerald-700" :
                                    r.vinculo === "CP" ? "bg-red-100 text-red-700" :
                                    "bg-gray-100 text-gray-600"
                                  }`}>{r.vinculo}</span>
                                </td>
                                <td className="py-2 px-4 text-muted-foreground">{r.beneficiario}</td>
                                <td className="py-2 px-4">
                                  {r.cod_categoria ? (
                                    <span className="text-[11px]">
                                      <span className="font-mono text-muted-foreground">{r.cod_categoria}</span>
                                      {" — "}{r.nome_categoria}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">SEM CATEGORIA</span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-4 font-semibold tabular-nums" style={{ color: Number(r.valor) >= 0 ? "#059669" : "#D92D20" }}>
                                  {fmt(Number(r.valor))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={exportarDiagnosticoPDF}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Exportar PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal editar categoria */}
      <Dialog open={!!editModal} onOpenChange={(open) => !open && setEditModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Alterar categoria</DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Lançamento</p>
                <p className="text-sm font-medium">{editModal.descricao}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmt(editModal.valor)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Categoria (Conta Contábil)</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1 font-normal">
                      {editContaId
                        ? contasContabeis.find((c: any) => c.id === editContaId)
                          ? `${contasContabeis.find((c: any) => c.id === editContaId).code} — ${contasContabeis.find((c: any) => c.id === editContaId).name}`
                          : "Selecione..."
                        : "Selecione uma categoria"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar categoria..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                        <CommandGroup>
                          {contasContabeis.map((c: any) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.code} ${c.name}`}
                              onSelect={() => setEditContaId(c.id)}
                            >
                              <span className={editContaId === c.id ? "font-semibold" : ""}>
                                {c.code} — {c.name}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditModal(null)}>Cancelar</Button>
                <Button size="sm" onClick={salvarCategoria} disabled={editSaving}>
                  {editSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function CategoriaExpandivel({
  catId,
  contaContabilId,
  nome,
  total,
  isTransf,
  lancamentos,
  isOpen,
  onToggle,
  onEditCategoria,
  cor,
}: {
  catId: string;
  contaContabilId: string;
  nome: string;
  total: number;
  isTransf: boolean;
  lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[];
  isOpen: boolean;
  onToggle: () => void;
  onEditCategoria: (lanc: { id: string; descricao: string; valor: number; contaBancariaId: string }, contaContabilId: string) => void;
  cor: string;
}) {
  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 pl-6">
          <div className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="font-medium">{nome}</span>
            <span className="text-[11px] text-muted-foreground ml-1">({lancamentos.length})</span>
          </div>
        </td>
        <td className="text-right py-2.5 px-4 font-semibold tabular-nums" style={{ color: isTransf ? "#98A2B3" : cor }}>
          {isTransf ? "—" : fmt(total)}
        </td>
      </tr>
      {isOpen &&
        lancamentos.map((l, i) => (
          <tr key={`${catId}_${i}`} className="border-b border-border/20 hover:bg-muted/10">
            <td className="py-1.5 px-4 pl-12 text-muted-foreground">
              <span className="text-[11px]">{l.data}</span>
              <button
                onClick={() => onEditCategoria(l, contaContabilId)}
                className="ml-3 text-foreground hover:text-primary hover:underline inline-flex items-center gap-1"
              >
                {l.descricao}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            </td>
            <td className="text-right py-1.5 px-4 tabular-nums text-muted-foreground">
              {isTransf ? "—" : fmt(l.valor)}
            </td>
          </tr>
        ))}
    </>
  );
}

function AtividadeDFC({
  header,
  filhos,
  total,
  isOpen,
  onToggle,
  corAtividade,
}: {
  header: DFCLinha;
  filhos: DFCLinha[];
  total: DFCLinha | null;
  isOpen: boolean;
  onToggle: () => void;
  corAtividade: string;
}) {
  return (
    <>
      <tr
        className="bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 font-mono text-muted-foreground text-[11px]">{header.codigo}</td>
        <td className="py-2.5 px-4 font-bold">
          <div className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: corAtividade }} />
            {header.nome}
          </div>
        </td>
        <td className="text-right py-2.5 px-4 font-bold tabular-nums" style={{ color: corAtividade }}>
          {fmt(header.valor)}
        </td>
      </tr>
      {isOpen && (
        <>
          {filhos.map((f) => (
            <tr key={f.codigo} className="border-b border-border/50 hover:bg-muted/10">
              <td className="py-2 px-4 pl-8 font-mono text-muted-foreground text-[11px]">{f.codigo}</td>
              <td className="py-2 px-4 pl-8">{f.nome}</td>
              <td
                className="text-right py-2 px-4 tabular-nums"
                style={{ color: f.valor >= 0 ? "#039855" : "#D92D20" }}
              >
                {fmt(f.valor)}
              </td>
            </tr>
          ))}
          {total && (
            <tr className="border-b border-foreground/20 bg-muted/30">
              <td className="py-2 px-4 font-mono text-[11px]">{total.codigo}</td>
              <td className="py-2 px-4 font-semibold italic">{total.nome}</td>
              <td
                className="text-right py-2 px-4 font-semibold tabular-nums"
                style={{ color: total.valor >= 0 ? "#039855" : "#D92D20" }}
              >
                {fmt(total.valor)}
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}
