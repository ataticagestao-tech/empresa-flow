import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ChevronRight, ChevronDown, Scale, Save, Settings2 } from "lucide-react";
import { format, subMonths, endOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

interface BPLinha {
  codigo: string;
  nome: string;
  nivel: number;
  natureza_saldo: string;
  valor: number;
  origem: string;
  ordem: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function BalancoPatrimonial() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();

  const hoje = new Date();
  const [mesRef, setMesRef] = useState(format(hoje, "yyyy-MM"));

  const mesesOpcoes = useMemo(() => {
    const opts: string[] = [];
    for (let i = 0; i < 24; i++) {
      opts.push(format(subMonths(hoje, i), "yyyy-MM"));
    }
    return opts;
  }, []);

  const dataReferencia = format(endOfMonth(new Date(`${mesRef}-01`)), "yyyy-MM-dd");

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["bp_contabil", selectedCompany?.id, dataReferencia],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];

      const { data, error } = await db.rpc("fn_gerar_bp", {
        p_company_id: selectedCompany.id,
        p_data_referencia: dataReferencia,
      });

      if (error) {
        console.error("Erro fn_gerar_bp:", error);
        return [];
      }

      return (data || []).map((d: any) => ({
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.nivel,
        natureza_saldo: d.natureza_saldo,
        valor: Number(d.valor || 0),
        origem: d.origem,
        ordem: d.ordem,
      })) as BPLinha[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Buscar linhas editáveis para saldos manuais
  const { data: linhasEditaveis = [] } = useQuery({
    queryKey: ["bp_linhas_editaveis", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("cont_linha_demonstrativo")
        .select("id, codigo, nome")
        .eq("company_id", selectedCompany.id)
        .eq("demonstrativo", "BP")
        .eq("editavel", true)
        .eq("ativo", true)
        .order("ordem");
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const [editando, setEditando] = useState(false);
  const [saldosEdit, setSaldosEdit] = useState<Record<string, string>>({});

  const iniciarEdicao = () => {
    const initial: Record<string, string> = {};
    linhasEditaveis.forEach((le: any) => {
      const linha = linhas.find((l) => l.codigo === le.codigo);
      initial[le.id] = linha ? String(linha.valor) : "0";
    });
    setSaldosEdit(initial);
    setEditando(true);
  };

  const salvarSaldos = async () => {
    if (!selectedCompany?.id) return;
    for (const [linhaId, valorStr] of Object.entries(saldosEdit)) {
      const saldo = parseFloat(valorStr) || 0;
      await db.from("cont_saldos_patrimoniais").upsert(
        {
          company_id: selectedCompany.id,
          linha_demonstrativo_id: linhaId,
          periodo_ref: dataReferencia,
          saldo,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "company_id,linha_demonstrativo_id,periodo_ref" }
      );
    }
    setEditando(false);
    queryClient.invalidateQueries({ queryKey: ["bp_contabil"] });
  };

  // KPIs
  const totalAtivo = linhas.find((l) => l.codigo === "BP.AT")?.valor || 0;
  const totalPassivoPL = linhas.find((l) => l.codigo === "BP.PT")?.valor || 0;
  const patrimonioLiquido = linhas.find((l) => l.codigo === "BP.PL")?.valor || 0;
  const diferenca = totalAtivo - totalPassivoPL;

  // Seções
  const secaoAtivo = linhas.filter((l) => l.codigo.startsWith("BP.A"));
  const secaoPassivo = linhas.filter(
    (l) => l.codigo.startsWith("BP.P") && !l.codigo.startsWith("BP.PL")
  );
  const secaoPL = linhas.filter((l) => l.codigo.startsWith("BP.PL"));

  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const toggleExpand = (codigo: string) =>
    setExpandidos((p) => ({ ...p, [codigo]: !p[codigo] }));

  function exportarExcel() {
    const wsData: any[][] = [
      ["Balanço Patrimonial"],
      [`Empresa: ${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}`],
      [`Data de referência: ${dataReferencia}`],
      [],
      ["Código", "Descrição", "Valor (R$)", "Origem"],
    ];
    linhas.forEach((l) => {
      wsData.push([l.codigo, l.nivel === 1 ? l.nome.toUpperCase() : `   ${l.nome}`, l.valor, l.origem]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "BP");
    XLSX.writeFile(wb, `BP_${mesRef}.xlsx`);
  }

  return (
    <AppLayout title="Balanço Patrimonial">
      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Balanço Patrimonial</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Posição patrimonial na data de referência
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={mesRef} onValueChange={setMesRef}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesOpcoes.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!editando ? (
              <>
                <Button variant="outline" size="sm" onClick={iniciarEdicao}>
                  Editar Saldos
                </Button>
                <Button variant="outline" size="sm" onClick={exportarExcel}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Excel
                </Button>
                <Link to="/demonstrativos/mapeamento">
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-3.5 w-3.5 mr-1" /> Mapeamento
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Button size="sm" onClick={salvarSaldos}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Ativo", value: fmt(totalAtivo), color: "#039855" },
            { label: "Total Passivo + PL", value: fmt(totalPassivoPL), color: "#059669" },
            { label: "Patrimônio Líquido", value: fmt(patrimonioLiquido), color: patrimonioLiquido >= 0 ? "#039855" : "#E53E3E" },
            { label: "Diferença (A-P)", value: fmt(diferenca), color: Math.abs(diferenca) < 0.01 ? "#039855" : "#E53E3E" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Balanço em duas colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ATIVO */}
          <Card>
            <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#059669" }}>
              <CardTitle className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
                <Scale className="h-4 w-4" /> ATIVO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SecaoBP
                linhas={secaoAtivo}
                expandidos={expandidos}
                onToggle={toggleExpand}
                editando={editando}
                saldosEdit={saldosEdit}
                onSaldoChange={setSaldosEdit}
                linhasEditaveis={linhasEditaveis}
              />
            </CardContent>
          </Card>

          {/* PASSIVO + PL */}
          <Card>
            <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#059669" }}>
              <CardTitle className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
                <Scale className="h-4 w-4" /> PASSIVO + PATRIMÔNIO LÍQUIDO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SecaoBP
                linhas={[...secaoPassivo, ...secaoPL]}
                expandidos={expandidos}
                onToggle={toggleExpand}
                editando={editando}
                saldosEdit={saldosEdit}
                onSaldoChange={setSaldosEdit}
                linhasEditaveis={linhasEditaveis}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function SecaoBP({
  linhas,
  expandidos,
  onToggle,
  editando,
  saldosEdit,
  onSaldoChange,
  linhasEditaveis,
}: {
  linhas: BPLinha[];
  expandidos: Record<string, boolean>;
  onToggle: (codigo: string) => void;
  editando: boolean;
  saldosEdit: Record<string, string>;
  onSaldoChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  linhasEditaveis: any[];
}) {
  if (linhas.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground text-xs">Sem dados para exibir.</p>
      </div>
    );
  }

  const nivel1 = linhas.filter((l) => l.nivel === 1);

  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {nivel1.map((g) => {
          const isOpen = expandidos[g.codigo] ?? false;
          const filhos = linhas.filter(
            (l) => l.nivel === 2 && l.codigo.startsWith(g.codigo + ".")
          );
          const isTotal = g.codigo === "BP.AT" || g.codigo === "BP.PT";
          const corValor = g.valor >= 0 ? "#039855" : "#E53E3E";

          return (
            <React.Fragment key={g.codigo}>
              <tr
                className={`${isTotal ? "bg-muted/50 border-t-2 border-foreground/30" : "bg-muted/20"} cursor-pointer hover:bg-muted/40 transition-colors`}
                onClick={filhos.length > 0 ? () => onToggle(g.codigo) : undefined}
              >
                <td className="py-2.5 px-4 font-bold">
                  <div className="flex items-center gap-1.5">
                    {filhos.length > 0 && (
                      isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {g.nome}
                  </div>
                </td>
                <td className="text-right py-2.5 px-4 font-bold tabular-nums w-[140px]" style={{ color: corValor }}>
                  {fmt(g.valor)}
                </td>
              </tr>
              {isOpen &&
                filhos.map((f) => {
                  const editavel = linhasEditaveis.find((le: any) => le.codigo === f.codigo);
                  return (
                    <tr key={f.codigo} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="py-2 px-4 pl-8">
                        <span className="text-muted-foreground font-mono text-[10px] mr-2">{f.codigo}</span>
                        {f.nome}
                        {f.origem === "manual" && (
                          <span className="ml-1.5 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">manual</span>
                        )}
                      </td>
                      <td className="text-right py-2 px-4 tabular-nums w-[140px]">
                        {editando && editavel ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 w-[120px] text-right text-xs ml-auto"
                            value={saldosEdit[editavel.id] || "0"}
                            onChange={(e) =>
                              onSaldoChange((prev) => ({ ...prev, [editavel.id]: e.target.value }))
                            }
                          />
                        ) : (
                          <span style={{ color: f.valor >= 0 ? "#039855" : "#E53E3E" }}>
                            {fmt(f.valor)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// Need React import for Fragment
import React from "react";
