import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronRight, ChevronDown, Banknote, Settings2, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

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
  operacional: "#2e7d32",
  investimento: "#e65100",
  financiamento: "#3b5bdb",
};

export default function FluxoCaixa() {
  const { selectedCompany } = useCompany();
  const { activeClient, isUsingSecondary } = useAuth();
  const db = activeClient as any;

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

  const isTransferencia = (nome: string) =>
    /transfer[eê]ncia/i.test(nome);

  const relatorio = useMemo(() => {
    const entradas: [string, { nome: string; total: number; isTransf: boolean; lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[] }][] = [];
    const saidas: [string, { nome: string; total: number; isTransf: boolean; lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[] }][] = [];
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const row of relatorioRaw) {
      const catId = row.cat_id || "_sem_categoria";
      const nome = row.cat_nome || "Sem categoria";
      const isTransf = isTransferencia(nome);
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

  return (
    <AppLayout title="Fluxo de Caixa">
      <div className="space-y-5 animate-fade-in">
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
                    <p className="text-lg font-bold mt-1" style={{ color: relatorio.totalEntradas - relatorio.totalSaidas >= 0 ? "#059669" : "#dc2626" }}>
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
                                  nome={cat.nome}
                                  total={cat.total}
                                  isTransf={cat.isTransf}
                                  lancamentos={cat.lancamentos}
                                  isOpen={isOpen}
                                  onToggle={() => toggleRelExpand(`e_${catId}`)}
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
                                  nome={cat.nome}
                                  total={cat.total}
                                  isTransf={cat.isTransf}
                                  lancamentos={cat.lancamentos}
                                  isOpen={isOpen}
                                  onToggle={() => toggleRelExpand(`s_${catId}`)}
                                  cor="#dc2626"
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </CardContent>
                    )}
                  </Card>

                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={exportarRelatorioExcel}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Exportar Relatório
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
                  { label: "Variação Líquida", value: fmt(variacaoLiquida), color: variacaoLiquida >= 0 ? "#2e7d32" : "#c62828" },
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
                <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#1a2e4a" }}>
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
                                style={{ color: variacaoLinha.valor >= 0 ? "#2e7d32" : "#c62828" }}
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

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportarExcel}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar DFC
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function CategoriaExpandivel({
  catId,
  nome,
  total,
  isTransf,
  lancamentos,
  isOpen,
  onToggle,
  cor,
}: {
  catId: string;
  nome: string;
  total: number;
  isTransf: boolean;
  lancamentos: { id: string; data: string; valor: number; descricao: string; contaBancariaId: string }[];
  isOpen: boolean;
  onToggle: () => void;
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
        <td className="text-right py-2.5 px-4 font-semibold tabular-nums" style={{ color: isTransf ? "#9ca3af" : cor }}>
          {isTransf ? "—" : fmt(total)}
        </td>
      </tr>
      {isOpen &&
        lancamentos.map((l, i) => (
          <tr key={`${catId}_${i}`} className="border-b border-border/20 hover:bg-muted/10">
            <td className="py-1.5 px-4 pl-12 text-muted-foreground">
              <span className="text-[11px]">{l.data}</span>
              <Link
                to={l.contaBancariaId ? `/conciliacao?conta=${l.contaBancariaId}` : "/conciliacao"}
                className="ml-3 text-foreground hover:text-primary hover:underline"
              >
                {l.descricao}
              </Link>
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
                style={{ color: f.valor >= 0 ? "#2e7d32" : "#c62828" }}
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
                style={{ color: total.valor >= 0 ? "#2e7d32" : "#c62828" }}
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
