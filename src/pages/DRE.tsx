import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronRight, ChevronDown, TrendingUp, TrendingDown, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";

interface DRELinha {
  competencia: string;
  conta_contabil_id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  realizado: number;
  orcado: number;
  variacao: number;
  variacao_pct: number | null;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtPct = (v: number | null) =>
  v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";

export default function DRE() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const hoje = new Date();
  const [mesInicio, setMesInicio] = useState(format(startOfMonth(subMonths(hoje, 2)), "yyyy-MM"));
  const [mesFim, setMesFim] = useState(format(hoje, "yyyy-MM"));

  // Gerar opções de meses (últimos 24 meses)
  const mesesOpcoes = useMemo(() => {
    const opts: string[] = [];
    for (let i = 0; i < 24; i++) {
      opts.push(format(subMonths(hoje, i), "yyyy-MM"));
    }
    return opts;
  }, []);

  // Buscar DRE consolidado (view v_dre_consolidado)
  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["dre_consolidado", selectedCompany?.id, mesInicio, mesFim],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];

      const { data, error } = await db
        .from("v_dre_consolidado")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .gte("competencia", mesInicio)
        .lte("competencia", mesFim)
        .order("codigo");

      if (error || !data || data.length === 0) {
        // View vazia ou com erro: fallback para movimentações
        return await calcularDREFallback();
      }

      return (data || []).map((d: any) => ({
        competencia: d.competencia,
        conta_contabil_id: d.conta_contabil_id,
        codigo: d.codigo,
        descricao: d.descricao,
        tipo: d.tipo,
        realizado: Number(d.realizado || 0),
        orcado: Number(d.orcado || 0),
        variacao: Number(d.variacao || 0),
        variacao_pct: d.variacao_pct != null ? Number(d.variacao_pct) : null,
      })) as DRELinha[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Fallback: calcular DRE direto das movimentações
  async function calcularDREFallback(): Promise<DRELinha[]> {
    if (!selectedCompany?.id) return [];

    // Paginar movimentações (pode ter 7000+)
    const pageSize = 1000;
    let movs: any[] = [];
    let page = 0;
    while (true) {
      const { data } = await db
        .from("movimentacoes")
        .select("valor, tipo, conta_contabil_id, data, origem")
        .eq("company_id", selectedCompany.id)
        .neq("origem", "transferencia")
        .gte("data", `${mesInicio}-01`)
        .lte("data", `${mesFim}-31`)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (!data || data.length === 0) break;
      movs = movs.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    const { data: contas } = await db
      .from("chart_of_accounts")
      .select("id, code, name, account_type, account_nature, dre_group, dre_order")
      .eq("company_id", selectedCompany.id)
      .eq("is_analytical", true);

    const contasMap: Record<string, any> = {};
    (contas || []).forEach((c: any) => { contasMap[c.id] = c; });

    const totais: Record<string, { credito: number; debito: number }> = {};
    movs.forEach((m: any) => {
      if (!m.conta_contabil_id) return;
      if (!totais[m.conta_contabil_id]) totais[m.conta_contabil_id] = { credito: 0, debito: 0 };
      if (m.tipo === "credito") totais[m.conta_contabil_id].credito += Number(m.valor || 0);
      else totais[m.conta_contabil_id].debito += Number(m.valor || 0);
    });

    return Object.entries(totais).map(([id, t]) => {
      const conta = contasMap[id];
      if (!conta) return null;
      const saldo = conta.account_nature === "credit"
        ? t.credito - t.debito
        : t.debito - t.credito;
      return {
        competencia: `${mesInicio} a ${mesFim}`,
        conta_contabil_id: id,
        codigo: conta.code,
        descricao: conta.name,
        tipo: conta.account_type,
        realizado: saldo,
        orcado: 0,
        variacao: saldo,
        variacao_pct: null,
      };
    }).filter(Boolean) as DRELinha[];
  }

  // Agrupar linhas por tipo
  const grupos = useMemo(() => {
    const map: Record<string, { linhas: DRELinha[]; totalRealizado: number; totalOrcado: number }> = {};

    // Agregar por conta (somar competências)
    const porConta: Record<string, DRELinha> = {};
    linhas.forEach((l) => {
      const key = l.conta_contabil_id;
      if (!porConta[key]) {
        porConta[key] = { ...l, realizado: 0, orcado: 0, variacao: 0 };
      }
      porConta[key].realizado += l.realizado;
      porConta[key].orcado += l.orcado;
    });

    Object.values(porConta).forEach((l) => {
      l.variacao = l.realizado - l.orcado;
      l.variacao_pct = l.orcado !== 0 ? ((l.variacao / Math.abs(l.orcado)) * 100) : null;

      const grupo = l.tipo === "revenue" ? "RECEITAS"
        : (l.tipo === "expense" || l.tipo === "cost") ? "DESPESAS"
        : "OUTROS";
      if (!map[grupo]) map[grupo] = { linhas: [], totalRealizado: 0, totalOrcado: 0 };
      map[grupo].linhas.push(l);
      map[grupo].totalRealizado += l.realizado;
      map[grupo].totalOrcado += l.orcado;
    });

    // Ordenar linhas por código
    Object.values(map).forEach((g) => g.linhas.sort((a, b) => a.codigo.localeCompare(b.codigo)));

    return map;
  }, [linhas]);

  // Totais
  const receitaTotal = grupos["RECEITAS"]?.totalRealizado || 0;
  const despesaTotal = Math.abs(grupos["DESPESAS"]?.totalRealizado || 0);
  const resultado = receitaTotal - despesaTotal;
  const margemLiquida = receitaTotal > 0 ? (resultado / receitaTotal) * 100 : 0;

  // Dados para gráfico mensal
  const dadosGrafico = useMemo(() => {
    const porMes: Record<string, { receita: number; despesa: number; resultado: number }> = {};
    linhas.forEach((l) => {
      if (!porMes[l.competencia]) porMes[l.competencia] = { receita: 0, despesa: 0, resultado: 0 };
      if (l.tipo === "revenue") porMes[l.competencia].receita += l.realizado;
      else if (l.tipo === "expense") porMes[l.competencia].despesa += Math.abs(l.realizado);
    });
    return Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes,
        Receita: v.receita,
        Despesa: v.despesa,
        Resultado: v.receita - v.despesa,
      }));
  }, [linhas]);

  // Export Excel
  function exportarExcel() {
    const wsData: any[][] = [
      ["DRE — Demonstrativo de Resultados"],
      [`Empresa: ${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}`],
      [`Período: ${mesInicio} a ${mesFim}`],
      [],
      ["Código", "Descrição", "Realizado", "Orçado", "Variação", "Var %"],
    ];

    const addGrupo = (nome: string) => {
      const g = grupos[nome];
      if (!g) return;
      wsData.push([nome, "", "", "", "", ""]);
      g.linhas.forEach((l) => {
        wsData.push([
          l.codigo,
          l.descricao,
          l.realizado,
          l.orcado,
          l.variacao,
          l.variacao_pct != null ? l.variacao_pct / 100 : null,
        ]);
      });
      wsData.push(["", `Total ${nome}`, g.totalRealizado, g.totalOrcado, g.totalRealizado - g.totalOrcado, ""]);
      wsData.push([]);
    };

    addGrupo("RECEITAS");
    addGrupo("DESPESAS");
    addGrupo("OUTROS");
    wsData.push(["", "RESULTADO LÍQUIDO", resultado, "", "", ""]);
    wsData.push(["", "Margem Líquida", `${margemLiquida.toFixed(2)}%`, "", "", ""]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    XLSX.writeFile(wb, `DRE_${mesInicio}_${mesFim}.xlsx`);
  }

  // Grupo expansível
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({ RECEITAS: true, DESPESAS: true });

  return (
    <AppLayout title="DRE">
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Demonstrativo de Resultados</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Orçado vs Realizado por conta contábil</p>
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
            <Button variant="outline" size="sm" onClick={exportarExcel}>
              <Download className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
          </div>
        </div>

        {/* KPIs resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Receita Bruta", value: fmt(receitaTotal), color: "#2e7d32" },
            { label: "Despesas", value: fmt(despesaTotal), color: "#c62828" },
            { label: "Resultado Líquido", value: fmt(resultado), color: resultado >= 0 ? "#2e7d32" : "#c62828" },
            { label: "Margem Líquida", value: `${margemLiquida.toFixed(1)}%`, color: margemLiquida >= 0 ? "#2e7d32" : "#c62828" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Gráfico DRE mensal */}
        {dadosGrafico.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[13px] font-bold tracking-tight">Evolução Mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Receita" fill="#2e7d32" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesa" fill="#c62828" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Resultado" fill="#3b5bdb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tabela DRE */}
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-4 w-4" /> DRE Detalhado
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Carregando DRE...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2.5 px-4 font-semibold">Conta</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Descrição</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Realizado</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Orçado</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Variação</th>
                      <th className="text-right py-2.5 px-4 font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["RECEITAS", "DESPESAS", "OUTROS"] as const).map((grupo) => {
                      const g = grupos[grupo];
                      if (!g) return null;
                      const isOpen = expandidos[grupo] ?? false;
                      return (
                        <GrupoDRE
                          key={grupo}
                          nome={grupo}
                          grupo={g}
                          isOpen={isOpen}
                          onToggle={() => setExpandidos((p) => ({ ...p, [grupo]: !p[grupo] }))}
                        />
                      );
                    })}
                    {/* Resultado Final */}
                    <tr className="border-t-2 border-foreground bg-muted/50 font-bold">
                      <td className="py-3 px-4" colSpan={2}>RESULTADO LÍQUIDO</td>
                      <td className="text-right py-3 px-4" style={{ color: resultado >= 0 ? "#2e7d32" : "#c62828" }}>
                        {fmt(resultado)}
                      </td>
                      <td className="text-right py-3 px-4">—</td>
                      <td className="text-right py-3 px-4">—</td>
                      <td className="text-right py-3 px-4">{margemLiquida.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function GrupoDRE({ nome, grupo, isOpen, onToggle }: {
  nome: string;
  grupo: { linhas: DRELinha[]; totalRealizado: number; totalOrcado: number };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const varTotal = grupo.totalRealizado - grupo.totalOrcado;
  const varPct = grupo.totalOrcado !== 0 ? (varTotal / Math.abs(grupo.totalOrcado)) * 100 : null;

  return (
    <>
      {/* Header do grupo */}
      <tr
        className="border-b bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 font-bold" colSpan={2}>
          <div className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {nome}
          </div>
        </td>
        <td className="text-right py-2.5 px-4 font-bold">{fmt(grupo.totalRealizado)}</td>
        <td className="text-right py-2.5 px-4 font-bold text-muted-foreground">{fmt(grupo.totalOrcado)}</td>
        <td className="text-right py-2.5 px-4 font-bold" style={{ color: varTotal >= 0 ? "#2e7d32" : "#c62828" }}>
          {fmt(varTotal)}
        </td>
        <td className="text-right py-2.5 px-4 font-bold" style={{ color: (varPct ?? 0) >= 0 ? "#2e7d32" : "#c62828" }}>
          {fmtPct(varPct)}
        </td>
      </tr>
      {/* Linhas detalhadas */}
      {isOpen && grupo.linhas.map((l) => (
        <tr key={l.conta_contabil_id} className="border-b border-border/50 hover:bg-muted/10">
          <td className="py-2 px-4 pl-8 text-muted-foreground font-mono">{l.codigo}</td>
          <td className="py-2 px-4">{l.descricao}</td>
          <td className="text-right py-2 px-4 tabular-nums">{fmt(l.realizado)}</td>
          <td className="text-right py-2 px-4 tabular-nums text-muted-foreground">{fmt(l.orcado)}</td>
          <td className="text-right py-2 px-4 tabular-nums" style={{ color: l.variacao >= 0 ? "#2e7d32" : "#c62828" }}>
            {fmt(l.variacao)}
          </td>
          <td className="text-right py-2 px-4" style={{ color: (l.variacao_pct ?? 0) >= 0 ? "#2e7d32" : "#c62828" }}>
            <div className="flex items-center justify-end gap-1">
              {l.variacao_pct != null && l.variacao_pct !== 0 && (
                l.variacao_pct > 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />
              )}
              {fmtPct(l.variacao_pct)}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
