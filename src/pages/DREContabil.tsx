import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronRight, ChevronDown, FileText, Settings2 } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

interface DRELinha {
  codigo: string;
  nome: string;
  nivel: number;
  tipo_calculo: string;
  valor: number;
  ordem: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function DREContabil() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
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
  const dataFim = format(endOfMonth(new Date(`${mesFim}-01`)), "yyyy-MM-dd");

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["dre_contabil", selectedCompany?.id, dataInicio, dataFim],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];

      const { data, error } = await db.rpc("fn_gerar_dre", {
        p_company_id: selectedCompany.id,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      });

      if (error) {
        console.error("Erro fn_gerar_dre:", error);
        return [];
      }

      return (data || []).map((d: any) => ({
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.nivel,
        tipo_calculo: d.tipo_calculo,
        valor: Number(d.valor || 0),
        ordem: d.ordem,
      })) as DRELinha[];
    },
    enabled: !!selectedCompany?.id,
  });

  // KPIs
  const receitaLiquida = linhas.find((l) => l.codigo === "DRE.RL")?.valor || 0;
  const lucroBruto = linhas.find((l) => l.codigo === "DRE.LB")?.valor || 0;
  const resultadoLiquido = linhas.find((l) => l.codigo === "DRE.RL.F")?.valor || 0;
  const margemLiquida = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const toggleExpand = (codigo: string) =>
    setExpandidos((p) => ({ ...p, [codigo]: !p[codigo] }));

  // Agrupar hierarquicamente: nível 1 são grupos, nível 2 são filhos
  const grupos = useMemo(() => {
    const nivel1 = linhas.filter((l) => l.nivel === 1);
    const nivel2 = linhas.filter((l) => l.nivel === 2);
    return nivel1.map((g) => ({
      ...g,
      filhos: nivel2.filter((f) => {
        // Filhos: código começa com o código do pai + "."
        const prefixo = g.codigo + ".";
        return f.codigo.startsWith(prefixo) && f.codigo.split(".").length === g.codigo.split(".").length + 1;
      }),
    }));
  }, [linhas]);

  function exportarExcel() {
    const wsData: any[][] = [
      ["DRE — Demonstrativo de Resultado do Exercício"],
      [`Empresa: ${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}`],
      [`Período: ${mesInicio} a ${mesFim}`],
      [],
      ["Código", "Descrição", "Valor (R$)"],
    ];

    linhas.forEach((l) => {
      wsData.push([
        l.codigo,
        l.nivel === 1 ? l.nome.toUpperCase() : `   ${l.nome}`,
        l.valor,
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    XLSX.writeFile(wb, `DRE_Contabil_${mesInicio}_${mesFim}.xlsx`);
  }

  return (
    <AppLayout title="DRE Contábil">
      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Demonstração do Resultado do Exercício
            </h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Gerado automaticamente a partir dos lançamentos mapeados
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
            <Button variant="outline" size="sm" onClick={exportarExcel}>
              <Download className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
            <Link to="/demonstrativos/mapeamento">
              <Button variant="outline" size="sm">
                <Settings2 className="h-3.5 w-3.5 mr-1" /> Mapeamento
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Receita Líquida", value: fmt(receitaLiquida), color: "#039855" },
            { label: "Lucro Bruto", value: fmt(lucroBruto), color: lucroBruto >= 0 ? "#039855" : "#E53E3E" },
            { label: "Resultado Líquido", value: fmt(resultadoLiquido), color: resultadoLiquido >= 0 ? "#039855" : "#E53E3E" },
            { label: "Margem Líquida", value: `${margemLiquida.toFixed(1)}%`, color: margemLiquida >= 0 ? "#039855" : "#E53E3E" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabela DRE */}
        <Card>
          <CardHeader className="border-b border-border" style={{ backgroundColor: "#059669" }}>
            <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2 text-white">
              <FileText className="h-4 w-4" /> DRE — Demonstração do Resultado do Exercício
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Gerando DRE...</p>
              </div>
            ) : linhas.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
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
                    {grupos.map((g) => {
                      const isOpen = expandidos[g.codigo] ?? false;
                      const isResultado = g.tipo_calculo === "resultado";
                      return (
                        <LinhaGrupoDRE
                          key={g.codigo}
                          grupo={g}
                          filhos={g.filhos}
                          isOpen={isOpen}
                          isResultado={isResultado}
                          onToggle={() => toggleExpand(g.codigo)}
                        />
                      );
                    })}
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

function LinhaGrupoDRE({
  grupo,
  filhos,
  isOpen,
  isResultado,
  onToggle,
}: {
  grupo: DRELinha;
  filhos: DRELinha[];
  isOpen: boolean;
  isResultado: boolean;
  onToggle: () => void;
}) {
  const corValor = grupo.valor >= 0 ? "#039855" : "#E53E3E";
  const bgClass = isResultado
    ? "bg-muted/50 border-t border-b border-foreground/20"
    : "bg-muted/20";

  return (
    <>
      <tr
        className={`${bgClass} cursor-pointer hover:bg-muted/40 transition-colors`}
        onClick={filhos.length > 0 ? onToggle : undefined}
      >
        <td className="py-2.5 px-4 font-mono text-muted-foreground text-[11px]">{grupo.codigo}</td>
        <td className="py-2.5 px-4 font-bold">
          <div className="flex items-center gap-1.5">
            {filhos.length > 0 && (
              isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            )}
            {grupo.nome}
          </div>
        </td>
        <td className="text-right py-2.5 px-4 font-bold tabular-nums" style={{ color: corValor }}>
          {fmt(grupo.valor)}
        </td>
      </tr>
      {isOpen &&
        filhos.map((f) => (
          <tr key={f.codigo} className="border-b border-border/50 hover:bg-muted/10">
            <td className="py-2 px-4 pl-8 font-mono text-muted-foreground text-[11px]">{f.codigo}</td>
            <td className="py-2 px-4 pl-8">{f.nome}</td>
            <td
              className="text-right py-2 px-4 tabular-nums"
              style={{ color: f.valor >= 0 ? "#039855" : "#E53E3E" }}
            >
              {fmt(f.valor)}
            </td>
          </tr>
        ))}
    </>
  );
}
